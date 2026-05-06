// ─────────────────────────────────────────────────────────────────────────────
// src/services/aiService.ts
// Main entry point for all AI streaming requests.
// Re-exports shared types for consumers, then handles transport logic.
// ─────────────────────────────────────────────────────────────────────────────

import { useSettings } from "@/store/settings";
import { useUserProfile } from "@/store/userProfile";
import { buildSystemPrompt } from "./ai/prompts";
import { consumeSseStream } from "./ai/sseParser";
import type { StreamOptions } from "./ai/types";
import OpenAI from "openai";
import { supabase } from "@/integrations/supabase/client";

// Re-export types so consumers only need to import from this one file
export type { AiMode, MindsetType, DepthLevel, StreamOptions } from "./ai/types";

// ─────────────────────────────────────────────────────────────────────────────
// Environment constants
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/prompt-edge-function`;
const SUPABASE_KEY    = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const DEFAULT_OPENAI_BASE = "https://api.openai.com/v1";
const DEFAULT_CUSTOM_MODEL = "gpt-4o-mini";

// ─────────────────────────────────────────────────────────────────────────────
// Model selection logic
// ─────────────────────────────────────────────────────────────────────────────

function getModelForMode(mode: AiMode): string {
  // Use gpt-5.4-mini for Problem breakdown, Explanation, and Research steps
  if (mode === "problem" || mode === "tutor" || mode === "research") {
    return "gpt-5.4-mini";
  }
  // Use gpt-5.4-nano for other modes (Simplify problem, Short hints, Rewrites)
  return "gpt-5.4-nano";
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — streamAi
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stream an AI response for the given mode and input.
 *
 * Routing logic:
 * 1. If the user has configured a custom API key in Settings, route to their
 *    OpenAI-compatible endpoint directly from the client.
 * 2. Otherwise, route to the Supabase edge function (default, server-side key).
 *
 * Streaming is handled via consumeSseStream which parses the SSE response and
 * calls onDelta for each content chunk, onDone when complete, onError on failure.
 */
export async function streamAi(opts: StreamOptions): Promise<void> {
  const {
    mode,
    input,
    mindset,
    depth,
    citationStyle,
    onDelta,
    onDone,
    onError,
    signal,
  } = opts;

  const { customApiKey, customApiBase } = useSettings.getState();
  const profileStore = useUserProfile.getState();

  // Check credits before proceeding
  if (!customApiKey && !profileStore.deductCredits(1)) {
    onError("Insufficient credits. Please upgrade your plan or add custom API key.");
    return;
  }

  let finalOutput = "";

  try {
    const resp = customApiKey
      ? await fetchFromCustomApi({
          customApiKey,
          customApiBase,
          mode,
          input,
          mindset,
          depth,
          citationStyle,
          signal,
        })
      : await fetchFromSupabase({
          mode,
          input,
          mindset,
          depth,
          citationStyle,
          signal,
        });

    // ── HTTP-level error ───────────────────────────────────────────────────
    if (!resp.ok) {
      onError(await extractErrorMessage(resp));
      return;
    }

    // ── No body guard ──────────────────────────────────────────────────────
    if (!resp.body) {
      onError("The server returned an empty response. Please try again.");
      return;
    }

    // ── Consume the SSE stream ─────────────────────────────────────────────
    await consumeSseStream(resp.body, (chunk) => {
      finalOutput += chunk;
      onDelta(chunk);
    });

    // ── Log chat history (only for authenticated users) ────────────────────
    if (!customApiKey) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await logChatHistory(user.id, opts, finalOutput);
        }
      } catch (error) {
        console.warn('Failed to log chat history:', error);
      }
    }

    onDone(finalOutput);
  } catch (error: unknown) {
    // AbortError is intentional (user cancelled) — swallow silently
    if (error instanceof Error && error.name === "AbortError") return;
    onError(error instanceof Error ? error.message : "An unexpected network error occurred.");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Private fetch helpers
// ─────────────────────────────────────────────────────────────────────────────

interface BaseFetchArgs {
  mode:          StreamOptions["mode"];
  input:         string;
  mindset?:      StreamOptions["mindset"];
  depth?:        StreamOptions["depth"];
  citationStyle?: string;
  signal?:       AbortSignal;
}

/**
 * Route to the Supabase edge function.
 * The API key is kept server-side; the client only sends the publishable key.
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
 * Route directly to a user-supplied OpenAI-compatible endpoint.
 * Uses OpenAI SDK for Nvidia API, falls back to fetch for others.
 * The system prompt is built client-side and injected into the messages array.
 */
function fetchFromCustomApi(
  args: BaseFetchArgs & { customApiKey: string; customApiBase?: string }
): Promise<Response> {
  const { customApiKey, customApiBase, mode, input, mindset, depth, citationStyle, signal } = args;

  const baseUrl = (customApiBase ?? DEFAULT_OPENAI_BASE).replace(/\/$/, "");
  const systemPrompt = buildSystemPrompt(mode, mindset, depth, citationStyle);

  // Use OpenAI SDK for Nvidia API
  if (baseUrl === "https://integrate.api.nvidia.com/v1") {
    return fetchFromNvidiaApi(customApiKey, mode, input, mindset, depth, citationStyle, signal);
  }

  // Fallback to generic OpenAI-compatible fetch
  return fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${customApiKey}`,
    },
    body: JSON.stringify({
      model: getModelForMode(mode),
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: input },
      ],
    }),
  });
}

