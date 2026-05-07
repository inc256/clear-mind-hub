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

const MAX_TOKENS = {
  problem:   800,
  tutor:    2400,
  research: 3200,
  simplify:  600,
  hints:     400,
  rewrites:  700,
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

const INPUT_MAX_CHARS     = 4000;
const UPSTREAM_TIMEOUT_MS = 25000;

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Fragments
// ─────────────────────────────────────────────────────────────────────────────

const DEPTH_GUIDES = {
  beginner:     `DEPTH: Beginner — write for a curious 12-year-old. Short sentences, plain words, define terms immediately, 5–7 sentence core, one real-world analogy. No equations or jargon.`,
  intermediate: `DEPTH: Intermediate — assume basic familiarity. Use domain vocab with brief first-use clarification, 1–2 worked examples, 10–15 sentences. Simple formulas welcome.`,
  higher:       `DEPTH: Higher — assume solid subject knowledge. Use precise terminology, multi-step worked examples, introduce and explain relevant formulas/equations with derivation context, 15–25 sentences. Address nuance and common misconceptions.`,
  advanced:     `DEPTH: Advanced — expert audience. Precise terminology, rigorous multi-layered reasoning, full equations/derivations/edge-cases where relevant. Be thorough; do not truncate.`,
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
    refExample: '[1] J. Smith, "Title," Journal, vol. 1, no. 1, pp. 1-10, 2023.',
  },
  AMA: {
    fullName:   "American Medical Association Style",
    layout:     { font: "Times New Roman 12pt", spacing: "double-spaced", margins: "1 inch all sides" },
    inText:     { format: "superscript number", example: "Smith1" },
    refTitle:   "References",
    refExample: "1. Smith J. Title. Journal Name. 2023;1(1):1-10.",
  },
};

// ── Research structure definitions per citation style and depth ───────────────

