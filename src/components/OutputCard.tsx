import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import {
  Copy, RefreshCw, Check, ChevronRight, ChevronLeft,
  Plus, Volume2, VolumeX, Download, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { generatePDF, cleanLaTeXContent } from "@/lib/pdfGenerator";
import { AiMode } from "@/services/aiService";
import { analytics } from "@/lib/analytics";
import { hapticSuccess, hapticLight } from "@/lib/haptic";



// ─────────────────────────────────────────────────────────────────────────────
// Markdown table components
// ─────────────────────────────────────────────────────────────────────────────

const MarkdownTable = ({ children }: { children?: React.ReactNode }) => (
  <div className="overflow-x-auto my-6 rounded-lg border border-border/50 bg-muted/30">
    <table className="w-full border-collapse text-sm">{children}</table>
  </div>
);

const MarkdownTableHead = ({ children }: { children?: React.ReactNode }) => (
  <thead className="bg-primary/10 border-b border-border/50">{children}</thead>
);

const MarkdownTableBody = ({ children }: { children?: React.ReactNode }) => (
  <tbody>{children}</tbody>
);

const MarkdownTableRow = ({ children }: { children?: React.ReactNode }) => (
  <tr className="hover:bg-muted/50 transition-colors border-b border-border/30 last:border-b-0">
    {children}
  </tr>
);

const MarkdownTableCell = ({
  children,
  isHeader,
}: {
  children?: React.ReactNode;
  isHeader?: boolean;
}) => {
  const base = "px-4 py-3 text-left align-top";
  return isHeader ? (
    <th className={`${base} font-semibold text-foreground/90 bg-primary/5`}>{children}</th>
  ) : (
    <td className={`${base} text-foreground/75`}>{children}</td>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Table content cleaner
// ─────────────────────────────────────────────────────────────────────────────

const cleanTableContent = (text: string): string => {
  let result = text;

  if (result.includes(" | | ")) {
    const rows = result.split(" | | ");
    if (rows.length >= 2) {
      result = rows
        .map((r) => r.trim())
        .filter((r) => r && r.includes("|"))
        .join("\n");
    }
  }

  const lines = result.split("\n");
  const cleaned: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(\|\s*)?:\s*-+\s*(\|\s*:\s*-+\s*)*(\|)?$/.test(trimmed)) continue;
    if (/^(\|\s*)+$/.test(trimmed)) continue;
    cleaned.push(line);
  }

  return cleaned.join("\n");
};

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface OutputCardProps {
  content: string;
  steps: Array<{ title: string; content: string }>;
  currentStep: number;
  onNext: () => void;
  onPrevious: () => void;
  loading?: boolean;
  onRegenerate?: () => void;
  onNewQuery?: () => void;
  mode?: AiMode;
  practiceQuestions?: PracticeQuestion[];
}

interface PracticeQuestion {
  question: string;
  options: string[];
  correct_answer: string;
  explanation?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Practice question extractor — handles both raw JSON and fenced code blocks
// ─────────────────────────────────────────────────────────────────────────────

function extractPracticeQuestions(text: string): PracticeQuestion[] {
  try {
    // 1. Try raw object form: {"practice_questions":[...]}
    const objMatch = text.match(/\{"practice_questions"\s*:\s*\[[\s\S]*?\]\s*\}/);
    if (objMatch) {
      const parsed = JSON.parse(objMatch[0]);
      return normaliseQuestions(parsed.practice_questions ?? []);
    }

    // 2. Try bare array (may be inside a fenced code block)
    const arrayMatch = text.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
    if (arrayMatch) {
      const parsed = JSON.parse(arrayMatch[1]);
      if (Array.isArray(parsed)) return normaliseQuestions(parsed);
    }

    // 3. Try a bare array outside any fence
    const bareArray = text.match(/\[\s*\{[\s\S]*?\}\s*\]/);
    if (bareArray) {
      const parsed = JSON.parse(bareArray[0]);
      if (Array.isArray(parsed)) return normaliseQuestions(parsed);
    }
  } catch {
    // silently fail
  }
  return [];
}

/**
 * Normalise questions so they always have:
 *   - options with "A) " … "D) " prefixes
 *   - a correct_answer field (falls back from "answer" key)
 */
function normaliseQuestions(raw: any[]): PracticeQuestion[] {
  return raw
    .filter((q) => q && typeof q.question === "string" && Array.isArray(q.options))
    .map((q) => {
      const letters = ["A", "B", "C", "D"];

      // Ensure every option has a letter prefix
      const options: string[] = q.options.map((opt: string, i: number) => {
        const prefix = `${letters[i] ?? String.fromCharCode(65 + i)}) `;
        return opt.startsWith(prefix) || /^[A-D]\)\s/.test(opt) ? opt : `${prefix}${opt}`;
      });

      // Resolve correct_answer — prefer correct_answer, fall back to answer
      let correct_answer: string = q.correct_answer ?? q.answer ?? "";

      // If correct_answer is a plain string without a letter prefix, try to match it
      if (!/^[A-D]\)\s/.test(correct_answer)) {
        const match = options.find((o) =>
          o.toLowerCase().includes(correct_answer.toLowerCase())
        );
        if (match) correct_answer = match;
      }

      return { 
        question: q.question, 
        options, 
        correct_answer,
        explanation: q.explanation || "" 
      };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Markdown components
// ─────────────────────────────────────────────────────────────────────────────

const markdownComponents = {
  table: MarkdownTable,
  thead: MarkdownTableHead,
  tbody: MarkdownTableBody,
  tr: MarkdownTableRow,
  td: ({ children, ...props }: any) => <MarkdownTableCell {...props}>{children}</MarkdownTableCell>,
  th: ({ children, ...props }: any) => <MarkdownTableCell isHeader {...props}>{children}</MarkdownTableCell>,
  code: ({ node, inline, className, children, ...props }: any) => {
    const match = /language-(\w+)/.exec(className || "");
    const language = match ? match[1] : "";
    const codeString = String(children).replace(/\n$/, "");

    if (inline) {
      return (
        <code className={`${className} bg-muted/60 px-1.5 py-0.5 rounded-md`} {...props}>
          {children}
        </code>
      );
    }

    return (
      <div className="relative group my-4">
        <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border border-border rounded-t-lg">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {language || "code"}
          </span>
          <button
            className="h-6 px-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs bg-transparent border-none text-muted-foreground hover:text-foreground"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(codeString);
                toast.success("Code copied to clipboard!");
              } catch {
                toast.error("Failed to copy code");
              }
            }}
          >
            <Copy className="w-3 h-3 mr-1 inline" />
            Copy
          </button>
        </div>
        <SyntaxHighlighter
          style={oneDark}
          language={language}
          PreTag="div"
          className="!mt-0 !rounded-t-none"
          {...props}
        >
          {codeString}
        </SyntaxHighlighter>
      </div>
    );
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// OutputCard Component
// ─────────────────────────────────────────────────────────────────────────────

export function OutputCard({
  content,
  steps,
  currentStep,
  onNext,
  onPrevious,
  loading,
  onRegenerate,
  onNewQuery,
  mode,
  practiceQuestions: providedPracticeQuestions,
}: OutputCardProps) {
  const { t } = useTranslation();

  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [practiceAnswers, setPracticeAnswers] = useState<Record<number, string>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [questionTimer, setQuestionTimer] = useState<number | null>(null);
  const [questionTimeLeft, setQuestionTimeLeft] = useState(20);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [showingPracticeQuestions, setShowingPracticeQuestions] = useState(false);
  const [isRenderingTable, setIsRenderingTable] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [hasShownHaptic, setHasShownHaptic] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const codeBlockRef = useRef<HTMLDivElement | null>(null);

  // Derive practice questions once for reuse in render
  const practiceQuestions = providedPracticeQuestions || (mode === "tutor" ? extractPracticeQuestions(content) : []);

  // Memoised cleaned content for display
  const cleanedContent = useMemo(() => {
    if (!content && steps.length === 0) return "";
    try {
      const stepContent = steps[currentStep]?.content?.trim() || steps[currentStep]?.content || content;

      // For research final step, reconstruct from all steps; otherwise use current step
      const baseContent = mode === "research" && currentStep === steps.length - 1 && steps.length > 0
        ? steps.map((s) => `## ${s.title}\n${s.content}`).join("\n\n")
        : stepContent || "";

      // Only clean for table parsing; preserve LaTeX for KaTeX rendering
      return cleanTableContent(baseContent)
        .replace(/\[CORRECT\]/g, "")
        // Strip any leftover practice_questions JSON blob from display
        .replace(/\{"practice_questions"[\s\S]*?(?=\n\n|$)/, "")
        // Strip fenced JSON blocks (practice questions)
        .replace(/```(?:json)?\s*\[[\s\S]*?\]\s*```/g, "");
    } catch {
      return content;
    }
  }, [content, steps, currentStep, mode]);

  // Trigger haptic feedback when content loads
  useEffect(() => {
    if (!loading && cleanedContent?.trim()) {
      setIsRenderingTable(true);
      const t = setTimeout(() => setIsRenderingTable(false), 50);
      if (!hasShownHaptic) {
        hapticSuccess();
        setHasShownHaptic(true);
      }
      return () => clearTimeout(t);
    } else if (loading) {
      setIsRenderingTable(false);
      setHasShownHaptic(false);
    }
  }, [cleanedContent, loading, hasShownHaptic]);

  // Practice questions timer
  useEffect(() => {
    if (showingPracticeQuestions && practiceQuestions.length > 0 && !showResults) {
      const question = practiceQuestions[currentQuestionIndex];
      if (question && practiceAnswers[currentQuestionIndex] === undefined) {
        setQuestionTimeLeft(20);

        const timer = window.setInterval(() => {
          setQuestionTimeLeft(prev => {
            if (prev <= 1) {
              clearInterval(timer);
              handlePracticeAnswerSelect(currentQuestionIndex, "");
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
        setQuestionTimer(timer);

        return () => clearInterval(timer);
      }
    }
  }, [showingPracticeQuestions, currentQuestionIndex, practiceQuestions, practiceAnswers, showResults]);

  // Clear timer on unmount
  useEffect(() => {
    return () => {
      if (questionTimer) {
        clearInterval(questionTimer);
      }
      if (speaking) {
        speechSynthesis.cancel();
      }
    };
  }, [questionTimer, speaking]);

  // ── Multiple choice (problem mode) ────────────────────────────────────────

  const parseMultipleChoice = (content: string) => {
    const options: { letter: string; text: string; correct: boolean }[] = [];
    content.split("\n").forEach((line) => {
      const match = line.match(/^([A-D])\)\s*(.+?)(?:\s*\[CORRECT\])?$/i);
      if (match) {
        const [, letter, text] = match;
        options.push({
          letter: letter.toUpperCase(),
          text: text.trim().replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1"),
          correct: line.includes("[CORRECT]"),
        });
      }
    });
    return options;
  };

  const handleAnswerSelect = (letter: string) => {
    setSelectedAnswer(letter);
    const options = parseMultipleChoice(steps[currentStep]?.content || "");
    const selected = options.find((o) => o.letter === letter);
    if (selected?.correct) {
      toast.success("Correct! Well done!");
      hapticSuccess();
    } else {
      const correct = options.find((o) => o.correct);
      toast.error(`Wrong. The correct answer is ${correct?.letter}) ${correct?.text}`);
      hapticLight();
    }
  };

  // ── Practice questions (tutor mode) ───────────────────────────────────────

  const handlePracticeAnswerSelect = (questionIndex: number, selectedLetter: string) => {
    if (questionTimer) {
      clearInterval(questionTimer);
      setQuestionTimer(null);
    }

    setPracticeAnswers((prev) => ({ ...prev, [questionIndex]: selectedLetter }));

    const question = practiceQuestions[questionIndex];
    if (!question) return;

    const correctLetter = question.correct_answer.match(/^[A-D]/)?.[0];

    if (selectedLetter === correctLetter) {
      toast.success("Correct! Great job practicing!");
      hapticSuccess();
    } else if (selectedLetter === "") {
      toast.error("Time's up! Let's see the correct answer.");
      hapticLight();
    } else {
      const correctOption = question.options.find((o) => o.startsWith(correctLetter ?? ""));
      toast.error(`Not quite. The correct answer is ${correctOption ?? question.correct_answer}`);
      hapticLight();
    }

    // Auto-advance to next question or show results
    if (selectedLetter !== "") {
      // User selected, advance immediately
      if (questionIndex < practiceQuestions.length - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
      } else {
        setShowResults(true);
      }
    } else {
      // Timeout, show message then advance after delay
      setTimeout(() => {
        if (questionIndex < practiceQuestions.length - 1) {
          setCurrentQuestionIndex(prev => prev + 1);
        } else {
          setShowResults(true);
        }
      }, 2000);
    }
  };

  // ── Text to speech ────────────────────────────────────────────────────────

  const handleSpeak = () => {
    if (!("speechSynthesis" in window)) {
      toast.error("Text-to-speech not supported in this browser");
      return;
    }
    if (speaking) {
      speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    if (!cleanedContent.trim()) return;
    
    analytics.speakButtonClicked();
    const utterance = new SpeechSynthesisUtterance(cleanedContent);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => {
      setSpeaking(false);
      toast.error("Speech synthesis failed");
    };
    speechSynthesis.speak(utterance);
  };

  // ── Download PDF ──────────────────────────────────────────────────────────

  const downloadDocument = useCallback(async () => {
    try {
      analytics.downloadButtonClicked(mode as string);
      setIsDownloading(true);
      const titles: Record<string, string> = {
        tutor: "Tutorial",
        research: "Research Report",
        problem: "Problem Solution",
      };
      const title = steps[0]?.title || titles[mode as string] || "Document";
      const success = await generatePDF(title, steps, mode as string);
      if (success) {
        toast.success("PDF downloaded successfully");
        hapticSuccess();
      } else {
        toast.error("Failed to generate PDF");
      }
    } catch {
      toast.error("Failed to download document");
    } finally {
      setIsDownloading(false);
    }
  }, [steps, mode]);

  // ── Calculate results ─────────────────────────────────────────────────────

  const calculateResults = useMemo(() => {
    if (!showResults) return null;
    
    let correct = 0;
    practiceQuestions.forEach((q, idx) => {
      const answer = practiceAnswers[idx];
      const correctLetter = q.correct_answer.match(/^[A-D]/)?.[0];
      if (answer === correctLetter) correct++;
    });
    
    return {
      correct,
      total: practiceQuestions.length,
      percentage: (correct / practiceQuestions.length) * 100
    };
  }, [showResults, practiceQuestions, practiceAnswers]);

  // Early return if no content
  if (!loading && steps.length === 0 && !content) return null;

  const isTutorPracticeStep = mode === "tutor" && 
    currentStep === steps.length - 1 && 
    practiceQuestions.length > 0;

  const visibleContent = (isTutorPracticeStep && !showingPracticeQuestions) ? "" : cleanedContent;

  return (
    <div className="glass-card rounded-2xl p-4 sm:p-6 lg:p-7 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {loading
              ? t("workspace.thinking")
              : (steps[currentStep]?.title || t("workspace.response")).replace(/[\^$]/g, "")}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {onNewQuery && (
            <Button size="sm" variant="ghost" onClick={() => { hapticLight(); onNewQuery(); }}>
              <Plus size={14} className="mr-1.5" /> {t("workspace.newQuery")}
            </Button>
          )}
          {onRegenerate && (
            <Button size="sm" variant="ghost" onClick={() => { hapticLight(); onRegenerate(); }} disabled={loading}>
              <RefreshCw size={14} className="mr-1.5" /> {t("workspace.regenerate")}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { hapticLight(); handleSpeak(); }}
            disabled={!content || showingPracticeQuestions}
          >
            {speaking ? (
              <VolumeX size={14} className="mr-1.5" />
            ) : (
              <Volume2 size={14} className="mr-1.5" />
            )}
            {speaking ? t("workspace.stop") : t("workspace.speak")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={downloadDocument}
            disabled={!content || loading || isDownloading}
          >
            {isDownloading ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : (
              <Download size={14} className="mr-1.5" />
            )}
            {isDownloading ? t("workspace.downloading") || "Downloading…" : t("workspace.download")}
          </Button>

        </div>
      </div>

      {/* Body Content */}
      {loading ? (
        // Loading skeleton
        <div className="space-y-3">
          {[80, 95, 70, 88, 60].map((w, i) => (
            <div
              key={i}
              className="h-3 rounded-full bg-muted animate-pulse"
              style={{ width: `${w}%` }}
            />
          ))}
        </div>
      ) : isRenderingTable ? (
        // Table rendering indicator
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={32} className="animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              {t("workspace.renderingContent") || "Rendering content…"}
            </p>
          </div>
        </div>
      ) : showingPracticeQuestions ? (
        // Practice Questions View
        <div className="space-y-6">
          {!showResults ? (
            <>
              {/* Timer and Progress */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    questionTimeLeft > 10 ? 'bg-green-500' :
                    questionTimeLeft > 5 ? 'bg-yellow-500' : 'bg-red-500'
                  } animate-pulse`} />
                  <span className="text-sm font-medium">
                    {questionTimeLeft}s remaining
                  </span>
                </div>
                <span className="text-sm text-muted-foreground">
                  Question {currentQuestionIndex + 1} of {practiceQuestions.length}
                </span>
              </div>

              {/* Question */}
              <div className="p-4 bg-muted/30 rounded-lg">
                <p className="font-medium text-lg">
                  {practiceQuestions[currentQuestionIndex].question}
                </p>
              </div>

              {/* Options */}
              <div className="grid gap-3 grid-cols-1">
                {practiceQuestions[currentQuestionIndex].options.map((option) => {
                  const letter = option.match(/^([A-D])\)/)?.[1] ?? "";
                  const isSelected = practiceAnswers[currentQuestionIndex] === letter;
                  const correctLetter = practiceQuestions[currentQuestionIndex].correct_answer.match(/^[A-D]/)?.[0];
                  const isCorrect = letter === correctLetter;
                  const hasAnswered = practiceAnswers[currentQuestionIndex] !== undefined;

                  let variant: "default" | "destructive" | "outline" = "outline";
                  if (hasAnswered) {
                    if (isSelected) {
                      variant = isCorrect ? "default" : "destructive";
                    }
                  }

                  return (
                    <Button
                      key={letter}
                      onClick={() => handlePracticeAnswerSelect(currentQuestionIndex, letter)}
                      variant={variant}
                      className="justify-start text-left h-auto py-3 px-4"
                      disabled={hasAnswered || questionLoading}
                    >
                      <div className="flex items-center gap-3 w-full">
                        <span className="font-semibold">{letter})</span>
                        <span className="flex-1">{option.substring(3)}</span>
                        {hasAnswered && isSelected && (
                          <div className={`w-2 h-2 rounded-full ${isCorrect ? 'bg-green-500' : 'bg-red-500'}`} />
                        )}
                      </div>
                    </Button>
                  );
                })}
              </div>

              {/* Explanation */}
              {practiceAnswers[currentQuestionIndex] !== undefined && 
               practiceQuestions[currentQuestionIndex].explanation && (
                <div className="mt-4 p-3 bg-primary/10 rounded-lg border border-primary/20">
                  <p className="text-sm">
                    <strong className="text-primary">Explanation:</strong> {practiceQuestions[currentQuestionIndex].explanation}
                  </p>
                </div>
              )}

              {/* Navigation Buttons - Removed as per user request */}
              {/* <div className="flex items-center justify-between gap-3 mt-6 pt-4 border-t border-border">
                <Button
                  onClick={() => {
                    if (questionTimer) clearInterval(questionTimer);
                    setQuestionLoading(true);
                    setTimeout(() => {
                      if (currentQuestionIndex > 0) {
                        setCurrentQuestionIndex(prev => prev - 1);
                      }
                      setQuestionLoading(false);
                    }, 300);
                  }}
                  disabled={currentQuestionIndex === 0 || questionLoading}
                  variant="outline"
                  className="flex-1"
                >
                  <ChevronLeft size={16} className="mr-2" />
                  Previous
                </Button>

                <Button
                  onClick={() => {
                    if (questionTimer) clearInterval(questionTimer);
                    setQuestionLoading(true);
                    setTimeout(() => {
                      if (currentQuestionIndex < practiceQuestions.length - 1) {
                        setCurrentQuestionIndex(prev => prev + 1);
                      } else {
                        setShowResults(true);
                      }
                      setQuestionLoading(false);
                    }, 300);
                  }}
                  disabled={practiceAnswers[currentQuestionIndex] === undefined || questionLoading}
                  className="flex-1"
                >
                  {questionLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      {currentQuestionIndex < practiceQuestions.length - 1 ? 'Next Question' : 'Finish Practice'}
                      <ChevronRight size={16} className="ml-2" />
                    </>
                  )}
                </Button>
              </div> */}
            </>
          ) : (
            // Results View
            <div className="space-y-6">
              <div className="text-center p-6 bg-gradient-to-br from-primary/5 to-primary/10 rounded-2xl">
                <h3 className="text-2xl font-bold mb-2">Practice Complete! 🎉</h3>
                <p className="text-muted-foreground">Here's how you did:</p>
                
                <div className="mt-6 flex justify-center">
                  <div className="relative w-32 h-32">
                    <svg className="w-full h-full" viewBox="0 0 100 100">
                      <circle
                        className="text-muted/20"
                        strokeWidth="8"
                        stroke="currentColor"
                        fill="transparent"
                        r="40"
                        cx="50"
                        cy="50"
                      />
                      <circle
                        className="text-primary"
                        strokeWidth="8"
                        strokeDasharray={`${calculateResults?.percentage} ${100 - (calculateResults?.percentage || 0)}`}
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="transparent"
                        r="40"
                        cx="50"
                        cy="50"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-2xl font-bold">
                        {calculateResults?.percentage.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="mt-4 space-y-2">
                  <p className="text-lg">
                    <strong>{calculateResults?.correct}</strong> out of <strong>{calculateResults?.total}</strong> correct
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {calculateResults?.percentage === 100 
                      ? "Perfect score! Excellent work! 🌟" 
                      : calculateResults && calculateResults.percentage >= 70
                      ? "Good job! Keep practicing! 💪"
                      : "Review the material and try again! 📚"}
                  </p>
                </div>
              </div>

              <Button
                onClick={() => {
                  setShowingPracticeQuestions(false);
                  setShowResults(false);
                  setPracticeAnswers({});
                  setCurrentQuestionIndex(0);
                }}
                className="w-full"
              >
                Back to Content
              </Button>
            </div>
          )}
        </div>
      ) : (
        // Main Content View
        <>
          {/* Markdown Content */}
          {visibleContent && (
            <article className="prose prose-sm sm:prose-base max-w-none prose-headings:font-display prose-headings:tracking-tight prose-headings:text-primary-deep prose-headings:mt-6 prose-headings:mb-2 prose-h2:text-lg prose-h3:text-base prose-p:text-foreground/85 prose-li:text-foreground/85 prose-strong:text-foreground prose-code:text-foreground prose-code:bg-muted/60 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:before:content-none prose-code:after:content-none prose-pre:bg-transparent prose-pre:p-0 prose-pre:border-none prose-pre:shadow-none">
              <ReactMarkdown
                remarkPlugins={[remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={markdownComponents}
              >
                {cleanedContent}
              </ReactMarkdown>
            </article>
          )}

          {/* Problem Mode - Multiple Choice */}
          {mode === "problem" && visibleContent && parseMultipleChoice(cleanedContent).length > 0 && (
            <div className="mt-6 space-y-3">
              <h3 className="font-semibold text-base">{t("workspace.selectCorrectAnswer")}</h3>
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                {parseMultipleChoice(cleanedContent).map((option) => (
                  <Button
                    key={option.letter}
                    onClick={() => handleAnswerSelect(option.letter)}
                    variant={
                      selectedAnswer
                        ? option.correct
                          ? "default"
                          : selectedAnswer === option.letter
                          ? "destructive"
                          : "outline"
                        : "outline"
                    }
                    className="justify-start text-left h-auto py-2.5 px-4"
                    disabled={selectedAnswer !== null}
                  >
                    <span className="font-semibold mr-2">{option.letter})</span>
                    {option.text}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Tutor Mode - Practice Questions Button */}
          {mode === "tutor" && isTutorPracticeStep && !showingPracticeQuestions && (
            <div className="mt-8 pt-6 border-t border-border">
              <div className="bg-gradient-to-r from-primary/5 to-primary/10 rounded-lg p-4 mb-4">
                <h4 className="font-semibold mb-1">🎯 Ready to Test Your Knowledge?</h4>
                <p className="text-sm text-muted-foreground">
                  Practice with {practiceQuestions.length} questions to reinforce what you've learned.
                </p>
              </div>
              <Button
                onClick={() => {
                  hapticLight();
                  setShowingPracticeQuestions(true);
                }}
                variant="default"
                className="w-full"
              >
                Start Practice Questions ({practiceQuestions.length})
              </Button>
            </div>
          )}

          {/* Action Buttons - Removed as per user request, already at top */}
          {/* {visibleContent && (
            <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
              <Button onClick={handleSpeak} variant="outline" size="sm">
                <Volume2 className="w-4 h-4 mr-2" />
                {t("workspace.speak")}
              </Button>
              <Button onClick={downloadDocument} variant="outline" size="sm" disabled={isDownloading}>
                {isDownloading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                {t("workspace.download")}
              </Button>
              {onRegenerate && (
                <Button onClick={onRegenerate} variant="outline" size="sm">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  {t("workspace.regenerate")}
                </Button>
              )}
              {onNewQuery && (
                <Button onClick={onNewQuery} variant="outline" size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  {t("workspace.newQuery")}
                </Button>
              )}
            </div>
          )} */}
        </>
      )}

      {/* Step Navigation (Only for multi-step content) */}
      {!loading && steps.length > 1 && !showingPracticeQuestions && (
        <div className="flex justify-center gap-3 mt-6 pt-4 border-t border-border">
          <Button
            onClick={() => { hapticLight(); onPrevious(); }}
            disabled={currentStep === 0}
            variant="outline"
            className="flex-1 bg-background hover:bg-muted"
          >
            <ChevronLeft size={16} className="mr-2" />
            Previous
          </Button>
          <Button
            onClick={() => { hapticLight(); onNext(); }}
            disabled={currentStep === steps.length - 1}
            className="flex-1 bg-primary hover:opacity-90 btn-glow"
          >
            {t("workspace.nextStep")}
            <ChevronRight size={16} className="ml-2" />
          </Button>
        </div>
      )}


    </div>
  );
}