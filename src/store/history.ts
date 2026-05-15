import { create } from "zustand";

import { supabase } from "@/integrations/supabase/client";
import type { AiMode } from "@/services/ai/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HistoryEntry {
  id: string;
  mode: AiMode;
  input: string;
  output: string;
  timestamp: number;
  practiceQuestions?: any;
  imageData?: string | null;
  imageMimeType?: string | null;
  imageName?: string | null;
  documentData?: string | null;
  documentMimeType?: string | null;
  documentName?: string | null;
  voiceTranscript?: string | null;
  codeSnippets?: Array<{ id: string; content: string; language?: string }>;
  remoteId?: string;
}

type DbMode = "tutor" | "research";

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = "organyze.history.v1";

function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* noop */ }
  return [];
}

function saveHistory(items: HistoryEntry[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* noop */ }
}

function clearLocalHistory(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

function toDbMode(mode: AiMode): DbMode | null {
  if (mode === "tutor" || mode === "research") return mode;
  console.warn(`[history] mode "${mode}" is not supported by the DB — entry will be local-only.`);
  return null;
}

interface EntryMetadata {
  imageMimeType?: string | null;
  imageName?: string | null;
  documentMimeType?: string | null;
  documentName?: string | null;
  voiceTranscript?: string | null;
  practiceQuestions?: any;
}

function encodeMetadata(entry: Partial<HistoryEntry>): EntryMetadata {
  return {
    imageMimeType: entry.imageMimeType ?? null,
    imageName: entry.imageName ?? null,
    documentMimeType: entry.documentMimeType ?? null,
    documentName: entry.documentName ?? null,
    voiceTranscript: entry.voiceTranscript ?? null,
    practiceQuestions: entry.practiceQuestions ?? null,
  };
}

function decodeMetadata(raw: any): Partial<EntryMetadata> {
  if (!raw || typeof raw !== "object") return {};
  return {
    imageMimeType: raw.imageMimeType ?? null,
    imageName: raw.imageName ?? null,
    documentMimeType: raw.documentMimeType ?? null,
    documentName: raw.documentName ?? null,
    voiceTranscript: raw.voiceTranscript ?? null,
    practiceQuestions: raw.practiceQuestions ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Promise-based mutex
//
// Keyed by fingerprint (mode + first 120 chars of input).
// Any concurrent addEntry call for the same fingerprint chains onto the
// previous promise, so calls execute serially and the second call always
// sees the completed state of the first (including remoteId).
// ---------------------------------------------------------------------------

const _mutex = new Map<string, Promise<void>>();

function fingerprint(mode: AiMode, input: string): string {
  return `${mode}::${input.slice(0, 120)}`;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface HistoryState {
  items: HistoryEntry[];
  addEntry: (entry: Omit<HistoryEntry, "id" | "timestamp">) => Promise<void>;
  clearHistory: () => Promise<void>;
  loadFromSupabase: () => Promise<void>;
}

export const useHistory = create<HistoryState>((set, get) => ({
  items: loadHistory(),

  // -------------------------------------------------------------------------
  addEntry: (payload) => {
    const fp = fingerprint(payload.mode, payload.input);

    // Chain onto any existing promise for this fingerprint so calls are serial.
    const prev = _mutex.get(fp) ?? Promise.resolve();

    const next = prev.then(async () => {
      const {
        mode, input, output,
        imageData, imageMimeType, imageName,
        documentData, documentMimeType, documentName,
        voiceTranscript, codeSnippets, practiceQuestions,
      } = payload;

      // After awaiting the previous call, check if an entry already exists.
      const existing = get().items.find(
        (e) => e.mode === mode && e.input === input
      );

      if (existing) {
        // ── Update existing entry (e.g. practice questions arrived) ──────────
        const merged: HistoryEntry = {
          ...existing,
          output,
          practiceQuestions: practiceQuestions ?? existing.practiceQuestions,
          codeSnippets: codeSnippets ?? existing.codeSnippets,
        };

        set((state) => {
          const next = state.items.map((e) => e.id === existing.id ? merged : e);
          saveHistory(next);
          return { items: next };
        });

        // Patch Supabase row if already synced.
        if (existing.remoteId) {
          try {
            const metadata = encodeMetadata(merged);
            const { error } = await supabase
              .from("chat_history")
              .update({
                response: output,
                code_snippets: merged.codeSnippets ? (merged.codeSnippets as any) : null,
                image_processing_metadata: metadata as any,
              })
              .eq("id", existing.remoteId);
            if (error) console.warn("[history] Supabase update error:", error);
          } catch (err) {
            console.warn("[history] Supabase update error:", err);
          }
        }
        return;
      }

      // ── Brand-new entry ───────────────────────────────────────────────────
      const id =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const entry: HistoryEntry = {
        id, mode, input, output,
        timestamp: Date.now(),
        imageData, imageMimeType, imageName,
        documentData, documentMimeType, documentName,
        voiceTranscript, codeSnippets, practiceQuestions,
      };

      // 1. Write locally immediately.
      set((state) => {
        const next = [entry, ...state.items].slice(0, 100);
        saveHistory(next);
        return { items: next };
      });

      // 2. Write to Supabase.
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const dbMode = toDbMode(mode);
        if (!dbMode) return;

        const metadata = encodeMetadata(entry);

        const { data: upserted, error } = await supabase
          .from("chat_history")
          .upsert(
            {
              id,
              user_id: user.id,
              mode: dbMode,
              prompt: input,
              response: output,
              image_data: imageData ?? null,
              document_data: documentData ?? null,
              code_snippets: codeSnippets ? (codeSnippets as any) : null,
              image_processing_metadata: metadata as any,
            },
            { onConflict: "id" }
          )
          .select("id")
          .single();

        if (error) {
          console.warn("[history] Failed to upsert entry to Supabase:", error);
          return;
        }

        // Tag local entry with confirmed remoteId so future updates go to .update().
        set((state) => {
          const next = state.items.map((e) =>
            e.id === id ? { ...e, remoteId: upserted.id } : e
          );
          saveHistory(next);
          return { items: next };
        });
      } catch (err) {
        console.warn("[history] Supabase addEntry error:", err);
      }
    });

    // Store the chained promise; clean up once settled.
    _mutex.set(fp, next);
    next.finally(() => {
      // Only delete if this is still the latest promise for the fingerprint.
      if (_mutex.get(fp) === next) _mutex.delete(fp);
    });

    return next;
  },

  // -------------------------------------------------------------------------
  clearHistory: async () => {
    set({ items: [] });
    clearLocalHistory();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("chat_history")
        .delete()
        .eq("user_id", user.id);

      if (error) console.warn("[history] Failed to clear Supabase history:", error);
    } catch (err) {
      console.warn("[history] Supabase clearHistory error:", err);
    }
  },

  // -------------------------------------------------------------------------
  loadFromSupabase: async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: remoteHistory, error } = await supabase
        .from("chat_history")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        console.warn("[history] Failed to load from Supabase:", error);
        return;
      }

      const remoteEntries: HistoryEntry[] = (remoteHistory ?? []).map((item) => {
        const meta = decodeMetadata(item.image_processing_metadata);
        return {
          id: item.id,
          remoteId: item.id,
          mode: item.mode as AiMode,
          input: item.prompt,
          output: item.response.replace(/\{"practice_questions"[\s\S]*$/, "").trim(),
          timestamp: new Date(item.created_at).getTime(),
          imageData: item.image_data ?? null,
          documentData: item.document_data ?? null,
          codeSnippets: Array.isArray(item.code_snippets)
            ? (item.code_snippets as Array<{ id: string; content: string; language?: string }>)
            : undefined,
          imageMimeType: meta.imageMimeType,
          imageName: meta.imageName,
          documentMimeType: meta.documentMimeType,
          documentName: meta.documentName,
          voiceTranscript: meta.voiceTranscript,
          practiceQuestions: meta.practiceQuestions,
        };
      });

      const localEntries = loadHistory();
      const remoteIds = new Set(remoteEntries.map((e) => e.id));

      const localOnly = localEntries.filter((l) => {
        if (remoteIds.has(l.id)) return false;
        return !remoteEntries.some(
          (r) => r.timestamp === l.timestamp && r.input === l.input
        );
      });

      const merged = [...remoteEntries, ...localOnly]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 100);

      set({ items: merged });
      saveHistory(merged);
    } catch (err) {
      console.warn("[history] loadFromSupabase error:", err);
    }
  },
}));