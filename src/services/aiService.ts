import { useSettings } from "@/store/settings";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

export type AiMode = "problem" | "research";

export interface StreamOptions {
  mode: AiMode;
  input: string;
  onDelta: (chunk: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
  signal?: AbortSignal;
}

/**
 * Stream an AI response. Uses Lovable Cloud edge function by default.
 * If user has provided a custom OpenAI-compatible API key in Settings,
 * we call that endpoint directly from the client (their choice).
 */
export async function streamAi(opts: StreamOptions) {
  const { mode, input, onDelta, onDone, onError, signal } = opts;
  const { depth, customApiKey, customApiBase } = useSettings.getState();

  try {
    let resp: Response;

    if (customApiKey) {
      const base = customApiBase || "https://api.openai.com/v1";
      resp = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customApiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          stream: true,
          messages: [
            { role: "system", content: systemForMode(mode, depth) },
            { role: "user", content: input },
          ],
        }),
      });
    } else {
      resp = await fetch(FN_URL, {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ mode, input, depth }),
      });
    }

    if (!resp.ok) {
      let msg = `Request failed (${resp.status})`;
      try {
        const j = await resp.json();
        if (j?.error) msg = j.error;
      } catch {
        /* noop */
      }
      onError(msg);
      return;
    }
    if (!resp.body) {
      onError("No response stream");
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let done = false;

    while (!done) {
      const { done: d, value } = await reader.read();
      if (d) break;
      buf += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buf.indexOf("\n")) !== -1) {
        let line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line || line.startsWith(":")) continue;
        if (!line.startsWith("data: ")) continue;
        const json = line.slice(6).trim();
        if (json === "[DONE]") {
          done = true;
          break;
        }
        try {
          const parsed = JSON.parse(json);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) onDelta(delta);
        } catch {
          buf = line + "\n" + buf;
          break;
        }
      }
    }
    onDone();
  } catch (e: any) {
    if (e?.name === "AbortError") return;
    onError(e?.message ?? "Network error");
  }
}

function systemForMode(mode: AiMode, depth: string): string {
  const depthHint =
    depth === "simple"
      ? "Keep it short."
      : depth === "deep"
        ? "Go deep with nuance."
        : "Be balanced.";
  if (mode === "problem") {
    return `You are Organyze. Respond in Markdown with sections: ## Problem Understanding, ## Breakdown, ## Reasoning Steps, ## Final Solution, ## Action Steps. ${depthHint}`;
  }
  return `You are Organyze research assistant. Respond in Markdown with: ## Key Points, ## Organized Sections (### subheadings), ## Summary, ## Suggested Formats. ${depthHint}`;
}
