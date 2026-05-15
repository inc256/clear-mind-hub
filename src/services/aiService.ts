// ─────────────────────────────────────────────────────────────────────────────
// src/services/aiService.ts
// ─────────────────────────────────────────────────────────────────────────────

import { useUserProfile } from "@/store/userProfile";
import { useHistory } from "@/store/history";
import { consumeSseStream } from "./ai/sseParser";
import type { AiMode, StreamOptions } from "./ai/types";
import { supabase } from "@/integrations/supabase/client";
import { 
  PLAN_FEATURES, 
  PlanId, 
  canAccessTutorLevel, 
  canAccessResearchLevel,
  canUseCitationStyle,
  getMaxInputWords,
  getUploadLimitMB,
  canGenerateAIIllustrations,
  getModelForMode as getPlanModelForMode,
  CREDIT_COSTS
} from "@/lib/planConstants";

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
const PROFILE_TIMEOUT_MS = 5_000;

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
  if (!profile?.created_at) return { eligible: false, remaining: 0, planId: null };

  const trialSubscription = subscriptions.find((s: any) =>
    s.status === "active" && s.plans?.name === "Trial"
  );

  const isTrial = trialSubscription || subscriptions.length === 0;

  if (isTrial) {
    const resetAt = profile.daily_free_credits_reset_at
      ? new Date(profile.daily_free_credits_reset_at)
      : new Date(0);
    const usedToday = isSameUtcDay(resetAt, new Date())
      ? (profile.daily_free_credits_used ?? 0)
      : 0;

    const dailyCredits = PLAN_FEATURES[PlanId.TRIAL].dailyCredits;
    return { 
      eligible: true, 
      remaining: Math.max(0, dailyCredits - usedToday),
      planId: PlanId.TRIAL
    };
  }

  return { eligible: false, remaining: 0, planId: null };
}

export function getUserSubscriptionPlan(subscriptions: any[]): string | null {
  const activeSubscription = subscriptions.find((s: any) => s.status === "active");
  if (!activeSubscription) return null;
  
  const planName = activeSubscription.plans?.name?.toLowerCase();
  if (planName === "trial") return PlanId.TRIAL;
  if (planName === "basic") return PlanId.BASIC;
  if (planName === "pro") return PlanId.PRO;
  if (planName === "ultra") return PlanId.ULTRA;
  
  return null;
}

