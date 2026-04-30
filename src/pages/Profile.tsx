import { useSettings } from "@/store/settings";
import { Switch } from "@/components/ui/switch";

import { Shield, Globe } from "lucide-react";
import { useState, useEffect } from "react";

import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const languageOptions = [
  { value: "en", label: "English" },
  { value: "ar", label: "العربية (Arabic)" },
  { value: "fr", label: "Français (French)" },
  { value: "zh", label: "中文 (Chinese)" },
  { value: "sw", label: "Kiswahili (Swahili)" },
];

const Profile = () => {
  const s = useSettings();
  const { t, i18n } = useTranslation();


  useEffect(() => {
    if (s.language && s.language !== i18n.language) {
      i18n.changeLanguage(s.language);
    }
  }, [s.language, i18n]);



  return (
    <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <header className="space-y-2">
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">{t('profile.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('profile.subtitle')}</p>
      </header>

      {/* Privacy */}
      <section className="glass-card rounded-2xl p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="grid place-items-center h-10 w-10 rounded-xl bg-accent text-primary">
            <Shield size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{t('profile.privacy.title')}</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {t('profile.privacy.description')}
                </p>
              </div>
              <Switch checked={s.privacyMode} onCheckedChange={s.setPrivacyMode} />
            </div>
            {s.privacyMode && (
              <div className="mt-3 rounded-xl bg-accent/60 border border-primary/15 px-3 py-2 text-xs text-accent-foreground">
                {t('profile.privacy.active')}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Language */}
      <section className="glass-card rounded-2xl p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="grid place-items-center h-10 w-10 rounded-xl bg-accent text-primary">
            <Globe size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{t('profile.language.title')}</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {t('profile.language.description')}
                </p>
              </div>
            </div>
            <div className="mt-3">
              <Select value={i18n.language || "en"} placeholder="" onValueChange={(value) => {
                i18n.changeLanguage(value);
                s.setLanguage(value);
              }}>
                <SelectTrigger className="w-full max-w-xs">
                  <SelectValue placeholder="" />
                </SelectTrigger>
                <SelectContent>
                  {languageOptions.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </section>



      <p className="text-center text-xs text-muted-foreground pt-4">
        {t('profile.footer')}
      </p>
    </div>
  );
};

export default Profile;