const RESEARCH_STRUCTURES = {
  APA: {
    beginner: {
      label: "Basic APA",
      sections: [
        "Title Page",
        "Introduction",
        "Body Paragraphs",
        "Conclusion",
        "References",
      ],
      instructions: `Write a short academic paper using Basic APA structure:
1. Title Page — include paper title, author name, institution, course, date.
2. Introduction — introduce the topic clearly and state the purpose of the paper.
3. Body Paragraphs — 2-3 focused paragraphs covering the main ideas with simple (Author, Year) in-text citations.
4. Conclusion — summarise key points in 2-3 sentences.
5. References — list all sources in APA format. Minimum 3 references.
Use simple headings, accessible language, and minimal methodology discussion.`,
    },
    intermediate: {
      label: "Intermediate APA",
      sections: [
        "Title Page", "Abstract", "Introduction", "Literature Review",
        "Methodology", "Results", "Discussion", "Conclusion", "References", "Appendices",
      ],
      instructions: `Write a research paper using Intermediate APA structure:
1. Title Page — full APA title page with running head.
2. Abstract — 150-250 word summary of the paper.
3. Introduction — background, significance, and research purpose with citations.
4. Literature Review — review of 4-6 scholarly sources with synthesis.
5. Methodology — describe the research approach (qualitative/quantitative/mixed).
6. Results — present key findings clearly.
7. Discussion — interpret results in context of existing literature.
8. Conclusion — summarise findings and implications.
9. References — full APA reference list. Minimum 5 references.
10. Appendices — include supporting materials if applicable.
Use proper APA Level 1-2 headings, scholarly sources, and data interpretation.`,
    },
    higher: {
      label: "Higher APA",
      sections: [
        "Title Page", "Abstract", "Keywords", "Introduction", "Literature Review",
        "Theoretical Framework", "Research Questions/Hypotheses", "Methodology",
        "Data Analysis", "Results", "Discussion", "Conclusion", "References", "Appendices",
      ],
      instructions: `Write a detailed research paper using Higher APA structure:
1. Title Page — full APA title page with running head and author note.
2. Abstract — 200-300 word structured abstract.
3. Keywords — 4-6 relevant keywords.
4. Introduction — broad-to-narrow funnel, establish significance, end with research question.
5. Literature Review — thematic synthesis of 6-8 scholarly works.
6. Theoretical Framework — identify the theory/model underpinning the study.
7. Research Questions/Hypotheses — state clearly and number them.
8. Methodology — detailed design, participants, instruments, procedures, ethical considerations.
9. Data Analysis — describe analytical strategy with justification.
10. Results — present findings using APA tables/figures conventions.
11. Discussion — interpret findings against literature, note implications.
12. Conclusion — synthesise contributions and suggest future directions.
13. References — minimum 8 references in APA 7th edition format.
14. Appendices — labelled Appendix A, B, etc.
Use APA Level 1-4 headings, formal tone, and proper statistical reporting where relevant.`,
    },
    advanced: {
      label: "Advanced APA",
      sections: [
        "Title Page", "Abstract", "Keywords", "Introduction", "Literature Review",
        "Theoretical Framework", "Research Questions/Hypotheses", "Methodology",
        "Data Analysis", "Results", "Discussion", "Limitations", "Implications",
        "Future Research", "Conclusion", "References", "Appendices",
      ],
      instructions: `Write a publication-quality research paper using Advanced APA structure:
1. Title Page — full APA 7th edition title page.
2. Abstract — 250-300 word structured abstract covering purpose, method, results, conclusions.
3. Keywords — 5-7 precise keywords.
4. Introduction — establish theoretical and empirical context with extensive citations; end with clear research gap and aims.
5. Literature Review — critical synthesis of 10+ sources, organised thematically, identifying gaps.
6. Theoretical Framework — articulate and justify the theoretical lens applied.
7. Research Questions/Hypotheses — formally stated with logical derivation from the literature.
8. Methodology — comprehensive: design rationale, sampling, instruments (with reliability/validity), data collection procedures, ethical approval.
9. Data Analysis — analytical techniques with statistical tools/software cited.
10. Results — comprehensive findings with APA-formatted tables and figures; report effect sizes and confidence intervals.
11. Discussion — deep interpretation, comparison to prior literature, theoretical implications.
12. Limitations — honest discussion of scope and constraints.
13. Implications — practical and theoretical contributions.
14. Future Research — specific, actionable research directions.
15. Conclusion — concise synthesis of the entire paper.
16. References — minimum 12 references, APA 7th edition, DOIs included.
17. Appendices — labelled appendices with supplementary materials.
Maintain formal academic tone, complex argumentation, and statistical rigour throughout.`,
    },
  },

  MLA: {
    beginner: {
      label: "Basic MLA",
      sections: ["Heading", "Title", "Introduction", "Body", "Conclusion", "Works Cited"],
      instructions: `Write an essay using Basic MLA structure:
1. Heading — student name, instructor, course, date (top-left, double-spaced).
2. Title — centred, not bolded or underlined.
3. Introduction — introduce the topic and end with a clear thesis statement.
4. Body — 2-3 paragraphs, each with a topic sentence, evidence with (Author Page) citations, and analysis.
5. Conclusion — restate thesis and summarise main points.
6. Works Cited — MLA format, alphabetical order. Minimum 3 sources.
Use essay-focused writing, textual analysis, Times New Roman 12pt, 1-inch margins, double-spaced.`,
    },
    intermediate: {
      label: "Intermediate MLA",
      sections: [
        "Introduction", "Context/Literature Background", "Main Argument Sections",
        "Comparative Analysis", "Counterarguments", "Conclusion", "Works Cited",
      ],
      instructions: `Write an argumentative research essay using Intermediate MLA structure:
1. Introduction — engaging hook, contextual background, clear argumentative thesis.
2. Context/Literature Background — situate the topic using 3-5 scholarly sources.
3. Main Argument Sections — 3-4 sections, each advancing a distinct claim with evidence and (Author Page) citations.
4. Comparative Analysis — compare perspectives, texts, or approaches with analytical depth.
5. Counterarguments — acknowledge and refute at least 2 opposing views.
6. Conclusion — synthesise arguments and reinforce thesis significance.
7. Works Cited — minimum 6 sources, MLA 9th edition format.
Maintain strong argumentative flow and analytical interpretation throughout.`,
    },
    higher: {
      label: "Higher MLA",
      sections: [
        "Introduction", "Historical/Theoretical Context", "Literature Review",
        "Analytical Framework", "Multi-layer Textual Analysis", "Conclusion", "Works Cited",
      ],
      instructions: `Write a scholarly essay using Higher MLA structure:
1. Introduction — situate the work in its critical conversation; end with a precise, nuanced thesis.
2. Historical/Theoretical Context — ground the argument in relevant history and critical theory (e.g. postcolonialism, feminism, structuralism).
3. Literature Review — review 6-8 scholarly works, identifying dominant interpretations and gaps.
4. Analytical Framework — explicitly state the critical lens and methodology applied.
5. Multi-layer Textual Analysis — close reading of primary sources with layered interpretive claims; integrate secondary sources in dialogue.
6. Conclusion — synthesise analytical findings and articulate contribution to scholarly conversation.
7. Works Cited — minimum 8 sources, MLA 9th edition.
Use precise critical vocabulary, theory integration, and advanced rhetorical analysis.`,
    },
    advanced: {
      label: "Advanced MLA",
      sections: [
        "Introduction", "Historical/Theoretical Context", "Literature Review",
        "Analytical Framework", "Multi-layer Textual Analysis", "Comparative Criticism",
        "Scholarly Debate Section", "Conclusion", "Works Cited", "Notes/Appendices",
      ],
      instructions: `Write a publication-quality critical essay using Advanced MLA structure:
1. Introduction — enter the scholarly debate directly; articulate a sophisticated, contestable thesis.
2. Historical/Theoretical Context — extensive critical and historical grounding with multi-theory engagement.
3. Literature Review — critical evaluation of 10+ sources; map the scholarly conversation, highlighting tensions and gaps.
4. Analytical Framework — justify the theoretical methodology with reference to its proponents and limitations.
5. Multi-layer Textual Analysis — sustained close reading with intertextual and contextual layers; every interpretive move supported.
6. Comparative Criticism — compare with related texts, authors, or critical traditions, noting divergences.
7. Scholarly Debate Section — engage directly with opposing critical positions and articulate why your reading advances the field.
8. Conclusion — bold synthesis that extends beyond summary to propose new critical directions.
9. Works Cited — minimum 12 sources, MLA 9th edition.
10. Notes/Appendices — endnotes for tangential arguments; appendices for supplementary textual material.
Demonstrate deep literary criticism, advanced rhetorical analysis, and original scholarly contribution.`,
    },
  },

  IEEE: {
    beginner: {
      label: "Basic IEEE",
      sections: [
        "Title", "Abstract", "Introduction", "Problem Statement",
        "Proposed Solution", "Conclusion", "References",
      ],
      instructions: `Write a technical report using Basic IEEE structure:
1. Title — concise and descriptive technical title.
2. Abstract — 100-150 word summary: problem, approach, key result.
3. Introduction — define the problem domain, motivation, and paper objective.
4. Problem Statement — clearly articulate the technical problem being addressed.
5. Proposed Solution — describe the approach, system, or method with simple diagrams or tables if helpful.
6. Conclusion — summarise what was achieved and its significance.
7. References — numbered IEEE format [1], [2], etc. Minimum 3 references.
Use technical writing basics, numbered in-text citations, and clear simple diagrams.`,
    },
    intermediate: {
      label: "Intermediate IEEE",
      sections: [
        "Title", "Abstract", "Keywords", "Introduction", "Related Work",
        "System Design", "Methodology", "Implementation", "Testing & Results",
        "Discussion", "Conclusion", "References",
      ],
      instructions: `Write a technical research paper using Intermediate IEEE structure:
1. Title — precise technical title reflecting the system or method.
2. Abstract — 150-200 words: context, problem, method, key results.
3. Keywords — 4-6 technical keywords.
4. Introduction — background, motivation, research gap, paper contributions, and outline.
5. Related Work — survey 4-6 related works; compare approaches and identify gaps.
6. System Design — high-level architecture with block diagrams or flowcharts.
7. Methodology — detailed technical approach: algorithms, protocols, models.
8. Implementation — tools, frameworks, languages, hardware used.
9. Testing & Results — test cases, performance metrics, result tables/figures.
10. Discussion — interpret results, compare to related work, address limitations.
11. Conclusion — summarise contributions and outline future work.
12. References — minimum 6 IEEE-format references.
Include architecture diagrams, comparative evaluation, and technical validation.`,
    },
    higher: {
      label: "Higher IEEE",
      sections: [
        "Title", "Abstract", "Keywords", "Introduction", "Problem Definition",
        "Related Work", "Research Gap", "System Architecture",
        "Mathematical/Algorithmic Model", "Experimental Setup", "Results & Benchmarking",
        "Discussion", "Conclusion", "References", "Appendices",
      ],
      instructions: `Write an advanced technical paper using Higher IEEE structure:
1. Title — publication-style technical title.
2. Abstract — 200-250 words: motivation, problem, proposed method, key results, significance.
3. Keywords — 5-7 precise technical keywords.
4. Introduction — deep motivation, enumerate contributions, structured paper outline.
5. Problem Definition — formal definition with mathematical notation where applicable.
6. Related Work — critical review of 6-8 works; categorise by approach and identify unresolved challenges.
7. Research Gap — explicitly state what existing work does not address and how this paper fills it.
8. System Architecture — detailed architecture with labelled diagrams; justify design choices.
9. Mathematical/Algorithmic Model — formal model with equations, pseudocode, or proofs.
10. Experimental Setup — dataset, environment, baseline models, hyperparameters, evaluation metrics.
11. Results & Benchmarking — tables and figures comparing performance against baselines; statistical significance noted.
12. Discussion — interpret results, analyse failure cases, discuss trade-offs and scalability.
13. Conclusion — summarise contributions, limitations, and concrete future directions.
14. References — minimum 10 IEEE-format references.
15. Appendices — proofs, additional experiments, or extended algorithm listings.`,
    },
    advanced: {
      label: "Advanced IEEE",
      sections: [
        "Title", "Abstract", "Keywords", "Introduction", "Problem Definition",
        "Related Work", "Research Gap", "System Architecture",
        "Mathematical/Algorithmic Model", "Experimental Setup", "Dataset Description",
        "Performance Metrics", "Results & Benchmarking", "Discussion", "Limitations",
        "Future Improvements", "Conclusion", "References", "Appendices",
      ],
      instructions: `Write a conference/journal-quality paper using Advanced IEEE structure:
1. Title — precise, publication-ready technical title.
2. Abstract — 250-300 words: problem significance, novelty of approach, experimental results, impact.
3. Keywords — 6-8 precise technical keywords for indexing.
4. Introduction — comprehensive motivation, clearly enumerated contributions, paper organisation.
5. Problem Definition — formal mathematical problem statement with notation, assumptions, and constraints.
6. Related Work — critical literature review of 8-12 works, categorised by method family; highlight gaps.
7. Research Gap — explicit, evidence-backed statement of what this work uniquely addresses.
8. System Architecture — complete architecture with labelled multi-level diagrams; justify every design decision.
9. Mathematical/Algorithmic Model — rigorous formal model: equations, algorithm pseudocode, complexity analysis, proofs.
10. Experimental Setup — full reproducibility details: datasets, splits, hardware, software, baselines, hyperparameter tuning.
11. Dataset Description — size, source, preprocessing pipeline, class distribution, licensing.
12. Performance Metrics — define all metrics (accuracy, F1, AUC, latency, etc.) with mathematical definitions.
13. Results & Benchmarking — comprehensive tables and figures; ablation studies; statistical significance tests.
14. Discussion — deep analysis of results, comparison against state-of-the-art, failure mode analysis, computational cost.
15. Limitations — candid discussion of scope, generalisability, and threats to validity.
16. Future Improvements — specific, technically grounded future research directions.
17. Conclusion — crisp synthesis of contributions and impact.
18. References — minimum 15 IEEE-format references with DOIs.
19. Appendices — supplementary proofs, datasets, code snippets, extended results.
Maintain formal scientific rigour, benchmark comparisons, statistical evaluation, and reproducibility focus throughout.`,
    },
  },

  AMA: {
    beginner: {
      label: "Basic AMA",
      sections: [
        "Title", "Abstract", "Introduction", "Case/Study Description", "Discussion",
        "Conclusion", "References",
      ],
      instructions: `Write a clinical paper using Basic AMA structure:
1. Title — clear clinical title.
2. Abstract — 100-150 word unstructured abstract summarising the case/study.
3. Introduction — introduce the clinical problem and its significance.
4. Case/Study Description — describe the patient case or study clearly and chronologically.
5. Discussion — explain clinical findings and their implications using medical evidence.
6. Conclusion — summarise clinical lessons and recommendations.
7. References — superscript numbered AMA format. Minimum 3 references.
Use standard medical terminology appropriate to the audience depth level.`,
    },
    intermediate: {
      label: "Intermediate AMA",
      sections: [
        "Title", "Structured Abstract", "Introduction", "Background",
        "Methods", "Results", "Clinical Discussion", "Conclusion", "References",
      ],
      instructions: `Write a clinical research paper using Intermediate AMA structure:
1. Title — descriptive clinical/research title.
2. Structured Abstract — 200-250 words with labelled sections: Importance, Objective, Design, Setting/Participants, Interventions, Main Outcomes and Measures, Results, Conclusions.
3. Introduction — clinical context, unmet need, study objective.
4. Background — review of 4-6 relevant clinical studies; situate the current work.
5. Methods — study design, patient selection criteria, interventions, outcome measures, statistical approach.
6. Results — key findings with clinical statistics; tables/figures formatted per AMA guidelines.
7. Clinical Discussion — interpret results against existing evidence; address clinical significance.
8. Conclusion — clinical implications and recommended next steps.
9. References — minimum 6 AMA superscript-numbered references.
Use structured abstract format, proper clinical terminology, and evidence-based reasoning.`,
    },
    higher: {
      label: "Higher AMA",
      sections: [
        "Title", "Structured Abstract", "Introduction", "Literature Review",
        "Study Design", "Methods", "Results", "Clinical Interpretation",
        "Ethical Considerations", "Conclusion", "References",
      ],
      instructions: `Write an advanced clinical paper using Higher AMA structure:
1. Title — publication-style clinical research title.
2. Structured Abstract — 250-300 words: Importance, Objective, Design, Setting, Participants, Exposures/Interventions, Main Outcomes, Results, Conclusions and Relevance.
3. Introduction — comprehensive clinical background, knowledge gap, and specific aims.
4. Literature Review — critical synthesis of 6-8 clinical studies; identify inconsistencies and gaps in evidence.
5. Study Design — justify design choice (RCT, cohort, case-control, meta-analysis); CONSORT/PRISMA flow where applicable.
6. Methods — complete: patient/data selection, inclusion/exclusion criteria, interventions, blinding, outcome measures, statistical analysis plan.
7. Results — comprehensive findings: primary and secondary outcomes, subgroup analyses, adverse events; AMA-formatted tables.
8. Clinical Interpretation — evidence-based interpretation with reference to clinical guidelines and prior trials.
9. Ethical Considerations — IRB/ethics committee approval, informed consent, data privacy, conflict of interest.
10. Conclusion — evidence synthesis and evidence-graded clinical recommendations.
11. References — minimum 10 AMA-format references with DOIs.`,
    },
    advanced: {
      label: "Advanced AMA",
      sections: [
        "Title", "Structured Abstract", "Introduction", "Literature Review",
        "Study Design", "Patient/Data Selection", "Statistical Analysis", "Results",
        "Clinical Interpretation", "Ethical Considerations", "Limitations",
        "Recommendations", "Conclusion", "References", "Supplementary Materials",
      ],
      instructions: `Write a journal-quality clinical research paper using Advanced AMA structure:
1. Title — precise, journal-ready clinical research title.
2. Structured Abstract — 300 words max: Importance, Objective, Design, Setting, Participants, Exposures/Interventions, Main Outcomes and Measures, Results, Conclusions and Relevance.
3. Introduction — clinical and epidemiological context, critical evidence gap, specific research aims.
4. Literature Review — comprehensive critical appraisal of 10+ studies; meta-analytic context where available; identify conflicting evidence.
5. Study Design — rigorous design justification; CONSORT, STROBE, or PRISMA compliance stated explicitly.
6. Patient/Data Selection — detailed eligibility criteria, recruitment strategy, sample size justification (power calculation), screening and enrolment flow.
7. Statistical Analysis — all statistical tests defined; primary and secondary endpoints pre-specified; sensitivity analyses described; software and version cited.
8. Results — primary and secondary outcomes with effect sizes, 95% CIs, and p-values; subgroup and sensitivity analysis results; CONSORT/STROBE flow diagram.
9. Clinical Interpretation — deep evidence-based interpretation; comparison to landmark trials and meta-analyses; mechanism discussion.
10. Ethical Considerations — IRB protocol number, informed consent procedures, data security, HIPAA/GDPR compliance, author conflicts of interest.
11. Limitations — threats to internal and external validity; selection bias, confounding, missing data handling.
12. Recommendations — GRADE-evidence-level-graded clinical practice recommendations.
13. Conclusion — definitive summary of clinical contribution and impact on practice/guidelines.
14. References — minimum 15 AMA-format references; DOIs included.
15. Supplementary Materials — extended tables, protocol documents, statistical code, data availability statement.
Maintain formal scientific and clinical rigour, statistical precision, and ethical transparency throughout.`,
    },
  },
};

