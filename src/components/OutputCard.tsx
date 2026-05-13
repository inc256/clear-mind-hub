import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import {
  Copy, RefreshCw, ChevronRight, ChevronLeft,
  Plus, Volume2, VolumeX, Download, Loader2,
  CheckCircle2, XCircle, Trophy, RotateCcw, BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { generatePDF } from "@/lib/pdfGenerator";
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
  <tr className="hover:bg-muted/50 transition-colors border-b border-border/30 last:border-b-0">{children}</tr>
);
const MarkdownTableCell = ({ children, isHeader }: { children?: React.ReactNode; isHeader?: boolean }) => {
  const base = "px-4 py-3 text-left align-top";
  return isHeader
    ? <th className={`${base} font-semibold text-foreground/90 bg-primary/5`}>{children}</th>
    : <td className={`${base} text-foreground/75`}>{children}</td>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Table content cleaner
// ─────────────────────────────────────────────────────────────────────────────

const cleanTableContent = (text: string): string => {
  let result = text;
  if (result.includes(" | | ")) {
    const rows = result.split(" | | ");
    if (rows.length >= 2) {
      result = rows.map(r => r.trim()).filter(r => r && r.includes("|")).join("\n");
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
// Section marker parser
// ─────────────────────────────────────────────────────────────────────────────

interface ParsedSection {
  name: string;
  content: string;
  isComplete: boolean;
}

function parseSections(rawText: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  const completeRe = /<!-- SECTION_START:([^>]+?) -->[\r\n]*([\s\S]*?)<!-- SECTION_END:\1 -->/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = completeRe.exec(rawText)) !== null) {
    sections.push({ name: match[1].trim(), content: match[2].trim(), isComplete: true });
    lastIndex = completeRe.lastIndex;
  }
  const remaining = rawText.slice(lastIndex);
  const openMatch = /<!-- SECTION_START:([^>]+?) -->[\r\n]*([\s\S]*)$/.exec(remaining);
  if (openMatch) {
    const partialContent = openMatch[2].replace(/<!-- SECTION_END:[^>]*-->.*$/, "").trim();
    sections.push({ name: openMatch[1].trim(), content: partialContent, isComplete: false });
  }
  return sections;
}

function parseBatchedSections(rawText: string): Array<{ batchIndex: number; sections: ParsedSection[] }> {
  const batchMarkerRe = /<!-- BATCH_(\d+)_OF_\d+ -->/g;
  const splitPoints: number[] = [0];
  let m: RegExpExecArray | null;
  while ((m = batchMarkerRe.exec(rawText)) !== null) splitPoints.push(m.index);
  return splitPoints.map((start, i) => {
    const end = splitPoints[i + 1] ?? rawText.length;
    const chunk = rawText.slice(start, end).replace(/<!-- BATCH_\d+_OF_\d+ -->/g, "").trim();
    return { batchIndex: i, sections: parseSections(chunk) };
  });
}

function stripMarkers(text: string): string {
  return text
    .replace(/<!-- SECTION_START:[^>]+ -->/g, "")
    .replace(/<!-- SECTION_END:[^>]+ -->/g, "")
    .replace(/<!-- BATCH_\d+_OF_\d+ -->/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Research section canonical order
// ─────────────────────────────────────────────────────────────────────────────

const RESEARCH_SECTION_ORDER = [
  "Title Page", "Abstract", "Introduction", "Literature Review",
  "Methodology", "Results", "Discussion", "Conclusion", "References", "Appendices",
];

function sortResearchSections(sections: ParsedSection[]): ParsedSection[] {
  const ordered: ParsedSection[] = [];
  const remaining = [...sections];
  for (const canonical of RESEARCH_SECTION_ORDER) {
    const idx = remaining.findIndex(s => s.name.toLowerCase().trim() === canonical.toLowerCase());
    if (idx !== -1) ordered.push(remaining.splice(idx, 1)[0]);
  }
  return [...ordered, ...remaining];
}

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
  batchTotal?: number;
  batchCurrent?: number;
  batchLabel?: string;
  isBatched?: boolean;
  depth?: string;
}

interface PracticeQuestion {
  question: string;
  options: string[];
  correct_answer: string;
  explanation?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG Countdown Ring
// ─────────────────────────────────────────────────────────────────────────────

const TIMER_TOTAL    = 20;
const RING_RADIUS    = 20;
const CIRCUMFERENCE  = 2 * Math.PI * RING_RADIUS;

function CountdownRing({ timeLeft, total = TIMER_TOTAL }: { timeLeft: number; total?: number }) {
  const fraction  = timeLeft / total;
  const offset    = CIRCUMFERENCE * (1 - fraction);
  const isUrgent  = timeLeft <= 5;
  const isWarning = timeLeft <= 10 && !isUrgent;
  const color     = isUrgent ? "#ef4444" : isWarning ? "#f59e0b" : "#22c55e";

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: 56, height: 56 }}>
      <svg width="56" height="56" viewBox="0 0 56 56" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="28" cy="28" r={RING_RADIUS} fill="none" stroke="currentColor"
          strokeWidth="4" className="text-muted/30" />
        <circle cx="28" cy="28" r={RING_RADIUS} fill="none"
          stroke={color} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.95s linear, stroke 0.3s ease" }}
        />
      </svg>
      <span className="absolute text-sm font-bold tabular-nums"
        style={{ color, transition: "color 0.3s ease", animation: isUrgent ? "urgentPulse 0.5s ease-in-out infinite alternate" : "none" }}>
        {timeLeft}
      </span>
      <style>{`@keyframes urgentPulse { from{transform:scale(1)} to{transform:scale(1.25)} }`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Option Button
// ─────────────────────────────────────────────────────────────────────────────

interface OptionButtonProps {
  letter: string;
  text: string;
  isSelected: boolean;
  isCorrect: boolean;
  hasAnswered: boolean;
  index: number;
  onClick: () => void;
}

function OptionButton({ letter, text, isSelected, isCorrect, hasAnswered, index, onClick }: OptionButtonProps) {
  const showCorrect = hasAnswered && isCorrect;
  const showWrong   = hasAnswered && isSelected && !isCorrect;
  const showDimmed  = hasAnswered && !isSelected && !isCorrect;

  let cls = "bg-muted/20 hover:bg-muted/50 border-border/50 hover:border-primary/40";
  if (showCorrect) cls = "bg-green-500/15 border-green-500/60";
  if (showWrong)   cls = "bg-red-500/15 border-red-500/60";
  if (showDimmed)  cls = "bg-muted/10 border-border/20 opacity-40";

  return (
    <button onClick={onClick} disabled={hasAnswered}
      className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 text-left
        transition-all duration-200 cursor-pointer disabled:cursor-default ${cls}`}
      style={{ animation: `optionSlideIn 0.28s ease-out both`, animationDelay: `${index * 55}ms` }}
    >
      <span className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-all duration-200
        ${showCorrect ? "bg-green-500 text-white" : showWrong ? "bg-red-500 text-white" : "bg-primary/10 text-primary"}`}>
        {letter}
      </span>
      <span className="flex-1 text-sm leading-snug">{text}</span>
      {showCorrect && <CheckCircle2 size={16} className="text-green-500 flex-shrink-0" style={{ animation: "pop 0.25s ease-out" }} />}
      {showWrong   && <XCircle     size={16} className="text-red-500 flex-shrink-0"   style={{ animation: "pop 0.25s ease-out" }} />}
      <style>{`
        @keyframes optionSlideIn { from{opacity:0;transform:translateX(-10px)} to{opacity:1;transform:translateX(0)} }
        @keyframes pop { 0%{transform:scale(0)} 70%{transform:scale(1.25)} 100%{transform:scale(1)} }
      `}</style>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Practice Quiz (self-contained, ref-based timer that actually counts)
// ─────────────────────────────────────────────────────────────────────────────

function PracticeQuiz({ questions, onExit }: { questions: PracticeQuestion[]; onExit: () => void }) {
  const QUESTION_TIME = 20;

  const [qIndex,      setQIndex]      = useState(0);
  const [answers,     setAnswers]     = useState<Record<number, string>>({});
  const [timeLeft,    setTimeLeft]    = useState(QUESTION_TIME);
  const [showResults, setShowResults] = useState(false);
  const [entryKey,    setEntryKey]    = useState(0);

  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const qIndexRef   = useRef(qIndex);
  const answersRef  = useRef(answers);

  qIndexRef.current  = qIndex;
  answersRef.current = answers;

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const commitAnswer = useCallback((letter: string) => {
    const qi = qIndexRef.current;
    if (answersRef.current[qi] !== undefined) return;
    stopTimer();

    const correctLetter = questions[qi].correct_answer.match(/^[A-D]/)?.[0] ?? "";
    const timedOut      = letter === "";

    setAnswers(prev => {
      const next = { ...prev, [qi]: letter };
      answersRef.current = next;
      return next;
    });

    if (timedOut) { toast.error("⏰ Time's up!"); hapticLight(); }
    else if (letter === correctLetter) { toast.success("✅ Correct!"); hapticSuccess(); }
    else {
      const co = questions[qi].options.find(o => o.startsWith(correctLetter));
      toast.error(`❌ Not quite — ${co ?? questions[qi].correct_answer}`);
      hapticLight();
    }

    const delay = timedOut ? 2000 : 1500;
    setTimeout(() => {
      if (qi < questions.length - 1) {
        setQIndex(qi + 1);
        setTimeLeft(QUESTION_TIME);
        setEntryKey(k => k + 1);
      } else {
        setShowResults(true);
      }
    }, delay);
  }, [questions, stopTimer]);

  useEffect(() => {
    if (showResults) return;
    if (answersRef.current[qIndex] !== undefined) return;

    stopTimer();
    setTimeLeft(QUESTION_TIME);

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          commitAnswer("");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return stopTimer;
  }, [qIndex, showResults, stopTimer, commitAnswer]);

  useEffect(() => () => stopTimer(), [stopTimer]);

  if (showResults) {
    const correct = questions.reduce((acc, q, i) => {
      const cl = q.correct_answer.match(/^[A-D]/)?.[0] ?? "";
      return acc + (answers[i] === cl ? 1 : 0);
    }, 0);
    const pct = Math.round((correct / questions.length) * 100);
    const C   = 2 * Math.PI * 36;

    return (
      <div className="space-y-5" style={{ animation: "fadeSlideUp 0.4s ease-out" }}>
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-3">
            <Trophy size={28} className="text-primary" />
          </div>
          <h3 className="text-xl font-bold">Quiz Complete!</h3>
          <p className="text-sm text-muted-foreground mt-1">Here's how you did</p>
        </div>

        <div className="flex justify-center">
          <div className="relative" style={{ width: 100, height: 100 }}>
            <svg width="100" height="100" viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="50" cy="50" r="36" fill="none" stroke="currentColor" strokeWidth="7" className="text-muted/20" />
              <circle cx="50" cy="50" r="36" fill="none"
                stroke={pct === 100 ? "#22c55e" : pct >= 70 ? "#3b82f6" : "#f59e0b"}
                strokeWidth="7" strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - pct / 100)}
                style={{ transition: "stroke-dashoffset 0.8s ease-out 0.2s" }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl font-bold tabular-nums">{pct}%</span>
            </div>
          </div>
        </div>

        <p className="text-center text-sm font-medium">
          {correct} / {questions.length} correct &nbsp;·&nbsp;
          <span className="text-muted-foreground">
            {pct === 100 ? "Perfect! 🌟" : pct >= 70 ? "Great job! 💪" : "Keep practising! 📚"}
          </span>
        </p>

        <div className="space-y-2">
          {questions.map((q, i) => {
            const cl   = q.correct_answer.match(/^[A-D]/)?.[0] ?? "";
            const ans  = answers[i] ?? "";
            const isOk = ans === cl;
            return (
              <div key={i}
                className={`flex items-start gap-3 p-3 rounded-xl border text-sm
                  ${isOk ? "bg-green-500/5 border-green-500/20" : "bg-red-500/5 border-red-500/20"}`}
                style={{ animation: `optionSlideIn 0.3s ease-out ${i * 50}ms both` }}>
                {isOk
                  ? <CheckCircle2 size={15} className="text-green-500 mt-0.5 flex-shrink-0" />
                  : <XCircle     size={15} className="text-red-500 mt-0.5 flex-shrink-0" />}
                <div className="min-w-0">
                  <p className="font-medium leading-snug line-clamp-2">{q.question}</p>
                  {!isOk && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Correct: {q.options.find(o => o.startsWith(cl)) ?? q.correct_answer}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1 gap-2" onClick={() => {
            setAnswers({}); answersRef.current = {};
            setQIndex(0); setTimeLeft(QUESTION_TIME);
            setShowResults(false); setEntryKey(k => k + 1);
          }}>
            <RotateCcw size={14} /> Retry
          </Button>
          <Button className="flex-1 gap-2" onClick={onExit}>
            <BookOpen size={14} /> Back to Content
          </Button>
        </div>

        <style>{`
          @keyframes fadeSlideUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
          @keyframes optionSlideIn { from{opacity:0;transform:translateX(-8px)} to{opacity:1;transform:translateX(0)} }
        `}</style>
      </div>
    );
  }

  const question     = questions[qIndex];
  const correctLetter = question.correct_answer.match(/^[A-D]/)?.[0] ?? "";
  const userAnswer   = answers[qIndex];
  const hasAnswered  = userAnswer !== undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <CountdownRing timeLeft={hasAnswered ? timeLeft : timeLeft} />
        <div className="flex flex-col items-end gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            Question {qIndex + 1} / {questions.length}
          </span>
          <div className="flex gap-1">
            {questions.map((_, i) => {
              const a  = answers[i];
              const cl = questions[i].correct_answer.match(/^[A-D]/)?.[0] ?? "";
              return (
                <div key={i} className={`rounded-full transition-all duration-300
                  ${i === qIndex ? "w-3 h-2 bg-primary" : "w-2 h-2"}
                  ${i < qIndex ? (a === cl ? "bg-green-500" : "bg-red-400") : i > qIndex ? "bg-muted/40" : ""}`}
                />
              );
            })}
          </div>
        </div>
      </div>

      <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
        <div className="h-full rounded-full"
          style={{
            width: `${(timeLeft / QUESTION_TIME) * 100}%`,
            background: timeLeft <= 5 ? "#ef4444" : timeLeft <= 10 ? "#f59e0b" : "hsl(var(--primary))",
            transition: "width 0.95s linear, background 0.3s ease",
          }}
        />
      </div>

      <div key={`q-${entryKey}`}
        className="p-4 rounded-2xl bg-muted/20 border border-border/40"
        style={{ animation: "questionEnter 0.35s cubic-bezier(0.16,1,0.3,1)" }}>
        <p className="font-semibold text-base leading-snug">{question.question}</p>
      </div>

      <div key={`opts-${entryKey}`} className="space-y-2.5">
        {question.options.map((opt, i) => {
          const letter = opt.match(/^([A-D])\)/)?.[1] ?? String.fromCharCode(65 + i);
          const text   = opt.replace(/^[A-D]\)\s*/, "");
          return (
            <OptionButton key={letter} letter={letter} text={text}
              isSelected={userAnswer === letter}
              isCorrect={letter === correctLetter}
              hasAnswered={hasAnswered}
              index={i}
              onClick={() => commitAnswer(letter)}
            />
          );
        })}
      </div>

      {hasAnswered && question.explanation && (
        <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/20 text-sm"
          style={{ animation: "fadeSlideUp 0.3s ease-out" }}>
          <p className="font-semibold text-primary text-xs uppercase tracking-wider mb-1">Explanation</p>
          <p className="text-foreground/80 leading-relaxed">{question.explanation}</p>
        </div>
      )}

      <style>{`
        @keyframes questionEnter { from{opacity:0;transform:translateY(10px) scale(0.98)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes fadeSlideUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes optionSlideIn { from{opacity:0;transform:translateX(-10px)} to{opacity:1;transform:translateX(0)} }
        @keyframes pop { 0%{transform:scale(0)} 70%{transform:scale(1.25)} 100%{transform:scale(1)} }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading skeleton with animated dots and stage name
// ─────────────────────────────────────────────────────────────────────────────

function LoadingSkeleton({ stepName }: { stepName?: string }) {
  const [dotCount, setDotCount] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setDotCount(d => (d % 3) + 1), 500);
    return () => clearInterval(id);
  }, []);
  
  const displayName = stepName || "Processing";
  
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-primary/80">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-sm font-medium">
          {displayName}{".".repeat(dotCount)}
        </span>
      </div>
      <div className="space-y-3">
        {[85, 92, 78, 88, 70].map((w, i) => (
          <div key={i} className="h-3 rounded-full bg-muted animate-pulse"
            style={{ width: `${w}%`, animationDelay: `${i * 100}ms` }} />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Smart Progress Bar
// ─────────────────────────────────────────────────────────────────────────────

function SmartProgressBar({
  loading, isBatched, batchTotal, batchCurrent, batchLabel, mode, depth, currentStepName,
}: {
  loading: boolean; isBatched: boolean; batchTotal: number; batchCurrent: number;
  batchLabel: string; mode: string; depth?: string; currentStepName?: string;
}) {
  const [fakeProgress, setFakeProgress] = useState(0);
  const [dotCount,     setDotCount]     = useState(1);
  const fakeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!loading) { setDotCount(1); return; }
    const id = setInterval(() => setDotCount(d => (d % 3) + 1), 500);
    return () => clearInterval(id);
  }, [loading]);

  useEffect(() => {
    if (!loading || isBatched) { setFakeProgress(0); if (fakeRef.current) clearTimeout(fakeRef.current); return; }
    const tick = () => {
      setFakeProgress(prev => {
        if (prev >= 95) return prev;
        const rem = 95 - prev;
        return Math.min(95, prev + (rem > 50 ? 3.5 : rem > 20 ? 1.8 : rem > 5 ? 0.6 : 0.15));
      });
      fakeRef.current = setTimeout(tick, 120);
    };
    fakeRef.current = setTimeout(tick, 80);
    return () => { if (fakeRef.current) clearTimeout(fakeRef.current); };
  }, [loading, isBatched]);

  useEffect(() => { if (!loading && !isBatched) setFakeProgress(100); }, [loading, isBatched]);

  if (!loading && (!isBatched || batchCurrent >= batchTotal)) return null;

  const batchPercent = batchTotal > 0 ? Math.round(((batchCurrent + 0.5) / batchTotal) * 100) : 0;
  const dots = ".".repeat(dotCount);
  
  // Enhanced label mapping for tutor mode with specific stage names
  const getTutorStageLabel = (stepName?: string): string => {
    if (stepName) return `${stepName} being processed`;
    return "Building your tutorial";
  };
  
  const modeLabel: Record<string, string> = {
    tutor: getTutorStageLabel(currentStepName),
    problem: "Solving the problem", 
    simplify: "Simplifying",
    hints: "Generating hints", 
    rewrites: "Rewriting",
    research: (depth === "beginner" || depth === "intermediate")
      ? (currentStepName ? `${currentStepName} being processed` : "Researching your topic") : "",
  };
  const label = modeLabel[mode] || "Processing";

  if (isBatched) {
    return (
      <div className="mb-5 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {Array.from({ length: batchTotal }).map((_, i) => {
            const done = i < batchCurrent, active = i === batchCurrent;
            return (
              <div key={i} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-500
                ${done ? "bg-primary/20 text-primary border border-primary/30"
                  : active ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30 scale-105"
                  : "bg-muted/40 text-muted-foreground border border-border/40"}`}>
                {done ? <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  : active ? <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                  : <span className="w-1.5 h-1.5 rounded-full bg-current opacity-30" />}
                Part {i + 1}
              </div>
            );
          })}
        </div>
        {batchLabel && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 size={11} className="animate-spin shrink-0" />
            <span className="truncate">{batchLabel.replace(/^Batch \d+ — /, "")} being processed{dots}</span>
          </p>
        )}
        <div className="relative h-1.5 bg-muted/50 rounded-full overflow-hidden">
          <div className="absolute left-0 top-0 h-full bg-primary rounded-full transition-all duration-700 ease-out"
            style={{ width: `${batchPercent}%` }} />
        </div>
        <p className="text-[11px] text-muted-foreground/70">Part {Math.min(batchCurrent + 1, batchTotal)} of {batchTotal} — {batchPercent}% complete</p>
      </div>
    );
  }

  return (
    <div className="mb-5 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 size={11} className="animate-spin shrink-0" />{label}{dots}
        </p>
        <span className="text-[11px] text-muted-foreground/60 tabular-nums">
          {fakeProgress < 100 ? `${Math.round(fakeProgress)}%` : "Done"}
        </span>
      </div>
      <div className="relative h-1.5 bg-muted/50 rounded-full overflow-hidden">
        <div className="absolute left-0 top-0 h-full bg-primary rounded-full"
          style={{ width: `${fakeProgress}%`, transition: fakeProgress === 100 ? "width 0.3s ease-out" : "width 0.12s linear" }} />
        {loading && (
          <div className="absolute top-0 h-full w-20 rounded-full"
            style={{ left: `calc(${fakeProgress}% - 2.5rem)`,
              background: "linear-gradient(90deg,transparent,hsl(var(--primary)/0.5),transparent)",
              animation: "shimmer 1.2s ease-in-out infinite" }} />
        )}
      </div>
      <style>{`@keyframes shimmer{0%{transform:translateX(-100%);opacity:0}40%{opacity:1}100%{transform:translateX(200%);opacity:0}}`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section navigation with proper ordering by citation
// ─────────────────────────────────────────────────────────────────────────────

function SectionNav({ sections, currentIndex, onGoTo, isStreaming }: {
  sections: ParsedSection[]; currentIndex: number;
  onGoTo: (i: number) => void; isStreaming?: boolean;
}) {
  if (sections.length <= 1) return null;
  
  // Sections are already ordered by canonical order from sortResearchSections
  return (
    <div className="flex flex-col gap-2 mt-6 pt-4 border-t border-border">
      <div className="flex items-center gap-1.5 flex-wrap">
        {sections.map((s, i) => {
          const isActive = i === currentIndex, isPast = i < currentIndex;
          return (
            <button key={i} onClick={() => onGoTo(i)} disabled={isActive}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium
                transition-all duration-300 truncate max-w-[140px]
                ${isActive ? "bg-primary text-primary-foreground scale-105 shadow-sm shadow-primary/30 cursor-default"
                  : isPast ? "bg-primary/15 text-primary hover:bg-primary/25 cursor-pointer"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted/60 cursor-pointer"}`}
              title={s.name}>
              {isPast && <svg className="w-2.5 h-2.5 shrink-0" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              {isActive && isStreaming && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse shrink-0" />}
              <span className="truncate">{s.name}</span>
            </button>
          );
        })}
      </div>
      <div className="flex gap-3">
        <Button onClick={() => { hapticLight(); onGoTo(Math.max(0, currentIndex - 1)); }}
          disabled={currentIndex === 0} variant="outline" className="flex-1 bg-background hover:bg-muted" size="sm">
          <ChevronLeft size={15} className="mr-1.5" /> Previous
        </Button>
        <Button onClick={() => { hapticLight(); onGoTo(Math.min(sections.length - 1, currentIndex + 1)); }}
          disabled={currentIndex >= sections.length - 1} className="flex-1 bg-primary hover:opacity-90 btn-glow" size="sm">
          Next <ChevronRight size={15} className="ml-1.5" />
        </Button>
      </div>
      <p className="text-[11px] text-center text-muted-foreground/60">
        Section {currentIndex + 1} of {sections.length}{!sections[currentIndex]?.isComplete && " — streaming…"}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Practice question extractor
// ─────────────────────────────────────────────────────────────────────────────

function extractPracticeQuestions(text: string): PracticeQuestion[] {
  try {
    const objMatch = text.match(/\{"practice_questions"\s*:\s*\[[\s\S]*?\]\s*\}/);
    if (objMatch) { const p = JSON.parse(objMatch[0]); return normaliseQuestions(p.practice_questions ?? []); }
    const arrayMatch = text.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
    if (arrayMatch) { const p = JSON.parse(arrayMatch[1]); if (Array.isArray(p)) return normaliseQuestions(p); }
    const bareArray = text.match(/\[\s*\{[\s\S]*?\}\s*\]/);
    if (bareArray) { const p = JSON.parse(bareArray[0]); if (Array.isArray(p)) return normaliseQuestions(p); }
  } catch { /* silently fail */ }
  return [];
}

function normaliseQuestions(raw: any[]): PracticeQuestion[] {
  return raw.filter(q => q && typeof q.question === "string" && Array.isArray(q.options)).map(q => {
    const letters = ["A","B","C","D"];
    const options: string[] = q.options.map((opt: string, i: number) => {
      const prefix = `${letters[i] ?? String.fromCharCode(65+i)}) `;
      return opt.startsWith(prefix) || /^[A-D]\)\s/.test(opt) ? opt : `${prefix}${opt}`;
    });
    let correct_answer: string = q.correct_answer ?? q.answer ?? "";
    if (!/^[A-D]\)\s/.test(correct_answer)) {
      const match = options.find(o => o.toLowerCase().includes(correct_answer.toLowerCase()));
      if (match) correct_answer = match;
    }
    return { question: q.question, options, correct_answer, explanation: q.explanation || "" };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Check if content has formulas or equations
// ─────────────────────────────────────────────────────────────────────────────

const hasFormulasOrEquations = (content: string): boolean => {
  const formulaPatterns = [
    /\\frac\{/, /\\sqrt/, /\\sum/, /\\int/, /\\prod/,
    /\\[a-zA-Z]+\(/, /\^\{/, /_\{/, /\$[^$]+\$/,
    /[a-z]\([a-z]\)/, /[=<>]/, /\+/, /-/, /\*/, /\//,
  ];
  return formulaPatterns.some(pattern => pattern.test(content)) && 
         !/This topic doesn'?t have any formulas or equations\./i.test(content);
};

// ─────────────────────────────────────────────────────────────────────────────
// Remove empty formulas section marker for PDF (content cleaner)
// ─────────────────────────────────────────────────────────────────────────────

const removeEmptyFormulasSectionForDisplay = (content: string): string => {
  return content.replace(/(^|\n)#+\s*Formulas\s*&\s*Equations\s*\n([\s\S]*?)(?=(\n#+\s|$))/g, (match, prefix, sectionBody) => {
    const body = sectionBody.trim();
    const hasFormula = hasFormulasOrEquations(body);
    return hasFormula ? match : prefix;
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Markdown components
// ─────────────────────────────────────────────────────────────────────────────

const markdownComponents = {
  table: MarkdownTable, thead: MarkdownTableHead, tbody: MarkdownTableBody, tr: MarkdownTableRow,
  td: ({ children, ...props }: any) => <MarkdownTableCell {...props}>{children}</MarkdownTableCell>,
  th: ({ children, ...props }: any) => <MarkdownTableCell isHeader {...props}>{children}</MarkdownTableCell>,
  code: ({ node, inline, className, children, ...props }: any) => {
    const match = /language-(\w+)/.exec(className || "");
    const language = match ? match[1] : "";
    const codeString = String(children).replace(/\n$/, "");
    if (inline) return <code className={`${className} bg-muted/60 px-1.5 py-0.5 rounded-md`} {...props}>{children}</code>;
    return (
      <div className="relative group my-4">
        <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border border-border rounded-t-lg">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{language || "code"}</span>
          <button className="h-6 px-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs bg-transparent border-none text-muted-foreground hover:text-foreground"
            onClick={async () => { try { await navigator.clipboard.writeText(codeString); toast.success("Code copied!"); } catch { toast.error("Failed to copy code"); } }}>
            <Copy className="w-3 h-3 mr-1 inline" /> Copy
          </button>
        </div>
        <SyntaxHighlighter style={oneDark} language={language} PreTag="div" className="!mt-0 !rounded-t-none" {...props}>
          {codeString}
        </SyntaxHighlighter>
      </div>
    );
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// OutputCard
// ─────────────────────────────────────────────────────────────────────────────

export function OutputCard({
  content, steps, currentStep, onNext, onPrevious, loading,
  onRegenerate, onNewQuery, mode,
  practiceQuestions: providedPracticeQuestions,
  batchTotal = 0, batchCurrent = 0, batchLabel = "", isBatched = false, depth,
}: OutputCardProps) {
  const { t } = useTranslation();

  const [selectedAnswer, setSelectedAnswer]   = useState<string | null>(null);
  const [speaking,       setSpeaking]         = useState(false);
  const [showingPractice,setShowingPractice]  = useState(false);
  const [isRenderingTable,setIsRenderingTable]= useState(false);
  const [isDownloading,  setIsDownloading]    = useState(false);
  const [hasShownHaptic, setHasShownHaptic]   = useState(false);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const hasResetToFirstRef = useRef(false);

  const isResearch = mode === "research";
  const isTutor    = mode === "tutor";

  // ── Section parsing ──────────────────────────────────────────────────────
  const researchSections = useMemo<ParsedSection[]>(() => {
    if (!isResearch) return [];
    let raw: ParsedSection[];
    if (isBatched) {
      const bd = parseBatchedSections(content ?? "");
      raw = (bd[currentStep] ?? bd[bd.length - 1])?.sections ?? [];
    } else {
      raw = parseSections(steps[currentStep]?.content ?? content ?? "");
    }
    const allComplete = raw.length > 0 && raw.every(s => s.isComplete);
    return allComplete ? sortResearchSections(raw) : raw;
  }, [content, steps, currentStep, isBatched, isResearch]);

  useEffect(() => { setCurrentSectionIndex(0); hasResetToFirstRef.current = false; }, [currentStep]);

  useEffect(() => {
    if (!loading && isResearch && researchSections.length > 0 && !hasResetToFirstRef.current) {
      setCurrentSectionIndex(0); hasResetToFirstRef.current = true;
    }
  }, [loading, isResearch, researchSections.length]);

  useEffect(() => {
    if (loading && isResearch && researchSections.length > 0) {
      const li = researchSections.findIndex(s => !s.isComplete);
      if (li !== -1 && li !== currentSectionIndex) setCurrentSectionIndex(li);
    }
  }, [researchSections.length, loading, isResearch]);

  // ── Practice questions ───────────────────────────────────────────────────
  const practiceQuestions = providedPracticeQuestions || (isTutor ? extractPracticeQuestions(content) : []);

  // ── Cleaned content with empty formulas section removal ─────────────────
  const cleanedContent = useMemo(() => {
    if (!content && steps.length === 0) return "";
    try {
      if (isResearch) {
        if (isBatched) {
          const sec = researchSections[currentSectionIndex];
          if (!sec) return stripMarkers(content ?? "").replace(/\[CORRECT\]/g, "").replace(/\{"practice_questions"[\s\S]*?(?=\n\n|$)/, "").replace(/```(?:json)?\s*\[[\s\S]*?\]\s*```/g, "");
          return cleanTableContent(sec.content).replace(/\[CORRECT\]/g, "");
        }
        const sec = researchSections[currentSectionIndex];
        if (!sec) return cleanTableContent(stripMarkers(steps[currentStep]?.content ?? content ?? "")).replace(/\[CORRECT\]/g, "");
        return cleanTableContent(sec.content).replace(/\[CORRECT\]/g, "");
      }
      const stepContent = steps[currentStep]?.content?.trim() || steps[currentStep]?.content || content;
      const baseContent = isTutor && currentStep === steps.length - 1 && steps.length > 0
        ? steps.map(s => `## ${s.title}\n${s.content}`).join("\n\n") : stepContent || "";
      
      // Remove empty Formulas & Equations section if no formulas present
      let processed = cleanTableContent(baseContent);
      processed = removeEmptyFormulasSectionForDisplay(processed);
      
      return processed
        .replace(/\[CORRECT\]/g, "").replace(/\{"practice_questions"[\s\S]*?(?=\n\n|$)/, "")
        .replace(/```(?:json)?\s*\[[\s\S]*?\]\s*```/g, "").replace(/<!--\s*BATCH_\d+_OF_\d+\s*-->/g, "");
    } catch { return content; }
  }, [content, steps, currentStep, mode, isBatched, isResearch, researchSections, currentSectionIndex]);

  const currentStreamingSectionName = useMemo(() => {
    if (!isResearch || !loading) return undefined;
    return researchSections.find(s => !s.isComplete)?.name;
  }, [researchSections, isResearch, loading]);

  // Enhanced skeleton label for tutor mode with proper stage names
  const skeletonLabel = useMemo(() => {
    if (!loading) return undefined;
    if (isResearch && currentStreamingSectionName) return currentStreamingSectionName;
    if (isBatched && batchLabel) return batchLabel.replace(/^Batch \d+ — /, "");
    if (isTutor) {
      const stepTitle = steps[currentStep]?.title;
      // Map step titles to more descriptive loading labels
      if (stepTitle?.toLowerCase().includes("introduction")) return "Introduction being processed";
      if (stepTitle?.toLowerCase().includes("core concept")) return "Core Concepts being processed";
      if (stepTitle?.toLowerCase().includes("detailed")) return "Detailed Explanation being processed";
      if (stepTitle?.toLowerCase().includes("formula")) return "Formulas & Equations being processed";
      if (stepTitle?.toLowerCase().includes("takeaway")) return "Key Takeaways being processed";
      if (stepTitle?.toLowerCase().includes("practice")) return "Practice Questions being prepared";
      return stepTitle ? `${stepTitle} being processed` : "Building your tutorial";
    }
    const m: Record<string, string> = { problem: "Formula & Calculations", simplify: "Simplification", hints: "Hints", rewrites: "Rewrite" };
    return m[mode as string];
  }, [loading, isResearch, currentStreamingSectionName, isBatched, batchLabel, isTutor, steps, currentStep, mode]);

  // ── Render effects ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!loading && cleanedContent?.trim()) {
      setIsRenderingTable(true);
      const id = setTimeout(() => setIsRenderingTable(false), 50);
      if (!hasShownHaptic) { hapticSuccess(); setHasShownHaptic(true); }
      return () => clearTimeout(id);
    } else if (loading) { setIsRenderingTable(false); setHasShownHaptic(false); }
  }, [cleanedContent, loading, hasShownHaptic]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const parseMultipleChoice = (c: string) => {
    const opts: { letter: string; text: string; correct: boolean }[] = [];
    c.split("\n").forEach(line => {
      const m = line.match(/^([A-D])\)\s*(.+?)(?:\s*\[CORRECT\])?$/i);
      if (m) opts.push({ letter: m[1].toUpperCase(), text: m[2].trim().replace(/\*\*(.+?)\*\*/g,"$1").replace(/\*(.+?)\*/g,"$1"), correct: line.includes("[CORRECT]") });
    });
    return opts;
  };
  
  const handleAnswerSelect = (letter: string) => {
    setSelectedAnswer(letter);
    const opts = parseMultipleChoice(steps[currentStep]?.content || "");
    const sel  = opts.find(o => o.letter === letter);
    if (sel?.correct) { toast.success("Correct! Well done!"); hapticSuccess(); }
    else { const c = opts.find(o => o.correct); toast.error(`Wrong. The correct answer is ${c?.letter}) ${c?.text}`); hapticLight(); }
  };
  
  const handleSpeak = () => {
    if (!("speechSynthesis" in window)) { toast.error("Text-to-speech not supported"); return; }
    if (speaking) { speechSynthesis.cancel(); setSpeaking(false); return; }
    if (!cleanedContent.trim()) return;
    analytics.speakButtonClicked();
    const u = new SpeechSynthesisUtterance(cleanedContent);
    u.rate = 0.9; u.pitch = 1;
    u.onstart = () => setSpeaking(true);
    u.onend   = () => setSpeaking(false);
    u.onerror = () => { setSpeaking(false); toast.error("Speech synthesis failed"); };
    speechSynthesis.speak(u);
  };
  
  const downloadDocument = useCallback(async () => {
    try {
      analytics.downloadButtonClicked(mode as string);
      setIsDownloading(true);
      const titles: Record<string,string> = { tutor: "Tutorial", research: "Research Report", problem: "Problem Solution" };
      const title = steps[0]?.title || titles[mode as string] || "Document";
      const ok = await generatePDF(title, steps, mode as string);
      if (ok) { toast.success("PDF downloaded successfully"); hapticSuccess(); } else toast.error("Failed to generate PDF");
    } catch { toast.error("Failed to download document"); }
    finally { setIsDownloading(false); }
  }, [steps, mode]);

  const handleNewQuery = useCallback(() => {
    hapticLight();
    if (speaking) {
      speechSynthesis.cancel();
      setSpeaking(false);
    }
    if (onNewQuery) onNewQuery();
  }, [onNewQuery, speaking]);

  // ── Early exit ───────────────────────────────────────────────────────────
  if (!loading && steps.length === 0 && !content) return null;

  const isTutorPracticeStep = isTutor && currentStep === steps.length - 1 && practiceQuestions.length > 0;
  const visibleContent      = (isTutorPracticeStep && !showingPractice) ? "" : cleanedContent;
  const showProgress        = loading || (isBatched && batchCurrent < batchTotal);
  const showSectionNav      = isResearch && researchSections.length > 1 && !showingPractice;
  const tutorIsLoading      = isTutor && !!loading;

  const headerLabel = (() => {
    if (loading) return t("workspace.thinking");
    if (isBatched && batchLabel) return batchLabel.replace(/^Batch \d+ — /, "");
    if (isResearch && researchSections[currentSectionIndex]) return researchSections[currentSectionIndex].name;
    return (steps[currentStep]?.title || t("workspace.response")).replace(/[\^$]/g, "");
  })();

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="glass-card rounded-2xl p-4 sm:p-6 lg:p-7 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">{headerLabel}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {onNewQuery && <Button size="sm" variant="ghost" onClick={handleNewQuery}><Plus size={14} className="mr-1.5" />{t("workspace.newQuery")}</Button>}
          {onRegenerate && <Button size="sm" variant="ghost" onClick={() => { hapticLight(); onRegenerate(); }} disabled={loading}><RefreshCw size={14} className="mr-1.5" />{t("workspace.regenerate")}</Button>}
          <Button size="sm" variant="ghost" onClick={() => { hapticLight(); handleSpeak(); }} disabled={!content || showingPractice}>
            {speaking ? <VolumeX size={14} className="mr-1.5" /> : <Volume2 size={14} className="mr-1.5" />}
            {speaking ? t("workspace.stop") : t("workspace.speak")}
          </Button>
          <Button size="sm" variant="ghost" onClick={downloadDocument} disabled={!content || loading || isDownloading}>
            {isDownloading ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Download size={14} className="mr-1.5" />}
            {isDownloading ? t("workspace.downloading") || "Downloading…" : t("workspace.download")}
          </Button>
        </div>
      </div>

      {/* Progress */}
      {showProgress && (
        <SmartProgressBar loading={!!loading} isBatched={isBatched} batchTotal={batchTotal}
          batchCurrent={batchCurrent} batchLabel={batchLabel} mode={mode ?? "research"} depth={depth}
          currentStepName={isTutor ? steps[currentStep]?.title : currentStreamingSectionName} />
      )}

      {/* Body */}
      {tutorIsLoading ? (
        <LoadingSkeleton stepName={skeletonLabel} />

      ) : loading && !cleanedContent ? (
        <LoadingSkeleton stepName={skeletonLabel} />

      ) : loading && cleanedContent && isResearch ? (
        <LoadingSkeleton stepName={skeletonLabel ?? currentStreamingSectionName} />

      ) : isRenderingTable ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={32} className="animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{t("workspace.renderingContent") || "Rendering content…"}</p>
          </div>
        </div>

      ) : showingPractice ? (
        <PracticeQuiz questions={practiceQuestions} onExit={() => setShowingPractice(false)} />

      ) : (
        <>
          {visibleContent && (
            <article className="prose prose-sm sm:prose-base max-w-none prose-headings:font-display prose-headings:tracking-tight prose-headings:text-primary-deep prose-headings:mt-6 prose-headings:mb-2 prose-h2:text-lg prose-h3:text-base prose-p:text-foreground/85 prose-li:text-foreground/85 prose-strong:text-foreground prose-code:text-foreground prose-code:bg-muted/60 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:before:content-none prose-code:after:content-none prose-pre:bg-transparent prose-pre:p-0 prose-pre:border-none prose-pre:shadow-none">
              <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]} components={markdownComponents}>
                {visibleContent}
              </ReactMarkdown>
            </article>
          )}

          {mode === "problem" && visibleContent && parseMultipleChoice(cleanedContent).length > 0 && (
            <div className="mt-6 space-y-3">
              <h3 className="font-semibold text-base">{t("workspace.selectCorrectAnswer")}</h3>
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                {parseMultipleChoice(cleanedContent).map(option => (
                  <Button key={option.letter} onClick={() => handleAnswerSelect(option.letter)}
                    variant={selectedAnswer ? (option.correct ? "default" : selectedAnswer === option.letter ? "destructive" : "outline") : "outline"}
                    className="justify-start text-left h-auto py-2.5 px-4" disabled={selectedAnswer !== null}>
                    <span className="font-semibold mr-2">{option.letter})</span>{option.text}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Tutor practice CTA */}
          {isTutor && isTutorPracticeStep && !showingPractice && practiceQuestions.length > 0 && (
            <div className="mt-8 pt-6 border-t border-border">
              <div className="bg-gradient-to-r from-primary/5 to-primary/10 rounded-xl p-4 mb-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
                  <Trophy size={20} className="text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm mb-0.5">Ready to Test Your Knowledge?</h4>
                  <p className="text-xs text-muted-foreground">{practiceQuestions.length} timed questions · 20 seconds each</p>
                </div>
              </div>
              <Button onClick={() => { hapticLight(); setShowingPractice(true); }} className="w-full gap-2">
                <Trophy size={15} /> Start Practice Quiz ({practiceQuestions.length} questions)
              </Button>
            </div>
          )}

          {showSectionNav && (
            <SectionNav sections={researchSections} currentIndex={currentSectionIndex}
              onGoTo={i => { hapticLight(); setCurrentSectionIndex(i); }}
              isStreaming={loading && !researchSections[currentSectionIndex]?.isComplete} />
          )}
        </>
      )}

      {/* Step nav */}
      {!loading && steps.length > 1 && !showingPractice && !showSectionNav && (
        <div className="flex justify-center gap-3 mt-6 pt-4 border-t border-border">
          <Button onClick={() => { hapticLight(); onPrevious(); }} disabled={currentStep === 0}
            variant="outline" className="flex-1 bg-background hover:bg-muted">
            <ChevronLeft size={16} className="mr-2" /> Previous
          </Button>
          <Button onClick={() => { hapticLight(); onNext(); }} disabled={currentStep === steps.length - 1}
            className="flex-1 bg-primary hover:opacity-90 btn-glow">
            {t("workspace.nextStep")} <ChevronRight size={16} className="ml-2" />
          </Button>
        </div>
      )}

      {/* Batch part nav */}
      {isBatched && steps.length > 1 && !showingPractice && !loading && (
        <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-border/50">
          <p className="text-[11px] text-muted-foreground/60 text-center uppercase tracking-wider">Navigate Parts</p>
          <div className="flex gap-2 flex-wrap justify-center">
            {steps.map((_, i) => (
              <button key={i} onClick={() => { hapticLight(); if (i < currentStep) onPrevious(); else if (i > currentStep) onNext(); }}
                disabled={i === currentStep}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all
                  ${i === currentStep ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:bg-muted/70"}`}>
                Part {i + 1}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}