import ReactMarkdown from "react-markdown";
import { Copy, RefreshCw, Check, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

interface OutputCardProps {
  content: string;
  steps: Array<{title: string, content: string}>;
  currentStep: number;
  onNext: () => void;
  loading?: boolean;
  onRegenerate?: () => void;
  onNewQuery?: () => void;
}

export function OutputCard({ content, steps, currentStep, onNext, loading, onRegenerate, onNewQuery }: OutputCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy");
    }
  };

  if (!loading && steps.length === 0) return null;

  return (
    <div className="glass-card rounded-2xl p-5 sm:p-7 animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {loading ? "Thinking…" : steps[currentStep]?.title || "Response"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onNewQuery && (
            <Button size="sm" variant="ghost" onClick={onNewQuery}>
              <Plus size={14} className="mr-1.5" /> New Query
            </Button>
          )}
          {onRegenerate && (
            <Button size="sm" variant="ghost" onClick={onRegenerate} disabled={loading}>
              <RefreshCw size={14} className="mr-1.5" /> Regenerate
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={handleCopy} disabled={!content}>
            {copied ? <Check size={14} className="mr-1.5" /> : <Copy size={14} className="mr-1.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[80, 95, 70, 88, 60].map((w, i) => (
            <div
              key={i}
              className="h-3 rounded-full bg-muted animate-pulse"
              style={{ width: `${w}%` }}
            />
          ))}
        </div>
      ) : (
        <article className="prose prose-sm sm:prose-base max-w-none prose-headings:font-display prose-headings:tracking-tight prose-headings:text-primary-deep prose-headings:mt-6 prose-headings:mb-2 prose-h2:text-lg prose-h3:text-base prose-p:text-foreground/85 prose-li:text-foreground/85 prose-strong:text-foreground">
          <ReactMarkdown>{steps[currentStep]?.content || ""}</ReactMarkdown>
        </article>
      )}

      {!loading && currentStep < steps.length - 1 && (
        <div className="flex justify-center mt-6">
          <Button onClick={onNext} className="bg-gradient-primary hover:opacity-90 btn-glow">
            Next Step <ChevronRight size={16} className="ml-2" />
          </Button>
        </div>
      )}
    </div>
  );
}
