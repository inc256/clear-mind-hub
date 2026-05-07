// ─────────────────────────────────────────────────────────────────────────────
// src/services/aiService.ts
// ─────────────────────────────────────────────────────────────────────────────

import { useSettings } from "@/store/settings";
import { useUserProfile } from "@/store/userProfile";
import { buildSystemPrompt } from "./ai/prompts";
import { consumeSseStream } from "./ai/sseParser";
import type { AiMode, StreamOptions } from "./ai/types";
import { supabase } from "@/integrations/supabase/client";

export type { AiMode, MindsetType, DepthLevel, StreamOptions } from "./ai/types";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_FN_URL     = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/prompt-edge-function`;
const SUPABASE_ANON_KEY   = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const DEFAULT_OPENAI_BASE = "https://api.openai.com/v1";

const STANDARD_MODES = new Set<AiMode>(["problem", "tutor", "research"]);

const MODEL_MAP = {
  standard: "gpt-4.1",
  fast:     "gpt-4.1-mini",
} as const;

const MAX_TOKENS: Record<AiMode, number> = {
  problem:   800,
  tutor:    1800,
  research: 2400,
  simplify:  600,
  hints:     400,
  rewrites:  700,
};

const TEMPERATURE: Record<AiMode, number> = {
  problem:  0.3,
  tutor:    0.7,
  research: 0.3,
  simplify: 0.5,
  hints:    0.5,
  rewrites: 0.7,
};

const FETCH_TIMEOUT_MS   = 20_000;
const PROFILE_TIMEOUT_MS = 5_000; // fetchProfile must resolve within 5 s or we skip the pre-check

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getModelForMode(mode: AiMode): string {
  return STANDARD_MODES.has(mode) ? MODEL_MAP.standard : MODEL_MAP.fast;
}

function createTimeoutController(originalSignal?: AbortSignal): AbortController {
  const controller = new AbortController();
  const onAbort = () => controller.abort();

  if (originalSignal) {
    if (originalSignal.aborted) { controller.abort(); }
    else { originalSignal.addEventListener("abort", onAbort, { once: true }); }
  }

  const timeoutId = window.setTimeout(onAbort, FETCH_TIMEOUT_MS);
  const cleanup = () => {
    window.clearTimeout(timeoutId);
    if (originalSignal) originalSignal.removeEventListener("abort", onAbort);
  };
  controller.signal.addEventListener("abort", cleanup, { once: true });
  return controller;
}

/** Races a promise against a timeout. Returns null on timeout instead of throwing. */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let id: number;
  const timer = new Promise<null>((resolve) => { id = window.setTimeout(() => resolve(null), ms); });
  try {
    const result = await Promise.race([promise, timer]);
    return result;
  } finally {
    window.clearTimeout(id!);
  }
}

async function promiseWithTimeout<T>(promise: Promise<T>, ms: number, msg: string): Promise<T> {
  let id: number;
  const timer = new Promise<never>((_, reject) => {
    id = window.setTimeout(() => reject(new Error(msg)), ms);
  });
  try {
    return await Promise.race([promise, timer]);
  } finally {
    window.clearTimeout(id!);
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth()    === b.getUTCMonth()    &&
    a.getUTCDate()     === b.getUTCDate()
  );
}

function getFreeTierStatus(profile: any, subscriptions: any[]) {
  if (!profile?.created_at) return { eligible: false, remaining: 0 };

  const createdAt    = new Date(profile.created_at);
  const within30Days = Date.now() - createdAt.getTime() <= 30 * DAY_MS;
  const hasPaidTier  = subscriptions.some((s: any) =>
    s.status === "active" && ["monthly", "yearly", "one_time"].includes(s.plans?.billing_type)
  );

  if (!within30Days || hasPaidTier) return { eligible: false, remaining: 0 };

  const resetAt  = profile.daily_free_credits_reset_at
    ? new Date(profile.daily_free_credits_reset_at)
    : new Date(0);
  const usedToday = isSameUtcDay(resetAt, new Date())
    ? (profile.daily_free_credits_used ?? 0)
    : 0;

  return { eligible: true, remaining: Math.max(0, 10 - usedToday) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — streamAi
// ─────────────────────────────────────────────────────────────────────────────

export async function streamAi(opts: StreamOptions): Promise<void> {
  const { mode, input, mindset, depth, citationStyle, imageBase64, imageMimeType, onDelta, onDone, onError, signal } = opts;
  const { customApiKey, customApiBase } = useSettings.getState();

  console.log("[streamAi] mode:", mode, "| customApiKey:", !!customApiKey);

  // ── Credit pre-check (server-key path only) ────────────────────────────
  // We give fetchProfile() 5 seconds. If it hangs (e.g. no session, network
  // issue) we skip the client-side pre-check and let the edge function decide.
  if (!customApiKey) {
    console.log("[streamAi] attempting credit pre-check (5 s timeout)...");

    const state = useUserProfile.getState();
    let profile = state.profile;
    let subscriptions = state.subscriptions;

    if (!profile) {
      console.log("[streamAi] no cached profile, fetching profile...");
      const profileResult = await withTimeout(state.fetchProfile(), PROFILE_TIMEOUT_MS);
      if (profileResult === null) {
        console.warn("[streamAi] fetchProfile timed out — skipping client-side credit check");
      }
      profile = state.profile;
      subscriptions = state.subscriptions;
    } else {
      console.log("[streamAi] using cached profile for client-side credit check");
    }

    if (profile) {
      const paidCredits = profile.credits ?? 0;
      const freeStatus = getFreeTierStatus(profile, subscriptions);
      const total = paidCredits + freeStatus.remaining;

      console.log("[streamAi] credits available:", total);

      if (total < 1) {
        const message = freeStatus.eligible
          ? "You've used your 10 daily free credits. Please wait until tomorrow."
          : "Insufficient credits. Please purchase credits, upgrade your plan, or add a custom API key.";
        onError(message);
        return;
      }
    }
  }

  // ── Fetch ──────────────────────────────────────────────────────────────
  console.log("[streamAi] sending request to", customApiKey ? "custom API" : "Supabase edge function");

  let resp: Response;
  try {
    resp = customApiKey
      ? await fetchFromCustomApi({ customApiKey, customApiBase, mode, input, mindset, depth, citationStyle, imageBase64, imageMimeType, signal })
      : await fetchFromSupabase({ mode, input, mindset, depth, citationStyle, imageBase64, imageMimeType, signal });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") return;
    console.error("[streamAi] fetch threw:", error);
    onError(error instanceof Error ? error.message : "An unexpected network error occurred.");
    return;
  }

  // ── HTTP errors ────────────────────────────────────────────────────────
  if (!resp.ok) {
    const msg = await extractErrorMessage(resp);
    console.error("[streamAi] HTTP error:", resp.status, msg);
    onError(msg);
    return;
  }

  if (!resp.body) {
    onError("The server returned an empty response. Please try again.");
    return;
  }

  // ── Stream ─────────────────────────────────────────────────────────────
  let finalOutput = "";
  try {
    await promiseWithTimeout(
      consumeSseStream(resp.body, (chunk) => {
        finalOutput += chunk;
        onDelta(chunk);
      }),
      60_000,
      "AI response timed out. Please try again."
    );
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") return;
    console.error("[streamAi] stream error:", error);
    onError(error instanceof Error ? error.message : "Stream error.");
    return;
  }

  console.log("[streamAi] stream complete, total chars:", finalOutput.length);

  // ── Post-completion: deduct credits + log history ──────────────────────
  if (!customApiKey) {
    const deducted = await withTimeout(useUserProfile.getState().deductCredits(1), PROFILE_TIMEOUT_MS);
    if (!deducted) {
      console.warn("[streamAi] credit deduction failed (response already delivered)");
    }
    void logChatHistory(opts, finalOutput);
  }

  onDone(finalOutput);
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch helpers
// ─────────────────────────────────────────────────────────────────────────────

interface BaseFetchArgs {
  mode:           AiMode;
  input:          string;
  mindset?:       StreamOptions["mindset"];
  depth?:         StreamOptions["depth"];
  citationStyle?: string;
  imageBase64?:   StreamOptions["imageBase64"];
  imageMimeType?: StreamOptions["imageMimeType"];
  signal?:        AbortSignal;
}

function fetchFromSupabase(args: BaseFetchArgs): Promise<Response> {
  const { mode, input, mindset, depth, citationStyle, imageBase64, imageMimeType, signal } = args;

  console.log("[fetchFromSupabase] URL:", SUPABASE_FN_URL);
  console.log("[fetchFromSupabase] key present:", !!SUPABASE_ANON_KEY, "| key prefix:", SUPABASE_ANON_KEY?.slice(0, 20));

  const ctrl = createTimeoutController(signal);
  return fetch(SUPABASE_FN_URL, {
    method: "POST",
    signal: ctrl.signal,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ mode, input, mindset, depth, citationStyle, imageBase64, imageMimeType }),
  });
}

function fetchFromCustomApi(
  args: BaseFetchArgs & { customApiKey: string; customApiBase?: string }
): Promise<Response> {
  const { customApiKey, customApiBase, mode, input, mindset, depth, citationStyle, imageBase64, imageMimeType, signal } = args;
  const baseUrl      = (customApiBase ?? DEFAULT_OPENAI_BASE).replace(/\/$/, "");
  const systemPrompt = buildSystemPrompt(mode, mindset, depth, citationStyle);
  const ctrl         = createTimeoutController(signal);

  return fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    signal: ctrl.signal,
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${customApiKey}`,
    },
    body: JSON.stringify({
      model:       getModelForMode(mode),
      stream:      true,
      max_tokens:  MAX_TOKENS[mode],
      temperature: TEMPERATURE[mode],
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: imageBase64
            ? [
                { type: "input_text", text: input.trim() },
                { type: "input_image", image_url: `data:${imageMimeType};base64,${imageBase64}` },
              ]
            : input.trim(),
        },
      ],
    }),
  });
}

async function logChatHistory(opts: StreamOptions, response: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await (supabase as any).from("chat_history").insert({
      user_id:      user.id,
      mode:         opts.mode,
      prompt:       opts.input,
      response,
      credits_used: 1,
    });
  } catch (error) {
    console.warn("[aiService] Failed to log chat history:", error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Error extraction
// ─────────────────────────────────────────────────────────────────────────────

async function extractErrorMessage(resp: Response): Promise<string> {
  try {
    const body = await resp.json();
    if (typeof body?.error === "string")          return body.error;
    if (typeof body?.error?.message === "string") return body.error.message;
  } catch { /* not JSON */ }

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