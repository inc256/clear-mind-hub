import { useRef, useState } from "react";
import { streamAi, AiMode, MindsetType, DepthLevel } from "@/services/aiService";
import { useHistory } from "../store/history";
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
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogClose,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AiWorkspaceProps {
  mode: AiMode;
  title: string;
  subtitle: string;
  placeholder: string;
  acceptFile?: boolean;
}

interface CitationStyle {
  name: string;
  full_name: string;
  use: {
    primary_fields: string[];
    purpose: string;
    common_scenarios: string[];
  };
  users: {
    main_users: string[];
    disciplines: string[];
    level: string[];
  };
}

const citationStyles: CitationStyle[] = [
  {
    "name": "APA",
    "full_name": "American Psychological Association Style",
    "use": {
      "primary_fields": ["Psychology", "Education", "Social Sciences"],
      "purpose": "Used for scientific writing where date of research is important.",
      "common_scenarios": [
        "Research papers",
        "Case studies",
        "Scientific reports"
      ]
    },
    "users": {
      "main_users": ["Researchers", "Students", "Academics"],
      "disciplines": ["Psychology", "Sociology", "Education"],
      "level": ["University", "Professional"]
    }
  },
  {
    "name": "MLA",
    "full_name": "Modern Language Association Style",
    "use": {
      "primary_fields": ["Literature", "Languages", "Arts", "Humanities"],
      "purpose": "Used for writing and analyzing texts, focusing on authorship and page references.",
      "common_scenarios": [
        "Essay writing",
        "Literary analysis",
        "Language studies"
      ]
    },
    "users": {
      "main_users": ["Students", "Teachers", "Researchers"],
      "disciplines": ["English", "Philosophy", "Cultural Studies"],
      "level": ["High School", "University"]
    }
  },
  {
    "name": "IEEE",
    "full_name": "Institute of Electrical and Electronics Engineers Style",
    "use": {
      "primary_fields": ["Engineering", "Computer Science", "Technology"],
      "purpose": "Used for technical writing with numbered references for efficiency.",
      "common_scenarios": [
        "Technical reports",
        "Engineering papers",
        "Software documentation"
      ]
    },
    "users": {
      "main_users": ["Engineers", "Developers", "Researchers"],
      "disciplines": ["Electrical Engineering", "Computer Science", "IT"],
      "level": ["University", "Professional"]
    }
  },
  {
    "name": "AMA",
    "full_name": "American Medical Association Style",
    "use": {
      "primary_fields": ["Medicine", "Health Sciences"],
      "purpose": "Used in medical and clinical research with concise numeric citations.",
      "common_scenarios": [
        "Clinical research papers",
        "Medical journals",
        "Case reports"
      ]
    },
    "users": {
      "main_users": ["Doctors", "Medical Students", "Researchers"],
      "disciplines": ["Medicine", "Nursing", "Pharmacy"],
      "level": ["University", "Professional"]
    }
  }
];

const getMindsetOptions = (t: any) => [
  { value: "general", label: t('workspace.general') },
  { value: "medical", label: t('workspace.medical') },
  { value: "engineering", label: t('workspace.engineering') },
  { value: "lecturer", label: t('workspace.lecturer') },
  { value: "scientific", label: t('workspace.scientific') },
  { value: "creative", label: t('workspace.creative') },
];

const getDepthOptions = (t: any) => [
  { value: "beginner", label: t('workspace.beginner') },
  { value: "intermediate", label: t('workspace.intermediate') },
  { value: "advanced", label: t('workspace.advanced') },
];

