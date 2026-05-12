 import { useRef, useState } from "react";
import { streamAi, AiMode, MindsetType, DepthLevel, getAiCreditCost, getFreeTierStatus } from "@/services/aiService";
import { useHistory } from "@/store/history";
import { useUserProfile } from "@/store/userProfile";
import { OutputCard } from "@/components/OutputCard";
import { Button } from "@/components/ui/button";
import { CreditNavIndicator } from "@/components/CreditNavIndicator";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUp, Square, Camera, FileText, Image as ImageIcon, Paperclip, X, MinusCircle, Maximize2, Mic, Crown, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { analytics } from "@/lib/analytics";
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
import { hapticLight, hapticMedium } from "@/lib/haptic";

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
    name: "APA",
    full_name: "American Psychological Association Style",
    use: {
      primary_fields: ["Psychology", "Education", "Social Sciences"],
      purpose: "Used for scientific writing where date of research is important.",
      common_scenarios: ["Research papers", "Case studies", "Scientific reports"],
    },
    users: {
      main_users: ["Researchers", "Students", "Academics"],
      disciplines: ["Psychology", "Sociology", "Education"],
      level: ["University", "Professional"],
    },
  },
  {
    name: "MLA",
    full_name: "Modern Language Association Style",
    use: {
      primary_fields: ["Literature", "Languages", "Arts", "Humanities"],
      purpose: "Used for writing and analyzing texts, focusing on authorship and page references.",
      common_scenarios: ["Essay writing", "Literary analysis", "Language studies"],
    },
    users: {
      main_users: ["Students", "Teachers", "Researchers"],
      disciplines: ["English", "Philosophy", "Cultural Studies"],
      level: ["High School", "University"],
    },
  },
  {
    name: "IEEE",
    full_name: "Institute of Electrical and Electronics Engineers Style",
    use: {
      primary_fields: ["Engineering", "Computer Science", "Technology"],
      purpose: "Used for technical writing with numbered references for efficiency.",
      common_scenarios: ["Technical reports", "Engineering papers", "Software documentation"],
    },
    users: {
      main_users: ["Engineers", "Developers", "Researchers"],
      disciplines: ["Electrical Engineering", "Computer Science", "IT"],
      level: ["University", "Professional"],
    },
  },
  {
    name: "AMA",
    full_name: "American Medical Association Style",
    use: {
      primary_fields: ["Medicine", "Health Sciences"],
      purpose: "Used in medical and clinical research with concise numeric citations.",
      common_scenarios: ["Clinical research papers", "Medical journals", "Case reports"],
    },
    users: {
      main_users: ["Doctors", "Medical Students", "Researchers"],
      disciplines: ["Medicine", "Nursing", "Pharmacy"],
      level: ["University", "Professional"],
    },
  },
];

const getMindsetOptions = (t: any) => [
  { value: "general", label: t("workspace.general") },
  { value: "medical", label: t("workspace.medical") },
  { value: "engineering", label: t("workspace.engineering") },
  { value: "lecturer", label: t("workspace.lecturer") },
  { value: "scientific", label: t("workspace.scientific") },
  { value: "creative", label: t("workspace.creative") },
];

