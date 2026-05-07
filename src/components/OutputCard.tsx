import ReactMarkdown from "react-markdown";
import {
  Copy, RefreshCw, Check, ChevronRight, ChevronLeft,
  Plus, Volume2, VolumeX, Download, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useMemo, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { generatePDF, cleanLaTeXContent } from "@/lib/pdfGenerator";
import { AiMode } from "@/services/aiService";

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
}

interface PracticeQuestion {
  question: string;
  options: string[];
  correct_answer: string;
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

      return { question: q.question, options, correct_answer };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// OutputCard
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
}: OutputCardProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [practiceAnswers, setPracticeAnswers] = useState<Record<number, string>>({});
  const [showingPracticeQuestions, setShowingPracticeQuestions] = useState(false);
  const [isRenderingTable, setIsRenderingTable] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Memoised cleaned content for display
  const cleanedContent = useMemo(() => {
    if (!content && steps.length === 0) return "";
    try {
      const stepContent =
        steps[currentStep]?.content?.trim() ? steps[currentStep].content : content;

      const latexCleaned =
        mode === "research" && currentStep === steps.length - 1
          ? steps
              .map((s) => `## ${cleanLaTeXContent(s.title)}\n${cleanLaTeXContent(s.content)}`)
              .join("\n\n")
          : cleanLaTeXContent(stepContent || "")
              .replace(/\[CORRECT\]/g, "")
              // Strip any leftover practice_questions JSON blob from display
              .replace(/\{"practice_questions"[\s\S]*$/, "")
              // Strip fenced JSON blocks (practice questions)
              .replace(/```(?:json)?\s*\[[\s\S]*?\]\s*```/g, "");

      return cleanTableContent(latexCleaned.replace(/[\^$\\*]/g, ""));
    } catch {
      return content;
    }
  }, [content, steps, currentStep, mode]);

  useEffect(() => {
    if (!loading && cleanedContent?.trim()) {
      setIsRenderingTable(true);
      const t = setTimeout(() => setIsRenderingTable(false), 50);
      return () => clearTimeout(t);
    } else if (loading) {
      setIsRenderingTable(false);
    }
  }, [cleanedContent, loading]);

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
    } else {
      const correct = options.find((o) => o.correct);
      toast.error(`Wrong. The correct answer is ${correct?.letter}) ${correct?.text}`);
    }
  };

  // ── Practice questions (tutor mode) ───────────────────────────────────────

  const handlePracticeAnswerSelect = (questionIndex: number, selectedLetter: string) => {
    setPracticeAnswers((prev) => ({ ...prev, [questionIndex]: selectedLetter }));
    const questions = extractPracticeQuestions(content);
    const question = questions[questionIndex];
    const correctLetter = question.correct_answer.match(/^[A-D]/)?.[0];

    if (selectedLetter === correctLetter) {
      toast.success("Correct! Great job practicing!");
    } else {
      const correctOption = question.options.find((o) => o.startsWith(correctLetter ?? ""));
      toast.error(`Not quite. The correct answer is ${correctOption ?? question.correct_answer}`);
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
    const utterance = new SpeechSynthesisUtterance(cleanedContent);
    utterance.rate = 1;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => {
      setSpeaking(false);
      toast.error("Speech synthesis failed");
    };
    speechSynthesis.speak(utterance);
  };

  // ── Download ──────────────────────────────────────────────────────────────

  const downloadDocument = useCallback(async () => {
    try {
      setIsDownloading(true);
      const titles: Record<string, string> = {
        tutor: "Tutorial",
        research: "Research Report",
        problem: "Problem Solution",
      };
      const title = titles[mode as string] || "Document";
      const success = await generatePDF(title, steps, mode as string);
      if (success) {
        toast.success("PDF downloaded successfully");
      } else {
        toast.error("Failed to generate PDF");
      }
    } catch {
      toast.error("Failed to download document");
    } finally {
      setIsDownloading(false);
    }
  }, [steps, mode]);

  // ── Copy ──────────────────────────────────────────────────────────────────

  const getCopyText = useCallback(() => {
    if (mode === "research" && currentStep === steps.length - 1 && steps.length > 0) {
      return steps.map((s) => `## ${s.title}\n${s.content}`).join("\n\n");
    }
    if (steps[currentStep]?.content?.trim()) return steps[currentStep].content;
    if (cleanedContent?.trim()) return cleanedContent;
    return content;
  }, [cleanedContent, content, steps, currentStep, mode]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(getCopyText());
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy");
    }
  }, [getCopyText]);

  // FIX: also guard against content being present (during streaming)
  if (!loading && steps.length === 0 && !content) return null;

  // Derive practice questions once for reuse in render
  const practiceQuestions = mode === "tutor" ? extractPracticeQuestions(content) : [];

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
            <Button size="sm" variant="ghost" onClick={onNewQuery}>
              <Plus size={14} className="mr-1.5" /> {t("workspace.newQuery")}
            </Button>
          )}
          {onRegenerate && (
            <Button size="sm" variant="ghost" onClick={onRegenerate} disabled={loading}>
              <RefreshCw size={14} className="mr-1.5" /> {t("workspace.regenerate")}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleSpeak}
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
          <Button size="sm" variant="ghost" onClick={handleCopy} disabled={!content}>
            {copied ? <Check size={14} className="mr-1.5" /> : <Copy size={14} className="mr-1.5" />}
            {copied ? t("workspace.copied") : t("workspace.copy")}
          </Button>
        </div>
      </div>

      {/* Body */}
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
      ) : isRenderingTable ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={32} className="animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              {t("workspace.renderingContent") || "Rendering content…"}
            </p>
          </div>
        </div>
      ) : (
        <>
          {!showingPracticeQuestions ? (
            <>
              {/* Main markdown content */}
              <article className="prose prose-sm sm:prose-base max-w-none prose-headings:font-display prose-headings:tracking-tight prose-headings:text-primary-deep prose-headings:mt-6 prose-headings:mb-2 prose-h2:text-lg prose-h3:text-base prose-p:text-foreground/85 prose-li:text-foreground/85 prose-strong:text-foreground">
                <ReactMarkdown
                  components={{
                    table: ({ node, ...props }) => <MarkdownTable {...props} />,
                    thead: ({ node, ...props }) => <MarkdownTableHead {...props} />,
                    tbody: ({ node, ...props }) => <MarkdownTableBody {...props} />,
                    tr: ({ node, ...props }) => <MarkdownTableRow {...props} />,
                    th: ({ node, ...props }) => <MarkdownTableCell isHeader {...props} />,
                    td: ({ node, ...props }) => <MarkdownTableCell {...props} />,
                    p: ({ children, node }) => {
                      const textContent =
                        node?.children?.map((c: any) => c.value || c.raw || "").join("") || "";
                      if (
                        textContent.includes("|") &&
                        (textContent.match(/\|/g) || []).length > 4
                      ) {
                        const lines = textContent.split("\n");
                        const rows = lines.filter((r) => r.trim().includes("|"));
                        if (rows.length >= 2) {
                          let sepIdx = rows.findIndex((r) => {
                            const cells = r.split("|").slice(1, -1);
                            return cells.every((c) => /^:?-+:?$/.test(c.trim()) || c.trim() === "");
                          });
                          if (sepIdx < 0) sepIdx = 0;
                          try {
                            const headerRow = rows[Math.max(0, sepIdx)];
                            const headerCells = headerRow
                              .split("|")
                              .slice(1, -1)
                              .map((c) => c.trim())
                              .filter(Boolean);
                            const bodyRows = (
                              sepIdx >= 0 ? rows.slice(sepIdx + 1) : rows.slice(1)
                            )
                              .map((r) => r.split("|").slice(1, -1).map((c) => c.trim()))
                              .filter((r) => r.some((c) => c));
                            if (headerCells.length > 0 && bodyRows.length > 0) {
                              return (
                                <MarkdownTable>
                                  <MarkdownTableHead>
                                    <MarkdownTableRow>
                                      {headerCells.map((cell, idx) => (
                                        <MarkdownTableCell key={idx} isHeader>
                                          {cell}
                                        </MarkdownTableCell>
                                      ))}
                                    </MarkdownTableRow>
                                  </MarkdownTableHead>
                                  <MarkdownTableBody>
                                    {bodyRows.map((row, ri) => (
                                      <MarkdownTableRow key={ri}>
                                        {headerCells.map((_, ci) => (
                                          <MarkdownTableCell key={ci}>
                                            {row[ci] || ""}
                                          </MarkdownTableCell>
                                        ))}
                                      </MarkdownTableRow>
                                    ))}
                                  </MarkdownTableBody>
                                </MarkdownTable>
                              );
                            }
                          } catch {
                            // fall through to normal <p>
                          }
                        }
                      }
                      return <p>{children}</p>;
                    },
                  }}
                >
                  {cleanedContent}
                </ReactMarkdown>
              </article>

              {/* Problem mode — multiple choice */}
              {mode === "problem" && currentStep === steps.length - 1 && (
                <div className="mt-6 space-y-4">
                  <p className="font-semibold">{t("workspace.selectCorrectAnswer")}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {parseMultipleChoice(steps[currentStep]?.content || "").map((option) => (
                      <Button
                        key={option.letter}
                        onClick={() => handleAnswerSelect(option.letter)}
                        variant={
                          selectedAnswer === option.letter
                            ? option.correct
                              ? "default"
                              : "destructive"
                            : "outline"
                        }
                        className="justify-start text-left"
                        disabled={selectedAnswer !== null}
                      >
                        {option.letter}) {option.text}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Tutor mode — practice questions button */}
              {mode === "tutor" &&
                currentStep === steps.length - 1 &&
                practiceQuestions.length > 0 && (
                  <div className="mt-6 pt-6 border-t border-border">
                    <Button
                      onClick={() => setShowingPracticeQuestions(true)}
                      variant="outline"
                      className="w-full"
                    >
                      {t("workspace.practiceQuestions")} ({practiceQuestions.length})
                    </Button>
                  </div>
                )}
            </>
          ) : (
            /* Practice questions panel */
            <>
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">{t("workspace.practiceQuestionsTitle")}</h3>
                {practiceQuestions.map((question, qIndex) => (
                  <div key={qIndex} className="border border-border rounded-lg p-4 space-y-3">
                    <p className="font-medium">
                      {qIndex + 1}. {question.question}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {question.options.map((option) => {
                        const letter = option.match(/^([A-D])\)/)?.[1] ?? "";
                        const isSelected = practiceAnswers[qIndex] === letter;
                        const correctLetter = question.correct_answer.match(/^[A-D]/)?.[0];
                        const isCorrect = letter === correctLetter;

                        return (
                          <Button
                            key={letter}
                            onClick={() => handlePracticeAnswerSelect(qIndex, letter)}
                            variant={
                              isSelected ? (isCorrect ? "default" : "destructive") : "outline"
                            }
                            className="justify-start text-left"
                            disabled={practiceAnswers[qIndex] !== undefined}
                          >
                            {option}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 pt-6 border-t border-border">
                <Button
                  onClick={() => setShowingPracticeQuestions(false)}
                  variant="outline"
                  className="w-full"
                >
                  {t("workspace.backToLesson")}
                </Button>
              </div>
            </>
          )}
        </>
      )}

      {/* Step navigation */}
      {!loading && steps.length > 1 && !showingPracticeQuestions && (
        <div className="flex justify-center gap-3 mt-6">
          <Button
            onClick={onPrevious}
            disabled={currentStep === 0}
            variant="outline"
            className="bg-background hover:bg-muted"
          >
            <ChevronLeft size={16} className="mr-2" /> Previous
          </Button>
          <Button
            onClick={onNext}
            disabled={currentStep === steps.length - 1}
            className="bg-primary hover:opacity-90 btn-glow"
          >
            {t("workspace.nextStep")} <ChevronRight size={16} className="ml-2" />
          </Button>
        </div>
      )}
    </div>
  );
}