/**
 * Route to Nvidia API using OpenAI SDK.
 * Uses the specific Nvidia model and configuration.
 */
async function fetchFromNvidiaApi(
  apiKey: string,
  mode: StreamOptions["mode"],
  input: string,
  mindset?: StreamOptions["mindset"],
  depth?: StreamOptions["depth"],
  citationStyle?: string,
  signal?: AbortSignal
): Promise<Response> {
  const systemPrompt = buildSystemPrompt(mode, mindset, depth, citationStyle);

  const openai = new OpenAI({
    apiKey,
    baseURL: 'https://integrate.api.nvidia.com/v1',
  });

  const completion = await openai.chat.completions.create({
    model: "minimaxai/minimax-m2.7",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: input }
    ],
    temperature: 1,
    top_p: 0.95,
    max_tokens: 8192,
    stream: true,
  });

  // Convert the OpenAI stream to a Response object with ReadableStream
  const stream = new ReadableStream({
    start(controller) {
      (async () => {
        try {
          for await (const chunk of completion) {
            if (signal?.aborted) {
              controller.close();
              return;
            }
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              // Format as SSE data
              const sseData = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
              controller.enqueue(new TextEncoder().encode(sseData));
            }
          }
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      })();
    },
    cancel() {
      // Handle cancellation if needed
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attempt to extract a human-readable error message from an error response.
 * Falls back to a generic HTTP status message.
 */
async function extractErrorMessage(resp: Response): Promise<string> {
  try {
    const body = await resp.json();
    if (typeof body?.error === "string")       return body.error;
    if (typeof body?.error?.message === "string") return body.error.message;
  } catch {
    // Response body was not JSON — fall through to generic message
  }
  return `Request failed with status ${resp.status} (${resp.statusText || "unknown error"}).`;
}

// ── Chat History Logging ─────────────────────────────────────────────────────

async function logChatHistory(userId: string, opts: StreamOptions, response: string): Promise<void> {
  try {
    // Use the database function that handles credit deduction and chat insertion
    await supabase.rpc('insert_chat', {
      p_user_id: userId,
      p_mode: opts.mode,
      p_prompt: opts.input,
      p_response: response,
      p_credits: 1, // Each AI interaction costs 1 credit
    });
  } catch (error) {
    console.warn('Failed to log chat history:', error);
    // If the database function fails (likely due to insufficient credits),
    // the credit check should have caught this earlier, but let's handle it gracefully
  }
}