// ── Generic (no citation style) research structures ───────────────────────────

const GENERIC_RESEARCH_STRUCTURES = {
  beginner: `You are Xplainfy, a structured research assistant writing at BEGINNER level.

Write a clear, accessible research response with the following sections:

## Summary
2-3 sentences giving a direct answer.

## Key Points
3-4 bullet points covering the most important facts.

## Explanation
2-3 short paragraphs with plain language and real-world examples.

## Conclusion
1-2 sentences wrapping up the key takeaway.`,

  intermediate: `You are Xplainfy, a structured research assistant writing at INTERMEDIATE level.

## Executive Summary
2-3 sentences.

## Key Points
4-6 bullet points.

## Deep Dive
3-5 sub-sections with analytical detail and referenced examples.

## Competing Views & Limitations
1-3 counterarguments or limitations of current knowledge.

## Summary
3-5 sentences.

## Suggested Next Steps
3-5 actionable recommendations.`,

  higher: `You are Xplainfy, a structured research assistant writing at HIGHER level.

## Executive Summary
3-4 precise sentences including scope and significance.

## Key Points
5-7 bullet points with brief justification for each.

## Background & Context
Situate the topic within its broader field or discipline.

## Deep Dive
4-6 thematic sub-sections with in-depth analysis, relevant data or figures noted where applicable.

## Competing Views, Debates & Limitations
2-4 substantive counterarguments or knowledge gaps, explained with nuance.

## Synthesis
Integrate the key threads into a coherent analytical narrative (3-5 sentences).

## Implications & Applications
Practical or theoretical implications of the findings.

## Suggested Next Steps
4-6 specific, actionable research or study recommendations.`,

  advanced: `You are Xplainfy, a structured research assistant writing at ADVANCED level.

## Executive Summary
4-5 sentences covering scope, methodology, key findings, and significance.

## Key Points
6-8 substantive bullet points with critical nuance.

## Background & Theoretical Context
Comprehensive contextualisation within the discipline; identify dominant frameworks.

## Deep Dive
5-7 rigorous thematic sub-sections: mechanisms, evidence, models, quantitative data.

## Competing Views, Scholarly Debates & Limitations
3-5 well-developed counterarguments with engagement of conflicting evidence.

## Critical Synthesis
Integrate all threads with original analytical commentary (4-6 sentences).

## Implications
Theoretical, practical, policy, or clinical implications as appropriate.

## Future Research Directions
4-6 specific, evidence-grounded research questions or directions.

## Suggested Next Steps
5-7 concrete, prioritised recommendations.`,
};

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
  return `You are Xplainfy, a precise problem-solving assistant.

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

function buildTutorPrompt(mindset, depth) {
  const formulaInstruction = (depth === "higher" || depth === "advanced")
    ? `\nFORMULAS: This is a ${depth}-level response. If the topic involves any mathematical, scientific, or technical formulas, equations, or derivations, you MUST include them with full explanation. Show step-by-step working where applicable. Do not omit formulas for brevity.`
    : `\nFORMULAS: If the question involves or would benefit from formulas, equations, or calculations, include them clearly with explanation. Do not skip relevant formulas.`;

  return `You are Xplainfy, an expert adaptive tutor.${depthLine(depth)}${mindsetLine(mindset)}${formulaInstruction}

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
{"practice_questions":[{"question":"...","options":["A) ...","B) ...","C) ...","D) ..."],"correct_answer":"A) ..."},{"question":"...","options":["A) ...","B) ...","C) ...","D) ..."],"correct_answer":"B) ..."},{"question":"...","options":["A) ...","B) ...","C) ...","D) ..."],"correct_answer":"C) ..."}]}

