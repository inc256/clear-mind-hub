import { create } from "zustand";

interface SettingsState {
  privacyMode: boolean;
  customApiKey: string;
  customApiBase: string;
  setPrivacyMode: (v: boolean) => void;
  setCustomApiKey: (k: string) => void;
  setCustomApiBase: (k: string) => void;
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
  privacyMode: initial.privacyMode ?? false,
  customApiKey: initial.customApiKey ?? "",
  customApiBase: initial.customApiBase ?? "",
  setPrivacyMode: (v) => {
    set({ privacyMode: v });
    persist(get());
    if (v) {
      // Wipe any persisted state when enabling privacy mode
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem("organyze.history.v1");
      } catch {
        /* noop */
      }
    }
  },
  setCustomApiKey: (k) => {
    set({ customApiKey: k });
    persist(get());
  },
  setCustomApiBase: (k) => {
    set({ customApiBase: k });
    persist(get());
  },
}));

function persist(state: SettingsState) {
  if (state.privacyMode) return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        privacyMode: state.privacyMode,
        customApiKey: state.customApiKey,
        customApiBase: state.customApiBase,
      }),
    );
  } catch {
    /* noop */
  }
}
