import { useRef, useState } from "react";
import { streamAi, AiMode, MindsetType, DepthLevel, getAiCreditCost, getFreeTierStatus, getUserSubscriptionPlan } from "@/services/aiService";
import { useHistory } from "@/store/history";
import { useUserProfile } from "@/store/userProfile";
import { OutputCard } from "@/components/OutputCard";
import { Button } from "@/components/ui/button";
import { CreditNavIndicator } from "@/components/CreditNavIndicator";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUp, Square, Camera, FileText, Image as ImageIcon, Paperclip, X, MinusCircle, Maximize2, Mic, Crown, CreditCard, Loader2, AlertCircle } from "lucide-react";
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
import { hapticLight, hapticMedium, hapticSuccess } from "@/lib/haptic";
import { 
  getMaxInputWords, 
  getUploadLimitMB, 
  canAccessTutorLevel, 
  canAccessResearchLevel,
  canUseCitationStyle,
  PlanId,
  PLAN_FEATURES
} from "@/lib/planConstants";

// Styled select trigger matching sidebar button aesthetic
const StyledSelectTrigger = ({ className, children, ...props }: React.ComponentProps<typeof SelectTrigger>) => (
  <SelectTrigger
    className={`
      group flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5 
      text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white 
      transition-all duration-200 border border-white/10 bg-slate-900/50
      backdrop-blur-sm shadow-sm hover:shadow-md
      ${className || ""}
    `}
    {...props}
  >
    {children}
  </SelectTrigger>
);

// Styled select item matching dropdown aesthetic
const StyledSelectItem = ({ className, children, ...props }: React.ComponentProps<typeof SelectItem>) => (
  <SelectItem
    className={`
      rounded-xl px-4 py-2.5 text-sm font-medium text-slate-300
      focus:bg-white/10 focus:text-white focus:outline-none
      data-[highlighted]:bg-white/10 data-[highlighted]:text-white
      cursor-pointer transition-all duration-150
      ${className || ""}
    `}
    {...props}
  >
    {children}
  </SelectItem>
);

// Styled dropdown menu items matching sidebar navigation
const StyledDropdownMenuItem = ({ className, children, ...props }: React.ComponentProps<typeof DropdownMenuItem>) => (
  <DropdownMenuItem
    className={`
      flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold
      text-slate-300 hover:!bg-white/10 hover:!text-white
      cursor-pointer transition-all duration-150
      ${className || ""}
    `}
    {...props}
  >
    {children}
  </DropdownMenuItem>
);

// Styled button variants matching sidebar aesthetic
const StyledButton = ({ variant, className, children, ...props }: React.ComponentProps<typeof Button> & { variant?: "primary" | "secondary" | "ghost" | "outline" }) => {
  const variantClasses = {
    primary: "bg-primary hover:bg-primary/80 text-white shadow-lg hover:shadow-primary/25 transition-all duration-200",
    secondary: "bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-white/10 hover:border-white/20",
    ghost: "text-slate-300 hover:bg-white/10 hover:text-white",
    outline: "border border-white/10 bg-transparent hover:bg-white/10 text-slate-300 hover:text-white",
  };
  
  return (
    <Button
      className={`
        rounded-2xl px-4 py-2.5 text-sm font-semibold
        transition-all duration-200
        ${variantClasses[variant || "primary"]}
        ${className || ""}
      `}
      {...props}
    >
      {children}
    </Button>
  );
};

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

const getMindsetOptions = (t: any) => [
  { value: "general", label: t("workspace.general") },
  { value: "medical", label: t("workspace.medical") },
  { value: "engineering", label: t("workspace.engineering") },
  { value: "lecturer", label: t("workspace.lecturer") },
  { value: "scientific", label: t("workspace.scientific") },
  { value: "creative", label: t("workspace.creative") },
];

const getDepthOptions = (t: any, mode: AiMode, subscriptions: any[], citationStyle?: string, hasPaidSubscription?: boolean, totalCredits?: number) => {
  const allOptions = [
    { value: "fundamental", label: "Fundamental" },
    { value: "intermediate", label: t("workspace.intermediate") },
    { value: "higher", label: t("workspace.higher") },
    { value: "advanced", label: t("workspace.advanced") },
  ];

  return allOptions.map(({ value, label }) => {
    const cost = getAiCreditCost(mode, value, citationStyle, hasPaidSubscription, totalCredits, subscriptions);
    return {
      value,
      label,
      cost,
    };
  });
};

