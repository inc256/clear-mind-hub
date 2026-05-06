import { useMemo, useState } from "react";
import { useHistory } from "@/store/history";
import { useAuth } from "@/store/auth";
import { Button } from "@/components/ui/button";

const History = () => {
  const history = useHistory();
  const auth = useAuth();
  const [filter, setFilter] = useState<"all" | "tutor" | "research">("all");

  const sortedHistory = useMemo(
    () => [...history.items].sort((a, b) => b.timestamp - a.timestamp),
    [history.items],
  );

  const filteredHistory = useMemo(
    () => sortedHistory.filter((entry) => filter === "all" || entry.mode === filter),
    [sortedHistory, filter],
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <header className="space-y-2">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
              Activity History
            </h1>
            <p className="text-muted-foreground text-sm">
              Review your recent AI sessions, prompts, and responses.
            </p>
            {!auth.user && (
              <p className="mt-2 text-sm text-muted-foreground">
                Sign in on the Profile page to save and sync your history across devices.
              </p>
            )}
          </div>
          <Button variant="secondary" onClick={history.clearHistory}>
            Clear history
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {[
          { value: "all", label: "All" },
          { value: "tutor", label: "Tutor" },
          { value: "research", label: "Research" },
        ].map((option) => (
          <Button
            key={option.value}
            variant={filter === option.value ? "default" : "secondary"}
            size="sm"
            onClick={() => setFilter(option.value as "all" | "tutor" | "research")}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {filteredHistory.length === 0 ? (
        <div className="glass-card rounded-2xl p-6 text-center">
          <p className="text-muted-foreground">
            {sortedHistory.length === 0
              ? "No activities yet. Start using the app!"
              : "No entries match this history filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredHistory.map((entry) => (
            <div key={entry.id} className="glass-card rounded-3xl border border-border p-5">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                    {entry.mode}
                  </p>
                  <p className="font-semibold text-foreground mt-1">{entry.input}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(entry.timestamp))}
                </div>
              </div>
              <div className="mt-4 text-sm leading-7 text-muted-foreground whitespace-pre-wrap">
                {entry.output}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default History;