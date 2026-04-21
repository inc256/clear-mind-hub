import { useRef, useState } from "react";
import { streamAi, AiMode } from "@/services/aiService";
import { OutputCard } from "@/components/OutputCard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUp, Square, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface AiWorkspaceProps {
  mode: AiMode;
  title: string;
  subtitle: string;
  placeholder: string;
  examples: string[];
  acceptFile?: boolean;
}

export function AiWorkspace({ mode, title, subtitle, placeholder, examples, acceptFile }: AiWorkspaceProps) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastInputRef = useRef("");

  const run = async (text: string) => {
    if (!text.trim() || loading) return;
    lastInputRef.current = text;
    setOutput("");
    setLoading(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    await streamAi({
      mode,
      input: text,
      signal: ctrl.signal,
      onDelta: (chunk) => setOutput((p) => p + chunk),
      onDone: () => setLoading(false),
      onError: (msg) => {
        setLoading(false);
        toast.error(msg);
      },
    });
  };

  const handleFile = async (file: File) => {
    if (file.size > 1_000_000) {
      toast.error("File too large (max 1MB for MVP)");
      return;
    }
    try {
      const text = await file.text();
      setInput(text.slice(0, 18000));
      toast.success(`Loaded ${file.name}`);
    } catch {
      toast.error("Couldn't read file");
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <header className="space-y-2">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
          <Sparkles size={12} /> {mode === "problem" ? "Problem solver" : "Research engine"}
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
          <span className="text-gradient">{title}</span>
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base max-w-xl">{subtitle}</p>
      </header>

      <div className="glass-card rounded-2xl p-3 sm:p-4">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          className="min-h-[140px] resize-none border-0 bg-transparent text-base shadow-none focus-visible:ring-0 px-2"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              run(input);
            }
          }}
        />
        <div className="flex items-center justify-between gap-2 pt-2 px-1">
          <div className="flex items-center gap-2">
            {acceptFile && (
              <label className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-primary transition-colors">
                <input
                  type="file"
                  accept=".txt,.md,.csv,.json"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
                + Attach .txt / .md
              </label>
            )}
            <span className="text-[11px] text-muted-foreground hidden sm:inline">
              ⌘ + Enter to send
            </span>
          </div>
          {loading ? (
            <Button
              onClick={() => {
                abortRef.current?.abort();
                setLoading(false);
              }}
              variant="secondary"
              size="sm"
            >
              <Square size={14} className="mr-1.5" /> Stop
            </Button>
          ) : (
            <Button
              onClick={() => run(input)}
              disabled={!input.trim()}
              size="sm"
              className="bg-gradient-primary hover:opacity-90 btn-glow"
            >
              <ArrowUp size={14} className="mr-1.5" /> Solve
            </Button>
          )}
        </div>
      </div>

      {!output && !loading && examples.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Try one of these
          </p>
          <div className="grid sm:grid-cols-2 gap-2">
            {examples.map((ex) => (
              <button
                key={ex}
                onClick={() => {
                  setInput(ex);
                  run(ex);
                }}
                className="text-left rounded-xl border border-border/60 bg-card/50 px-4 py-3 text-sm text-foreground/80 hover:border-primary/40 hover:bg-accent/40 transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      <OutputCard
        content={output}
        loading={loading}
        onRegenerate={lastInputRef.current ? () => run(lastInputRef.current) : undefined}
      />
    </div>
  );
}
