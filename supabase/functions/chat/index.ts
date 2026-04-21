// Edge function: streaming chat via Lovable AI Gateway
// Used for Problem solving + Research generation in Organyze
// deno-lint-ignore-file no-explicit-any

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPTS: Record<string, string> = {
  problem: `You are Organyze — a structured thinking assistant.
For any problem the user gives you, respond in clean Markdown using EXACTLY these sections (use ## headings):

## Problem Understanding
A short, clear restatement of the problem.

## Breakdown
Bullet list of the key sub-problems or components.

## Reasoning Steps
Numbered list of the logical steps to reach a solution.

## Final Solution
The clear, actionable solution.

## Action Steps
A numbered list of concrete next actions.

Be concise, structured, and easy to scan. Never skip a section.`,
  research: `You are Organyze — a structured research assistant.
Given the user's source material (text or pasted document), produce clean Markdown with EXACTLY these sections (use ## headings):

## Key Points
Bullet list of the most important findings.

## Organized Sections
Group the content into 3–5 thematic sections with ### subheadings and short paragraphs.

## Summary
A tight executive summary (3–5 sentences).

## Suggested Formats
Briefly suggest how this could be turned into notes, a report, or a presentation outline.

Be precise, neutral, and well-organized.`,
};

const DEPTH_HINT: Record<string, string> = {
  simple: "Keep responses short and beginner-friendly.",
  balanced: "Provide balanced depth — clear but not exhaustive.",
  deep: "Go deep: include nuance, edge cases, and thorough reasoning.",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { mode, input, depth } = await req.json();

    if (!input || typeof input !== "string" || input.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Input is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (input.length > 20000) {
      return new Response(JSON.stringify({ error: "Input too long (max 20000 chars)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sys = SYSTEM_PROMPTS[mode] ?? SYSTEM_PROMPTS.problem;
    const depthHint = DEPTH_HINT[depth] ?? DEPTH_HINT.balanced;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: `${sys}\n\n${depthHint}` },
          { role: "user", content: input },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Settings → Workspace → Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("Gateway error", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e: any) {
    console.error("chat error", e);
    return new Response(JSON.stringify({ error: e?.message ?? "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
