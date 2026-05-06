// ─────────────────────────────────────────────────────────────────────────────
// src/services/ai/citationFormats.ts
// Typed citation format definitions — single source of truth
// ─────────────────────────────────────────────────────────────────────────────

export interface CitationFormat {
  name: string;
  fullName: string;
  layout: {
    font: string;
    spacing: string;
    margins: string;
    alignment?: string;
  };
  titlePage?: {
    required: boolean;
    fields: string[];
  };
  titleSection?: {
    fields: string[];
  };
  firstPage?: {
    titlePageRequired?: boolean;
    topLeft?: string[];
    centeredTitle?: string;
  };
  structure?: {
    abstract?: string | { optional: boolean; length?: string };
    sections: string[];
  };
  bodyStructure?: {
    introduction: string[];
    bodyParagraphs: string[];
    conclusion: string[];
  };
  inTextCitation: {
    format: string;
    example: string;
  };
  referenceSection: {
    title: string;
    example: string;
  };
}

export const CITATION_FORMATS: CitationFormat[] = [
  {
    name: "MLA",
    fullName: "Modern Language Association Style",
    layout: {
      font: "Times New Roman, 12pt",
      spacing: "Double-spaced throughout",
      margins: "1 inch on all sides",
      alignment: "Left-aligned (do not justify)",
    },
    firstPage: {
      titlePageRequired: false,
      topLeft: ["Student Full Name", "Instructor Name", "Course Name & Number", "Day Month Year"],
      centeredTitle: "Title in Title Case (no bold, no underline)",
    },
    bodyStructure: {
      introduction: ["Contextual background", "Clear thesis statement as final sentence"],
      bodyParagraphs: [
        "Topic sentence stating the paragraph's claim",
        "Evidence with in-text citation: (Author Page)",
        "Analysis connecting evidence to thesis",
      ],
      conclusion: ["Restate thesis in new words", "Broader significance or call to reflection"],
    },
    inTextCitation: { format: "(Author Page)", example: "(Smith 45)" },
    referenceSection: {
      title: "Works Cited",
      example: "Smith, John. *The Title of the Book*. Publisher Name, 2022.",
    },
  },
  {
    name: "APA",
    fullName: "American Psychological Association Style (7th Edition)",
    layout: {
      font: "Times New Roman 12pt or Calibri 11pt",
      spacing: "Double-spaced throughout",
      margins: "1 inch on all sides",
    },
    titlePage: {
      required: true,
      fields: [
        "Title of Paper (bold, centered)",
        "Author Full Name",
        "Institutional Affiliation",
        "Course Name and Number",
        "Instructor Name",
        "Assignment Due Date",
      ],
    },
    structure: {
      abstract: { optional: true, length: "150–250 words, single paragraph, no indent" },
      sections: [
        "Introduction — State the problem, purpose, and research question",
        "Method — Describe data collection or research approach (if applicable)",
        "Results — Present findings objectively",
        "Discussion — Interpret findings, relate to prior research",
        "Conclusion — Summarise implications and future directions",
      ],
    },
    inTextCitation: { format: "(Author, Year)", example: "(Smith, 2021)" },
    referenceSection: {
      title: "References",
      example: "Smith, J. A. (2021). *Title of the book*. Publisher.",
    },
  },
  {
    name: "IEEE",
    fullName: "Institute of Electrical and Electronics Engineers Style",
    layout: {
      font: "Times New Roman 10pt (two-column layout standard)",
      spacing: "Single-spaced",
      margins: "1 inch",
    },
    titleSection: {
      fields: [
        "Paper Title (large, centered)",
        "Author Name(s) and Affiliation(s)",
        "Abstract (150–250 words)",
        "Index Terms (keywords)",
      ],
    },
    structure: {
      abstract: "Required — concise summary, 150–250 words, no citations inside abstract",
      sections: [
        "I. Introduction — Motivation and scope",
        "II. Related Work / Literature Review",
        "III. Methodology / System Design",
        "IV. Results and Evaluation",
        "V. Discussion",
        "VI. Conclusion and Future Work",
      ],
    },
    inTextCitation: { format: "Bracketed number [N]", example: "[1], [2], [1]–[3]" },
    referenceSection: {
      title: "References",
      example: "[1] J. Smith, *Title of Book*. City, Country: Publisher, 2020, pp. 10–25.",
    },
  },
  {
    name: "AMA",
    fullName: "American Medical Association Style (11th Edition)",
    layout: {
      font: "Times New Roman 12pt",
      spacing: "Double-spaced",
      margins: "1 inch",
    },
    titlePage: {
      required: true,
      fields: [
        "Full Title of Manuscript",
        "Author Full Name(s)",
        "Institutional Affiliation and Department",
        "Corresponding Author Contact Details",
        "Submission Date",
      ],
    },
    structure: {
      sections: [
        "Abstract — Structured: Background, Objective, Methods, Results, Conclusions",
        "Introduction — Clinical or research context and objective",
        "Methods — Study design, population, data analysis",
        "Results — Data presented with tables/figures",
        "Discussion — Interpretation and limitations",
        "Conclusion — Clinical implications",
      ],
    },
    inTextCitation: {
      format: "Superscript consecutive numbers",
      example: "as previously reported¹ or in recent studies²,³",
    },
    referenceSection: {
      title: "References",
      example: "1. Smith J, Doe A. Article title. *Journal Name*. 2021;14(3):100-115. doi:10.xxxx/xxxx",
    },
  },
  {
    name: "Chicago",
    fullName: "Chicago Manual of Style (17th Edition, Notes-Bibliography)",
    layout: {
      font: "Times New Roman 12pt",
      spacing: "Double-spaced body; single-spaced footnotes",
      margins: "1 inch",
      alignment: "Left-aligned",
    },
    titlePage: {
      required: true,
      fields: [
        "Title (centered, one-third down page)",
        "Author Name (centered below title)",
        "Course / Institutional Details",
        "Date",
      ],
    },
    structure: {
      sections: [
        "Introduction — Thesis and scope",
        "Body Chapters — Argument with footnote citations",
        "Conclusion — Synthesis",
        "Bibliography — Full source list",
      ],
    },
    inTextCitation: {
      format: "Footnote superscript + Bibliography",
      example: "¹ John Smith, *Book Title* (Publisher, 2020), 45.",
    },
    referenceSection: {
      title: "Bibliography",
      example: "Smith, John. *Title of Book*. City: Publisher, 2020.",
    },
  },
  {
    name: "Harvard",
    fullName: "Harvard Referencing Style",
    layout: {
      font: "Times New Roman 12pt or Arial 11pt",
      spacing: "Double-spaced",
      margins: "1 inch",
    },
    structure: {
      sections: [
        "Introduction — Context and aim",
        "Literature Review — Critical summary of sources",
        "Methodology (if applicable)",
        "Findings / Analysis",
        "Conclusion",
        "Reference List",
      ],
    },
    inTextCitation: {
      format: "(Author Year) or Author (Year)",
      example: "(Smith 2020) or Smith (2020) argues that…",
    },
    referenceSection: {
      title: "Reference List",
      example: "Smith, J. (2020) *Title of Book*. City: Publisher.",
    },
  },
];

/**
 * Safely retrieve a citation format by its short name (e.g. "APA", "MLA").
 * Returns undefined when the name is not found.
 */
export function getCitationFormat(name: string): CitationFormat | undefined {
  return CITATION_FORMATS.find((f) => f.name.toUpperCase() === name.toUpperCase());
}
