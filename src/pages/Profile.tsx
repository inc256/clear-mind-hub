import { useSettings } from "@/store/settings";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Shield, Key, ChevronDown, Sparkles, Globe } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
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
  { value: "sw", label: "Swahili" },
];

const Profile = () => {
  const s = useSettings();
  const { t, i18n } = useTranslation();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [tmpKey, setTmpKey] = useState(s.customApiKey);
  const [tmpBase, setTmpBase] = useState(s.customApiBase);

  useEffect(() => {
    if (s.language && s.language !== i18n.language) {
      i18n.changeLanguage(s.language);
    }
  }, [s.language, i18n]);

  const saveKeys = () => {
    s.setCustomApiKey(tmpKey.trim());
    s.setCustomApiBase(tmpBase.trim());
    toast.success("API settings saved");
  };

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
              <Select value={i18n.language} placeholder="" onValueChange={(value) => {
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

      {/* AI provider info */}
      <section className="glass-card rounded-2xl p-5 sm:p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="grid place-items-center h-10 w-10 rounded-xl bg-primary text-primary-foreground">
            <Sparkles size={18} />
          </div>
          <div>
            <h2 className="font-semibold">{t('profile.ai.title')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('profile.ai.description')}
            </p>
          </div>
        </div>

          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className="mt-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors"
          >
            <Key size={12} />
            {t('profile.ai.advanced')}
            <ChevronDown size={14} className={`transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
          </button>

        {showAdvanced && (
          <div className="mt-4 space-y-3 animate-fade-in">
            <div>
              <Label htmlFor="apikey" className="text-xs">{t('profile.ai.apiKey')}</Label>
              <Input
                id="apikey"
                type="password"
                value={tmpKey}
                onChange={(e) => setTmpKey(e.target.value)}
                placeholder="sk-…"
                autoComplete="off"
              />
            </div>
            <div>
              <Label htmlFor="apibase" className="text-xs">{t('profile.ai.apiBase')}</Label>
              <Input
                id="apibase"
                value={tmpBase}
                onChange={(e) => setTmpBase(e.target.value)}
                placeholder="https://api.openai.com/v1"
              />
            </div>
            <Button onClick={saveKeys} size="sm" className="bg-primary">
              {t('profile.ai.save')}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              {s.privacyMode
                ? t('profile.ai.privacyNotice')
                : t('profile.ai.normalNotice')}
            </p>
          </div>
        )}
      </section>

      <p className="text-center text-xs text-muted-foreground pt-4">
        {t('profile.footer')}
      </p>
    </div>
  );
};

export default Profile;
