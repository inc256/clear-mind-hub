// ─────────────────────────────────────────────────────────────────────────────
// src/services/aiService.ts
// ─────────────────────────────────────────────────────────────────────────────

import { useUserProfile } from "@/store/userProfile";
import { useHistory } from "@/store/history";
import { consumeSseStream } from "./ai/sseParser";
import type { AiMode, StreamOptions } from "./ai/types";
import { supabase } from "@/integrations/supabase/client";

export type { AiMode, MindsetType, DepthLevel, StreamOptions } from "./ai/types";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_FN_URL     = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/prompt-edge-function`;
const SUPABASE_ANON_KEY   = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

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

function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export function getFreeTierStatus(profile: any, subscriptions: any[]) {
  if (!profile?.created_at) return { eligible: false, remaining: 0 };

  const hasActiveSubscription = subscriptions.some((s: any) =>
    s.status === "active" && ["monthly", "yearly"].includes(s.plans?.billing_type)
  );

  if (hasActiveSubscription) return { eligible: false, remaining: 0 };

  const resetAt = profile.daily_free_credits_reset_at
    ? new Date(profile.daily_free_credits_reset_at)
    : new Date(0);
  const usedToday = isSameUtcDay(resetAt, new Date())
    ? (profile.daily_free_credits_used ?? 0)
    : 0;

  return { eligible: true, remaining: Math.max(0, 10 - usedToday) };
}

export function getAiCreditCost(mode: AiMode, depth?: string, citationStyle?: string, hasPaidSubscription?: boolean, totalCredits?: number) {
  console.log("[getAiCreditCost] input", { mode, depth, citationStyle, hasPaidSubscription, totalCredits });
  // Premium users (paid subscription) get all features for free
  if (hasPaidSubscription) {
    return { cost: 0, premium: false, premiumPrice: 0, label: "Free" };
  }

  // Check if user has purchased credits (credits beyond daily free 10)
  const hasPurchasedCredits = totalCredits ? totalCredits > 10 : false;

  // Free users can only use specific features
  if (mode === "simplify" || mode === "hints" || mode === "rewrites" || mode === "problem") {
    return { cost: 0, premium: false, premiumPrice: 0, label: "Free" };
  }

  // Tutor mode pricing based on depth
  if (mode === "tutor") {
    if (depth === "beginner") {
      return { cost: 1, premium: false, premiumPrice: 0, label: "1 credit" };
    } else if (depth === "intermediate") {
      return { cost: 2, premium: false, premiumPrice: 0, label: "2 credits" };
    } else if (depth === "higher") {
      return { cost: 5, premium: false, premiumPrice: 0, label: "5 credits" };
    } else if (depth === "advanced") {
      // Allow advanced tutor for users with purchased credits
      if (hasPurchasedCredits) {
        return { cost: 10, premium: false, premiumPrice: 0, label: "10 credits" };
      } else {
        return { cost: 0, premium: true, premiumPrice: 0, label: "Premium required" };
      }
    }
  }

  // Research mode pricing based on depth
  if (mode === "research") {
    if (depth === "beginner") {
      return { cost: 3, premium: false, premiumPrice: 0, label: "3 credits" };
    } else if (depth === "intermediate") {
      return { cost: 5, premium: false, premiumPrice: 0, label: "5 credits" };
    } else if (depth === "higher") {
      return { cost: 10, premium: false, premiumPrice: 0, label: "10 credits" };
    } else if (depth === "advanced") {
      // Research Advanced costs $5
      return { cost: 0, premium: false, premiumPrice: 5, label: "$5" };
    }
  }

  // All other features require premium subscription
  return { cost: 0, premium: true, premiumPrice: 0, label: "Premium required" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — streamAi
// ─────────────────────────────────────────────────────────────────────────────

export async function streamAi(opts: StreamOptions): Promise<void> {
  const { mode, input, mindset, depth, citationStyle, imageBase64, imageMimeType, documentBase64, documentMimeType, voiceTranscript, onDelta, onDone, onError, signal } = opts;

  let subscriptions: any[] = [];

  // ── Credit pre-check (server-key path only) ────────────────────────────
  // We give fetchProfile() 5 seconds. If it hangs (e.g. no session, network
  // issue) we skip the client-side credit check and let the edge function decide.
  const state = useUserProfile.getState();
  let profile = state.profile;
  subscriptions = state.subscriptions;

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

  const costInfo = getAiCreditCost(mode, depth, citationStyle, subscriptions.some((s: any) => s.status === "active"), profile ? (profile.credits ?? 0) + getFreeTierStatus(profile, subscriptions).remaining : 0);

  if (costInfo.premium) {
    onError("This feature requires a premium subscription. Please upgrade your plan to access all features.");
    return;
  }

  // Handle dollar-priced features (like Research Advanced)
  if (costInfo.premiumPrice > 0) {
    onError(`This feature costs ${costInfo.label}. Please upgrade your plan to access premium features.`);
    return;
  }

  if (profile && costInfo.cost > 0) {
    const paidCredits = profile.credits ?? 0;
    const freeStatus = getFreeTierStatus(profile, subscriptions);
    const total = paidCredits + freeStatus.remaining;

    console.log("[streamAi] credits available:", total, "required:", costInfo.cost);

    if (total < costInfo.cost) {
      const message = freeStatus.eligible
        ? `You need ${costInfo.cost} credits to run this feature. Your free credits are not enough. Please purchase credits or upgrade your plan.`
        : `You need ${costInfo.cost} credits to run this feature. Please purchase credits or upgrade your plan.`;
      onError(message);
      return;
    }
  }

  // ── Fetch ──────────────────────────────────────────────────────────────
  console.log("[streamAi] sending request to Supabase edge function");

  let resp: Response;
  try {
    resp = await fetchFromSupabase({ mode, input, mindset, depth, citationStyle, imageBase64, imageMimeType, documentBase64, documentMimeType, voiceTranscript, signal });
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

  // Extract practice questions for logging
  let practiceQuestions = null;
  if (opts.mode === "tutor" && finalOutput.includes('{"practice_questions"')) {
    try {
      const jsonMatch = finalOutput.match(/\{"practice_questions"[\s\S]*$/);
      if (jsonMatch) {
        practiceQuestions = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.warn("[streamAi] Failed to parse practice questions for logging:", e);
    }
  }

  const costInfoAfter = getAiCreditCost(mode, depth, citationStyle, subscriptions.some((s: any) => s.status === "active"), profile ? (profile.credits ?? 0) + getFreeTierStatus(profile, subscriptions).remaining : 0);
  const creditsUsed = !costInfoAfter.premium ? costInfoAfter.cost : 0;
  const historyLogged = await withTimeout(
    logChatHistory(opts, finalOutput, practiceQuestions, creditsUsed),
    PROFILE_TIMEOUT_MS
  );

  if (!historyLogged) {
    console.warn("[streamAi] history logging failed");
  }

  if (creditsUsed > 0) {
    const deducted = await useUserProfile.getState().deductCredits(creditsUsed);
    if (!deducted) {
      console.error("[streamAi] failed to deduct credits");
    } else {
      console.warn("[streamAi] credits deducted", { creditsUsed, deducted });
    }
    await useUserProfile.getState().fetchProfile();
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
  documentBase64?:   string;
  documentMimeType?: string;
  voiceTranscript?:  string;
  signal?:        AbortSignal;
}

function fetchFromSupabase(args: BaseFetchArgs): Promise<Response> {
  const { mode, input, mindset, depth, citationStyle, imageBase64, imageMimeType, documentBase64, documentMimeType, voiceTranscript, signal } = args;

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
    body: JSON.stringify({ mode, input, mindset, depth, citationStyle, imageBase64, imageMimeType, documentBase64, documentMimeType, voiceTranscript }),
  });
}


async function logChatHistory(opts: StreamOptions, response: string, practiceQuestions?: any, creditsUsed: number = 0): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.warn("[aiService] Not authenticated, cannot log chat history");
      return false;
    }

    console.log("[aiService] logChatHistory start", {
      userId: user.id,
      mode: opts.mode,
      creditsUsed,
      hasImage: !!opts.imageBase64,
      hasDocument: !!opts.documentBase64,
      hasVoiceTranscript: !!opts.voiceTranscript,
    });

    const cleanedResponse = response.replace(/\{"practice_questions"[\s\S]*$/, "").trim();
    
    // Insert into chat_history table
    const { data: chatData, error } = await (supabase as any)
      .from('chat_history')
      .insert({
        user_id: user.id,
        mode: opts.mode,
        prompt: opts.input,
        response: cleanedResponse,
        image_data: opts.imageBase64 ?? null,
        document_data: opts.documentBase64 ?? null,
        code_snippets: practiceQuestions ? practiceQuestions : null,
      })
      .select('id')
      .single();

    if (error) {
      console.error("[aiService] insert chat_history failed:", error);
      return false;
    }

    const chatId = chatData.id;

    console.log("[aiService] Chat history logged successfully", { chatId });
    
    // Add to local history store as well
    useHistory.getState().addEntry({
      mode: opts.mode,
      input: opts.input,
      output: cleanedResponse,
      imageData: opts.imageBase64 ?? null,
      imageMimeType: opts.imageMimeType ?? null,
      imageName: opts.imageName ?? null,
      documentData: opts.documentBase64 ?? null,
      documentMimeType: opts.documentMimeType ?? null,
      documentName: opts.documentName ?? null,
      voiceTranscript: opts.voiceTranscript ?? null,
      codeSnippets: practiceQuestions ? [{ id: '0', content: JSON.stringify(practiceQuestions) }] : undefined,
      remoteId: chatId
    });

    return true;
  } catch (error) {
    console.error("[aiService] Failed to log chat history:", error);
    return false;
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