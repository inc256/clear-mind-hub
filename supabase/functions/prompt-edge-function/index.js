import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

// Model routing: mini for complex modes, nano for lightweight modes
const MODELS = {
  standard: "gpt-5.4-mini",  // problem, tutor, research
  fast: "gpt-5.4-nano",      // simplify, hints, rewrites
};

// Per-mode max_tokens caps — prevents runaway token usage
const MAX_TOKENS = {
  problem:   800,
  tutor:    1800,
  research: 2400,
  simplify:  600,
  hints:     400,
  rewrites:  700,
};

// Per-mode temperature — lower = more focused/factual, higher = more creative
const TEMPERATURE = {
  problem:  0.3,
  tutor:    0.7,
  research: 0.3,
  simplify: 0.5,
  hints:    0.5,
  rewrites: 0.7,
};

const VALID_MODES     = new Set(["problem", "tutor", "research", "simplify", "hints", "rewrites"]);
const VALID_DEPTHS    = new Set(["beginner", "intermediate", "advanced"]);
const VALID_MINDSETS  = new Set(["general", "medical", "engineering", "lecturer", "scientific", "creative"]);
const VALID_CITATIONS = new Set(["APA", "MLA", "IEEE", "AMA"]);

const INPUT_MAX_CHARS = 4000;
const UPSTREAM_TIMEOUT_MS = 25000;

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Fragments
// ─────────────────────────────────────────────────────────────────────────────

const DEPTH_GUIDES = {
  beginner:     `DEPTH: Beginner — write for a curious 12-year-old. Short sentences, plain words, define terms immediately, 5–7 sentence core, one real-world analogy. No equations or jargon.`,
  intermediate: `DEPTH: Intermediate — assume basic familiarity. Use domain vocab with brief first-use clarification, 1–2 worked examples, 10–15 sentences. Simple formulas welcome.`,
  advanced:     `DEPTH: Advanced — expert audience. Precise terminology, rigorous multi-layered reasoning, equations/derivations/edge-cases where relevant. Be thorough; do not truncate.`,
};

const MINDSET_GUIDES = {
  general:     "Audience: general public. Plain accessible language, universal everyday examples.",
  medical:     "Audience: clinical. Use standard medical terminology, reference anatomy/physiology/pharmacology, frame in patient-outcome terms.",
  engineering: "Audience: engineers. Focus on systems, efficiency, tolerances, trade-offs. Include equations, units, standards (ISO/IEEE/ANSI) where relevant.",
  lecturer:    "Audience: students. Sequence simple→complex, use Socratic questions and scaffolded examples, anticipate and address misconceptions.",
  scientific:  "Audience: scientists. Ground claims in evidence, explain causal mechanisms, distinguish correlation from causation, note areas of evolving consensus.",
  creative:    "Audience: general, creative tone. Vivid metaphors, storytelling, sensory language. Prioritise engagement over exhaustive detail.",
};

