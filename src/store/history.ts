import { create } from "zustand";

import { supabase } from "@/integrations/supabase/client";
import type { AiMode } from "@/services/ai/types";

export interface HistoryEntry {
  id: string;
  mode: AiMode;
  input: string;
  output: string;
  timestamp: number;
  practiceQuestions?: any; // For tutor mode practice questions
  imageData?: string | null;
  imageMimeType?: string | null;
  imageName?: string | null;
  documentData?: string | null;
  documentMimeType?: string | null;
  documentName?: string | null;
  voiceTranscript?: string | null;
  codeSnippets?: Array<{ id: string; content: string; language?: string }>;
  remoteId?: string; // For tracking Supabase records
}

const STORAGE_KEY = "organyze.history.v1";

function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    /* noop */
  }
  return [];
}

interface HistoryState {
  items: HistoryEntry[];
  addEntry: (entry: Omit<HistoryEntry, "id" | "timestamp">) => void;
  clearHistory: () => void;
  loadFromSupabase: () => Promise<void>;
}

 export const useHistory = create<HistoryState>((set) => {


   return {
     items: loadHistory(),
      addEntry: ({ mode, input, output, imageData, imageMimeType, imageName, documentData, documentMimeType, documentName, voiceTranscript, codeSnippets }) => {
        const entry: HistoryEntry = {
          id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          mode,
          input,
          output,
          timestamp: Date.now(),
          imageData,
          imageMimeType,
          imageName,
          documentData,
          documentMimeType,
          documentName,
          voiceTranscript,
          codeSnippets,
        };

        set((state) => {
          const next = [entry, ...state.items].slice(0, 100);
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          } catch {
            /* noop */
          }
          return { items: next };
        });
     },
      clearHistory: () => {
        set({ items: [] });
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* noop */
        }
      },
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

          if (remoteHistory && remoteHistory.length > 0) {
          const remoteEntries: HistoryEntry[] = remoteHistory.map(item => ({
            id: item.id,
            mode: item.mode as AiMode,
            input: item.prompt,
            output: item.response.replace(/\{"practice_questions"[\s\S]*$/, "").trim(),
            timestamp: new Date(item.created_at).getTime(),
            practiceQuestions: item.code_snippets ? JSON.parse(item.code_snippets) : undefined, // practice questions stored in code_snippets field
            remoteId: item.id,
          }));

            // Merge with local history, preferring remote entries for duplicates
            const localEntries = loadHistory();
            const merged = [...remoteEntries];

            // Add local entries that don't exist remotely
            for (const local of localEntries) {
              const exists = merged.some(remote => remote.timestamp === local.timestamp && remote.input === local.input);
              if (!exists) {
                merged.push(local);
              }
            }

            // Sort by timestamp descending and limit to 100
            merged.sort((a, b) => b.timestamp - a.timestamp);
            const finalItems = merged.slice(0, 100);

            set({ items: finalItems });

            // Update localStorage with merged data
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(finalItems));
            } catch {
              /* noop */
            }
          }
        } catch (error) {
          console.warn("[history] Failed to load from Supabase:", error);
        }
      },
    };
 });