const getAvailableCitationStyles = (subscriptions: any[]): CitationStyle[] => {
  const userPlan = getUserSubscriptionPlan(subscriptions);
  
  const allCitations: CitationStyle[] = [
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

  if (userPlan === PlanId.TRIAL) {
    return allCitations.filter(c => c.name === "APA");
  }
  
  return allCitations;
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
  const [selectedDepth, setSelectedDepth] = useState<string>("fundamental");
  const [selectedCitationStyle, setSelectedCitationStyle] = useState<string>("APA");
  const [imageData, setImageData] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [extractedImageText, setExtractedImageText] = useState<string | null>(null);
  const [extractingImageText, setExtractingImageText] = useState(false);
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

  const checkCreditsBeforeSubmit = async (costInfo: { cost: number; premium: boolean; premiumPrice: number; label: string }) => {
    console.log("[AiWorkspace] checkCreditsBeforeSubmit", { mode, costInfo, profile: useUserProfile.getState().profile });
    if (costInfo.premium) {
      setShowPremiumDialog(true);
      return false;
    }

    if (costInfo.premiumPrice > 0) {
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
      const end = i + 1 < matches.length ? (matches[i + 1].index ?? withoutJson.length) : withoutJson.length;
      const stepContent = withoutJson.slice(start, end).trim();
      parsedSteps.push({ title, content: stepContent });
    }

    return parsedSteps;
  };

  const run = async (text: string) => {
    console.log("[debug] subscriptions raw", JSON.stringify(subscriptions));  // ADD THIS
    const planTier = getUserSubscriptionPlan(subscriptions);
    console.log("[debug] planTier", planTier);
    const hasText = text.trim().length > 0;
    if (!hasText && !imageData && !documentData && !voiceTranscript.trim() && codeSnippets.length === 0) return;
    if (loading) return;

    const userPlan = getUserSubscriptionPlan(subscriptions);
    const maxWords = userPlan ? getMaxInputWords(userPlan) : 250;
    
    const totalInput = text.trim() + (voiceTranscript.trim() ? voiceTranscript.trim() : "");
    const wordCount = totalInput.split(/\s+/).filter(w => w.length > 0).length;
    
    if (wordCount > maxWords) {
      toast.error(`Input exceeds ${maxWords} word limit for your plan. Current: ${wordCount} words`);
      return;
    }

    const costInfo = getAiCreditCost(mode, selectedDepth, selectedCitationStyle, subscriptions.some((s: any) => s.status === "active"), profile ? (profile.credits ?? 0) + getFreeTierStatus(profile, subscriptions).remaining : 0, subscriptions);

    if (!(await checkCreditsBeforeSubmit(costInfo))) {
      return;
    }

    await runWithCost(text, costInfo);
  };

  const runWithCost = async (text: string, costInfo: { cost: number; premium: boolean; premiumPrice: number; label: string }) => {
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

    analytics.aiRequestStarted(mode);
    hapticMedium();

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

  const costInfo = getAiCreditCost(mode, selectedDepth, selectedCitationStyle, subscriptions.some((s: any) => s.status === "active"));
  analytics.aiRequestCompleted(mode, costInfo.cost);

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

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = await navigator.clipboard.readText();
    if (!pastedText.trim()) return;

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

    if (pastedText.length > 200 || hasCodeIndicators) {
      e.preventDefault();

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
        content: pastedText.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, ''),
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
    const userPlan = getUserSubscriptionPlan(subscriptions);
    const uploadLimitMB = userPlan ? getUploadLimitMB(userPlan) : 1;
    const uploadLimitBytes = uploadLimitMB * 1_000_000;

    if (file.size > uploadLimitBytes) {
      toast.error(`File too large (max ${uploadLimitMB}MB for your plan). File size: ${(file.size / 1_000_000).toFixed(2)}MB`);
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

  const extractImageText = async () => {
    if (!imageData || !imageMimeType) return;

    setExtractingImageText(true);
    try {
      const SUPABASE_FN_URL = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '') + '/functions/v1/prompt-edge-function';
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

      if (!SUPABASE_FN_URL || !SUPABASE_ANON_KEY) {
        toast.error("Configuration error - cannot extract image text");
        return;
      }

      const response = await fetch(SUPABASE_FN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
          "apikey": SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          mode: "simplify",
          input: "Extract all visible text and questions from this image. Return only the extracted text, nothing else.",
          imageBase64: imageData.split(",")[1],
          imageMimeType: imageMimeType,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to extract text: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      let extractedText = "";
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const json = JSON.parse(line.slice(6));
              if (json.delta?.text) {
                extractedText += json.delta.text;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      if (extractedText.trim()) {
        setExtractedImageText(extractedText.trim());
        setInput(extractedText.trim());
        toast.success("Text extracted from image and set as input");
      } else {
        toast.info("No text found in image");
      }
    } catch (err) {
      console.error("[extractImageText] error:", err);
      toast.error("Failed to extract text from image");
    } finally {
      setExtractingImageText(false);
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

  const handleEndResponse = () => {
    hapticLight();
    reset();
    toast.success("Response ended. You can start a new query.");
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      
      {/* Mode-specific settings panels with styled selects */}
      {mode === "tutor" && steps.length === 0 && !loading && (
        <div className="rounded-2xl p-4 bg-gradient-to-br from-slate-900/50 to-slate-800/30 backdrop-blur-sm border border-white/10 shadow-xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold text-primary/80 block mb-2 uppercase tracking-wider">
                Choose Category
              </label>
              <Select
                value={selectedMindset}
                onValueChange={(value) => {
                  setSelectedMindset(value as MindsetType);
                  analytics.tutorMindsetChanged(value);
                }}
              >
                <StyledSelectTrigger>
                  <SelectValue />
                </StyledSelectTrigger>
                <SelectContent className="bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl">
                  {getMindsetOptions(t).map(({ value, label }) => (
                    <StyledSelectItem key={value} value={value}>
                      {label}
                    </StyledSelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-semibold text-primary/80 block mb-2 uppercase tracking-wider">
                Choose Level
              </label>
              <Select value={selectedDepth} onValueChange={(value) => {
                setSelectedDepth(value);
                if (mode === 'tutor') {
                  analytics.tutorExplanationDepthChanged(value);
                } else if (mode === 'research') {
                  analytics.researchExplanationDepthChanged(value);
                }
              }}>
                <StyledSelectTrigger>
                  <SelectValue />
                </StyledSelectTrigger>
                <SelectContent className="bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl">
                  {getDepthOptions(t, mode, subscriptions, undefined, subscriptions.some((s: any) => s.status === "active")).map(({ value, label, cost }) => (
                    <StyledSelectItem key={value} value={value}>
                      <div className="flex items-center justify-between w-full gap-3">
                        <span>{label}</span>
                        <div className="flex items-center gap-1.5">
                          {cost.premium && <Crown size={12} className="text-yellow-500" />}
                          <span className="text-xs text-primary/60">{cost.label}</span>
                        </div>
                      </div>
                    </StyledSelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {mode === "research" && steps.length === 0 && !loading && (
        <div className="rounded-2xl p-4 bg-gradient-to-br from-slate-900/50 to-slate-800/30 backdrop-blur-sm border border-white/10 shadow-xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-sm font-semibold text-primary/80 block mb-2 uppercase tracking-wider">
                Choose Level
              </label>
              <Select value={selectedDepth} onValueChange={(value) => {
                setSelectedDepth(value);
                analytics.researchExplanationDepthChanged(value);
              }}>
                <StyledSelectTrigger>
                  <SelectValue />
                </StyledSelectTrigger>
                <SelectContent className="bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl">
                  {getDepthOptions(t, mode, subscriptions, selectedCitationStyle, subscriptions.some((s: any) => s.status === "active"), profile ? (profile.credits ?? 0) + getFreeTierStatus(profile, subscriptions).remaining : 0).map(({ value, label, cost }) => (
                    <StyledSelectItem key={value} value={value}>
                      <div className="flex items-center justify-between w-full gap-3">
                        <span>{label}</span>
                        <div className="flex items-center gap-1.5">
                          {cost.premium && <Crown size={12} className="text-yellow-500" />}
                          <span className="text-xs text-primary/60">{cost.label}</span>
                        </div>
                      </div>
                    </StyledSelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-semibold text-primary/80 block mb-3 uppercase tracking-wider">
                Choose Citation Style
              </label>
              <div className="grid grid-cols-2 gap-2">
                {getAvailableCitationStyles(subscriptions).map((style) => {
                  const isAvailable = getAvailableCitationStyles(subscriptions).some(s => s.name === style.name);
                  return (
                    <Dialog key={style.name}>
                      <DialogTrigger asChild>
                        <button
                          onClick={() => {
                            if (isAvailable) {
                              setSelectedCitationStyle(style.name);
                              analytics.researchCriteriaChanged(style.name);
                            }
                          }}
                          disabled={!isAvailable && selectedCitationStyle !== style.name}
                          className={`
                            group p-3 rounded-xl border-2 transition-all duration-200 text-sm font-semibold
                            ${selectedCitationStyle === style.name
                              ? "border-primary bg-primary/10 text-white shadow-md"
                              : !isAvailable
                              ? "border-yellow-500/30 bg-yellow-500/5 opacity-60"
                              : "border-white/10 bg-slate-800/50 text-slate-300 hover:border-white/30 hover:bg-white/5"
                            }
                          `}
                        >
                          <div className="flex items-center justify-between">
                            <h3 className={`text-center w-full ${!isAvailable ? 'text-yellow-400' : ''}`}>
                              {style.name}
                            </h3>
                            <div className="flex items-center gap-1">
                              {!isAvailable && <Crown size={10} className="text-yellow-500" />}
                              {selectedCitationStyle === style.name && (
                                <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                              )}
                            </div>
                          </div>
                        </button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto bg-slate-900 border border-white/20 rounded-2xl">
                        <DialogHeader>
                          <DialogTitle className="text-white">{style.full_name}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 text-slate-300">
                          <div className="text-center">
                            <p className="text-sm text-slate-400">{style.use.purpose}</p>
                          </div>
                          <div>
                            <h4 className="font-medium text-sm mb-2 text-primary">Primary Fields:</h4>
                            <div className="flex flex-wrap gap-1">
                              {style.use.primary_fields.map((field) => (
                                <span key={field} className="text-xs bg-white/10 px-2 py-1 rounded-lg">
                                  {field}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div>
                            <h4 className="font-medium text-sm mb-2 text-primary">Common Scenarios:</h4>
                            <ul className="text-sm text-slate-400 space-y-1">
                              {style.use.common_scenarios.map((scenario) => (
                                <li key={scenario} className="flex items-center">
                                  <span className="w-1.5 h-1.5 bg-primary rounded-full mr-2 flex-shrink-0" />
                                  {scenario}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h4 className="font-medium text-sm mb-2 text-primary">Users & Disciplines:</h4>
                            <div className="space-y-2">
                              <div className="flex flex-wrap gap-1">
                                {style.users.main_users.map((user) => (
                                  <span key={user} className="text-xs bg-blue-500/20 text-blue-300 px-2 py-1 rounded-lg">
                                    {user}
                                  </span>
                                ))}
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {style.users.disciplines.map((discipline) => (
                                  <span key={discipline} className="text-xs bg-green-500/20 text-green-300 px-2 py-1 rounded-lg">
                                    {discipline}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="pt-2 border-t border-white/10">
                            <p className="text-sm text-slate-400 text-center">
                              <strong className="text-primary">Level:</strong> {style.users.level.join(", ")}
                            </p>
                          </div>
                          <div className="flex justify-center pt-4 border-t border-white/10">
                            <DialogClose asChild>
                              <StyledButton variant="primary" className="px-8">
                                Use {style.name}
                              </StyledButton>
                            </DialogClose>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Input area */}
      {steps.length === 0 && !loading && (
        <div className="rounded-2xl p-4 bg-gradient-to-br from-slate-900/50 to-slate-800/30 backdrop-blur-sm border border-white/10 shadow-xl">
          {/* Code Cards */}
          {codeSnippets.length > 0 && (
            <div className="mb-3 space-y-2">
              {codeSnippets.map((snippet, index) => (
                <div key={snippet.id} className="rounded-xl border border-white/10 bg-slate-800/50 p-3 relative group">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-primary/70 uppercase tracking-wider">
                      Code Snippet {index + 1}{snippet.language ? ` (${snippet.language})` : ''}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity rounded-full hover:bg-red-500/20"
                      onClick={() => {
                        setCodeSnippets(prev => prev.filter(s => s.id !== snippet.id));
                        hapticLight();
                      }}
                    >
                      <X size={12} />
                    </Button>
                  </div>
                  <div className="max-h-32 overflow-y-auto rounded-lg bg-slate-900/50 p-2 text-xs font-mono whitespace-pre-wrap border border-white/5">
                    {snippet.content}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Code Tray */}
          {isTrayOpen && trayContent && (
            <div className="mb-3 p-3 rounded-xl border border-white/10 bg-slate-800/50 relative">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-primary/70 uppercase tracking-wider">
                  Pasted Code / Large Text
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 rounded-xl hover:bg-white/10"
                    onClick={() => setIsTrayOpen(false)}
                  >
                    <MinusCircle size={12} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 rounded-xl hover:bg-red-500/20"
                    onClick={clearTray}
                  >
                    <X size={12} />
                  </Button>
                </div>
              </div>
              <div className="max-h-32 overflow-y-auto rounded-lg bg-slate-900/50 p-2 text-xs font-mono whitespace-pre-wrap border border-white/5">
                {trayContent}
              </div>
              <div className="mt-2 flex justify-end gap-2">
                <StyledButton variant="secondary" size="sm" onClick={clearTray}>
                  Discard
                </StyledButton>
                <StyledButton variant="primary" size="sm" onClick={moveFromTrayToInput}>
                  <Maximize2 size={12} className="mr-1" /> Use in Input
                </StyledButton>
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
            placeholder={mode === 'tutor' ? 'Ask me anything....' : placeholder}
            className="min-h-[60px] max-h-[140px] resize-none border-0 bg-transparent text-base text-slate-200 shadow-none focus-visible:ring-0 px-2 placeholder:text-slate-500"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                run(input);
              }
            }}
          />
          
          {imageData && (
            <div className="mt-3 rounded-xl border border-white/10 bg-slate-800/50 p-3 flex items-start gap-3">
              <img
                src={imageData}
                alt={imageName || "attached image"}
                className="h-24 w-24 rounded-lg object-cover border border-white/10"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-200">{imageName}</p>
                    <p className="text-xs text-slate-400">{imageMimeType}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={extractImageText}
                      disabled={extractingImageText}
                      className="rounded-xl hover:bg-white/10"
                      title="Extract text from image"
                    >
                      {extractingImageText ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setImageData(null);
                        setImageMimeType(null);
                        setImageName(null);
                        setExtractedImageText(null);
                      }}
                      className="rounded-xl hover:bg-red-500/20"
                    >
                      <X size={16} />
                    </Button>
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  Image attached for scanning. Click extract to scan text or send to ask the AI to interpret it.
                </p>
                {extractedImageText && (
                  <div className="mt-2 p-2 rounded-lg bg-slate-900/50 border border-white/5">
                    <p className="text-xs font-semibold text-primary/70 mb-1">Extracted text:</p>
                    <p className="text-sm text-slate-300 line-clamp-3">{extractedImageText}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {documentData && (
            <div className="mt-3 rounded-xl border border-white/10 bg-slate-800/50 p-3 flex items-start gap-3">
              <div className="h-24 w-24 rounded-lg bg-slate-900 flex items-center justify-center border border-white/10">
                <FileText size={32} className="text-slate-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-200">{documentName}</p>
                    <p className="text-xs text-slate-400">{documentMimeType}</p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setDocumentData(null);
                      setDocumentMimeType(null);
                      setDocumentName(null);
                    }}
                    className="rounded-xl hover:bg-red-500/20"
                  >
                    <X size={16} />
                  </Button>
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  Document attached for analysis. Send to ask the AI to analyze it.
                </p>
              </div>
            </div>
          )}

          {voiceTranscript && (
            <div className="mt-3 rounded-xl border border-white/10 bg-slate-800/50 p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center">
                    <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  </div>
                  <span className="text-xs font-semibold text-primary/70 uppercase tracking-wider">
                    Voice Transcript
                  </span>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 rounded-xl hover:bg-red-500/20"
                  onClick={clearVoiceTranscript}
                >
                  <X size={12} />
                </Button>
              </div>
              <div className="max-h-32 overflow-y-auto rounded-lg bg-slate-900/50 p-2 text-sm text-slate-300">
                {voiceTranscript}
              </div>
              <p className="mt-2 text-xs text-slate-400">
                Voice transcript recorded. Send to ask the AI to analyze it.
              </p>
            </div>
          )}
          
          <div className="flex items-center justify-between gap-2 pt-2 px-1">
            <div className="flex items-center gap-2">
              {acceptFile && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-primary transition-colors">
                      <Paperclip size={14} />
                      {t("workspace.attachFiles")}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="top" className="bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl p-1">
                    <StyledDropdownMenuItem onClick={() => cameraInputRef.current?.click()}>
                      <Camera size={14} className="mr-2" />
                      {t("workspace.camera")}
                    </StyledDropdownMenuItem>
                    <StyledDropdownMenuItem onClick={() => documentInputRef.current?.click()}>
                      <FileText size={14} className="mr-2" />
                      {t("workspace.document")}
                    </StyledDropdownMenuItem>
                    <StyledDropdownMenuItem onClick={() => imageInputRef.current?.click()}>
                      <ImageIcon size={14} className="mr-2" />
                      {t("workspace.image")}
                    </StyledDropdownMenuItem>
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
              <span className="text-[11px] text-slate-500 hidden sm:inline">
                {t("workspace.sendShortcut")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {loading ? (
                <StyledButton
                  onClick={() => {
                    abortRef.current?.abort();
                    setLoading(false);
                  }}
                  variant="secondary"
                  size="sm"
                >
                  <Square size={14} className="mr-1.5" /> {t("common.cancel")}
                </StyledButton>
              ) : (
                <>
                  {isRecording ? (
                    <Button
                      onClick={stopVoiceRecording}
                      className="rounded-full w-10 h-10 p-0 bg-red-500 hover:bg-red-600 transition-all duration-200 shadow-lg"
                    >
                      <Square size={16} className="text-white" />
                    </Button>
                  ) : (
                    <Button
                      onClick={startVoiceRecording}
                      disabled={loading}
                      className="rounded-full w-10 h-10 p-0 bg-slate-700 hover:bg-slate-600 transition-all duration-200"
                      title="Voice input"
                    >
                      <Mic size={16} className="text-slate-300" />
                    </Button>
                  )}
                  <Button
                    onClick={() => {
                      hapticMedium();
                      run(input);
                    }}
                    disabled={!input.trim() && !imageData && !documentData && !voiceTranscript.trim() && codeSnippets.length === 0}
                    className="bg-primary hover:bg-primary/80 btn-glow rounded-full w-10 h-10 p-0 shadow-lg"
                  >
                    <ArrowUp size={16} />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Question display */}
      {steps.length > 0 && lastInputRef.current && (
        <div className="rounded-2xl p-4 bg-gradient-to-br from-slate-900/50 to-slate-800/30 backdrop-blur-sm border border-white/10 animate-slide-up">
          <p className="text-sm font-semibold text-primary/70 uppercase tracking-wider">{t("workspace.question")}</p>
          <p className="text-slate-200 mt-1">{lastInputRef.current}</p>
        </div>
      )}

      {/* Output Card with End Response button integration */}
      <OutputCard
        content={output}
        steps={steps}
        currentStep={currentStep}
        onNext={() => setCurrentStep((prev) => prev + 1)}
        onPrevious={() => setCurrentStep((prev) => prev - 1)}
        loading={loading}
        onRegenerate={lastInputRef.current ? () => run(lastInputRef.current) : undefined}
        onNewQuery={reset}
        onEndResponse={handleEndResponse}
        mode={mode}
      />

      {/* Premium Feature Dialog */}
      <Dialog open={showPremiumDialog} onOpenChange={setShowPremiumDialog}>
        <DialogContent className="max-w-md bg-slate-900 border border-white/20 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Crown className="text-yellow-500" size={20} />
              Premium Feature Required
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              This feature requires a premium subscription to access all advanced capabilities.
              Upgrade your plan to unlock the full potential of Xplainfy.
            </p>
            <div className="flex gap-2">
              <StyledButton
                onClick={() => {
                  setShowPremiumDialog(false);
                  setPendingRun(null);
                  navigate("/subscription");
                }}
                className="flex-1"
              >
                Upgrade Plan
              </StyledButton>
              <StyledButton
                variant="secondary"
                onClick={() => {
                  setShowPremiumDialog(false);
                  setPendingRun(null);
                }}
                className="flex-1"
              >
                Cancel
              </StyledButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Insufficient Credits Dialog */}
      <Dialog open={showInsufficientCreditsDialog} onOpenChange={setShowInsufficientCreditsDialog}>
        <DialogContent className="max-w-md bg-slate-900 border border-white/20 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <CreditCard className="text-primary" size={20} />
              Insufficient Credits
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              {insufficientCreditsMessage || "You don't have enough credits to use this feature. Would you like to get more credits?"}
            </p>
            <div className="flex gap-2">
              <StyledButton
                onClick={() => {
                  setShowInsufficientCreditsDialog(false);
                  navigate("/subscription");
                }}
                className="flex-1"
              >
                Get Credits
              </StyledButton>
              <StyledButton
                variant="secondary"
                onClick={() => setShowInsufficientCreditsDialog(false)}
                className="flex-1"
              >
                Cancel
              </StyledButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}