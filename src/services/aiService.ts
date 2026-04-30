import { useSettings } from "@/store/settings";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

export type AiMode = "problem" | "tutor" | "research";
export type MindsetType = "general" | "medical" | "engineering" | "lecturer" | "scientific" | "creative";

export interface StreamOptions {
  mode: AiMode;
  input: string;
  mindset?: MindsetType;
  depth?: string;
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
  const { mode, input, mindset, depth, onDelta, onDone, onError, signal } = opts;
  const { customApiKey, customApiBase } = useSettings.getState();

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
            { role: "system", content: systemForMode(mode, mindset, depth) },
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
        body: JSON.stringify({ mode, input, mindset, depth }),
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

function systemForMode(mode: AiMode, mindset?: MindsetType, depth?: string): string {
  const mindsetGuide = getMindsetGuide(mindset);

  if (mode === "problem") {
    return `You are Tyn Tutor. IMPORTANT: Be BRIEF and FOCUSED. Respond with: ## Solution (concise explanation and direct answer), ## Check Your Answer (provide exactly 4 multiple choice options on separate lines: A) option text, B) option text, C) option text, D) option text. Mark the correct answer with [CORRECT] at the end of that line only). Keep explanation SHORT - max 2-3 sentences.`;
  }
  if (mode === "tutor") {
    const depthGuide = getDepthGuide(depth);
    return `You are Tyn Tutor, an expert educator. ${depthGuide} Respond in Markdown with sections: ## Introduction, ## Core Concepts (explain fundamental ideas), ## Detailed Explanation (comprehensive breakdown with examples), ## Key Takeaways, ## Practice Questions (Provide 3 practice questions in JSON format at the end: {"practice_questions": [{"question": "...", "options": ["A) ...", "B) ...", "C) ...", "D) ..."], "correct_answer": "A"}]}). ${mindsetGuide} Use terminology and examples relevant to the chosen mindset.`;
  }
  const depthGuide = getDepthGuide(depth);
  return `You are Tyn Tutor research assistant. ${depthGuide} Respond in Markdown with: ## Key Points, ## Organized Sections (### subheadings), ## Summary, ## Suggested Formats. ${mindsetGuide}`;
}

function getMindsetGuide(mindset?: MindsetType): string {
  const guides: Record<MindsetType, string> = {
    general: "Use clear, everyday language suitable for a general audience.",
    medical: "Use medical terminology, reference anatomy/physiology, and provide clinical context when relevant.",
    engineering: "Use technical terminology, focus on systems, efficiency, and design principles. Include equations and technical specifications where applicable.",
    lecturer: "Use pedagogical language, break down concepts progressively, and use teaching metaphors and analogies.",
    scientific: "Use scientific terminology, cite principles and laws, and explain mechanisms from first principles.",
    creative: "Use imaginative language, examples, and metaphors to make concepts engaging and memorable.",
  };
  return mindset ? `Mindset: ${guides[mindset]}` : "";
}

function getDepthGuide(depth?: string): string {
  const guides: Record<string, string> = {
    beginner: "Provide basic, introductory explanations. Avoid complex jargon. Focus on simplicity and fundamental concepts.",
    intermediate: "Provide balanced explanations with moderate detail. Include some technical terms but explain them. Cover core ideas with examples.",
    advanced: "Provide in-depth, comprehensive explanations. Use advanced terminology. Include detailed analysis, derivations, and complex examples.",
  };
  return depth ? `Explanation depth: ${guides[depth] || guides.intermediate}` : "";
}
