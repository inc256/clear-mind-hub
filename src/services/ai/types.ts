// ─────────────────────────────────────────────────────────────────────────────
// src/services/ai/types.ts
// Shared types used across all AI service modules
// ─────────────────────────────────────────────────────────────────────────────

export type AiMode = "problem" | "tutor" | "research" | "simplify" | "hints" | "rewrites";

export type MindsetType =
  | "general"
  | "medical"
  | "engineering"
  | "lecturer"
  | "scientific"
  | "creative";

export type DepthLevel = "beginner" | "intermediate" | "advanced";

export interface StreamOptions {
  mode: AiMode;
  input: string;
  mindset?: MindsetType;
  depth?: DepthLevel;
  citationStyle?: string;
  onDelta: (chunk: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
  signal?: AbortSignal;
}