Rules for the JSON:
- options must always start with the letter prefix: "A) ", "B) ", "C) ", "D) "
- correct_answer must exactly match one of the options including the letter prefix
- output the JSON as the very last thing, nothing after it`;
}

function buildResearchPrompt(mindset, depth) {
  const base = GENERIC_RESEARCH_STRUCTURES[depth] ?? GENERIC_RESEARCH_STRUCTURES["intermediate"];
  const mindsetSuffix = mindset && MINDSET_GUIDES[mindset] ? `\nLens: ${MINDSET_GUIDES[mindset]}` : "";
  return `${base}${mindsetSuffix}`;
}

function buildCitationResearchPrompt(style, mindset, depth) {
  const f  = CITATION_FORMATS[style];
  const structures = RESEARCH_STRUCTURES[style];
  const normalizedDepth = depth && structures[depth] ? depth : "intermediate";
  const struct = structures[normalizedDepth];

  const mindsetSuffix = mindset && MINDSET_GUIDES[mindset]
    ? `\nAudience Lens: ${MINDSET_GUIDES[mindset]}`
    : "";

  const depthSuffix = depth && DEPTH_GUIDES[depth]
    ? `\n${DEPTH_GUIDES[depth]}`
    : "";

  return `You are Xplainfy, an academic writing specialist in ${f.fullName} (${style}) at ${struct.label} level.${depthSuffix}${mindsetSuffix}

