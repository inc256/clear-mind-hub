import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useHistory } from "@/store/history";
import { useAuth } from "@/store/auth";
import type { HistoryEntry } from "@/store/history";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Trash2, Clock, MessageSquare, Search, Image as ImageIcon, FileText, Mic, Code, ChevronRight, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { generatePDF } from "@/lib/pdfGenerator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { hapticLight } from "@/lib/haptic";

const History = () => {
  const history = useHistory();
  const auth = useAuth();
  const navigate = useNavigate();
  const { entryId } = useParams<{ entryId?: string }>();
  const { t } = useTranslation();
  const [filter, setFilter] = useState<"all" | "tutor" | "research">("all");
  const [searchQuery, setSearchQuery] = useState("");

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
    const success = await generatePDF(entry.input || "History Export", [
      { title: "Response", content: entry.output }
    ], entry.mode);

    if (!success) {
      toast.error("Could not generate PDF. Please try again.");
    }
  };

  const getModeColor = (mode: string) => {
    const colors: Record<string, { bg: string; text: string; icon: string }> = {
      tutor: { bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', icon: 'bg-blue-500' },
      research: { bg: 'bg-purple-500/10', text: 'text-purple-600 dark:text-purple-400', icon: 'bg-purple-500' },
      problem: { bg: 'bg-green-500/10', text: 'text-green-600 dark:text-green-400', icon: 'bg-green-500' },
      simplify: { bg: 'bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400', icon: 'bg-orange-500' },
      hints: { bg: 'bg-pink-500/10', text: 'text-pink-600 dark:text-pink-400', icon: 'bg-pink-500' },
      rewrites: { bg: 'bg-cyan-500/10', text: 'text-cyan-600 dark:text-cyan-400', icon: 'bg-cyan-500' },
    };
    return colors[mode] || colors.tutor;
  };

  if (entryFromRoute) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 py-6 sm:py-10 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <Button
              variant="ghost"
              onClick={() => {
                navigate("/history");
              }}
              className="hover:bg-primary/10"
            >
              <ArrowLeft size={16} className="mr-2" /> Back to History
            </Button>
            <Button
              variant="outline"
              onClick={() => downloadEntryAsPdf(entryFromRoute)}
              className="gap-2"
            >
              <FileText size={16} className="mr-2" /> Download PDF
            </Button>
          </div>

          <div className="backdrop-blur-xl bg-card/50 rounded-2xl border border-border/50 shadow-xl overflow-hidden p-6 sm:p-8 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className={`px-3 py-1 text-xs font-semibold uppercase rounded-full ${getModeColor(entryFromRoute.mode).bg} ${getModeColor(entryFromRoute.mode).text}`}>
                    {entryFromRoute.mode}
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1 bg-muted/50 px-2 py-1 rounded-full">
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
                <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                  {truncateText(entryFromRoute.input, 100)}
                </h1>
              </div>
            </div>

            {/* Display code snippets if any */}
            {entryFromRoute.codeSnippets && entryFromRoute.codeSnippets.length > 0 && (
              <div className="mt-6 space-y-3">
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Code size={18} />
                  Attached Code
                </h2>
                {entryFromRoute.codeSnippets.map((snippet, index) => (
                  <div key={snippet.id} className="rounded-lg border border-border/50 bg-gradient-to-br from-muted/50 to-muted/20 p-4 backdrop-blur-sm">
                    <div className="mb-3">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Code Snippet {index + 1}{snippet.language ? ` (${snippet.language})` : ''}
                      </span>
                    </div>
                    <div className="max-h-48 overflow-y-auto rounded bg-background/80 p-3 text-xs font-mono whitespace-pre-wrap border border-border/30 text-foreground/80">
                      {snippet.content}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-border/50 my-4" />

            <div className="prose prose-sm sm:prose-base max-w-none dark:prose-invert">
              <div className="whitespace-pre-wrap text-foreground/90 leading-relaxed font-light">
                {entryFromRoute.output}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        {/* Header */}
        <header className="space-y-4">
          
          
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              {t('history.title')}
            </h1>
            <p className="text-muted-foreground text-sm mt-2 max-w-2xl">
              {t('history.subtitle')}
            </p>
            {!auth.user && (
              <div className="mt-3 p-3 bg-primary/5 border border-primary/20 rounded-lg flex items-center gap-2 text-xs text-muted-foreground">
                <MessageSquare size={14} />
                Sign in to sync your history across devices.
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search your history..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 border-border/50 bg-card/50 backdrop-blur-sm"
              />
            </div>
            <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
              <SelectTrigger className="w-full sm:w-[180px] border-border/50 bg-card/50 backdrop-blur-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="tutor">Tutor</SelectItem>
                <SelectItem value="research">Research</SelectItem>
              </SelectContent>
            </Select>
            {history.items.length > 0 && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={history.clearHistory}
                className="border-border/50"
              >
                <Trash2 size={14} className="mr-2" /> Clear All
              </Button>
            )}
          </div>
        </header>

        {/* Content */}
        {filteredHistory.length === 0 ? (
          <div className="backdrop-blur-xl bg-card/50 rounded-2xl border border-border/50 p-12 text-center shadow-lg">
            <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-4 ring-1 ring-primary/20">
              <Clock size={32} className="text-muted-foreground" />
            </div>
            <p className="text-foreground font-semibold text-lg">
              {sortedHistory.length === 0 ? "No activities yet" : "No matching results"}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
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
                  className="w-full group backdrop-blur-xl bg-card/50 rounded-2xl border border-border/50 p-4 sm:p-5 text-left transition-all duration-200 hover:border-primary/50 hover:bg-card/80 hover:shadow-lg"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded-full ${modeColor.bg} ${modeColor.text} ring-1 ring-current/20`}>
                          {entry.mode}
                        </span>
                        {entry.imageData && (
                          <ImageIcon size={13} className="text-muted-foreground" />
                        )}
                        {entry.documentData && (
                          <FileText size={13} className="text-muted-foreground" />
                        )}
                        {entry.voiceTranscript && (
                          <Mic size={13} className="text-muted-foreground" />
                        )}
                        {(entry.codeSnippets && entry.codeSnippets.length > 0) && (
                          <Code size={13} className="text-muted-foreground" />
                        )}
                        <span className="text-xs text-muted-foreground ml-auto">
                          {formatDate(entry.timestamp)}
                        </span>
                      </div>
                      <h3 className="font-semibold text-foreground truncate text-sm sm:text-base">
                        {truncateText(entry.input, 100)}
                      </h3>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ChevronRight size={18} className="text-muted-foreground group-hover:text-foreground transition-colors" />
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
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
