import ReactMarkdown from "react-markdown";
import { Copy, RefreshCw, Check, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";
import { AiMode } from "@/services/aiService";

interface OutputCardProps {
  content: string;
  steps: Array<{title: string, content: string}>;
  currentStep: number;
  onNext: () => void;
  loading?: boolean;
  onRegenerate?: () => void;
  onNewQuery?: () => void;
  mode?: AiMode;
}

export function OutputCard({ content, steps, currentStep, onNext, loading, onRegenerate, onNewQuery, mode }: OutputCardProps) {
  const [copied, setCopied] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);

  const parsePackageContent = (content: string) => {
    const lines = content.split('\n');
    const fields: Record<string, string> = {};
    lines.forEach(line => {
      const [key, ...valueParts] = line.split(':');
      if (key && valueParts.length) {
        fields[key.trim()] = valueParts.join(':').trim();
      }
    });
    return fields;
  };

  const parseMultipleChoice = (content: string) => {
    const lines = content.split('\n');
    const options: { letter: string; text: string; correct: boolean }[] = [];
    lines.forEach(line => {
      const match = line.match(/^([A-D])\)\s*(.+?)(?:\s*\[CORRECT\])?$/);
      if (match) {
        const [, letter, text] = match;
        const correct = line.includes('[CORRECT]');
        options.push({ letter, text, correct });
      }
    });
    return options;
  };

  const handleAnswerSelect = (letter: string) => {
    setSelectedAnswer(letter);
    const options = parseMultipleChoice(steps[currentStep]?.content || '');
    const selected = options.find(o => o.letter === letter);
    if (selected?.correct) {
      toast.success("Correct! Well done!");
    } else {
      const correct = options.find(o => o.correct);
      toast.error(`Wrong. The correct answer is ${correct?.letter}) ${correct?.text}`);
    }
  };

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

  if (mode === "research") {
    return (
      <div className="glass-card rounded-2xl p-5 sm:p-7 animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {loading ? "Thinking…" : "Packages"}
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {steps.map((step, index) => {
              const fields = parsePackageContent(step.content);
              return (
                <div key={index} className="glass-card rounded-xl p-4 space-y-3">
                  <h3 className="font-semibold text-lg">{step.title}</h3>
                  <div className="space-y-2 text-sm">
                    {Object.entries(fields).map(([key, value]) => (
                      <div key={key}>
                        <span className="font-medium text-muted-foreground">{key}:</span> {value}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

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
          <ReactMarkdown>{steps[currentStep]?.content.replace(/\[CORRECT\]/g, '') || ""}</ReactMarkdown>
        </article>

        {mode === "problem" && currentStep === steps.length - 1 && (
          <div className="mt-6 space-y-4">
            <p className="font-semibold">Select the correct answer:</p>
            <div className="grid gap-2">
              {parseMultipleChoice(steps[currentStep]?.content || '').map((option) => (
                <Button
                  key={option.letter}
                  onClick={() => handleAnswerSelect(option.letter)}
                  variant={selectedAnswer === option.letter ? "default" : "outline"}
                  className="justify-start text-left"
                  disabled={selectedAnswer !== null}
                >
                  {option.letter}) {option.text}
                </Button>
              ))}
            </div>
          </div>
        )}
      )}

      {!loading && currentStep < steps.length - 1 && (
        <div className="flex justify-center mt-6">
          <Button onClick={onNext} className="bg-primary hover:opacity-90 btn-glow">
            Next Step <ChevronRight size={16} className="ml-2" />
          </Button>
        </div>
      )}
    </div>
  );
}