const getDepthOptions = (t: any, mode: AiMode, citationStyle?: string, hasPaidSubscription?: boolean) => {
  const allOptions = [
    { value: "beginner", label: t("workspace.beginner") },
    { value: "intermediate", label: t("workspace.intermediate") },
    { value: "higher", label: t("workspace.higher") },
    { value: "advanced", label: t("workspace.advanced") },
  ];

  // Show all options but mark premium ones
  return allOptions.map(({ value, label }) => {
    const cost = getAiCreditCost(mode, value, citationStyle, hasPaidSubscription);
    if (!cost.label || cost.label.toString().trim() === "") {
      console.warn("[AiWorkspace] invalid cost label", {
        mode,
        depth: value,
        citationStyle,
        hasPaidSubscription,
        cost,
      });
    }
    return {
      value,
      label,
      cost,
    };
  });
};

 export function AiWorkspace({ mode, title, subtitle, placeholder, acceptFile }: AiWorkspaceProps) {
   const { t } = useTranslation();
   const history = useHistory();
   const { refreshCredits, profile, subscriptions } = useUserProfile();
   const [input, setInput] = useState("");
   const [output, setOutput] = useState("");
   const [steps, setSteps] = useState<Array<{ title: string; content: string }>>([]);
   const [currentStep, setCurrentStep] = useState(0);
   const [loading, setLoading] = useState(false);
   const [selectedMindset, setSelectedMindset] = useState<MindsetType>("general");
   const [selectedDepth, setSelectedDepth] = useState<string>("beginner");
   const [selectedCitationStyle, setSelectedCitationStyle] = useState<string>("APA");
    const [imageData, setImageData] = useState<string | null>(null);
    const [imageMimeType, setImageMimeType] = useState<string | null>(null);
    const [imageName, setImageName] = useState<string | null>(null);
    const [documentData, setDocumentData] = useState<string | null>(null);
    const [documentMimeType, setDocumentMimeType] = useState<string | null>(null);
    const [documentName, setDocumentName] = useState<string | null>(null);
    const [voiceTranscript, setVoiceTranscript] = useState<string>("");
   const [codeSnippets, setCodeSnippets] = useState<Array<{id: string, content: string, language?: string}>>([]);
   const abortRef = useRef<AbortController | null>(null);
   const lastInputRef = useRef("");
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const documentInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const voiceInputRef = useRef<HTMLInputElement>(null);
   const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [isTrayOpen, setIsTrayOpen] = useState(false);
    const [trayContent, setTrayContent] = useState("");
    const [isRecording, setIsRecording] = useState(false);
    const [recordingVisualizer, setRecordingVisualizer] = useState<number[]>([]);
    const recognitionRef = useRef<any>(null);
    const voiceTranscriptRef = useRef<string>("");
    const [showPremiumDialog, setShowPremiumDialog] = useState(false);
    const [pendingRun, setPendingRun] = useState<(() => void) | null>(null);
    const navigate = useNavigate();
    const [showInsufficientCreditsDialog, setShowInsufficientCreditsDialog] = useState(false);
    const [insufficientCreditsMessage, setInsufficientCreditsMessage] = useState("");

   const checkCreditsBeforeSubmit = async (costInfo: { cost: number; premium: boolean; label: string }) => {
     console.log("[AiWorkspace] checkCreditsBeforeSubmit", { mode, costInfo, profile: useUserProfile.getState().profile });
     if (costInfo.premium) {
       setShowPremiumDialog(true);
       return false;
     }

     if (costInfo.cost <= 0) {
       return true;
     }

     const state = useUserProfile.getState();
     if (!state.profile) {
       await state.fetchProfile();
     }

     const profileState = state.profile;
     if (!profileState) {
       toast.error("Unable to verify credits. Please sign in again.");
       return false;
     }

     const status = getFreeTierStatus(profileState, state.subscriptions);
     const total = (profileState.credits ?? 0) + status.remaining;

     if (total < costInfo.cost) {
       const message = status.remaining > 0
         ? `You need ${costInfo.cost} credits to run this feature, but only have ${total} credits including ${status.remaining} free daily credits remaining.`
         : `You need ${costInfo.cost} credits to run this feature. Your account has ${profileState.credits ?? 0} paid credits and no free daily credits left.`;
       setInsufficientCreditsMessage(message);
       if (total === 0) {
         toast.error("You have zero credits right now. Visit the subscription page to get more credits.");
       }
       setShowInsufficientCreditsDialog(true);
       return false;
     }

     return true;
   };

  const parseSteps = (content: string, mode: AiMode) => {
    // Strip the practice questions JSON before parsing into steps so it
    // doesn't bleed into the last section's visible content.
    const withoutJson = content.replace(/\{"practice_questions"[\s\S]*$/, "").trimEnd();

    const matches = [...withoutJson.matchAll(/^##+\s*(.+)$/gm)];
    const parsedSteps: Array<{ title: string; content: string }> = [];

    if (matches.length === 0) {
      if (withoutJson.trim()) {
        parsedSteps.push({ title: "Response", content: withoutJson.trim() });
      }
      return parsedSteps;
    }

    const firstMatchIndex = matches[0].index ?? 0;
    const leadingText = withoutJson.slice(0, firstMatchIndex).trim();
    if (leadingText) {
      parsedSteps.push({ title: "Response", content: leadingText });
    }

    for (let i = 0; i < matches.length; i++) {
      const title = matches[i][1].trim() || `Section ${i + 1}`;
      const start = (matches[i].index ?? 0) + matches[i][0].length;
      const end =
        i + 1 < matches.length
          ? (matches[i + 1].index ?? withoutJson.length)
          : withoutJson.length;
      const stepContent = withoutJson.slice(start, end).trim();
      parsedSteps.push({ title, content: stepContent });
    }

    return parsedSteps;
  };

   const run = async (text: string) => {
    const hasText = text.trim().length > 0;
      if (!hasText && !imageData && !documentData && !voiceTranscript.trim() && codeSnippets.length === 0) return;
     if (loading) return;

     const costInfo = getAiCreditCost(mode, selectedDepth, selectedCitationStyle, subscriptions.some((s: any) => s.status === "active"));

     if (!(await checkCreditsBeforeSubmit(costInfo))) {
       return;
     }

     await runWithCost(text, costInfo);
   };

   const runWithCost = async (text: string, costInfo: any) => {

       const prompt = text.trim().length > 0
         ? text
         : codeSnippets.length > 0
           ? "Please analyze the attached code snippets."
           : imageData
           ? "Please scan the attached image and answer the question."
           : documentData
           ? "Please analyze the attached document and answer the question."
           : voiceTranscript.trim()
           ? "Please analyze the voice transcript and answer the question."
           : "";

     lastInputRef.current = prompt;
     setOutput("");
     setSteps([]);
     setCurrentStep(0);
     setLoading(true);
     abortRef.current?.abort();
     const ctrl = new AbortController();
     abortRef.current = ctrl;
     let finalOutput = "";

     // Track AI request started
     analytics.aiRequestStarted(mode);

     // Haptic feedback on send
     hapticMedium();

     // Build code context
     let codeContext = "";
     if (codeSnippets.length > 0) {
       codeContext = "\n\nAttached Code Snippets:\n" + codeSnippets.map((snippet, index) =>
         `Code Snippet ${index + 1}${snippet.language ? ` (${snippet.language})` : ''}:\n\`\`\`${snippet.language || ''}\n${snippet.content}\n\`\`\``
       ).join('\n\n');
     }

      await streamAi({
        mode,
        input: prompt + codeContext,
        imageBase64: imageData?.split(",")[1],
        imageMimeType: imageMimeType || undefined,
        imageName: imageName || undefined,
        documentBase64: documentData?.split(",")[1],
        documentMimeType: documentMimeType || undefined,
        documentName: documentName || undefined,
        voiceTranscript: voiceTranscript || undefined,
        mindset: mode === "tutor" ? selectedMindset : undefined,
        depth: mode === "tutor" || mode === "research" ? (selectedDepth as DepthLevel) : undefined,
        citationStyle: mode === "research" ? selectedCitationStyle : undefined,
        signal: ctrl.signal,
        onDelta: (chunk) => {
          finalOutput += chunk;
          setOutput((p) => p + chunk);
        },
        onDone: async (finalResponse) => {
          const response = finalResponse || finalOutput;
          const parsedSteps = parseSteps(response, mode);
          setSteps(parsedSteps);
          setLoading(false);

          // Extract practice questions from response if present
          let practiceQuestions = null;
          if (mode === "tutor" && response.includes('{"practice_questions"')) {
            try {
              const jsonMatch = response.match(/\{"practice_questions"[\s\S]*$/);
              if (jsonMatch) {
                practiceQuestions = JSON.parse(jsonMatch[0]);
              }
            } catch (e) {
              console.warn("Failed to parse practice questions:", e);
            }
          }

          // Track AI request completed with cost
          const costInfo = getAiCreditCost(mode, selectedDepth, selectedCitationStyle, subscriptions.some((s: any) => s.status === "active"));
          analytics.aiRequestCompleted(mode, costInfo.cost);

          history.addEntry({
            mode,
            input: prompt, // Keep the processed prompt text
            output: response.replace(/\{"practice_questions"[\s\S]*$/, "").trim(), // Remove practice questions JSON from output
            practiceQuestions,
            // Don't store raw binary data in history - only keep processed text
          });

          await refreshCredits();
        },
        onError: (msg) => {
          setLoading(false);
          analytics.aiRequestFailed(mode, msg);
          if (msg.includes('Insufficient credits') || msg.includes('Daily free credits exhausted') || (msg.includes('need') && msg.includes('credits'))) {
            setInsufficientCreditsMessage(msg);
            setShowInsufficientCreditsDialog(true);
          } else {
            toast.error(msg);
          }
        },
      });
   };

    const reset = () => {
      setOutput("");
      setSteps([]);
      setCurrentStep(0);
      setInput("");
      setImageData(null);
      setImageMimeType(null);
      setImageName(null);
      setDocumentData(null);
      setDocumentMimeType(null);
      setDocumentName(null);
      setVoiceTranscript("");
      setCodeSnippets([]);
      setTrayContent("");
      setIsTrayOpen(false);
    };

   // Paste handler - detect code and create code cards
   const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
     const pastedText = await navigator.clipboard.readText();
     if (!pastedText.trim()) return;

     // Detect code-like patterns
     const hasCodeIndicators =
       pastedText.includes('```') ||
       pastedText.includes('function ') ||
       pastedText.includes('import ') ||
       pastedText.includes('class ') ||
       pastedText.includes('def ') ||
       pastedText.includes('var ') ||
       pastedText.includes('let ') ||
       pastedText.includes('const ') ||
       pastedText.match(/[{}[\];]/);

     // If it's code or large text, create a code card instead of putting in input
     if (pastedText.length > 200 || hasCodeIndicators) {
       e.preventDefault();

       // Detect language from code fences or common patterns
       let language = "";
       const fenceMatch = pastedText.match(/```(\w+)/);
       if (fenceMatch) {
         language = fenceMatch[1];
       } else if (pastedText.includes('function ') || pastedText.includes('const ') || pastedText.includes('let ')) {
         language = 'javascript';
       } else if (pastedText.includes('def ') || pastedText.includes('import ')) {
         language = 'python';
       } else if (pastedText.includes('class ')) {
         language = 'java';
       }

       const newSnippet = {
         id: `code-${Date.now()}-${Math.random().toString(36).slice(2)}`,
         content: pastedText.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, ''), // Remove code fences
         language: language || undefined,
       };

       setCodeSnippets(prev => [...prev, newSnippet]);
       hapticLight();
       toast.success("Code snippet added");
     }
   };

   const moveFromTrayToInput = () => {
     setInput(prev => prev + (prev ? "\n\n" : "") + trayContent);
     setTrayContent("");
     setIsTrayOpen(false);
     hapticLight();
   };

   const clearTray = () => {
     setTrayContent("");
     setIsTrayOpen(false);
   };

  const handleFile = async (file: File) => {
    if (file.size > 1_000_000) {
      toast.error("File too large (max 1MB for MVP)");
      return;
    }

    if (file.type.startsWith("image/")) {
      try {
        analytics.imageInputUsed();
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          if (typeof result === "string") {
            setImageData(result);
            setImageMimeType(file.type);
            setImageName(file.name);
            setInput((prev) => prev || "Please scan this image and answer the question.");
            toast.success(`Loaded image ${file.name} for scanning`);
          }
        };
        reader.onerror = () => {
          toast.error("Couldn't read image file");
        };
        reader.readAsDataURL(file);
      } catch {
        toast.error("Couldn't read image file");
      }
      return;
    }

    // Handle document files (PDF, DOCX, etc.)
    if (file.type === "application/pdf" || file.type.includes("document") || file.type === "text/plain") {
      try {
        analytics.documentInputUsed();
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          if (typeof result === "string") {
            setDocumentData(result);
            setDocumentMimeType(file.type);
            setDocumentName(file.name);
            setInput((prev) => prev || "Please analyze this document and answer the question.");
            toast.success(`Loaded document ${file.name} for analysis`);
          }
        };
        reader.onerror = () => {
          toast.error("Couldn't read document file");
        };
        reader.readAsDataURL(file);
      } catch {
        toast.error("Couldn't read document file");
      }
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

  const startVoiceRecording = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast.error("Voice recognition not supported in this browser");
      return;
    }

    const SpeechRecognition = (window as typeof window & {
      SpeechRecognition?: typeof SpeechRecognition;
      webkitSpeechRecognition?: typeof SpeechRecognition;
    }).SpeechRecognition || (window as typeof window & {
      SpeechRecognition?: typeof SpeechRecognition;
      webkitSpeechRecognition?: typeof SpeechRecognition;
    }).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast.error("Voice recognition not supported in this browser");
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    voiceTranscriptRef.current = "";
    setVoiceTranscript("");

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    let visualizerInterval: number;

    recognition.onstart = () => {
      setIsRecording(true);
      setRecordingVisualizer(Array.from({ length: 20 }, () => Math.random() * 100));

      visualizerInterval = window.setInterval(() => {
        setRecordingVisualizer(prev => prev.map(() => Math.random() * 100));
      }, 100);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      voiceTranscriptRef.current = transcript;
      setVoiceTranscript(transcript);
      analytics.voiceInputUsed();
      clearInterval(visualizerInterval);
      setRecordingVisualizer([]);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      clearInterval(visualizerInterval);
      console.error('Speech recognition error:', event.error);
      setIsRecording(false);
      setRecordingVisualizer([]);
      recognitionRef.current = null;
      toast.error("Voice recognition failed. Please try again.");
    };

    recognition.onend = () => {
      clearInterval(visualizerInterval);
      setIsRecording(false);
      setRecordingVisualizer([]);
      recognitionRef.current = null;
    };

    recognition.start();
  };

  const stopVoiceRecording = async () => {
    if (!recognitionRef.current) {
      return;
    }

    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    recognition.stop();
    setIsRecording(false);
    setRecordingVisualizer([]);

    const transcript = voiceTranscriptRef.current.trim();
    if (transcript) {
      await run(transcript);
    } else {
      toast.error("No voice was captured. Please try again.");
    }
  };

  const clearVoiceTranscript = () => {
    setVoiceTranscript("");
    voiceTranscriptRef.current = "";
    hapticLight();
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <header className="space-y-4 rounded-3xl border border-border/60 bg-background/80 p-4 shadow-sm backdrop-blur-xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
              <span className="text-gradient">{title}</span>
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base max-w-xl mt-1">{subtitle}</p>
          </div>
          <CreditNavIndicator compact />
        </div>
      </header>

      {mode === "tutor" && steps.length === 0 && !loading && (
        <div className="glass-card rounded-2xl p-3 sm:p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-foreground block mb-2">
                {t("workspace.mindset")}
              </label>
              <Select
                value={selectedMindset}
                onValueChange={(value) => {
                  setSelectedMindset(value as MindsetType);
                  analytics.tutorMindsetChanged(value);
                }}
              >
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
                {t("workspace.mindsetDescription")}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground block mb-2">
                {t("workspace.depth")}
              </label>
              <Select value={selectedDepth} onValueChange={(value) => {
                setSelectedDepth(value);
                if (mode === 'tutor') {
                  analytics.tutorExplanationDepthChanged(value);
                } else if (mode === 'research') {
                  analytics.researchExplanationDepthChanged(value);
                }
              }}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getDepthOptions(t, mode, undefined, subscriptions.some((s: any) => s.status === "active")).map(({ value, label, cost }) => (
                    <SelectItem key={value} value={value}>
                      <div className="flex items-center justify-between w-full">
                        <span>{label}</span>
                        <div className="flex items-center gap-1">
                          {cost.premium && <Crown size={12} className="text-yellow-500" />}
                          <span className="text-xs text-muted-foreground">{cost.label}</span>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-2">
                {t("workspace.depthDescription")}
              </p>
            </div>
          </div>
        </div>
      )}

       {mode === "research" && steps.length === 0 && !loading && (
         <div className="glass-card rounded-2xl p-3 sm:p-4">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
             <div>
               <label className="text-sm font-medium text-foreground block mb-2">
                 {t("workspace.depth")}
               </label>
               <Select value={selectedDepth} onValueChange={(value) => {
                 setSelectedDepth(value);
                 analytics.researchExplanationDepthChanged(value);
               }}>
                 <SelectTrigger className="w-full">
                   <SelectValue />
                 </SelectTrigger>
                 <SelectContent>
                   {getDepthOptions(t, mode, selectedCitationStyle, subscriptions.some((s: any) => s.status === "active")).map(({ value, label, cost }) => (
                     <SelectItem key={value} value={value}>
                       <div className="flex items-center justify-between w-full">
                         <span>{label}</span>
                         <div className="flex items-center gap-1">
                           {cost.premium && <Crown size={12} className="text-yellow-500" />}
                           <span className="text-xs text-muted-foreground">{cost.label}</span>
                         </div>
                       </div>
                     </SelectItem>
                   ))}
                 </SelectContent>
               </Select>
               <p className="text-xs text-muted-foreground mt-2">
                 {t("workspace.depthDescription")}
               </p>
             </div>
             <div>
               <label className="text-sm font-medium text-foreground block mb-3">
                 Citation Style
               </label>
               <div className="grid grid-cols-2 gap-2">
                 {citationStyles.map((style) => {
                   const hasPaidSubscription = subscriptions.some((s: any) => s.status === "active");
                   const isPremiumOnly = !hasPaidSubscription && style.name !== "APA";
                   return (
                   <Dialog key={style.name}>
                     <DialogTrigger asChild>
                       <button
                         onClick={() => {
                           if (isPremiumOnly) {
                             setShowPremiumDialog(true);
                           } else {
                             setSelectedCitationStyle(style.name);
                             analytics.researchCriteriaChanged(style.name);
                           }
                         }}
                         disabled={isPremiumOnly && selectedCitationStyle !== style.name}
                         className={`p-2 rounded-lg border-2 transition-all duration-200 text-xs relative ${
                           selectedCitationStyle === style.name
                             ? "border-primary bg-primary/5 shadow-sm"
                             : isPremiumOnly
                             ? "border-yellow-300 bg-yellow-50/50 opacity-60"
                             : "border-border hover:border-primary/50"
                         }`}
                       >
                         <div className="flex items-center justify-between">
                           <h3 className={`font-semibold text-center w-full ${isPremiumOnly ? 'text-yellow-700' : ''}`}>{style.name}</h3>
                           <div className="flex items-center gap-1">
                             {isPremiumOnly && <Crown size={10} className="text-yellow-500" />}
                             {selectedCitationStyle === style.name && (
                               <div className="w-1.5 h-1.5 bg-primary rounded-full" />
                             )}
                           </div>
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
                                 <span className="w-1.5 h-1.5 bg-current rounded-full mr-2 flex-shrink-0" />
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
                                 <span
                                   key={user}
                                   className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded"
                                 >
                                   {user}
                                 </span>
                               ))}
                             </div>
                             <div className="flex flex-wrap gap-1">
                               {style.users.disciplines.map((discipline) => (
                                 <span
                                   key={discipline}
                                   className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded"
                                 >
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
                             <Button className="px-8 bg-primary hover:bg-primary/90">
                               Use {style.name}
                             </Button>
                           </DialogClose>
                         </div>
                       </div>
                     </DialogContent>
                   </Dialog>
                 )})}
               </div>
               <p className="text-xs text-muted-foreground mt-3">
                 Choose a citation style. Click any style to learn more.
               </p>
             </div>
           </div>
         </div>
       )}

       {steps.length === 0 && !loading && (
         <div className="glass-card rounded-2xl p-3 sm:p-4">
           {/* Code Cards */}
           {codeSnippets.length > 0 && (
             <div className="mb-3 space-y-2">
               {codeSnippets.map((snippet, index) => (
                 <div key={snippet.id} className="rounded-lg border border-border bg-muted/30 p-3 relative group">
                   <div className="flex items-center justify-between mb-2">
                     <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                       Code Snippet {index + 1}{snippet.language ? ` (${snippet.language})` : ''}
                     </span>
                     <Button
                       size="sm"
                       variant="ghost"
                       className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                       onClick={() => {
                         setCodeSnippets(prev => prev.filter(s => s.id !== snippet.id));
                         hapticLight();
                       }}
                     >
                       <X size={12} />
                     </Button>
                   </div>
                   <div className="max-h-32 overflow-y-auto rounded bg-background/50 p-2 text-xs font-mono whitespace-pre-wrap border border-border/30">
                     {snippet.content}
                   </div>
                 </div>
               ))}
             </div>
           )}

           {/* Code Tray (legacy - can be removed later) */}
           {isTrayOpen && trayContent && (
             <div className="mb-3 p-3 rounded-lg border border-border bg-muted/30 relative">
               <div className="flex items-center justify-between mb-2">
                 <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                   Pasted Code / Large Text
                 </span>
                 <div className="flex items-center gap-1">
                   <Button
                     size="sm"
                     variant="ghost"
                     className="h-7 px-2"
                     onClick={() => setIsTrayOpen(false)}
                   >
                     <MinusCircle size={12} />
                   </Button>
                   <Button
                     size="sm"
                     variant="ghost"
                     className="h-7 px-2"
                     onClick={clearTray}
                   >
                     <X size={12} />
                   </Button>
                 </div>
               </div>
               <div className="max-h-32 overflow-y-auto rounded bg-background/50 p-2 text-xs font-mono whitespace-pre-wrap border border-border/30">
                 {trayContent}
               </div>
               <div className="mt-2 flex justify-end gap-2">
                 <Button size="sm" variant="outline" onClick={clearTray}>
                   Discard
                 </Button>
                 <Button size="sm" onClick={moveFromTrayToInput}>
                   <Maximize2 size={12} className="mr-1" /> Use in Input
                 </Button>
               </div>
             </div>
           )}

           <Textarea
             ref={textareaRef}
             value={input}
             onChange={(e) => {
               setInput(e.target.value);
               const target = e.target as HTMLTextAreaElement;
               target.style.height = "auto";
               target.style.height = Math.min(target.scrollHeight, 140) + "px";
             }}
             onPaste={handlePaste}
             placeholder={placeholder}
             className="min-h-[60px] max-h-[140px] resize-none border-0 bg-transparent text-base shadow-none focus-visible:ring-0 px-2"
             onKeyDown={(e) => {
               if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                 e.preventDefault();
                 run(input);
               }
             }}
           />
            {imageData && (
              <div className="mt-3 rounded-2xl border border-border/60 bg-background/80 p-3 flex items-start gap-3">
                <img
                  src={imageData}
                  alt={imageName || "attached image"}
                  className="h-24 w-24 rounded-xl object-cover"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">{imageName}</p>
                      <p className="text-xs text-muted-foreground">{imageMimeType}</p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setImageData(null);
                        setImageMimeType(null);
                        setImageName(null);
                      }}
                    >
                      <X size={16} />
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Image attached for scanning. Send to ask the AI to interpret it.
                  </p>
                </div>
              </div>
            )}

            {documentData && (
              <div className="mt-3 rounded-2xl border border-border/60 bg-background/80 p-3 flex items-start gap-3">
                <div className="h-24 w-24 rounded-xl bg-muted flex items-center justify-center">
                  <FileText size={32} className="text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">{documentName}</p>
                      <p className="text-xs text-muted-foreground">{documentMimeType}</p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setDocumentData(null);
                        setDocumentMimeType(null);
                        setDocumentName(null);
                      }}
                    >
                      <X size={16} />
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Document attached for analysis. Send to ask the AI to analyze it.
                  </p>
                </div>
              </div>
            )}

            {voiceTranscript && (
              <div className="mt-3 rounded-2xl border border-border/60 bg-background/80 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                    </div>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Voice Transcript
                    </span>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={clearVoiceTranscript}
                  >
                    <X size={12} />
                  </Button>
                </div>
                <div className="max-h-32 overflow-y-auto rounded bg-background/50 p-2 text-sm">
                  {voiceTranscript}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Voice transcript recorded. Send to ask the AI to analyze it.
                </p>
              </div>
            )}
            <div className="flex items-center justify-between gap-2 pt-2 px-1">
              <div className="flex items-center gap-2">
                {acceptFile && (
                  <DropdownMenu>
                   <DropdownMenuTrigger asChild>
                     <button className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary transition-colors">
                       <Paperclip size={14} />
                       {t("workspace.attachFiles")}
                     </button>
                   </DropdownMenuTrigger>
                   <DropdownMenuContent align="start" side="top">
                     <DropdownMenuItem onClick={() => cameraInputRef.current?.click()}>
                       <Camera size={14} className="mr-2" />
                       {t("workspace.camera")}
                     </DropdownMenuItem>
                     <DropdownMenuItem onClick={() => documentInputRef.current?.click()}>
                       <FileText size={14} className="mr-2" />
                       {t("workspace.document")}
                     </DropdownMenuItem>
                     <DropdownMenuItem onClick={() => imageInputRef.current?.click()}>
                       <ImageIcon size={14} className="mr-2" />
                       {t("workspace.image")}
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
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    analytics.cameraInputUsed();
                    handleFile(e.target.files[0]);
                  }
                }}
              />
              <input
                ref={documentInputRef}
                type="file"
                accept=".txt,.md,.csv,.json,.pdf,.docx"
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
                {t("workspace.sendShortcut")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {loading ? (
                <Button
                  onClick={() => {
                    abortRef.current?.abort();
                    setLoading(false);
                  }}
                  variant="secondary"
                  size="sm"
                >
                  <Square size={14} className="mr-1.5" /> {t("common.cancel")}
                </Button>
              ) : (
                <>
                  {isRecording ? (
                    <Button
                      onClick={stopVoiceRecording}
                      className="rounded-full w-10 h-10 p-0 bg-red-500 hover:bg-red-600 transition-all duration-200"
                    >
                      <Square size={16} className="text-white" />
                    </Button>
                  ) : (
                    <Button
                      onClick={startVoiceRecording}
                      disabled={loading}
                      className="rounded-full w-10 h-10 p-0 bg-secondary hover:bg-secondary/80 transition-all duration-200"
                      title="Voice input"
                    >
                      <Mic size={16} className="text-muted-foreground" />
                    </Button>
                  )}
                  <Button
                    onClick={() => {
                      hapticMedium();
                      run(input);
                    }}
                     disabled={!input.trim() && !imageData && !documentData && !voiceTranscript.trim() && codeSnippets.length === 0}
                    className="bg-primary hover:opacity-90 btn-glow rounded-full w-10 h-10 p-0"
                  >
                    <ArrowUp size={16} />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {steps.length > 0 && lastInputRef.current && (
        <div className="glass-card rounded-2xl p-4 mb-6 animate-slide-up">
          <p className="text-sm font-medium text-muted-foreground">{t("workspace.question")}</p>
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

      {/* Premium Feature Dialog */}
      <Dialog open={showPremiumDialog} onOpenChange={setShowPremiumDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="text-yellow-500" size={20} />
              Premium Feature Required
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This feature requires a premium subscription to access all advanced capabilities.
              Upgrade your plan to unlock the full potential of Xplainfy.
            </p>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  setShowPremiumDialog(false);
                  setPendingRun(null);
                  // TODO: Navigate to subscription page or open payment modal
                  toast.info("Please upgrade to a premium plan to access advanced research features.");
                }}
                className="flex-1"
              >
                Upgrade Plan
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowPremiumDialog(false);
                  setPendingRun(null);
                }}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
       </Dialog>
      {/* Insufficient Credits Dialog */}
      <Dialog open={showInsufficientCreditsDialog} onOpenChange={setShowInsufficientCreditsDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="text-primary" size={20} />
              Insufficient Credits
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {insufficientCreditsMessage || "You don't have enough credits to use this feature. Would you like to get more credits?"}
            </p>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  setShowInsufficientCreditsDialog(false);
                  navigate("/subscription");
                }}
                className="flex-1"
              >
                Get Credits
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowInsufficientCreditsDialog(false)}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
     </div>
  );
}