const CITATION_FORMATS = {
  APA: {
    fullName:   "American Psychological Association Style",
    layout:     { font: "Times New Roman 12pt", spacing: "double-spaced", margins: "1 inch all sides" },
    inText:     { format: "(Author, Year)", example: "(Smith, 2023)" },
    refTitle:   "References",
    refExample: "Smith, J. (2023). Title of work. Publisher.",
  },
  MLA: {
    fullName:   "Modern Language Association Style",
    layout:     { font: "Times New Roman 12pt", spacing: "double-spaced", margins: "1 inch all sides" },
    inText:     { format: "(Author Page)", example: "(Smith 123)" },
    refTitle:   "Works Cited",
    refExample: 'Smith, John. "Title of Work." Publisher, Year.',
  },
  IEEE: {
    fullName:   "Institute of Electrical and Electronics Engineers Style",
    layout:     { font: "Times New Roman 10pt", spacing: "single-spaced", margins: "1 inch all sides" },
    inText:     { format: "[Number]", example: "[1]" },
    refTitle:   "References",
    refExample: '[1] J. Smith, "Title," Journal, vol. 1, no. 1, pp. 1–10, 2023.',
  },
  AMA: {
    fullName:   "American Medical Association Style",
    layout:     { font: "Times New Roman 12pt", spacing: "double-spaced", margins: "1 inch all sides" },
    inText:     { format: "superscript number", example: "Smith¹" },
    refTitle:   "References",
    refExample: "1. Smith J. Title. Journal Name. 2023;1(1):1–10.",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Fragment Helpers
// ─────────────────────────────────────────────────────────────────────────────

function depthLine(depth) {
  return depth && DEPTH_GUIDES[depth] ? `\n${DEPTH_GUIDES[depth]}` : "";
}

function mindsetLine(mindset) {
  return mindset && MINDSET_GUIDES[mindset] ? `\nLens: ${MINDSET_GUIDES[mindset]}` : "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Builders
// ─────────────────────────────────────────────────────────────────────────────

function buildProblemPrompt() {
  return `You are Xplainfy, a precise problem-solving assistant. Be concise — every word must earn its place.

Respond in exactly this structure:

## Solution
State the answer in sentence 1. Follow with 2–4 sentences of key reasoning. Use Markdown code blocks or numbered steps only if needed.

## Why This Works
1–2 sentences on the underlying principle that makes the solution correct.

## Check Your Answer
Exactly 4 multiple-choice options, one per line:
A) …
B) …
C) …
D) …
Append [CORRECT] to the correct option only. Wrong options must reflect real misconceptions. No explanations after the options.`;
}

function buildTutorPrompt(mindset, depth) {
  return `You are Xplainfy, an expert adaptive tutor. Teach with clarity and precision.${depthLine(depth)}${mindsetLine(mindset)}

Structure your response exactly as follows:

## Introduction
1–2 sentence hook (real-world relevance) + what the learner will understand by the end.

## Core Concepts
2–4 fundamental concepts, each in its own short paragraph. **Bold** the concept name on first use.

## Detailed Explanation
Layered explanation (simple → complex). Integrate examples and analogies naturally. Address at least one common misconception.

## Key Takeaways
4–6 bullet points — each a complete, standalone insight.

## Practice Questions
Return exactly 3 questions as valid JSON in a fenced code block:
\`\`\`json
{
  "practice_questions": [
    {
      "question": "…?",
      "options": ["A) …", "B) …", "C) …", "D) …"],
      "correct_answer": "A",
      "explanation": "1–2 sentence rationale."
    }
  ]
}
\`\`\`
Each question tests a distinct concept. Wrong options must reflect real misconceptions. \`correct_answer\` is the letter only.`;
}

function buildResearchPrompt(mindset, depth) {
  return `You are Xplainfy, a structured research assistant. Produce organised, actionable insight — not bullet dumps.${depthLine(depth)}${mindsetLine(mindset)}

Required structure:

## Executive Summary
2–3 sentences: the single most important insight a skim-reader should leave with.

## Key Points
4–6 specific, standalone bullet points.

## Deep Dive
3–5 ### sub-sections. Each: explain the concept/mechanism/finding precisely, include relevant data or case studies, note nuances.

## Competing Views & Limitations
1–3 counterarguments or known limitations, presented objectively.

## Summary
3–5 sentences connecting the sub-topics and adding nuance to the executive summary.

## Suggested Next Steps
3–5 specific, actionable recommendations tailored to this exact topic.`;
}

function buildCitationResearchPrompt(style, mindset, depth) {
  const f = CITATION_FORMATS[style];
  return `You are Xplainfy, an academic writing specialist. Write a complete research paper in ${f.fullName} (${style}).${depthLine(depth)}${mindsetLine(mindset)}

GOAL: Deep, substantive research on the topic. Citation style governs format, not content depth.

${style} FORMATTING:
- Layout: ${f.layout.font}, ${f.layout.spacing}, ${f.layout.margins}
- In-text: ${f.inText.format} e.g. ${f.inText.example} — cite inline wherever claims are made
- ${f.refTitle}: at least 5 realistic entries; format: ${f.refExample}

CONTENT RULES:
- Minimum 2–3 solid paragraphs per section. No filler.
- Include mechanisms, data points, named theories, real-world applications, and current research directions.
- Address limitations, exceptions, and competing views.
- Write as a knowledgeable expert, not a summariser.

PAPER SECTIONS (in order):
1. Introduction
2. Literature Review
3. Discussion
4. Conclusion
${f.refTitle}

After the paper, add:
## ${style} Quick-Reference
5–8 bullet formatting rules + 2–3 "common mistake → correct form" examples specific to ${style}.`;
}

function buildSimplifyPrompt() {
  return `You are Xplainfy, a problem simplification assistant. Break complex problems into clear, manageable components.

## Simplified Problem
Restate the problem clearly, preserving all essential information.

## Key Components
The main elements or steps needed.

## Approach
A straightforward strategy for tackling the simplified problem.`;
}

function buildHintsPrompt() {
  return `You are Xplainfy, a hints assistant. Guide thinking without revealing the full solution.

## Hint 1
Points to the first key concept or step.

## Hint 2
Builds on Hint 1.

## Hint 3
Connects the concepts to help the solver progress.`;
}

function buildRewritesPrompt() {
  return `You are Xplainfy, a rewriting assistant. Improve clarity, conciseness, and engagement while preserving meaning.

## Rewritten Content
The improved version.

## Improvements Made
Brief explanation of what changed and why it's better.`;
}

function buildSystemPrompt(mode, mindset, depth, citationStyle) {
  switch (mode) {
    case "problem":  return buildProblemPrompt();
    case "tutor":    return buildTutorPrompt(mindset, depth);
    case "research":
      if (citationStyle && CITATION_FORMATS[citationStyle]) {
        return buildCitationResearchPrompt(citationStyle, mindset, depth);
      }
      return buildResearchPrompt(mindset, depth);
    case "simplify": return buildSimplifyPrompt();
    case "hints":    return buildHintsPrompt();
    case "rewrites": return buildRewritesPrompt();
    default:         return "";
  }
}

function getModel(mode) {
  return ["problem", "tutor", "research"].includes(mode) ? MODELS.standard : MODELS.fast;
}

// ─────────────────────────────────────────────────────────────────────────────
// Request Handler
// ─────────────────────────────────────────────────────────────────────────────

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (req.method !== "POST") {
    return errResp("Method not allowed", 405);
  }

  // ── Parse body ─────────────────────────────────────────────────────────
  let body;
  try {
    body = await req.json();
  } catch {
    return errResp("Invalid JSON body", 400);
  }

  const { input, mode, mindset, depth, citationStyle } = body;

  // ── Validate required fields ───────────────────────────────────────────
  if (!input?.trim()) return errResp("Missing required field: input", 400);
  if (!mode)          return errResp("Missing required field: mode", 400);

  if (!VALID_MODES.has(mode)) {
    return errResp(`Invalid mode. Must be one of: ${[...VALID_MODES].join(", ")}`, 400);
  }

  if (input.length > INPUT_MAX_CHARS) {
    return errResp(`Input too long. Maximum ${INPUT_MAX_CHARS} characters allowed.`, 400);
  }

  // ── Validate optional fields (fail fast on typos) ──────────────────────
  if (depth && !VALID_DEPTHS.has(depth)) {
    return errResp(`Invalid depth. Must be one of: ${[...VALID_DEPTHS].join(", ")}`, 400);
  }
  if (mindset && !VALID_MINDSETS.has(mindset)) {
    return errResp(`Invalid mindset. Must be one of: ${[...VALID_MINDSETS].join(", ")}`, 400);
  }

  const normalizedCitation = citationStyle?.toUpperCase();
  if (citationStyle && !VALID_CITATIONS.has(normalizedCitation)) {
    return errResp(`Invalid citationStyle. Must be one of: ${[...VALID_CITATIONS].join(", ")}`, 400);
  }

  // ── Build system prompt ────────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt(mode, mindset, depth, normalizedCitation);

  // ── Resolve API key ────────────────────────────────────────────────────
  const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_KEY) return errResp("Server misconfiguration: missing OPENAI_API_KEY", 500);

  // ── Call OpenAI with timeout ───────────────────────────────────────────
  let aiResp;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model:      getModel(mode),
        stream:     true,
        max_tokens: MAX_TOKENS[mode] ?? 1000,
        temperature: TEMPERATURE[mode] ?? 0.7,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: input.trim() },
        ],
      }),
    });
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === "AbortError") {
      return errResp("Request timed out — AI provider did not respond in time", 504);
    }
    console.error("[chat] upstream fetch failed:", e);
    return errResp("Failed to reach AI provider", 502);
  }

  clearTimeout(timeout);

  // ── Handle upstream errors ─────────────────────────────────────────────
  if (!aiResp.ok) {
    const detail = await aiResp.text().catch(() => "");
    console.error(`[chat] upstream ${aiResp.status}:`, detail);

    if (aiResp.status === 429) {
      return errResp("Rate limit reached — please retry in a moment", 429);
    }
    if (aiResp.status === 401) {
      return errResp("Invalid OpenAI API key", 401);
    }
    if (aiResp.status === 503) {
      return errResp("AI provider temporarily unavailable — please retry", 503);
    }
    return errResp(`AI provider error (${aiResp.status})`, 502);
  }

  // ── Stream response back to client ─────────────────────────────────────
  return new Response(aiResp.body, {
    status: 200,
    headers: {
      ...CORS,
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
      "X-Xplainfy-Mode":  mode,
      "X-Xplainfy-Model": getModel(mode),
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function errResp(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}