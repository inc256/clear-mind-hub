import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

const MODELS = {
  standard: "gpt-4.1",
  fast:     "gpt-4.1-mini",
};

// Hard cap at model's max completion tokens
const OPENAI_MAX_COMPLETION_TOKENS = 32768;

const MAX_TOKENS = {
  problem:                    800,
  tutor:                     2400,
  research_beginner:         5000,
  research_intermediate:    10000,
  // Higher and advanced: each batch gets the full 32k budget
  research_higher_batch:    32768,
  research_advanced_batch:  32768,
  simplify:                   600,
  hints:                      400,
  rewrites:                   700,
};

const TEMPERATURE = {
  problem:  0.3,
  tutor:    0.7,
  research: 0.3,
  simplify: 0.5,
  hints:    0.5,
  rewrites: 0.7,
};

const VALID_MODES     = new Set(["problem", "tutor", "research", "simplify", "hints", "rewrites"]);
const VALID_DEPTHS    = new Set(["beginner", "intermediate", "higher", "advanced"]);
const VALID_MINDSETS  = new Set(["general", "medical", "engineering", "lecturer", "scientific", "creative"]);
const VALID_CITATIONS = new Set(["APA", "MLA", "IEEE", "AMA"]);

// Depths that require batching
const BATCHED_DEPTHS  = new Set(["higher", "advanced"]);

// Page-count targets per depth (enforced in prompts)
const PAGE_TARGETS = {
  higher:   { min: 20, max: 40 },
  advanced: { min: 60, max: 100 },
};

const INPUT_MAX_CHARS      = 4000;
const UPSTREAM_TIMEOUT_MS  = 120000; // 2 min — batches are large
const BATCH_RETRY_LIMIT    = 2;
const BATCH_RETRY_DELAY_MS = 1500;

// SSE marker prefixes the frontend listens for
const SECTION_START_PREFIX = "<!-- SECTION_START:";
const SECTION_END_PREFIX   = "<!-- SECTION_END:";
const BATCH_MARKER_PREFIX  = "<!-- BATCH_";

// ─────────────────────────────────────────────────────────────────────────────
// Token resolver
// ─────────────────────────────────────────────────────────────────────────────

