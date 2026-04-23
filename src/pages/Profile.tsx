import { useSettings, Depth } from "@/store/settings";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Shield, Sliders, Key, ChevronDown, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const depthOptions: { value: Depth; label: string; desc: string }[] = [
  { value: "simple", label: "Simple", desc: "Short and beginner-friendly" },
  { value: "balanced", label: "Balanced", desc: "Clear, not exhaustive" },
  { value: "deep", label: "Deep", desc: "Nuance, edge cases, depth" },
];

const Profile = () => {
  const s = useSettings();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [tmpKey, setTmpKey] = useState(s.customApiKey);
  const [tmpBase, setTmpBase] = useState(s.customApiBase);

  const saveKeys = () => {
    s.setCustomApiKey(tmpKey.trim());
    s.setCustomApiBase(tmpBase.trim());
    toast.success("API settings saved");
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <header className="space-y-2">
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">Profile & Settings</h1>
        <p className="text-muted-foreground text-sm">Configure how Organyze thinks and stores data.</p>
      </header>

      {/* Privacy */}
      <section className="glass-card rounded-2xl p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="grid place-items-center h-10 w-10 rounded-xl bg-accent text-primary-deep">
            <Shield size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">Privacy mode</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Don't store anything locally. Everything is session-only.
                </p>
              </div>
              <Switch checked={s.privacyMode} onCheckedChange={s.setPrivacyMode} />
            </div>
            {s.privacyMode && (
              <div className="mt-3 rounded-xl bg-accent/60 border border-primary/15 px-3 py-2 text-xs text-accent-foreground">
                ✓ Privacy mode active — settings, API keys, and history are kept in memory only.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Depth */}
      <section className="glass-card rounded-2xl p-5 sm:p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="grid place-items-center h-10 w-10 rounded-xl bg-accent text-primary-deep">
            <Sliders size={18} />
          </div>
          <div>
            <h2 className="font-semibold">Response depth</h2>
            <p className="text-sm text-muted-foreground">How thoroughly should Organyze reason?</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-3 gap-2">
          {depthOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => s.setDepth(opt.value)}
              className={`text-left rounded-xl border px-4 py-3 transition-all ${
                s.depth === opt.value
                  ? "border-primary bg-accent shadow-glow"
                  : "border-border/60 bg-card/50 hover:border-primary/30"
              }`}
            >
              <div className="font-semibold text-sm">{opt.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
            </button>
          ))}
        </div>
      </section>

      {/* AI provider info */}
      <section className="glass-card rounded-2xl p-5 sm:p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="grid place-items-center h-10 w-10 rounded-xl bg-primary text-primary-foreground">
            <Sparkles size={18} />
          </div>
          <div>
            <h2 className="font-semibold">AI engine</h2>
            <p className="text-sm text-muted-foreground">
              Powered by Lovable AI by default — no API key needed.
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className="mt-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors"
        >
          <Key size={12} />
          Advanced — use my own API key
          <ChevronDown size={14} className={`transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
        </button>

        {showAdvanced && (
          <div className="mt-4 space-y-3 animate-fade-in">
            <div>
              <Label htmlFor="apikey" className="text-xs">OpenAI-compatible API key</Label>
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
              <Label htmlFor="apibase" className="text-xs">API base URL (optional)</Label>
              <Input
                id="apibase"
                value={tmpBase}
                onChange={(e) => setTmpBase(e.target.value)}
                placeholder="https://api.openai.com/v1"
              />
            </div>
            <Button onClick={saveKeys} size="sm" className="bg-primary">
              Save
            </Button>
            <p className="text-[11px] text-muted-foreground">
              {s.privacyMode
                ? "Privacy mode ON: kept in memory only."
                : "Stored in your browser's localStorage."}
            </p>
          </div>
        )}
      </section>

      <p className="text-center text-xs text-muted-foreground pt-4">
        Tyn Tutor · Think Better. Learn Smarter.
      </p>
    </div>
  );
};

export default Profile;