export function getAiCreditCost(
  mode: AiMode, 
  depth?: string, 
  citationStyle?: string, 
  hasPaidSubscription?: boolean, 
  totalCredits?: number,
  subscriptions?: any[]
) {
  console.log("[getAiCreditCost] input", { mode, depth, citationStyle, hasPaidSubscription, totalCredits });

  if (mode === "simplify" || mode === "hints" || mode === "rewrites" || mode === "problem") {
    return { cost: 0, premium: false, premiumPrice: 0, label: "Free" };
  }

  const userPlan = subscriptions ? getUserSubscriptionPlan(subscriptions) : null;
  const hasBonusCredits = totalCredits ? totalCredits > PLAN_FEATURES[PlanId.TRIAL].dailyCredits : false;
  const effectivePlan = userPlan === null
    ? PlanId.TRIAL
    : userPlan === PlanId.TRIAL && hasBonusCredits
    ? PlanId.BASIC
    : userPlan;

  if (hasPaidSubscription && (effectivePlan === PlanId.PRO || effectivePlan === PlanId.ULTRA)) {
    return { cost: 0, premium: false, premiumPrice: 0, label: "Free" };
  }

  const resolvedDepth = depth ?? "fundamental";

  if (effectivePlan === PlanId.TRIAL) {
    if (mode === "tutor") {
      if (resolvedDepth === "advanced") {
        return { cost: 0, premium: true, premiumPrice: 0, label: "Upgrade required" };
      }
      const cost = CREDIT_COSTS.tutor[resolvedDepth as keyof typeof CREDIT_COSTS.tutor] ?? 0;
      return { cost, premium: false, premiumPrice: 0, label: cost === 0 ? "Free" : `${cost} credits` };
    }

    if (mode === "research") {
      if (resolvedDepth === "fundamental") {
        const cost = CREDIT_COSTS.research.fundamental;
        return { cost, premium: false, premiumPrice: 0, label: `${cost} credits` };
      }
      if (resolvedDepth === "intermediate" || resolvedDepth === "higher") {
        const cost = CREDIT_COSTS.research[resolvedDepth as keyof typeof CREDIT_COSTS.research] ?? 0;
        return { cost, premium: false, premiumPrice: 0, label: cost === 0 ? "Free" : `${cost} credits` };
      }
      return { cost: 0, premium: true, premiumPrice: 0, label: "Ultra plan required" };
    }
  }

  if (effectivePlan === PlanId.BASIC) {
    if (mode === "tutor") {
      const cost = CREDIT_COSTS.tutor[resolvedDepth as keyof typeof CREDIT_COSTS.tutor] ?? 0;
      return { cost, premium: false, premiumPrice: 0, label: cost === 0 ? "Free" : `${cost} credits` };
    }

    if (mode === "research") {
      if (resolvedDepth === "advanced") {
        return { cost: 0, premium: true, premiumPrice: 0, label: "Ultra plan required" };
      }
      const cost = CREDIT_COSTS.research[resolvedDepth as keyof typeof CREDIT_COSTS.research] ?? 0;
      return { cost, premium: false, premiumPrice: 0, label: cost === 0 ? "Free" : `${cost} credits` };
    }
  }

  return { cost: 0, premium: true, premiumPrice: 0, label: "Upgrade required" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — streamAi
// ─────────────────────────────────────────────────────────────────────────────

export async function streamAi(opts: StreamOptions): Promise<void> {
  const { mode, input, mindset, depth, citationStyle, imageBase64, imageMimeType, documentBase64, documentMimeType, voiceTranscript, onDelta, onDone, onError, signal } = opts;

  let subscriptions: any[] = [];

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

  const costInfo = getAiCreditCost(
    mode, depth, citationStyle,
    subscriptions.some((s: any) => s.status === "active"),
    profile ? (profile.credits ?? 0) + getFreeTierStatus(profile, subscriptions).remaining : 0,
    subscriptions
  );

  if (costInfo.premium) {
    onError("This feature requires a plan upgrade. Please visit the subscription page.");
    return;
  }

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

  const costInfoAfter = getAiCreditCost(
    mode, depth, citationStyle,
    subscriptions.some((s: any) => s.status === "active"),
    profile ? (profile.credits ?? 0) + getFreeTierStatus(profile, subscriptions).remaining : 0,
    subscriptions
  );
  const creditsUsed = !costInfoAfter.premium ? costInfoAfter.cost : 0;
  const historyLogged = await withTimeout(
    logChatHistory(opts, finalOutput, creditsUsed),
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

/**
 * Persists the completed AI response to Supabase AND adds it to the local
 * history store. This is the ONLY place either of those things happens —
 * do not call addEntry or supabase.insert for chat_history anywhere else.
 */
async function logChatHistory(
  opts: StreamOptions,
  response: string,
  creditsUsed: number = 0,
): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.warn("[aiService] Not authenticated, cannot log chat history");
      return false;
    }

    // Parse practice questions out of the raw response.
    let practiceQuestions: any = null;
    if (opts.mode === "tutor" && response.includes('{"practice_questions"')) {
      try {
        const jsonMatch = response.match(/\{"practice_questions"[\s\S]*$/);
        if (jsonMatch) practiceQuestions = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.warn("[aiService] Failed to parse practice questions:", e);
      }
    }

    const cleanedResponse = response.replace(/\{"practice_questions"[\s\S]*$/, "").trim();

    console.log("[aiService] logChatHistory start", {
      userId: user.id,
      mode: opts.mode,
      creditsUsed,
      hasImage: !!opts.imageBase64,
      hasDocument: !!opts.documentBase64,
      hasVoiceTranscript: !!opts.voiceTranscript,
      hasPracticeQuestions: !!practiceQuestions,
    });

    // Single addEntry call — the store handles the Supabase upsert internally.
    await useHistory.getState().addEntry({
      mode: opts.mode,
      input: opts.input,
      output: cleanedResponse,
      practiceQuestions,
      imageData: opts.imageBase64 ? `data:${opts.imageMimeType};base64,${opts.imageBase64}` : null,
      imageMimeType: opts.imageMimeType ?? null,
      imageName: opts.imageName ?? null,
      documentData: opts.documentBase64 ? `data:${opts.documentMimeType};base64,${opts.documentBase64}` : null,
      documentMimeType: opts.documentMimeType ?? null,
      documentName: opts.documentName ?? null,
      voiceTranscript: opts.voiceTranscript ?? null,
    });

    console.log("[aiService] Chat history logged successfully");
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