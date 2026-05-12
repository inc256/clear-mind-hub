import { create } from "zustand";

interface SettingsState {
  language: string;
  setLanguage: (l: string) => void;
}

const STORAGE_KEY = "organyze.settings.v1";

const load = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const initial = load() ?? {};

export const useSettings = create<SettingsState>((set, get) => ({
  language: initial.language ?? "en",
  setLanguage: (l) => {
    set({ language: l });
    persist(get());
  },
}));

function persist(state: SettingsState) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        language: state.language,
      }),
    );
  } catch {
    /* noop */
  }
}