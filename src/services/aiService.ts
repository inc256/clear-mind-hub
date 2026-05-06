// ─────────────────────────────────────────────────────────────────────────────
// src/services/aiService.ts
// Main entry point for all AI streaming requests.
// Re-exports shared types for consumers, then handles transport logic.
// ─────────────────────────────────────────────────────────────────────────────

import { useSettings } from "@/store/settings";
import { useUserProfile } from "@/store/userProfile";
import { buildSystemPrompt } from "./ai/prompts";
import { consumeSseStream } from "./ai/sseParser";
import type { AiMode, StreamOptions } from "./ai/types";
import { supabase } from "@/integrations/supabase/client";

// Re-export types so consumers only need to import from this one file
export type { AiMode, MindsetType, DepthLevel, StreamOptions } from "./ai/types";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_FN_URL   = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/prompt-edge-function`;
const SUPABASE_KEY      = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const DEFAULT_OPENAI_BASE = "https://api.openai.com/v1";

// Model routing — matches server-side logic in index.js
const STANDARD_MODES = new Set<AiMode>(["problem", "tutor", "research"]);

const MODEL_MAP = {
  standard: "gpt-5.4-mini",   // complex reasoning modes
  fast:     "gpt-5.4-nano",   // lightweight modes
} as const;

// Per-mode max_tokens — mirrors server caps so custom-key calls are consistent
const MAX_TOKENS: Record<AiMode, number> = {
  problem:   800,
  tutor:    1800,
  research: 2400,
  simplify:  600,
  hints:     400,
  rewrites:  700,
};

// Per-mode temperature
const TEMPERATURE: Record<AiMode, number> = {
  problem:  0.3,
  tutor:    0.7,
  research: 0.3,
  simplify: 0.5,
  hints:    0.5,
  rewrites: 0.7,
};

// ─────────────────────────────────────────────────────────────────────────────
// Model selection
// ─────────────────────────────────────────────────────────────────────────────

function getModelForMode(mode: AiMode): string {
  return STANDARD_MODES.has(mode) ? MODEL_MAP.standard : MODEL_MAP.fast;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — streamAi
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stream an AI response for the given mode and input.
 *
 * Routing:
 * 1. Custom API key configured → client routes directly to OpenAI-compatible endpoint.
 * 2. No custom key → routes to Supabase edge function (server-side key, credit-gated).
 *
 * onDelta  — called for each streamed content chunk
 * onDone   — called once with the full accumulated output
 * onError  — called with a human-readable message; streaming stops
 */
export async function streamAi(opts: StreamOptions): Promise<void> {
  const { mode, input, mindset, depth, citationStyle, onDelta, onDone, onError, signal } = opts;

  const { customApiKey, customApiBase } = useSettings.getState();

  // ── Credit gate (server-key path only) ────────────────────────────────
  if (!customApiKey) {
    const hasCredits = await useUserProfile.getState().deductCredits(1);
    if (!hasCredits) {
      onError(
        "Insufficient credits. Please purchase credits, upgrade your plan, or add a custom API key."
      );
      return;
    }
  }

  let finalOutput = "";

  try {
    const resp = customApiKey
      ? await fetchFromCustomApi({ customApiKey, customApiBase, mode, input, mindset, depth, citationStyle, signal })
      : await fetchFromSupabase({ mode, input, mindset, depth, citationStyle, signal });

    // ── HTTP-level errors ──────────────────────────────────────────────
    if (!resp.ok) {
      onError(await extractErrorMessage(resp));
      return;
    }

    if (!resp.body) {
      onError("The server returned an empty response. Please try again.");
      return;
    }

    // ── Consume SSE stream ─────────────────────────────────────────────
    await consumeSseStream(resp.body, (chunk) => {
      finalOutput += chunk;
      onDelta(chunk);
    });

    // ── Persist chat history (server-key path, authenticated users only) ─
    if (!customApiKey) {
      void logChatHistory(opts, finalOutput); // fire-and-forget; never blocks onDone
    }

    onDone(finalOutput);

  } catch (error: unknown) {
    // AbortError = user cancelled — swallow silently, no error shown
    if (error instanceof Error && error.name === "AbortError") return;
    onError(error instanceof Error ? error.message : "An unexpected network error occurred.");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Private fetch helpers
// ─────────────────────────────────────────────────────────────────────────────

interface BaseFetchArgs {
  mode:           AiMode;
  input:          string;
  mindset?:       StreamOptions["mindset"];
  depth?:         StreamOptions["depth"];
  citationStyle?: string;
  signal?:        AbortSignal;
}

/**
 * Supabase edge function path.
 * API key lives server-side; client sends only the publishable key.
 */
function fetchFromSupabase(args: BaseFetchArgs): Promise<Response> {
  const { mode, input, mindset, depth, citationStyle, signal } = args;
  return fetch(SUPABASE_FN_URL, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_KEY}`,
      apikey: SUPABASE_KEY,
    },
    body: JSON.stringify({ mode, input, mindset, depth, citationStyle }),
  });
}

/**
 * Custom API key path — routes to OpenAI-compatible endpoint supplied by the user.
 */
function fetchFromCustomApi(
  args: BaseFetchArgs & { customApiKey: string; customApiBase?: string }
): Promise<Response> {
  const { customApiKey, customApiBase, mode, input, mindset, depth, citationStyle, signal } = args;

  const baseUrl = (customApiBase ?? DEFAULT_OPENAI_BASE).replace(/\/$/, "");

  const systemPrompt = buildSystemPrompt(mode, mindset, depth, citationStyle);

  return fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${customApiKey}`,
    },
    body: JSON.stringify({
      model:       getModelForMode(mode),
      stream:      true,
      max_tokens:  MAX_TOKENS[mode],
      temperature: TEMPERATURE[mode],
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: input.trim() },
      ],
    }),
  });
}



// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract a human-readable error from a non-ok Response.
 * Handles both { error: string } and { error: { message: string } } shapes.
 */
async function extractErrorMessage(resp: Response): Promise<string> {
  try {
    const body = await resp.json();
    if (typeof body?.error === "string")            return body.error;
    if (typeof body?.error?.message === "string")   return body.error.message;
  } catch {
    // Body was not JSON — fall through
  }

  // Map common HTTP statuses to actionable messages
  const STATUS_MESSAGES: Record<number, string> = {
    401: "Invalid API key. Please check your credentials in Settings.",
    403: "Access denied. Your API key may not have permission for this model.",
    429: "Rate limit reached. Please wait a moment and try again.",
    500: "The AI provider encountered an internal error. Please try again.",
    502: "Could not reach the AI provider. Please check your connection.",
    503: "The AI provider is temporarily unavailable. Please try again shortly.",
    504: "The request timed out. Please try again.",
  };

  return (
    STATUS_MESSAGES[resp.status] ??
    `Request failed with status ${resp.status} (${resp.statusText || "unknown error"}).`
  );
}

/**
 * Fire-and-forget chat history logger.
 * Resolves the current user internally so the caller doesn't need to pass it.
 * All errors are swallowed — logging must never block or break the UI.
 */
async function logChatHistory(opts: StreamOptions, response: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await (supabase.rpc as any)("insert_chat", {
      p_user_id: user.id,
      p_mode:     opts.mode,
      p_prompt:   opts.input,
      p_response: response,
      p_credits:  1,
    });
  } catch (error) {
    console.warn("[aiService] Failed to log chat history:", error);
  }
}