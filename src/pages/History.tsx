import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useHistory } from "@/store/history";
import { useAuth } from "@/store/auth";
import type { HistoryEntry } from "@/store/history";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Trash2, Clock, MessageSquare, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
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
  const [filter, setFilter] = useState<"all" | "tutor" | "research" | "problem">("all");
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

  if (entryFromRoute) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        <Button
          variant="ghost"
          onClick={() => {
            navigate("/history");
          }}
          className="mb-4"
        >
          <ArrowLeft size={16} className="mr-2" /> Back to History
        </Button>

        <div className="glass-card rounded-2xl p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-1 text-xs font-semibold uppercase rounded bg-primary/10 text-primary">
                  {entryFromRoute.mode}
                </span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock size={12} />
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: "long",
                    timeStyle: "short",
                  }).format(new Date(entryFromRoute.timestamp))}
                </span>
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
                {truncateText(entryFromRoute.input, 100)}
              </h1>
            </div>
          </div>

          {/* Display code snippets if any */}
          {entryFromRoute.codeSnippets && entryFromRoute.codeSnippets.length > 0 && (
            <div className="mt-4 space-y-2">
              <h2 className="text-lg font-semibold text-foreground">Attached Code</h2>
              {entryFromRoute.codeSnippets.map((snippet, index) => (
                <div key={snippet.id} className="rounded-lg border border-border bg-muted/30 p-3">
                  <div className="mb-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Code Snippet {index + 1}{snippet.language ? ` (${snippet.language})` : ''}
                    </span>
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded bg-background/50 p-2 text-xs font-mono whitespace-pre-wrap border border-border/30">
                    {snippet.content}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-border my-4" />

          <div className="prose prose-sm sm:prose-base max-w-none">
            <div className="whitespace-pre-wrap text-foreground/90 leading-relaxed">
              {entryFromRoute.output}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <header className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
              Activity History
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Review your past conversations, questions, and AI-generated content.
            </p>
            {!auth.user && (
              <p className="mt-2 text-sm text-muted-foreground flex items-center gap-1">
                <MessageSquare size={14} />
                Sign in to sync your history across devices.
              </p>
            )}
          </div>
          {history.items.length > 0 && (
            <Button variant="secondary" size="sm" onClick={history.clearHistory}>
              <Trash2 size={14} className="mr-2" /> Clear All
            </Button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search history..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Modes</SelectItem>
              <SelectItem value="tutor">Tutor</SelectItem>
              <SelectItem value="research">Research</SelectItem>
              <SelectItem value="problem">Problem Solver</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      {filteredHistory.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Clock size={32} className="text-muted-foreground" />
          </div>
          <p className="text-muted-foreground font-medium">
            {sortedHistory.length === 0 ? "No activities yet" : "No matching results"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {sortedHistory.length === 0
              ? "Start asking questions to build your history!"
              : "Try adjusting your search or filters"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredHistory.map((entry) => (
            <button
              key={entry.id}
              onClick={() => {
                hapticLight();
                navigate(`/history/${entry.id}`);
              }}
              className="w-full glass-card rounded-2xl p-4 text-left transition-all hover:border-primary/50 hover:shadow-md group"
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-primary/10 text-primary">
                      {entry.mode}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(entry.timestamp)}
                    </span>
                  </div>
                  <h3 className="font-semibold text-foreground truncate">
                    {truncateText(entry.input, 100)}
                  </h3>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ArrowLeft size={16} className="rotate-180" />
                </div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                {truncateText(entry.output.replace(/[#*`]/g, ""), 150)}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default History;
