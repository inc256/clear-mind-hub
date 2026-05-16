import { useEffect } from "react";
import i18n from "@/i18n";
import { useSettings } from "@/store/settings";

export default function LanguageWatcher() {
  const language = useSettings((s) => s.language);

  useEffect(() => {
    if (!language) return;
    if (i18n.language !== language) {
      i18n.changeLanguage(language).catch(() => {});
    }

    // set document direction for RTL languages
    const rtl = ['ar', 'he', 'fa', 'ur'];
    document.documentElement.dir = rtl.includes(language) ? 'rtl' : 'ltr';
  }, [language]);

  return null;
}