CITATION RULES:
- In-text citation format: ${f.inText.format} — e.g. ${f.inText.example}
- Reference section title: ${f.refTitle}
- Reference entry format: ${f.refExample}
- Include at least 5 realistic, plausible references.

PAPER STRUCTURE — follow every step below precisely:

${struct.instructions}

Important: Produce a complete, well-written paper following all the steps above. Use correct ${style} heading levels, citation format, and reference format throughout.`;
}

function buildSimplifyPrompt() {
  return `You are Xplainfy, a simplification assistant.

## Simplified Problem
Restate clearly.

## Key Components
Main elements needed.

## Approach
Straightforward strategy.`;
}

function buildHintsPrompt() {
  return `You are Xplainfy, a hints assistant.

## Hint 1
First key concept.

## Hint 2
Builds on Hint 1.

## Hint 3
Connects the concepts.`;
}

function buildRewritesPrompt() {
  return `You are Xplainfy, a rewriting assistant.

## Rewritten Content
Improved version.

## Improvements Made
What changed and why.`;
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
    default:         return "You are a helpful assistant.";
  }
}

function getModel(mode) {
  return ["problem", "tutor", "research"].includes(mode) ? MODELS.standard : MODELS.fast;
}

// ─────────────────────────────────────────────────────────────────────────────
// Request Handler
// ─────────────────────────────────────────────────────────────────────────────

serve(async (req) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const log = (msg, ...args) => console.log(`[${requestId}] ${msg}`, ...args);

  log("Incoming", req.method, new URL(req.url).pathname);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (req.method !== "POST") {
    return errResp("Method not allowed", 405);
  }

  // ── API key check ──────────────────────────────────────────────────────
  const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_KEY) {
    log("CRITICAL: OPENAI_API_KEY env var missing");
    return errResp("Server misconfiguration: OPENAI_API_KEY not set", 500);
  }
  log("API key present, starts with:", OPENAI_KEY.slice(0, 7));

  // ── Parse body ─────────────────────────────────────────────────────────
  let body;
  try {
    body = await req.json();
  } catch (e) {
    log("Failed to parse body:", e.message);
    return errResp("Invalid JSON body", 400);
  }

  const { input, mode, mindset, depth, citationStyle, imageBase64, imageMimeType } = body;
  log(
    "mode:", mode,
    "| input length:", input?.length,
    "| mindset:", mindset,
    "| depth:", depth,
    "| image:", imageBase64 ? imageMimeType : "none"
  );

  // ── Validate ───────────────────────────────────────────────────────────
  if (typeof input !== "string" || !input.trim()) return errResp("Missing: input", 400);
  if (!mode)                                       return errResp("Missing: mode", 400);
  if (!VALID_MODES.has(mode))                      return errResp(`Invalid mode: ${mode}`, 400);
  if (input.length > INPUT_MAX_CHARS)              return errResp("Input too long", 400);
  if (depth && !VALID_DEPTHS.has(depth))           return errResp(`Invalid depth: ${depth}`, 400);
  if (mindset && !VALID_MINDSETS.has(mindset))     return errResp(`Invalid mindset: ${mindset}`, 400);
  if (imageBase64 && typeof imageBase64 !== "string") return errResp("Invalid imageBase64", 400);
  if (imageMimeType && typeof imageMimeType !== "string") return errResp("Invalid imageMimeType", 400);
  if (imageBase64 && !imageMimeType) return errResp("Missing imageMimeType for uploaded image", 400);
  if (imageBase64 && imageMimeType && !imageMimeType.startsWith("image/")) return errResp("Invalid imageMimeType", 400);

  const normalizedCitation = citationStyle?.toUpperCase?.() ?? null;
  if (citationStyle && !VALID_CITATIONS.has(normalizedCitation)) {
    return errResp(`Invalid citationStyle: ${citationStyle}`, 400);
  }

  const systemPrompt = buildSystemPrompt(mode, mindset, depth, normalizedCitation);
  const model        = getModel(mode);
  log("Calling OpenAI with model:", model);

  // ── OpenAI request ─────────────────────────────────────────────────────
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    log("TIMEOUT fired after", UPSTREAM_TIMEOUT_MS, "ms — aborting");
    controller.abort();
  }, UPSTREAM_TIMEOUT_MS);

  let aiResp;
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
        max_tokens:  MAX_TOKENS[mode] ?? 1000,
        temperature: TEMPERATURE[mode] ?? 0.7,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: imageBase64
              ? [
                  { type: "input_text", text: input.trim() },
                  { type: "input_image", image_url: `data:${imageMimeType};base64,${imageBase64}` },
                ]
              : input.trim(),
          },
        ],
      }),
    });
    log("OpenAI response received | status:", aiResp.status, "| content-type:", aiResp.headers.get("content-type"));
  } catch (e) {
    clearTimeout(timeout);
    log("Fetch error:", e.name, e.message);
    if (e.name === "AbortError") return errResp("Upstream timeout — OpenAI did not respond in time.", 504);
    return errResp(`Network error reaching OpenAI: ${e.message}`, 502);
  }

  clearTimeout(timeout);

  // ── HTTP error from OpenAI ─────────────────────────────────────────────
  if (!aiResp.ok) {
    const raw = await aiResp.text().catch(() => "(unreadable)");
    log("OpenAI non-OK response:", aiResp.status, raw.slice(0, 300));
    switch (aiResp.status) {
      case 400: return errResp(`OpenAI bad request: ${raw.slice(0, 200)}`, 400);
      case 401: return errResp("Invalid OpenAI API key. Check OPENAI_API_KEY secret.", 401);
      case 403: return errResp("OpenAI access denied.", 403);
      case 429: return errResp("OpenAI rate limit hit — retry in a moment.", 429);
      case 500: return errResp("OpenAI internal error — try again.", 500);
      case 503: return errResp("OpenAI unavailable — try again shortly.", 503);
      default:  return errResp(`OpenAI error ${aiResp.status}: ${raw.slice(0, 200)}`, 502);
    }
  }

  // ── Content-type guard — catches silent JSON errors returned as 200 ────
  const contentType = aiResp.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    const raw = await aiResp.text().catch(() => "(unreadable)");
    log("ERROR: not an SSE stream. content-type:", contentType, "| body:", raw.slice(0, 300));
    return errResp(
      `OpenAI returned wrong content-type: "${contentType}". Body: ${raw.slice(0, 200)}`,
      502
    );
  }

  log("Piping SSE stream to client");

  return new Response(aiResp.body, {
    status: 200,
    headers: {
      ...CORS,
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
      "X-Xplainfy-Mode":  mode,
      "X-Xplainfy-Model": model,
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function errResp(message, status) {
  console.error(`[errResp] HTTP ${status}: ${message}`);
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}