export function AiWorkspace({ mode, title, subtitle, placeholder, acceptFile }: AiWorkspaceProps) {
  const { t } = useTranslation();
  const history = useHistory();
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [steps, setSteps] = useState<Array<{title: string, content: string}>>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedMindset, setSelectedMindset] = useState<MindsetType>("general");
  const [selectedDepth, setSelectedDepth] = useState<string>("beginner");
  const [selectedCitationStyle, setSelectedCitationStyle] = useState<string>("APA");
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
    let finalOutput = "";

    await streamAi({
      mode,
      input: text,
      mindset: mode === "tutor" ? selectedMindset : undefined,
      depth: mode === "tutor" ? (selectedDepth as DepthLevel) : undefined,
      citationStyle: mode === "research" ? selectedCitationStyle : undefined,
      signal: ctrl.signal,
      onDelta: (chunk) => {
        finalOutput += chunk;
        setOutput((p) => p + chunk);
      },
      onDone: (finalResponse) => {
        const response = finalResponse || finalOutput;
        setLoading(false);
        setSteps(parseSteps(response, mode));
        history.addEntry({
          mode,
          input: text,
          output: response,
        });
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
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
            <div>
              <label className="text-sm font-medium text-foreground block mb-2">
                {t('workspace.depth')}
              </label>
              <Select value={selectedDepth} onValueChange={setSelectedDepth}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getDepthOptions(t).map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-2">
                {t('workspace.depthDescription')}
              </p>
            </div>
          </div>
        </div>
      )}

      {mode === "research" && steps.length === 0 && !loading && (
        <div className="glass-card rounded-2xl p-3 sm:p-4">
          <div className="mb-4">
            <label className="text-sm font-medium text-foreground block mb-3">
              Citation Style
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {citationStyles.map((style) => (
                <Dialog key={style.name}>
                  <DialogTrigger asChild>
                    <button
                      onClick={() => setSelectedCitationStyle(style.name)}
                      className={`p-3 rounded-lg border-2 transition-all duration-200 hover:shadow-md hover:scale-[1.02] ${
                        selectedCitationStyle === style.name
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-sm text-center w-full">
                          {style.name}
                        </h3>
                        {selectedCitationStyle === style.name && (
                          <div className="w-2 h-2 bg-primary rounded-full"></div>
                        )}
                      </div>
                    </button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>{style.full_name}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">{style.use.purpose}</p>
                      </div>

                      <div>
                        <h4 className="font-medium text-sm mb-2">Primary Fields:</h4>
                        <div className="flex flex-wrap gap-1">
                          {style.use.primary_fields.map((field) => (
                            <span key={field} className="text-xs bg-muted px-2 py-1 rounded">
                              {field}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium text-sm mb-2">Common Scenarios:</h4>
                        <ul className="text-sm text-muted-foreground space-y-1">
                          {style.use.common_scenarios.map((scenario) => (
                            <li key={scenario} className="flex items-center">
                              <span className="w-1.5 h-1.5 bg-current rounded-full mr-2 flex-shrink-0"></span>
                              {scenario}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <h4 className="font-medium text-sm mb-2">Users & Disciplines:</h4>
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-1">
                            {style.users.main_users.map((user) => (
                              <span key={user} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                {user}
                              </span>
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {style.users.disciplines.map((discipline) => (
                              <span key={discipline} className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                                {discipline}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t">
                        <p className="text-sm text-muted-foreground text-center">
                          <strong>Level:</strong> {style.users.level.join(", ")}
                        </p>
                      </div>

                      <div className="flex justify-center pt-4 border-t">
                        <DialogClose asChild>
                          <Button className="px-8 bg-primary hover:bg-primary/90">Use {style.name}</Button>
                        </DialogClose>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Choose a citation style for your research report. Click any style to learn more about its use and requirements.
            </p>
          </div>
        </div>
      )}

        {steps.length === 0 && !loading && (
        <>
          <div className="glass-card rounded-2xl p-3 sm:p-4">
            <Textarea
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                // Auto-resize
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 140) + 'px';
              }}
              placeholder={placeholder}
              className="min-h-[60px] max-h-[140px] resize-none border-0 bg-transparent text-base shadow-none focus-visible:ring-0 px-2"
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
          onPrevious={() => setCurrentStep((prev) => prev - 1)}
          loading={loading}
          onRegenerate={lastInputRef.current ? () => run(lastInputRef.current) : undefined}
          onNewQuery={reset}
          mode={mode}
        />
    </div>
  );
}
