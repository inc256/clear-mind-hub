import { create } from "zustand";
import { useSettings } from "@/store/settings";
import type { AiMode } from "@/services/ai/types";

export interface HistoryEntry {
  id: string;
  mode: AiMode;
  input: string;
  output: string;
  timestamp: number;
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
}

export const useHistory = create<HistoryState>((set) => {
  if (typeof window !== "undefined") {
    useSettings.subscribe(
      (state) => state.privacyMode,
      (privacyMode) => {
        if (privacyMode) {
          try {
            localStorage.removeItem(STORAGE_KEY);
          } catch {
            /* noop */
          }
          set({ items: [] });
        }
      },
    );
  }

  return {
    items: loadHistory(),
    addEntry: ({ mode, input, output }) => {
      const entry: HistoryEntry = {
        id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        mode,
        input,
        output,
        timestamp: Date.now(),
      };

      set((state) => {
        const next = [entry, ...state.items].slice(0, 100);
        if (!useSettings.getState().privacyMode) {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          } catch {
            /* noop */
          }
        }
        return { items: next };
      });
    },
    clearHistory: () => {
      set({ items: [] });
      if (!useSettings.getState().privacyMode) {
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* noop */
        }
      }
    },
  };
});