function getMaxTokens(mode: string, depth?: string): number {
  if (mode === "research" && depth) {
    if (depth === "higher")   return MAX_TOKENS.research_higher_batch;
    if (depth === "advanced") return MAX_TOKENS.research_advanced_batch;
    const key = `research_${depth}` as keyof typeof MAX_TOKENS;
    if (key in MAX_TOKENS) return MAX_TOKENS[key];
  }
  return MAX_TOKENS[mode as keyof typeof MAX_TOKENS] ?? 1000;
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch definitions
// ─────────────────────────────────────────────────────────────────────────────

interface BatchDef {
  label: string;
  sections: string[];
  instructions: string;
}

// ── Page-count mandate helper ─────────────────────────────────────────────

function pageMandate(depth: "higher" | "advanced"): string {
  const t = PAGE_TARGETS[depth];
  return `
PAGE-COUNT MANDATE: This batch is part of a ${t.min}–${t.max} page ${depth}-level document.
Write EXTENSIVELY and with FULL ACADEMIC DEPTH for every section assigned to this batch.
- Do not truncate, summarise, or abbreviate any section.
- Each major heading should have multiple sub-sections with comprehensive paragraphs.
- Every body paragraph must be 4–8 sentences minimum.
- Include all relevant data, theory, equations, examples, and critical discussion.
- Aim for maximum substantive depth — length is a quality requirement here.
`;
}

// ── APA ──────────────────────────────────────────────────────────────────────

const APA_HIGHER_BATCHES: BatchDef[] = [
  {
    label: "Batch 1 — Foundation",
    sections: ["Title Page", "Abstract", "Keywords", "Introduction", "Literature Review"],
    instructions: `${pageMandate("higher")}Write the following sections of a Higher APA research paper:
1. Title Page — full APA title page with running head and author note.
2. Abstract — 200-300 word structured abstract.
3. Keywords — 4-6 relevant keywords.
4. Introduction — broad-to-narrow funnel, establish significance, end with research question. Write at least 4 substantial paragraphs.
5. Literature Review — thematic synthesis of 6-8 scholarly works across multiple thematic sub-sections. Each theme must be discussed thoroughly with multiple paragraphs.
Use APA Level 1-2 headings. End after the Literature Review — do NOT write any further sections.`,
  },
  {
    label: "Batch 2 — Core Analysis",
    sections: ["Theoretical Framework", "Research Questions/Hypotheses", "Methodology", "Data Analysis"],
    instructions: `${pageMandate("higher")}Continue the Higher APA research paper. Write only these sections:
6. Theoretical Framework — identify and critically discuss the theory/model underpinning the study across multiple paragraphs.
7. Research Questions/Hypotheses — state clearly and number them; provide rationale for each.
8. Methodology — detailed design, participants, instruments, procedures, ethical considerations. Write comprehensively with sub-sections for each component.
9. Data Analysis — describe analytical strategy with full justification, including software, statistical tests, and reliability measures.
Use APA Level 1-2 headings. End after Data Analysis — do NOT write any further sections.`,
  },
  {
    label: "Batch 3 — Findings & Close",
    sections: ["Results", "Discussion", "Conclusion", "References", "Appendices"],
    instructions: `${pageMandate("higher")}Continue and complete the Higher APA research paper. Write only these final sections:
10. Results — present findings comprehensively using APA tables/figures conventions; describe every finding in detail.
11. Discussion — interpret findings against literature thoroughly; discuss implications at length across multiple sub-sections.
12. Conclusion — synthesise contributions fully and suggest concrete future directions.
13. References — minimum 8 references in APA 7th edition format.
14. Appendices — labelled Appendix A, B, etc. with full supplementary content.
Use APA Level 1-4 headings and proper statistical reporting where relevant.`,
  },
];

const APA_ADVANCED_BATCHES: BatchDef[] = [
  {
    label: "Batch 1 — Foundation",
    sections: ["Title Page", "Abstract", "Keywords", "Introduction", "Literature Review"],
    instructions: `${pageMandate("advanced")}Write the following sections of a publication-quality Advanced APA research paper:
1. Title Page — full APA 7th edition title page.
2. Abstract — 250-300 word structured abstract covering purpose, method, results, conclusions.
3. Keywords — 5-7 precise keywords.
4. Introduction — establish theoretical and empirical context with extensive citations; at least 6 paragraphs ending with clear research gap and aims.
5. Literature Review — critical synthesis of 10+ sources, organised thematically with 5+ thematic sub-sections, multiple paragraphs per theme, identifying and elaborating gaps.
End after the Literature Review — do NOT write any further sections.`,
  },
  {
    label: "Batch 2 — Framework & Method",
    sections: ["Theoretical Framework", "Research Questions/Hypotheses", "Methodology", "Data Analysis"],
    instructions: `${pageMandate("advanced")}Continue the Advanced APA paper. Write only these sections:
6. Theoretical Framework — articulate and justify the theoretical lens applied across multiple paragraphs with sub-sections.
7. Research Questions/Hypotheses — formally stated with extensive logical derivation from the literature.
8. Methodology — comprehensive: design rationale, sampling, instruments (reliability/validity), data collection, ethical approval — minimum 6 sub-sections.
9. Data Analysis — analytical techniques with statistical tools/software cited; include power analysis, effect size considerations, and sensitivity analysis plans.
End after Data Analysis — do NOT write any further sections.`,
  },
  {
    label: "Batch 3 — Results & Discussion",
    sections: ["Results", "Discussion", "Limitations", "Implications", "Future Research"],
    instructions: `${pageMandate("advanced")}Continue the Advanced APA paper. Write only these sections:
10. Results — comprehensive findings with APA-formatted tables and figures; report effect sizes and confidence intervals; include all primary and secondary outcomes.
11. Discussion — deep interpretation across multiple sub-sections, comparison to prior literature, theoretical implications.
12. Limitations — thorough discussion of scope and constraints across multiple dimensions.
13. Implications — extensive practical and theoretical contributions.
14. Future Research — specific, actionable research directions with rationale.
End after Future Research — do NOT write any further sections.`,
  },
  {
    label: "Batch 4 — Close",
    sections: ["Conclusion", "References", "Appendices"],
    instructions: `${pageMandate("advanced")}Complete the Advanced APA paper with these final sections:
15. Conclusion — extensive synthesis of the entire paper across multiple paragraphs.
16. References — minimum 12 references, APA 7th edition, DOIs included.
17. Appendices — labelled appendices with full supplementary materials.
Maintain formal academic tone throughout.`,
  },
];

// ── MLA ──────────────────────────────────────────────────────────────────────

const MLA_HIGHER_BATCHES: BatchDef[] = [
  {
    label: "Batch 1 — Opening",
    sections: ["Introduction", "Historical/Theoretical Context", "Literature Review"],
    instructions: `${pageMandate("higher")}Write the opening sections of a Higher MLA scholarly essay:
1. Introduction — situate the work in its critical conversation; at least 3 paragraphs ending with a precise, nuanced thesis.
2. Historical/Theoretical Context — ground the argument in relevant history and critical theory across multiple thorough paragraphs.
3. Literature Review — review 6-8 scholarly works across multiple thematic groupings, multiple paragraphs per group, identifying dominant interpretations and gaps.
End after the Literature Review.`,
  },
  {
    label: "Batch 2 — Analysis & Close",
    sections: ["Analytical Framework", "Multi-layer Textual Analysis", "Conclusion", "Works Cited"],
    instructions: `${pageMandate("higher")}Continue and complete the Higher MLA essay:
4. Analytical Framework — explicitly state the critical lens and methodology applied across multiple paragraphs.
5. Multi-layer Textual Analysis — extensive close reading with layered interpretive claims across numerous sub-sections; integrate secondary sources throughout.
6. Conclusion — synthesise analytical findings and articulate contribution to scholarly conversation.
7. Works Cited — minimum 8 sources, MLA 9th edition.`,
  },
];

const MLA_ADVANCED_BATCHES: BatchDef[] = [
  {
    label: "Batch 1 — Opening",
    sections: ["Introduction", "Historical/Theoretical Context", "Literature Review"],
    instructions: `${pageMandate("advanced")}Write the opening sections of a publication-quality Advanced MLA critical essay:
1. Introduction — enter the scholarly debate directly; at least 4 paragraphs articulating a sophisticated, contestable thesis.
2. Historical/Theoretical Context — extensive critical and historical grounding with multi-theory engagement across multiple sub-sections.
3. Literature Review — critical evaluation of 10+ sources across multiple thematic groupings; map the scholarly conversation, highlighting tensions.
End after the Literature Review.`,
  },
  {
    label: "Batch 2 — Core Analysis",
    sections: ["Analytical Framework", "Multi-layer Textual Analysis", "Comparative Criticism"],
    instructions: `${pageMandate("advanced")}Continue the Advanced MLA essay:
4. Analytical Framework — justify the theoretical methodology with reference to its proponents and limitations across multiple paragraphs.
5. Multi-layer Textual Analysis — sustained close reading with extensive intertextual and contextual layers; multiple sub-sections per argument thread.
6. Comparative Criticism — compare extensively with related texts, authors, or critical traditions.
End after Comparative Criticism.`,
  },
  {
    label: "Batch 3 — Close",
    sections: ["Scholarly Debate Section", "Conclusion", "Works Cited", "Notes/Appendices"],
    instructions: `${pageMandate("advanced")}Complete the Advanced MLA essay:
7. Scholarly Debate Section — engage directly and at length with opposing critical positions.
8. Conclusion — bold synthesis that proposes new critical directions.
9. Works Cited — minimum 12 sources, MLA 9th edition.
10. Notes/Appendices — endnotes for tangential arguments; appendices for supplementary material.`,
  },
];

// ── IEEE ─────────────────────────────────────────────────────────────────────

const IEEE_HIGHER_BATCHES: BatchDef[] = [
  {
    label: "Batch 1 — Foundation",
    sections: ["Title", "Abstract", "Keywords", "Introduction", "Problem Definition", "Related Work", "Research Gap"],
    instructions: `${pageMandate("higher")}Write the opening sections of a Higher IEEE technical paper:
1. Title — publication-style technical title.
2. Abstract — 200-250 words: motivation, problem, proposed method, key results, significance.
3. Keywords — 5-7 precise technical keywords.
4. Introduction — deep motivation across at least 4 paragraphs; enumerate contributions; structured paper outline.
5. Problem Definition — formal definition with mathematical notation; multiple paragraphs covering assumptions and scope.
6. Related Work — critical review of 6-8 works across multiple categorised sub-sections; identify unresolved challenges.
7. Research Gap — explicitly state what existing work does not address with supporting evidence.
End after Research Gap.`,
  },
  {
    label: "Batch 2 — Technical Core",
    sections: ["System Architecture", "Mathematical/Algorithmic Model", "Experimental Setup"],
    instructions: `${pageMandate("higher")}Continue the Higher IEEE paper:
8. System Architecture — detailed architecture with labelled diagrams described in text; justify design choices across multiple sub-sections.
9. Mathematical/Algorithmic Model — formal model with equations, pseudocode, or proofs; include complexity analysis.
10. Experimental Setup — dataset, environment, baseline models, hyperparameters, evaluation metrics — each given a dedicated sub-section.
End after Experimental Setup.`,
  },
  {
    label: "Batch 3 — Results & Close",
    sections: ["Results & Benchmarking", "Discussion", "Conclusion", "References", "Appendices"],
    instructions: `${pageMandate("higher")}Complete the Higher IEEE paper:
11. Results & Benchmarking — extensive tables and figures comparing performance against baselines; statistical significance; ablation study results.
12. Discussion — interpret results thoroughly; analyse failure cases; discuss trade-offs, scalability, and limitations.
13. Conclusion — comprehensive summary of contributions, limitations, and concrete future directions.
14. References — minimum 10 IEEE-format references.
15. Appendices — proofs, additional experiments, or extended algorithm listings.`,
  },
];

const IEEE_ADVANCED_BATCHES: BatchDef[] = [
  {
    label: "Batch 1 — Foundation",
    sections: ["Title", "Abstract", "Keywords", "Introduction", "Problem Definition", "Related Work", "Research Gap"],
    instructions: `${pageMandate("advanced")}Write the opening sections of a conference/journal-quality Advanced IEEE paper:
1. Title — precise, publication-ready technical title.
2. Abstract — 250-300 words: problem significance, novelty, experimental results, impact.
3. Keywords — 6-8 precise technical keywords.
4. Introduction — comprehensive motivation across at least 5 paragraphs; clearly enumerated contributions; paper organisation.
5. Problem Definition — formal mathematical problem statement with notation, assumptions, constraints, and scope.
6. Related Work — critical review of 8-12 works across multiple method-family sub-sections; highlight gaps at length.
7. Research Gap — explicit, evidence-backed statement with detailed discussion of what this work uniquely addresses.
End after Research Gap.`,
  },
  {
    label: "Batch 2 — Architecture & Model",
    sections: ["System Architecture", "Mathematical/Algorithmic Model", "Experimental Setup", "Dataset Description", "Performance Metrics"],
    instructions: `${pageMandate("advanced")}Continue the Advanced IEEE paper:
8. System Architecture — complete architecture with labelled multi-level diagrams described extensively in text; justify every design decision.
9. Mathematical/Algorithmic Model — rigorous: equations, pseudocode, complexity analysis, proofs across multiple sub-sections.
10. Experimental Setup — full reproducibility: datasets, splits, hardware, software, baselines, hyperparameter tuning.
11. Dataset Description — size, source, preprocessing pipeline, class distribution, licensing.
12. Performance Metrics — define all metrics with mathematical definitions and justification.
End after Performance Metrics.`,
  },
  {
    label: "Batch 3 — Results & Discussion",
    sections: ["Results & Benchmarking", "Discussion", "Limitations", "Future Improvements"],
    instructions: `${pageMandate("advanced")}Continue the Advanced IEEE paper:
13. Results & Benchmarking — comprehensive tables and figures; extensive ablation studies; statistical significance tests across multiple sub-sections.
14. Discussion — deep analysis across multiple sub-sections; comparison to state-of-the-art; failure mode analysis; computational cost.
15. Limitations — candid discussion of scope, generalisability, and threats to validity.
16. Future Improvements — specific, technically grounded future research directions with rationale.
End after Future Improvements.`,
  },
  {
    label: "Batch 4 — Close",
    sections: ["Conclusion", "References", "Appendices"],
    instructions: `${pageMandate("advanced")}Complete the Advanced IEEE paper:
17. Conclusion — comprehensive synthesis of contributions and impact.
18. References — minimum 15 IEEE-format references with DOIs.
19. Appendices — supplementary proofs, datasets, code snippets, extended results.`,
  },
];

// ── AMA ──────────────────────────────────────────────────────────────────────

const AMA_HIGHER_BATCHES: BatchDef[] = [
  {
    label: "Batch 1 — Opening",
    sections: ["Title", "Structured Abstract", "Introduction", "Literature Review", "Study Design"],
    instructions: `${pageMandate("higher")}Write the opening sections of a Higher AMA clinical paper:
1. Title — publication-style clinical research title.
2. Structured Abstract — 250-300 words with all required AMA structured abstract headings.
3. Introduction — comprehensive clinical background, knowledge gap, and specific aims across at least 4 paragraphs.
4. Literature Review — critical synthesis of 6-8 clinical studies across multiple thematic sub-sections.
5. Study Design — justify design choice comprehensively; CONSORT/PRISMA flow where applicable.
End after Study Design.`,
  },
  {
    label: "Batch 2 — Methods & Results",
    sections: ["Methods", "Results", "Clinical Interpretation"],
    instructions: `${pageMandate("higher")}Continue the Higher AMA paper:
6. Methods — complete with dedicated sub-sections: patient/data selection, inclusion/exclusion criteria, interventions, blinding, outcome measures, statistical analysis plan.
7. Results — comprehensive findings: primary and secondary outcomes, subgroup analyses, adverse events — all described thoroughly.
8. Clinical Interpretation — evidence-based interpretation with reference to clinical guidelines across multiple paragraphs.
End after Clinical Interpretation.`,
  },
  {
    label: "Batch 3 — Close",
    sections: ["Ethical Considerations", "Conclusion", "References"],
    instructions: `${pageMandate("higher")}Complete the Higher AMA paper:
9. Ethical Considerations — IRB/ethics committee approval, informed consent, data privacy, conflict of interest.
10. Conclusion — comprehensive evidence synthesis and evidence-graded clinical recommendations.
11. References — minimum 10 AMA-format references with DOIs.`,
  },
];

const AMA_ADVANCED_BATCHES: BatchDef[] = [
  {
    label: "Batch 1 — Opening",
    sections: ["Title", "Structured Abstract", "Introduction", "Literature Review", "Study Design"],
    instructions: `${pageMandate("advanced")}Write the opening sections of a journal-quality Advanced AMA clinical research paper:
1. Title — precise, journal-ready clinical research title.
2. Structured Abstract — 300 words max with all required AMA structured abstract sections.
3. Introduction — clinical and epidemiological context across at least 5 paragraphs; critical evidence gap; specific research aims.
4. Literature Review — comprehensive critical appraisal of 10+ studies across multiple thematic sub-sections; meta-analytic context where available.
5. Study Design — rigorous justification; CONSORT, STROBE, or PRISMA compliance stated explicitly with flow diagram description.
End after Study Design.`,
  },
  {
    label: "Batch 2 — Methods",
    sections: ["Patient/Data Selection", "Statistical Analysis"],
    instructions: `${pageMandate("advanced")}Continue the Advanced AMA paper:
6. Patient/Data Selection — detailed eligibility criteria, recruitment strategy, sample size justification with power calculation, screening and enrolment flow across multiple sub-sections.
7. Statistical Analysis — all statistical tests defined; primary and secondary endpoints pre-specified; sensitivity analyses; software and version cited; handling of missing data.
End after Statistical Analysis.`,
  },
  {
    label: "Batch 3 — Results & Interpretation",
    sections: ["Results", "Clinical Interpretation", "Ethical Considerations", "Limitations"],
    instructions: `${pageMandate("advanced")}Continue the Advanced AMA paper:
8. Results — primary and secondary outcomes with effect sizes, 95% CIs, and p-values; subgroup and sensitivity analysis results — all described comprehensively.
9. Clinical Interpretation — deep evidence-based interpretation across multiple sub-sections; comparison to landmark trials and meta-analyses.
10. Ethical Considerations — IRB protocol number, informed consent, HIPAA/GDPR compliance, conflicts of interest.
11. Limitations — threats to internal and external validity; selection bias, confounding, missing data.
End after Limitations.`,
  },
  {
    label: "Batch 4 — Close",
    sections: ["Recommendations", "Conclusion", "References", "Supplementary Materials"],
    instructions: `${pageMandate("advanced")}Complete the Advanced AMA paper:
12. Recommendations — GRADE-evidence-level-graded clinical practice recommendations.
13. Conclusion — comprehensive summary of clinical contribution and impact on practice/guidelines.
14. References — minimum 15 AMA-format references with DOIs.
15. Supplementary Materials — extended tables, protocol documents, statistical code, data availability statement.`,
  },
];

// ── Generic (no citation style) ───────────────────────────────────────────────

const GENERIC_HIGHER_BATCHES: BatchDef[] = [
  {
    label: "Batch 1 — Overview",
    sections: ["Executive Summary", "Key Points", "Background & Context"],
    instructions: `${pageMandate("higher")}Write the opening sections of a Higher-level structured research response:

## Executive Summary
4-5 precise sentences including scope, methodology, and significance.

## Key Points
6-8 bullet points with comprehensive justification for each (2-3 sentences per point).

## Background & Context
Situate the topic within its broader field or discipline across multiple thorough paragraphs with sub-sections.

End after Background & Context.`,
  },
  {
    label: "Batch 2 — Analysis",
    sections: ["Deep Dive", "Competing Views, Debates & Limitations"],
    instructions: `${pageMandate("higher")}Continue the Higher-level research response:

## Deep Dive
5-7 thematic sub-sections with extensive in-depth analysis; each sub-section must have multiple substantive paragraphs with relevant data, theory, and critical discussion.

## Competing Views, Debates & Limitations
3-5 substantive counterarguments or knowledge gaps, each explored thoroughly across multiple paragraphs.

End after Competing Views, Debates & Limitations.`,
  },
  {
    label: "Batch 3 — Close",
    sections: ["Synthesis", "Implications & Applications", "Suggested Next Steps"],
    instructions: `${pageMandate("higher")}Complete the Higher-level research response:

## Synthesis
Integrate the key threads into a coherent analytical narrative across multiple paragraphs.

## Implications & Applications
Extensive practical or theoretical implications of the findings; multiple sub-sections covering different dimensions.

## Suggested Next Steps
5-7 specific, actionable research or study recommendations with rationale.`,
  },
];

const GENERIC_ADVANCED_BATCHES: BatchDef[] = [
  {
    label: "Batch 1 — Overview",
    sections: ["Executive Summary", "Key Points", "Background & Theoretical Context"],
    instructions: `${pageMandate("advanced")}Write the opening sections of an Advanced-level structured research response:

## Executive Summary
5-6 sentences covering scope, methodology, key findings, and significance.

## Key Points
7-9 substantive bullet points with critical nuance (3-4 sentences per point).

## Background & Theoretical Context
Comprehensive contextualisation within the discipline across multiple sub-sections; identify and critically discuss dominant frameworks.

End after Background & Theoretical Context.`,
  },
  {
    label: "Batch 2 — Deep Analysis",
    sections: ["Deep Dive", "Competing Views, Scholarly Debates & Limitations"],
    instructions: `${pageMandate("advanced")}Continue the Advanced-level research response:

## Deep Dive
6-8 rigorous thematic sub-sections; each must have extensive paragraphs covering mechanisms, evidence, models, and quantitative data.

## Competing Views, Scholarly Debates & Limitations
4-6 well-developed counterarguments with thorough engagement of conflicting evidence across multiple paragraphs.

End after Competing Views, Scholarly Debates & Limitations.`,
  },
  {
    label: "Batch 3 — Close",
    sections: ["Critical Synthesis", "Implications", "Future Research Directions", "Suggested Next Steps"],
    instructions: `${pageMandate("advanced")}Complete the Advanced-level research response:

## Critical Synthesis
Integrate all threads with extensive original analytical commentary across multiple paragraphs.

## Implications
Theoretical, practical, policy, or clinical implications as appropriate; multiple sub-sections.

## Future Research Directions
5-7 specific, evidence-grounded research questions or directions with detailed rationale.

## Suggested Next Steps
6-8 concrete, prioritised recommendations with implementation considerations.`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Batch resolver
// ─────────────────────────────────────────────────────────────────────────────

function getBatches(citationStyle: string | null, depth: string): BatchDef[] {
  if (citationStyle === "APA")  return depth === "higher" ? APA_HIGHER_BATCHES  : APA_ADVANCED_BATCHES;
  if (citationStyle === "MLA")  return depth === "higher" ? MLA_HIGHER_BATCHES  : MLA_ADVANCED_BATCHES;
  if (citationStyle === "IEEE") return depth === "higher" ? IEEE_HIGHER_BATCHES : IEEE_ADVANCED_BATCHES;
  if (citationStyle === "AMA")  return depth === "higher" ? AMA_HIGHER_BATCHES  : AMA_ADVANCED_BATCHES;
  return depth === "higher" ? GENERIC_HIGHER_BATCHES : GENERIC_ADVANCED_BATCHES;
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt fragments
// ─────────────────────────────────────────────────────────────────────────────

const DEPTH_GUIDES = {
  beginner: `
DEPTH: Beginner
- Assume zero prior knowledge.
- Use short, simple sentences.
- Avoid jargon; define all terms in plain language.
- Use concrete real-world analogies.
- No equations unless extremely simple.
`,
  intermediate: `
DEPTH: Intermediate
- Assume basic familiarity with the topic.
- Clear professional language; introduce vocabulary with brief clarification.
- Include practical examples and applications.
- Introduce moderate nuance without overwhelming detail.
`,
  higher: `
DEPTH: Higher
- Assume strong subject familiarity.
- Precise terminology and analytically structured explanations.
- Analyse causes, implications, trade-offs, and limitations.
- Multi-step reasoning; address misconceptions and edge cases.
`,
  advanced: `
DEPTH: Advanced
- Assume expert-level understanding and technical fluency.
- Rigorous, precise, domain-appropriate terminology.
- Deep multi-layered reasoning with theory, derivations, and proofs.
- Compare competing perspectives; highlight unresolved issues and research directions.
`,
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
    inText:     { format: "(Author, Year)", example: "(Smith, 2023)" },
    refTitle:   "References",
    refExample: "Smith, J. (2023). Title of work. Publisher.",
  },
  MLA: {
    fullName:   "Modern Language Association Style",
    inText:     { format: "(Author Page)", example: "(Smith 123)" },
    refTitle:   "Works Cited",
    refExample: 'Smith, John. "Title of Work." Publisher, Year.',
  },
  IEEE: {
    fullName:   "Institute of Electrical and Electronics Engineers Style",
    inText:     { format: "[Number]", example: "[1]" },
    refTitle:   "References",
    refExample: '[1] J. Smith, "Title," Journal, vol. 1, no. 1, pp. 1-10, 2023.',
  },
  AMA: {
    fullName:   "American Medical Association Style",
    inText:     { format: "superscript number", example: "Smith¹" },
    refTitle:   "References",
    refExample: "1. Smith J. Title. Journal Name. 2023;1(1):1-10.",
  },
};

const GENERIC_RESEARCH_STRUCTURES = {
  beginner: `You are Xplainfy, a structured research assistant writing at BEGINNER level.

Write a clear, accessible research response with the following sections.
Emit a SECTION_START marker before each section and SECTION_END marker after each section, using EXACTLY this format:
<!-- SECTION_START:Section Name -->
...content...
<!-- SECTION_END:Section Name -->

Sections to write (in order):

<!-- SECTION_START:Summary -->
## Summary
2-3 sentences giving a direct answer.
<!-- SECTION_END:Summary -->

<!-- SECTION_START:Key Points -->
## Key Points
3-4 bullet points covering the most important facts.
<!-- SECTION_END:Key Points -->

<!-- SECTION_START:Explanation -->
## Explanation
2-3 short paragraphs with plain language and real-world examples.
<!-- SECTION_END:Explanation -->

<!-- SECTION_START:Conclusion -->
## Conclusion
1-2 sentences wrapping up the key takeaway.
<!-- SECTION_END:Conclusion -->`,

  intermediate: `You are Xplainfy, a structured research assistant writing at INTERMEDIATE level.

Emit a SECTION_START marker before each section and SECTION_END marker after each section:
<!-- SECTION_START:Section Name -->
...content...
<!-- SECTION_END:Section Name -->

Sections (in order):

<!-- SECTION_START:Executive Summary -->
## Executive Summary
2-3 sentences.
<!-- SECTION_END:Executive Summary -->

<!-- SECTION_START:Key Points -->
## Key Points
4-6 bullet points.
<!-- SECTION_END:Key Points -->

<!-- SECTION_START:Deep Dive -->
## Deep Dive
3-5 sub-sections with analytical detail and referenced examples.
<!-- SECTION_END:Deep Dive -->

<!-- SECTION_START:Competing Views & Limitations -->
## Competing Views & Limitations
1-3 counterarguments or limitations of current knowledge.
<!-- SECTION_END:Competing Views & Limitations -->

<!-- SECTION_START:Summary -->
## Summary
3-5 sentences.
<!-- SECTION_END:Summary -->

<!-- SECTION_START:Suggested Next Steps -->
## Suggested Next Steps
3-5 actionable recommendations.
<!-- SECTION_END:Suggested Next Steps -->`,
};

function depthLine(depth?: string): string {
  return depth && DEPTH_GUIDES[depth as keyof typeof DEPTH_GUIDES]
    ? `\n${DEPTH_GUIDES[depth as keyof typeof DEPTH_GUIDES]}`
    : "";
}

function mindsetLine(mindset?: string): string {
  return mindset && MINDSET_GUIDES[mindset as keyof typeof MINDSET_GUIDES]
    ? `\nLens: ${MINDSET_GUIDES[mindset as keyof typeof MINDSET_GUIDES]}`
    : "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Section marker injection helper
// Wraps batch instructions to mandate SECTION_START/END markers
// ─────────────────────────────────────────────────────────────────────────────

function injectSectionMarkerInstructions(batchInstructions: string, sections: string[]): string {
  const markerGuide = sections
    .map(s => `<!-- SECTION_START:${s} -->\n...full content for "${s}"...\n<!-- SECTION_END:${s} -->`)
    .join("\n\n");

  return `${batchInstructions}

SECTION MARKERS (REQUIRED):
You MUST wrap EVERY section's content with the exact markers shown below.
The frontend uses these markers to enable section-by-section navigation.
Do NOT omit, modify, or abbreviate the markers.

${markerGuide}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt builders (non-batched modes)
// ─────────────────────────────────────────────────────────────────────────────

function buildProblemPrompt(): string {
  return `You are Xplainfy, a precise problem-solving assistant.
If an image, document, or voice transcript has been provided, analyse it thoroughly to identify and solve the problem it contains.

## Solution
State the answer in sentence 1. Follow with 2-4 sentences of key reasoning.

## Why This Works
1-2 sentences on the underlying principle.

## Check Your Answer
A) ...
B) ...
C) ...
D) ...
Append [CORRECT] to the correct option only.`;
}

function buildTutorPrompt(mindset?: string, depth?: string): string {
  const formulaInstruction = (depth === "higher" || depth === "advanced")
    ? `\nFORMULAS: This is a ${depth}-level response. If the topic involves any mathematical, scientific, or technical formulas, equations, or derivations, you MUST include them with full explanation. Show step-by-step working where applicable. Do not omit formulas for brevity.`
    : `\nFORMULAS: If the question involves or would benefit from formulas, equations, or calculations, include them clearly with explanation. Do not skip relevant formulas.`;

  return `You are Xplainfy, an expert adaptive tutor.${depthLine(depth)}${mindsetLine(mindset)}${formulaInstruction}
If an image, scanned document, voice transcript, or uploaded file has been provided, analyse it and generate your tutoring response based on its content.

Respond with the following sections in order:

## Introduction
1-2 sentence hook that engages the learner.

## Core Concepts
2-4 fundamental concepts as bullet points.

## Detailed Explanation
Layered explanation with real-world examples. If relevant, include and explain all applicable formulas, equations, or derivations here with step-by-step worked examples.

## Formulas & Equations
If the topic involves any formulas or equations, list and explain each one here. Show how to use them with a worked example. (Omit this section only if the topic is entirely non-mathematical.)

## Key Takeaways
4-6 bullet points summarising the most important ideas.

## Practice Questions
After all the above sections, output EXACTLY this raw JSON object — no markdown fences, no backticks, no extra text before or after:
{"practice_questions":[{"question":"...","options":["A) ...","B) ...","C) ...","D) ..."],"correct_answer":"A) ..."},{"question":"...","options":["A) ...","B) ...","C) ...","D) ..."],"correct_answer":"B) ..."},{"question":"...","options":["A) ...","B) ...","C) ...","D) ..."],"correct_answer":"C) ..."},{"question":"...","options":["A) ...","B) ...","C) ...","D) ..."],"correct_answer":"D) ..."},{"question":"...","options":["A) ...","B) ...","C) ...","D) ..."],"correct_answer":"A) ..."},{"question":"...","options":["A) ...","B) ...","C) ...","D) ..."],"correct_answer":"B) ..."},{"question":"...","options":["A) ...","B) ...","C) ...","D) ..."],"correct_answer":"C) ..."},{"question":"...","options":["A) ...","B) ...","C) ...","D) ..."],"correct_answer":"D) ..."},{"question":"...","options":["A) ...","B) ...","C) ...","D) ..."],"correct_answer":"A) ..."},{"question":"...","options":["A) ...","B) ...","C) ...","D) ..."],"correct_answer":"B) ..."}]}

Rules for the JSON:
- You MUST generate EXACTLY 10 practice questions — no more, no fewer.
- options must always start with the letter prefix: "A) ", "B) ", "C) ", "D) "
- correct_answer must exactly match one of the options including the letter prefix
- Vary the correct answers across all 10 questions — do not always use the same letter.
- output the JSON as the very last thing, nothing after it`;
}

function buildResearchPrompt(mindset?: string, depth?: string): string {
  const base = GENERIC_RESEARCH_STRUCTURES[depth as keyof typeof GENERIC_RESEARCH_STRUCTURES]
    ?? GENERIC_RESEARCH_STRUCTURES["intermediate"];
  const mindsetSuffix = mindset && MINDSET_GUIDES[mindset as keyof typeof MINDSET_GUIDES]
    ? `\nLens: ${MINDSET_GUIDES[mindset as keyof typeof MINDSET_GUIDES]}`
    : "";
  const imageSuffix = `\nIf an image, scanned document, voice transcript, or uploaded file has been provided, analyse it and base your research response on its content.`;
  return `${base}${mindsetSuffix}${imageSuffix}`;
}

function buildCitationResearchPrompt(style: string, mindset?: string, depth?: string): string {
  const f = CITATION_FORMATS[style as keyof typeof CITATION_FORMATS];
  const mindsetSuffix = mindset && MINDSET_GUIDES[mindset as keyof typeof MINDSET_GUIDES]
    ? `\nAudience Lens: ${MINDSET_GUIDES[mindset as keyof typeof MINDSET_GUIDES]}`
    : "";
  const depthSuffix = depth && DEPTH_GUIDES[depth as keyof typeof DEPTH_GUIDES]
    ? `\n${DEPTH_GUIDES[depth as keyof typeof DEPTH_GUIDES]}`
    : "";

  const RESEARCH_STRUCTURES_LEGACY: Record<string, Record<string, { label: string; sections: string[]; instructions: string }>> = {
    APA: {
      beginner: {
        label: "Basic APA",
        sections: ["Title Page", "Introduction", "Body Paragraphs", "Conclusion", "References"],
        instructions: `Write a short academic paper using Basic APA structure. Wrap each section in SECTION_START/SECTION_END markers:
<!-- SECTION_START:Title Page -->
1. Title Page — include paper title, author name, institution, course, date.
<!-- SECTION_END:Title Page -->
<!-- SECTION_START:Introduction -->
2. Introduction — introduce the topic clearly and state the purpose.
<!-- SECTION_END:Introduction -->
<!-- SECTION_START:Body Paragraphs -->
3. Body Paragraphs — 2-3 focused paragraphs with simple (Author, Year) citations.
<!-- SECTION_END:Body Paragraphs -->
<!-- SECTION_START:Conclusion -->
4. Conclusion — summarise key points in 2-3 sentences.
<!-- SECTION_END:Conclusion -->
<!-- SECTION_START:References -->
5. References — list all sources in APA format. Minimum 3 references.
<!-- SECTION_END:References -->`,
      },
      intermediate: {
        label: "Intermediate APA",
        sections: ["Title Page", "Abstract", "Introduction", "Literature Review", "Methodology", "Results", "Discussion", "Conclusion", "References", "Appendices"],
        instructions: `Write a research paper using Intermediate APA structure. Wrap each section in SECTION_START/SECTION_END markers.
Include all sections: Title Page, Abstract, Introduction, Literature Review, Methodology, Results, Discussion, Conclusion, References, Appendices.`,
      },
    },
    MLA: {
      beginner: {
        label: "Basic MLA",
        sections: ["Heading", "Title", "Introduction", "Body", "Conclusion", "Works Cited"],
        instructions: `Write an essay using Basic MLA structure with SECTION_START/SECTION_END markers around each section.`,
      },
      intermediate: {
        label: "Intermediate MLA",
        sections: ["Introduction", "Context/Literature Background", "Main Argument Sections", "Comparative Analysis", "Counterarguments", "Conclusion", "Works Cited"],
        instructions: `Write an argumentative research essay using Intermediate MLA structure with SECTION_START/SECTION_END markers.`,
      },
    },
    IEEE: {
      beginner: {
        label: "Basic IEEE",
        sections: ["Title", "Abstract", "Introduction", "Problem Statement", "Proposed Solution", "Conclusion", "References"],
        instructions: `Write a technical report using Basic IEEE structure with SECTION_START/SECTION_END markers around each section.`,
      },
      intermediate: {
        label: "Intermediate IEEE",
        sections: ["Title", "Abstract", "Keywords", "Introduction", "Related Work", "System Design", "Methodology", "Implementation", "Testing & Results", "Discussion", "Conclusion", "References"],
        instructions: `Write a technical research paper using Intermediate IEEE structure with SECTION_START/SECTION_END markers.`,
      },
    },
    AMA: {
      beginner: {
        label: "Basic AMA",
        sections: ["Title", "Abstract", "Introduction", "Case/Study Description", "Discussion", "Conclusion", "References"],
        instructions: `Write a clinical paper using Basic AMA structure with SECTION_START/SECTION_END markers.`,
      },
      intermediate: {
        label: "Intermediate AMA",
        sections: ["Title", "Structured Abstract", "Introduction", "Background", "Methods", "Results", "Clinical Discussion", "Conclusion", "References"],
        instructions: `Write a clinical research paper using Intermediate AMA structure with SECTION_START/SECTION_END markers.`,
      },
    },
  };

  const styleStructures = RESEARCH_STRUCTURES_LEGACY[style];
  const normalizedDepth = (depth && styleStructures?.[depth]) ? depth : "intermediate";
  const struct = styleStructures?.[normalizedDepth] ?? styleStructures?.["intermediate"];

  const markerGuide = (struct?.sections ?? [])
    .map(s => `<!-- SECTION_START:${s} -->\n...content...\n<!-- SECTION_END:${s} -->`)
    .join("\n\n");

  return `You are Xplainfy, an academic writing specialist in ${f.fullName} (${style}) at ${struct?.label ?? style} level.${depthSuffix}${mindsetSuffix}
If an image, scanned document, voice transcript, or uploaded file has been provided, analyse it and incorporate its content into the research paper.

CITATION RULES:
- In-text citation format: ${f.inText.format} — e.g. ${f.inText.example}
- Reference section title: ${f.refTitle}
- Reference entry format: ${f.refExample}
- Include at least 5 realistic, plausible references.

SECTION MARKERS (REQUIRED) — wrap every section:
${markerGuide}

PAPER STRUCTURE — follow every step below precisely:

${struct?.instructions ?? "Write a complete research paper following all standard conventions."}

Important: Produce a complete, well-written paper. Use correct ${style} heading levels, citation format, and reference format throughout.`;
}

function buildSimplifyPrompt(): string {
  return `You are Xplainfy, a simplification assistant.
If an image, scanned document, voice transcript, or uploaded file has been provided, analyse it and simplify its content.

## Simplified Problem
Restate clearly.

## Key Components
Main elements needed.

## Approach
Straightforward strategy.`;
}

function buildHintsPrompt(): string {
  return `You are Xplainfy, a hints assistant.
If an image, scanned document, voice transcript, or uploaded file has been provided, analyse it and provide hints based on its content.

## Hint 1
First key concept.

## Hint 2
Builds on Hint 1.

## Hint 3
Connects the concepts.`;
}

function buildRewritesPrompt(): string {
  return `You are Xplainfy, a rewriting assistant.
If an image, scanned document, voice transcript, or uploaded file has been provided, analyse it and rewrite or improve its content.

## Rewritten Content
Improved version.

## Improvements Made
What changed and why.`;
}

function buildSystemPrompt(mode: string, mindset?: string, depth?: string, citationStyle?: string | null): string {
  switch (mode) {
    case "problem":  return buildProblemPrompt();
    case "tutor":    return buildTutorPrompt(mindset, depth);
    case "research":
      if (citationStyle && CITATION_FORMATS[citationStyle as keyof typeof CITATION_FORMATS]) {
        return buildCitationResearchPrompt(citationStyle, mindset, depth);
      }
      return buildResearchPrompt(mindset, depth);
    case "simplify": return buildSimplifyPrompt();
    case "hints":    return buildHintsPrompt();
    case "rewrites": return buildRewritesPrompt();
    default:         return "You are a helpful assistant.";
  }
}

function getModel(mode: string): string {
  return ["problem", "tutor", "research"].includes(mode) ? MODELS.standard : MODELS.fast;
}

// ─────────────────────────────────────────────────────────────────────────────
// Content builder
// ─────────────────────────────────────────────────────────────────────────────

function buildUserContent(
  input: string,
  imageBase64?: string,
  imageMimeType?: string,
  documentBase64?: string,
  documentMimeType?: string,
  voiceTranscript?: string,
): string | Array<Record<string, unknown>> {
  const parts: Array<Record<string, unknown>> = [];

  const textParts: string[] = [];
  if (voiceTranscript && voiceTranscript.trim()) {
    textParts.push(`[Voice transcript]: ${voiceTranscript.trim()}`);
  }
  textParts.push(input.trim());
  parts.push({ type: "text", text: textParts.join("\n\n") });

  if (imageBase64 && imageMimeType) {
    parts.push({
      type: "image_url",
      image_url: { url: `data:${imageMimeType};base64,${imageBase64}`, detail: "high" },
    });
  }

  if (documentBase64 && documentMimeType) {
    if (documentMimeType === "application/pdf") {
      parts.push({
        type: "file",
        file: {
          filename: "uploaded_document.pdf",
          file_data: `data:application/pdf;base64,${documentBase64}`,
        },
      });
    } else {
      parts.push({
        type: "file",
        file: {
          filename: "uploaded_document",
          file_data: `data:${documentMimeType};base64,${documentBase64}`,
        },
      });
    }
  }

  if (parts.length === 1 && parts[0].type === "text") {
    return input.trim();
  }

  return parts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch context builder
// ─────────────────────────────────────────────────────────────────────────────

interface CompletedBatch {
  label: string;
  sections: string[];
  summary: string;
}

function buildBatchContextHeader(
  topic: string,
  citationStyle: string | null,
  depth: string,
  completed: CompletedBatch[],
): string {
  if (completed.length === 0) return "";

  const pageTarget = PAGE_TARGETS[depth as keyof typeof PAGE_TARGETS];
  const styleNote = citationStyle ? ` (${citationStyle} format)` : "";
  const completedBlock = completed
    .map(b => `  [${b.label}] — Sections: ${b.sections.join(", ")}\n  Summary: ${b.summary}`)
    .join("\n\n");

  return `CONTEXT — This is a continuation of a multi-part ${depth}-level research paper${styleNote} on the topic: "${topic}".
The final document must be ${pageTarget.min}–${pageTarget.max} pages. Write at the required length and depth for every section.

Sections already written:
${completedBlock}

Continue seamlessly from where the previous batch ended. Do NOT repeat or rewrite any already-completed sections. Maintain consistent tone, terminology, citation style, and academic register throughout.

---

`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary generator (non-streaming helper call)
// ─────────────────────────────────────────────────────────────────────────────

async function generateSummary(
  openAIKey: string,
  batchText: string,
  sections: string[],
): Promise<string> {
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${openAIKey}`,
      },
      body: JSON.stringify({
        model:       MODELS.fast,
        max_tokens:  200,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: "Summarise the provided academic text in exactly 2-3 sentences. Focus on key arguments, findings, and scope. Be precise and neutral.",
          },
          {
            role: "user",
            content: `Summarise the following sections (${sections.join(", ")}) in 2-3 sentences:\n\n${batchText.slice(0, 3000)}`,
          },
        ],
      }),
    });

    if (!resp.ok) return `Covered: ${sections.join(", ")}.`;
    const data = await resp.json();
    return data.choices?.[0]?.message?.content?.trim() ?? `Covered: ${sections.join(", ")}.`;
  } catch {
    return `Covered: ${sections.join(", ")}.`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Single batch streaming call with retry logic
// ─────────────────────────────────────────────────────────────────────────────

async function streamBatch(
  openAIKey:     string,
  model:         string,
  maxTokens:     number,
  systemPrompt:  string,
  userContent:   string | Array<Record<string, unknown>>,
  writer:        WritableStreamDefaultWriter<Uint8Array>,
  encoder:       TextEncoder,
  batchIndex:    number,
  totalBatches:  number,
  batchLabel:    string,
  batchSections: string[],
): Promise<{ text: string; success: boolean }> {

  // Emit batch separator marker (picked up by frontend)
  if (batchIndex > 0) {
    const marker = `\n\n<!-- BATCH_${batchIndex + 1}_OF_${totalBatches} -->\n\n`;
    await writer.write(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: marker } }] })}\n\n`));
  }

  let attempt = 0;
  let lastError = "";

  while (attempt <= BATCH_RETRY_LIMIT) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, BATCH_RETRY_DELAY_MS * attempt));
      console.log(`[batch ${batchIndex + 1}] Retry attempt ${attempt}`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    try {
      const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${openAIKey}`,
        },
        body: JSON.stringify({
          model,
          stream:      true,
          max_tokens:  Math.min(maxTokens, OPENAI_MAX_COMPLETION_TOKENS),
          temperature: TEMPERATURE.research,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user",   content: userContent },
          ],
        }),
      });

      clearTimeout(timeout);

      if (!aiResp.ok) {
        const raw = await aiResp.text().catch(() => "(unreadable)");
        lastError = `HTTP ${aiResp.status}: ${raw.slice(0, 200)}`;
        attempt++;
        continue;
      }

      const reader   = aiResp.body!.getReader();
      const decoder  = new TextDecoder();
      let   fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        await writer.write(encoder.encode(chunk));

        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            const delta  = parsed.choices?.[0]?.delta?.content ?? "";
            fullText += delta;
          } catch { /* skip malformed lines */ }
        }
      }

      return { text: fullText, success: true };

    } catch (e) {
      clearTimeout(timeout);
      lastError = (e as Error).message;
      attempt++;
    }
  }

  // All retries exhausted
  console.error(`[batch ${batchIndex + 1}] All retries failed: ${lastError}`);
  const placeholder = `\n\n> ⚠️ **[Section unavailable — generation failed after ${BATCH_RETRY_LIMIT} retries. Please regenerate.]**\n\n`;
  await writer.write(encoder.encode(
    `data: ${JSON.stringify({ choices: [{ delta: { content: placeholder } }] })}\n\n`
  ));

  return { text: placeholder, success: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Batched research handler (higher + advanced depths)
// ─────────────────────────────────────────────────────────────────────────────

async function handleBatchedResearch(
  openAIKey:      string,
  input:          string,
  depth:          string,
  mindset:        string | undefined,
  citationStyle:  string | null,
  userContent:    string | Array<Record<string, unknown>>,
  model:          string,
  maxTokens:      number,
): Promise<Response> {
  const batches = getBatches(citationStyle, depth);

  const { readable, writable } = new TransformStream<Uint8Array>();
  const writer  = writable.getWriter();
  const encoder = new TextEncoder();

  const f = citationStyle ? CITATION_FORMATS[citationStyle as keyof typeof CITATION_FORMATS] : null;
  const depthSuffix   = depthLine(depth);
  const mindsetSuffix = mindsetLine(mindset);
  const imageSuffix   = `\nIf an image, scanned document, voice transcript, or uploaded file has been provided, analyse it and incorporate its content into the paper.`;
  const citationRules = f
    ? `\nCITATION RULES:\n- In-text citation format: ${f.inText.format} — e.g. ${f.inText.example}\n- Reference section title: ${f.refTitle}\n- Reference entry format: ${f.refExample}\n- Include at least 5 realistic, plausible references.\n`
    : "";
  const styleNote = f
    ? `You are Xplainfy, an academic writing specialist in ${f.fullName} (${citationStyle}).`
    : "You are Xplainfy, a structured research assistant.";
  const pageTarget = PAGE_TARGETS[depth as keyof typeof PAGE_TARGETS];

  (async () => {
    const completedBatches: CompletedBatch[] = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      const contextHeader = buildBatchContextHeader(input, citationStyle, depth, completedBatches);

      // Inject section markers into this batch's instructions
      const instructionsWithMarkers = injectSectionMarkerInstructions(batch.instructions, batch.sections);

      const systemPrompt = `${styleNote}${depthSuffix}${mindsetSuffix}${citationRules}${imageSuffix}

PAGE-COUNT MANDATE: The completed document must be ${pageTarget.min}–${pageTarget.max} pages total. Write extensively.

${contextHeader}${instructionsWithMarkers}`;

      const batchUserContent: string | Array<Record<string, unknown>> =
        i === 0 ? userContent : `Topic: ${input}`;

      const { text, success } = await streamBatch(
        openAIKey,
        model,
        maxTokens,
        systemPrompt,
        batchUserContent,
        writer,
        encoder,
        i,
        batches.length,
        batch.label,
        batch.sections,
      );

      const summary = success
        ? await generateSummary(openAIKey, text, batch.sections)
        : `[Failed — sections not available: ${batch.sections.join(", ")}]`;

      completedBatches.push({
        label:    batch.label,
        sections: batch.sections,
        summary,
      });
    }

    await writer.write(encoder.encode("data: [DONE]\n\n"));
    await writer.close();
  })();

  return new Response(readable, {
    status: 200,
    headers: {
      ...CORS,
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
      "X-Xplainfy-Mode":           "research",
      "X-Xplainfy-Model":          model,
      "X-Xplainfy-MaxTokens":      String(maxTokens),
      "X-Xplainfy-Batched":        "true",
      "X-Xplainfy-BatchCount":     String(batches.length),
      "X-Xplainfy-PageTargetMin":  String(pageTarget.min),
      "X-Xplainfy-PageTargetMax":  String(pageTarget.max),
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Request handler
// ─────────────────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const log = (msg: string, ...args: unknown[]) => console.log(`[${requestId}] ${msg}`, ...args);

  log("Incoming", req.method, new URL(req.url).pathname);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (req.method !== "POST") {
    return errResp("Method not allowed", 405);
  }

  const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_KEY) {
    log("CRITICAL: OPENAI_API_KEY env var missing");
    return errResp("Server misconfiguration: OPENAI_API_KEY not set", 500);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (e) {
    log("Failed to parse body:", (e as Error).message);
    return errResp("Invalid JSON body", 400);
  }

  const {
    input, mode, mindset, depth, citationStyle,
    imageBase64, imageMimeType,
    documentBase64, documentMimeType,
    voiceTranscript,
  } = body as {
    input?: string; mode?: string; mindset?: string; depth?: string; citationStyle?: string;
    imageBase64?: string; imageMimeType?: string;
    documentBase64?: string; documentMimeType?: string;
    voiceTranscript?: string;
  };

  log("mode:", mode, "| input length:", input?.length, "| depth:", depth, "| citationStyle:", citationStyle);

  if (typeof input !== "string" || !input.trim()) return errResp("Missing: input", 400);
  if (!mode)                                       return errResp("Missing: mode", 400);
  if (!VALID_MODES.has(mode))                      return errResp(`Invalid mode: ${mode}`, 400);
  if (input.length > INPUT_MAX_CHARS)              return errResp("Input too long", 400);
  if (depth && !VALID_DEPTHS.has(depth))           return errResp(`Invalid depth: ${depth}`, 400);
  if (mindset && !VALID_MINDSETS.has(mindset))     return errResp(`Invalid mindset: ${mindset}`, 400);

  if (imageBase64 && typeof imageBase64 !== "string")       return errResp("Invalid imageBase64", 400);
  if (imageMimeType && typeof imageMimeType !== "string")   return errResp("Invalid imageMimeType", 400);
  if (imageBase64 && !imageMimeType)                        return errResp("Missing imageMimeType for uploaded image", 400);
  if (imageBase64 && imageMimeType && !imageMimeType.startsWith("image/")) return errResp("Invalid imageMimeType", 400);
  if (documentBase64 && typeof documentBase64 !== "string") return errResp("Invalid documentBase64", 400);
  if (documentMimeType && typeof documentMimeType !== "string") return errResp("Invalid documentMimeType", 400);
  if (documentBase64 && !documentMimeType)                  return errResp("Missing documentMimeType for uploaded document", 400);
  if (voiceTranscript && typeof voiceTranscript !== "string") return errResp("Invalid voiceTranscript", 400);

  const normalizedCitation = (citationStyle as string | undefined)?.toUpperCase() ?? null;
  if (citationStyle && !VALID_CITATIONS.has(normalizedCitation!)) {
    return errResp(`Invalid citationStyle: ${citationStyle}`, 400);
  }

  const model     = getModel(mode);
  const maxTokens = getMaxTokens(mode, depth);

  const userContent = buildUserContent(
    input, imageBase64, imageMimeType, documentBase64, documentMimeType, voiceTranscript,
  );

  // Route to batched handler for higher/advanced research
  if (mode === "research" && depth && BATCHED_DEPTHS.has(depth)) {
    log("Routing to batched research handler | depth:", depth, "| batches:", getBatches(normalizedCitation, depth).length);
    return handleBatchedResearch(
      OPENAI_KEY, input, depth, mindset, normalizedCitation,
      userContent, model, maxTokens,
    );
  }

  // Standard single-shot path
  const systemPrompt = buildSystemPrompt(mode, mindset, depth, normalizedCitation);
  log("Calling OpenAI with model:", model, "| max_tokens:", maxTokens);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  let aiResp: Response;
  try {
    aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model,
        stream:      true,
        max_tokens:  Math.min(maxTokens, OPENAI_MAX_COMPLETION_TOKENS),
        temperature: TEMPERATURE[mode as keyof typeof TEMPERATURE] ?? 0.7,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userContent },
        ],
      }),
    });
    log("OpenAI response received | status:", aiResp.status);
  } catch (e) {
    clearTimeout(timeout);
    if ((e as Error).name === "AbortError") return errResp("Upstream timeout.", 504);
    return errResp(`Network error reaching OpenAI: ${(e as Error).message}`, 502);
  }

  clearTimeout(timeout);

  if (!aiResp.ok) {
    const raw = await aiResp.text().catch(() => "(unreadable)");
    log("OpenAI non-OK response:", aiResp.status, raw.slice(0, 300));
    switch (aiResp.status) {
      case 400: return errResp(`OpenAI bad request: ${raw.slice(0, 200)}`, 400);
      case 401: return errResp("Invalid OpenAI API key.", 401);
      case 403: return errResp("OpenAI access denied.", 403);
      case 429: return errResp("OpenAI rate limit hit — retry in a moment.", 429);
      case 500: return errResp("OpenAI internal error — try again.", 500);
      case 503: return errResp("OpenAI unavailable — try again shortly.", 503);
      default:  return errResp(`OpenAI error ${aiResp.status}: ${raw.slice(0, 200)}`, 502);
    }
  }

  const contentType = aiResp.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    const raw = await aiResp.text().catch(() => "(unreadable)");
    log("ERROR: not an SSE stream. content-type:", contentType);
    return errResp(`OpenAI returned wrong content-type: "${contentType}". Body: ${raw.slice(0, 200)}`, 502);
  }

  log("Piping SSE stream to client");

  return new Response(aiResp.body, {
    status: 200,
    headers: {
      ...CORS,
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
      "X-Xplainfy-Mode":      mode,
      "X-Xplainfy-Model":     model,
      "X-Xplainfy-MaxTokens": String(maxTokens),
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function errResp(message: string, status: number): Response {
  console.error(`[errResp] HTTP ${status}: ${message}`);
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}