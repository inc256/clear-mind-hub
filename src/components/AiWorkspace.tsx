import { useRef, useState } from "react";
import { streamAi, AiMode, MindsetType } from "@/services/aiService";
import { OutputCard } from "@/components/OutputCard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUp, Square, Sparkles, Camera, FileText, Image as ImageIcon, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AiWorkspaceProps {
  mode: AiMode;
  title: string;
  subtitle: string;
  placeholder: string;
  acceptFile?: boolean;
}

const getMindsetOptions = (t: any) => [
  { value: "general", label: t('workspace.general') },
  { value: "medical", label: t('workspace.medical') },
  { value: "engineering", label: t('workspace.engineering') },
  { value: "lecturer", label: t('workspace.lecturer') },
  { value: "scientific", label: t('workspace.scientific') },
  { value: "creative", label: t('workspace.creative') },
];

export function AiWorkspace({ mode, title, subtitle, placeholder, acceptFile }: AiWorkspaceProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [steps, setSteps] = useState<Array<{title: string, content: string}>>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedMindset, setSelectedMindset] = useState<MindsetType>("general");
  const abortRef = useRef<AbortController | null>(null);
  const lastInputRef = useRef("");
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const run = async (text: string) => {
    if (!text.trim() || loading) return;
    lastInputRef.current = text;
    setOutput("");
    setSteps([]);
    setCurrentStep(0);
    setLoading(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    await streamAi({
      mode,
      input: text,
      mindset: mode === "tutor" ? selectedMindset : undefined,
      signal: ctrl.signal,
      onDelta: (chunk) => setOutput((p) => p + chunk),
      onDone: () => {
        setLoading(false);
        setSteps(parseSteps(output, mode));
      },
      onError: (msg) => {
        setLoading(false);
        toast.error(msg);
      },
    });
  };

  const reset = () => {
    setOutput("");
    setSteps([]);
    setCurrentStep(0);
    setInput("");
  };

  const parseSteps = (content: string, mode: AiMode) => {
    const sections = content.split(/^## /m).slice(1); // Skip the first empty part
    const parsedSteps: Array<{title: string, content: string}> = [];

    for (const section of sections) {
      const lines = section.trim().split('\n');
      const title = lines[0].trim();
      const content = lines.slice(1).join('\n').trim();
      if (title && content) {
        parsedSteps.push({ title, content });
      }
    }

    // If no steps parsed, treat the whole content as one step
    if (parsedSteps.length === 0 && content.trim()) {
      parsedSteps.push({ title: "Response", content: content.trim() });
    }

    return parsedSteps;
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
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
          <span className="text-gradient">{title}</span>
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base max-w-xl">{subtitle}</p>
      </header>

      {mode === "tutor" && steps.length === 0 && !loading && (
        <div className="glass-card rounded-2xl p-3 sm:p-4">
          <label className="text-sm font-medium text-foreground block mb-2">
            {t('workspace.mindset')}
          </label>
          <Select value={selectedMindset} onValueChange={(value) => setSelectedMindset(value as MindsetType)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {getMindsetOptions(t).map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-2">
            {t('workspace.mindsetDescription')}
          </p>
        </div>
      )}

        {steps.length === 0 && !loading && (
        <>
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary transition-colors">
                        <Paperclip size={14} />
                        {t('workspace.attachFiles')}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" side="top">
                      <DropdownMenuItem onClick={() => cameraInputRef.current?.click()}>
                        <Camera size={14} className="mr-2" />
                        {t('workspace.camera')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => documentInputRef.current?.click()}>
                        <FileText size={14} className="mr-2" />
                        {t('workspace.document')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => imageInputRef.current?.click()}>
                        <ImageIcon size={14} className="mr-2" />
                        {t('workspace.image')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
                <input
                  ref={documentInputRef}
                  type="file"
                  accept=".txt,.md,.csv,.json"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
                <span className="text-[11px] text-muted-foreground hidden sm:inline">
                  {t('workspace.sendShortcut')}
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
                  <Square size={14} className="mr-1.5" /> {t('common.cancel')}
                </Button>
              ) : (
                <Button
                  onClick={() => run(input)}
                  disabled={!input.trim()}
                  className="bg-primary hover:opacity-90 btn-glow rounded-full w-10 h-10 p-0"
                >
                  <ArrowUp size={16} />
                </Button>
              )}
            </div>
          </div>


        </>
      )}

      {steps.length > 0 && lastInputRef.current && (
        <div className="glass-card rounded-2xl p-4 mb-6 animate-slide-up">
          <p className="text-sm font-medium text-muted-foreground">{t('workspace.question')}</p>
          <p className="text-foreground mt-1">{lastInputRef.current}</p>
        </div>
      )}

      <OutputCard
          content={output}
          steps={steps}
          currentStep={currentStep}
          onNext={() => setCurrentStep((prev) => prev + 1)}
          loading={loading}
          onRegenerate={lastInputRef.current ? () => run(lastInputRef.current) : undefined}
          onNewQuery={reset}
          mode={mode}
        />
    </div>
  );
}
