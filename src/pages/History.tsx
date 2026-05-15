import { useMemo, useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useHistory } from "@/store/history";
import { useAuth } from "@/store/auth";
import type { HistoryEntry } from "@/store/history";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Trash2, Clock, MessageSquare, Search, Image as ImageIcon, FileText, Mic, Code, ChevronRight, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { generatePDF, processContentForDisplay } from "@/lib/pdfGenerator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { hapticLight } from "@/lib/haptic";

// Styled components matching sidebar aesthetic
const StyledSelectTrigger = ({ className, children, ...props }: React.ComponentProps<typeof SelectTrigger>) => (
  <SelectTrigger
    className={`
      group flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5 
      text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white 
      transition-all duration-200 border border-white/10 bg-slate-900/50
      backdrop-blur-sm shadow-sm
      ${className || ""}
    `}
    {...props}
  >
    {children}
  </SelectTrigger>
);

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

interface PracticeQuestion {
  question: string;
  options?: string[];
  correct_answer?: string;
  explanation?: string;
}

const History = () => {
  const history = useHistory();
  const auth = useAuth();
  const navigate = useNavigate();
  const { entryId } = useParams<{ entryId?: string }>();
  const { t } = useTranslation();
  const [filter, setFilter] = useState<"all" | "tutor" | "research">("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!auth.user) return;
    void history.loadFromSupabase().catch((error) => {
      console.warn('[History] remote history sync failed', error);
    });
  }, [auth.user?.id, history]);

  const sortedHistory = useMemo(
    () => [...history.items].sort((a, b) => b.timestamp - a.timestamp),
    [history.items],
  );

  const filteredHistory = useMemo(
    () =>
      sortedHistory.filter((entry) => {
        const matchesFilter = filter === "all" || entry.mode === filter;
        const matchesSearch = searchQuery === "" ||
          entry.input.toLowerCase().includes(searchQuery.toLowerCase()) ||
          entry.output.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesFilter && matchesSearch;
      }),
    [sortedHistory, filter, searchQuery],
  );

  const entryFromRoute = useMemo(
    () => (entryId ? history.items.find((item) => item.id === entryId) || null : null),
    [entryId, history.items],
  );

  const truncateText = (text: string, maxLength: number = 120): string => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength).trim() + "...";
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return date.toLocaleDateString(undefined, { weekday: "long" });
    } else {
      return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    }
  };

  const downloadEntryAsPdf = async (entry: HistoryEntry) => {
    const steps = [{ title: "Response", content: processContentForDisplay(entry.output) }];
    
    if (entry.codeSnippets && entry.codeSnippets.length > 0) {
      entry.codeSnippets.forEach(snippet => {
        try {
          const parsed = JSON.parse(snippet.content) as { practice_questions?: PracticeQuestion[] };
          if (parsed.practice_questions && Array.isArray(parsed.practice_questions)) {
            const questionsText = parsed.practice_questions.map((q: PracticeQuestion, index: number) => 
              `Question ${index + 1}: ${q.question}\n\n${q.options ? q.options.map((opt: string, optIndex: number) => 
                `${String.fromCharCode(65 + optIndex)}. ${opt}`).join('\n') + '\n\n' : ''}Correct Answer: ${q.correct_answer}\n\n${q.explanation ? `Explanation: ${q.explanation}\n\n` : ''}`
            ).join('\n---\n\n');
            steps.push({ title: "Practice Questions", content: questionsText });
          }
        } catch (e) {
          // Ignore parsing errors
        }
      });
    }

    const success = await generatePDF(entry.input || "History Export", steps, entry.mode);

    if (!success) {
      toast.error("Could not generate PDF. Please try again.");
    }
  };

  const getModeColor = (mode: string) => {
    const colors: Record<string, { bg: string; text: string; icon: string }> = {
      tutor: { bg: 'bg-blue-500/10', text: 'text-blue-400', icon: 'bg-blue-500' },
      research: { bg: 'bg-purple-500/10', text: 'text-purple-400', icon: 'bg-purple-500' },
      problem: { bg: 'bg-green-500/10', text: 'text-green-400', icon: 'bg-green-500' },
      simplify: { bg: 'bg-orange-500/10', text: 'text-orange-400', icon: 'bg-orange-500' },
      hints: { bg: 'bg-pink-500/10', text: 'text-pink-400', icon: 'bg-pink-500' },
      rewrites: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', icon: 'bg-cyan-500' },
    };
    return colors[mode] || colors.tutor;
  };

  if (entryFromRoute) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 py-6 sm:py-10 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <Button
              variant="ghost"
              onClick={() => {
                hapticLight();
                navigate("/history");
              }}
              className="rounded-2xl text-slate-300 hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft size={16} className="mr-2" /> Back to History
            </Button>
            <Button
              onClick={() => downloadEntryAsPdf(entryFromRoute)}
              className="rounded-2xl bg-primary hover:bg-primary/80 text-white shadow-md"
            >
              <FileText size={16} className="mr-2" /> Download PDF
            </Button>
          </div>

          <div className="rounded-2xl p-6 sm:p-8 bg-gradient-to-br from-slate-900/50 to-slate-800/30 backdrop-blur-sm border border-white/10 shadow-xl space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className={`px-3 py-1 text-xs font-semibold uppercase rounded-full ${getModeColor(entryFromRoute.mode).bg} ${getModeColor(entryFromRoute.mode).text} border border-current/20`}>
                    {entryFromRoute.mode}
                  </span>
                  <span className="text-xs text-slate-400 flex items-center gap-1 bg-slate-800/50 px-2 py-1 rounded-full">
                    <Clock size={12} />
                    {new Intl.DateTimeFormat(undefined, {
                      dateStyle: "long",
                      timeStyle: "short",
                    }).format(new Date(entryFromRoute.timestamp))}
                  </span>
                  {entryFromRoute.imageData && (
                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full flex items-center gap-1">
                      <ImageIcon size={12} /> Image
                    </span>
                  )}
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                  {truncateText(entryFromRoute.input, 100)}
                </h1>
              </div>
            </div>

            {entryFromRoute.codeSnippets && entryFromRoute.codeSnippets.length > 0 && entryFromRoute.codeSnippets.some(snippet => {
              try {
                const parsed = JSON.parse(snippet.content) as { practice_questions?: PracticeQuestion[] };
                return !parsed.practice_questions;
              } catch {
                return true;
              }
            }) && (
              <div className="mt-6 space-y-3">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Code size={18} className="text-primary" />
                  Attached Code
                </h2>
                {entryFromRoute.codeSnippets.filter(snippet => {
                  try {
                    const parsed = JSON.parse(snippet.content) as { practice_questions?: PracticeQuestion[] };
                    return !parsed.practice_questions;
                  } catch {
                    return true;
                  }
                }).map((snippet, index) => (
                  <div key={snippet.id} className="rounded-xl border border-white/10 bg-slate-800/50 p-4">
                    <div className="mb-3">
                      <span className="text-xs font-semibold text-primary/70 uppercase tracking-wider">
                        Code Snippet {index + 1}{snippet.language ? ` (${snippet.language})` : ''}
                      </span>
                    </div>
                    <div className="max-h-48 overflow-y-auto rounded-lg bg-slate-900/50 p-3 text-xs font-mono whitespace-pre-wrap border border-white/5 text-slate-300">
                      {snippet.content}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-white/10 my-4" />

            <div className="prose prose-sm sm:prose-base max-w-none 
              prose-headings:text-white prose-headings:font-semibold
              prose-p:text-slate-300 prose-li:text-slate-300
              prose-strong:text-white prose-code:text-slate-300
              prose-code:bg-slate-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md">
              <div className="whitespace-pre-wrap text-slate-300 leading-relaxed">
                {processContentForDisplay(entryFromRoute.output)}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        <header className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search your history..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 rounded-2xl border-white/10 bg-slate-900/50 backdrop-blur-sm text-slate-200 placeholder:text-slate-500 focus:border-primary/50"
              />
            </div>
            <Select value={filter} onValueChange={(v) => setFilter(v as "all" | "tutor" | "research")}>
              <StyledSelectTrigger className="w-full sm:w-[180px]">
                <SelectValue />
              </StyledSelectTrigger>
              <SelectContent className="bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl">
                <StyledSelectItem value="all">All</StyledSelectItem>
                <StyledSelectItem value="tutor">Ask</StyledSelectItem>
                <StyledSelectItem value="research">Research</StyledSelectItem>
              </SelectContent>
            </Select>
            {history.items.length > 0 && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  hapticLight();
                  history.clearHistory();
                }}
                className="rounded-2xl border-white/10 bg-slate-900/50 text-slate-300 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30"
              >
                <Trash2 size={14} className="mr-2" /> Clear All
              </Button>
            )}
          </div>
        </header>

        {filteredHistory.length === 0 ? (
          <div className="rounded-2xl p-12 text-center bg-gradient-to-br from-slate-900/50 to-slate-800/30 backdrop-blur-sm border border-white/10 shadow-xl">
            <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-4 ring-1 ring-primary/20">
              <Clock size={32} className="text-slate-400" />
            </div>
            <p className="text-white font-semibold text-lg">
              {sortedHistory.length === 0 ? "No activities yet" : "No matching results"}
            </p>
            <p className="text-sm text-slate-400 mt-2">
              {sortedHistory.length === 0
                ? "Start asking questions to build your history!"
                : "Try adjusting your search or filters"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredHistory.map((entry) => {
              const modeColor = getModeColor(entry.mode);
              return (
                <button
                  key={entry.id}
                  onClick={() => {
                    hapticLight();
                    navigate(`/history/${entry.id}`);
                  }}
                  className="w-full group rounded-2xl p-4 sm:p-5 text-left transition-all duration-200 
                    bg-gradient-to-br from-slate-900/50 to-slate-800/30 backdrop-blur-sm 
                    border border-white/10 hover:border-primary/50 hover:shadow-lg"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded-full ${modeColor.bg} ${modeColor.text} ring-1 ring-current/20`}>
                          {entry.mode}
                        </span>
                        {entry.imageData && (
                          <ImageIcon size={13} className="text-slate-400" />
                        )}
                        {entry.documentData && (
                          <FileText size={13} className="text-slate-400" />
                        )}
                        {entry.voiceTranscript && (
                          <Mic size={13} className="text-slate-400" />
                        )}
                        {(entry.codeSnippets && entry.codeSnippets.length > 0) && (
                          <Code size={13} className="text-slate-400" />
                        )}
                        <span className="text-xs text-slate-400 ml-auto">
                          {formatDate(entry.timestamp)}
                        </span>
                      </div>
                      <h3 className="font-semibold text-white truncate text-sm sm:text-base">
                        {truncateText(entry.input, 100)}
                      </h3>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ChevronRight size={18} className="text-slate-400 group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-slate-400 line-clamp-2">
                    {truncateText(entry.output.replace(/[#*`]/g, ""), 150)}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default History;