import { jsPDF } from 'jspdf';

// Convert LaTeX-like content to plain text with Unicode subscripts/superscripts
export const cleanLaTeXContent = (content: string): string => {
  let cleaned = content;

  // Convert fractions \frac{a}{b} → a/b
  cleaned = cleaned.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1/$2');

  // Remove \text{} but keep content
  cleaned = cleaned.replace(/\\text\{([^}]+)\}/g, '$1');

  // Subscript digit mapping
  const subscriptDigits: Record<string, string> = {
    '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
    '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  };

  // Subscript letter mapping (common in chemistry/math)
  const subscriptLetters: Record<string, string> = {
    'a': 'ₐ', 'e': 'ₑ', 'i': 'ᵢ', 'o': 'ₒ', 'r': 'ᵣ',
    'x': 'ₓ', 'y': 'ᵧ', 'z': '𝑧', 'n': 'ₙ',
  };

  // Subscript mapping combining digits and letters
  const subscriptMap: Record<string, string> = { ...subscriptDigits, ...subscriptLetters };

  // Convert subscript without braces: _4 → ₄, _n → ₙ
  cleaned = cleaned.replace(/_(\w)/g, (_, ch) => subscriptMap[ch] || '_' + ch);

  // Convert subscript with braces: _{4} → ₄, _{n} → ₙ, _{12} → ₁₂
  cleaned = cleaned.replace(/_\{(.+?)\}/g, (_, content) => {
    return content.split('').map(ch => subscriptMap[ch] || ch).join('');
  });

  // Superscript digit mapping
  const superscriptDigits: Record<string, string> = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  };

  // Superscript symbol mapping
  const superscriptSymbols: Record<string, string> = {
    '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
    'n': 'ⁿ', 'i': 'ⁱ', 'x': 'ˣ',
  };

  const superscriptMap: Record<string, string> = { ...superscriptDigits, ...superscriptSymbols };

  // Superscript without braces: ^2 → ²
  cleaned = cleaned.replace(/\^(\w)/g, (_, ch) => superscriptMap[ch] || '^' + ch);
  // Superscript with braces: ^{2} → ²
  cleaned = cleaned.replace(/\^\{(.+?)\}/g, (_, content) => {
    return content.split('').map(ch => superscriptMap[ch] || ch).join('');
  });

  // Map common Greek letter commands to their actual letter names (remove backslash)
  const greekMap: Record<string, string> = {
    'alpha': 'alpha', 'beta': 'beta', 'gamma': 'gamma', 'delta': 'delta',
    'epsilon': 'epsilon', 'zeta': 'zeta', 'eta': 'eta', 'theta': 'theta',
    'iota': 'iota', 'kappa': 'kappa', 'lambda': 'lambda', 'mu': 'mu',
    'nu': 'nu', 'xi': 'xi', 'omicron': 'omicron', 'pi': 'pi', 'rho': 'rho',
    'sigma': 'sigma', 'tau': 'tau', 'upsilon': 'upsilon', 'phi': 'phi',
    'chi': 'chi', 'psi': 'psi', 'omega': 'omega',
    'Gamma': 'Gamma', 'Delta': 'Delta', 'Theta': 'Theta', 'Lambda': 'Lambda',
    'Xi': 'Xi', 'Pi': 'Pi', 'Sigma': 'Sigma', 'Upsilon': 'Upsilon',
    'Phi': 'Phi', 'Psi': 'Psi', 'Omega': 'Omega',
  };

  // Replace \cmd with its mapped value; if unknown, strip backslash
  cleaned = cleaned.replace(/\\([a-zA-Z]+)/g, (_, cmd) => {
    return greekMap[cmd] || cmd;
  });

  // Remove all dollar signs
  cleaned = cleaned.replace(/\$/g, '');

  return cleaned;
};

interface TableData {
  headers: string[];
  rows: string[][];
}

// Parse markdown content and extract tables and text
const parseContent = (content: string): (TextBlock | TableBlock)[] => {
  const blocks: (TextBlock | TableBlock)[] = [];
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip empty lines
    if (!line.trim()) {
      i++;
      continue;
    }

    // Check if this is a table
    if (line.includes('|')) {
      const tableLines: string[] = [];
      let j = i;

      // Collect table lines
      while (j < lines.length && lines[j].includes('|')) {
        tableLines.push(lines[j]);
        j++;
      }

      if (tableLines.length >= 2) {
        const table = parseTable(tableLines);
        if (table && table.rows.length > 0) {
          blocks.push({
            type: 'table',
            data: table,
          });
          i = j;
          continue;
        }
      }
    }

    // It's text - collect paragraph
    const textLines: string[] = [];
    while (i < lines.length && lines[i].trim() && !lines[i].includes('|')) {
      let text = lines[i];
      
      // Clean markdown formatting
      text = text.replace(/^#+\s+/, ''); // Remove headers
      text = text.replace(/\*\*(.+?)\*\*/g, '$1'); // Bold to plain
      text = text.replace(/\*(.+?)\*/g, '$1'); // Italic to plain
      text = text.replace(/`(.+?)`/g, '$1'); // Code to plain
      text = text.replace(/\[(.+?)\]\(.+?\)/g, '$1'); // Links to plain
      
      if (text.trim()) {
        textLines.push(text);
      }
      i++;
    }

    if (textLines.length > 0) {
      blocks.push({
        type: 'text',
        content: textLines.join('\n'),
      });
    }
  }

  return blocks;
};

interface TextBlock {
  type: 'text';
  content: string;
}

interface TableBlock {
  type: 'table';
  data: TableData;
}

// Parse table from markdown lines
const parseTable = (lines: string[]): TableData | null => {
  const rows = lines.map(line => {
    let cleaned = line.trim();
    if (cleaned.startsWith('|')) cleaned = cleaned.slice(1);
    if (cleaned.endsWith('|')) cleaned = cleaned.slice(0, -1);
    return cleaned.split('|').map(c => c.trim());
  });

  if (rows.length < 2) return null;

  // Find separator row
  const headerIdx = 0;
  let separatorIdx = -1;

  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i];
    const isSeparator = cells.every(cell => /^:?-+:?$/.test(cell) || cell === '');
    if (isSeparator) {
      separatorIdx = i;
      break;
    }
  }

  // If no separator, assume first row is header
  if (separatorIdx < 0) {
    separatorIdx = 0;
  }

  const headers = rows[separatorIdx === 0 ? 0 : separatorIdx - 1];
  const bodyRows = rows.slice(separatorIdx + 1).filter(row => row.some(cell => cell));

  return {
    headers: headers.filter(h => h),
    rows: bodyRows.map(row => row.slice(0, headers.length)),
  };
};

interface PdfPracticeQuestion {
  question: string;
  options: string[];
  correct_answer: string;
  explanation?: string;
}

const extractPracticeQuestionsFromText = (text: string): PdfPracticeQuestion[] => {
  try {
    const jsonMatch = text.match(/\{[\s\S]*?"practice_questions"\s*:\s*\[[\s\S]*?\](?:[\s\S]*?)\}/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.practice_questions ?? [];
  } catch {
    return [];
  }
};

const extractPracticeQuestionsFromSteps = (
  steps: Array<{ title: string; content: string }>
): PdfPracticeQuestion[] => {
  return steps.flatMap(step => extractPracticeQuestionsFromText(step.content));
};

// Generate PDF
export const generatePDF = async (
  title: string,
  steps: Array<{ title: string; content: string }>,
  mode: string
): Promise<boolean> => {
  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margins = { top: 15, left: 15, right: 15, bottom: 15 };
    const contentWidth = pageWidth - margins.left - margins.right;

    let currentY = margins.top;

    // Add title
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    const displayTitle = mode === 'tutor' ? 'Tutor Summary' : title;
    doc.text(displayTitle, margins.left, currentY);
    currentY += 15;

    // Add metadata
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    const now = new Date();
    const date = now.toLocaleDateString();
    const time = now.toLocaleTimeString();
    doc.text(`Generated on ${date} at ${time}`, margins.left, currentY);
    currentY += 10;

    const practiceQuestions = extractPracticeQuestionsFromSteps(steps);

    // Add content
    for (const step of steps) {
      const isPracticeStep = /practice_questions|practice questions/i.test(step.title) ||
        step.content.includes('"practice_questions"');
      if (isPracticeStep) continue;

      // Check if we need a new page
      if (currentY > pageHeight - margins.bottom - 20) {
        doc.addPage();
        currentY = margins.top;
      }

      // Add step title
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(step.title, margins.left, currentY);
      currentY += 8;

      // Parse and add content
      const cleanedContent = cleanLaTeXContent(step.content);
      const blocks = parseContent(cleanedContent);

      for (const block of blocks) {
        // Check if we need a new page
        if (currentY > pageHeight - margins.bottom - 15) {
          doc.addPage();
          currentY = margins.top;
        }

        if (block.type === 'text') {
          // Add text
          doc.setFontSize(11);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(0, 0, 0);

          const textLines = (doc as any).splitTextToSize(block.content, contentWidth);
          const textHeight = textLines.length * 5;

          if (currentY + textHeight > pageHeight - margins.bottom) {
            doc.addPage();
            currentY = margins.top;
          }

          doc.text(textLines, margins.left, currentY);
          currentY += textHeight + 5;
        } else if (block.type === 'table' && block.data) {
          // Add table
          const tableData = block.data;

          // Check if table fits on current page
          const estimatedTableHeight = (tableData.rows.length + 1) * 7 + 10;
          if (currentY + estimatedTableHeight > pageHeight - margins.bottom) {
            doc.addPage();
            currentY = margins.top;
          }

          // Fallback: render table as text
          currentY += 5;
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');

          // Headers
          const headerText = tableData.headers.join(' | ');
          doc.text(headerText, margins.left, currentY);
          currentY += 8;

          // Rows
          doc.setFont('helvetica', 'normal');
          for (const row of tableData.rows) {
            if (currentY > pageHeight - margins.bottom - 5) {
              doc.addPage();
              currentY = margins.top;
            }
            const rowText = row.join(' | ');
            doc.text(rowText, margins.left, currentY);
            currentY += 6;
          }
          currentY += 5;
        }
      }

      currentY += 5; // Space between sections
    }

    if (practiceQuestions.length > 0) {
      if (currentY > pageHeight - margins.bottom - 25) {
        doc.addPage();
        currentY = margins.top;
      }

      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('Practice Questions', margins.left, currentY);
      currentY += 10;

      practiceQuestions.forEach((question, index) => {
        if (currentY > pageHeight - margins.bottom - 40) {
          doc.addPage();
          currentY = margins.top;
        }

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        const questionLines = (doc as any).splitTextToSize(
          `${index + 1}. ${question.question}`,
          contentWidth
        );
        doc.text(questionLines, margins.left, currentY);
        currentY += questionLines.length * 5 + 4;

        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        question.options.forEach((option) => {
          if (currentY > pageHeight - margins.bottom - 20) {
            doc.addPage();
            currentY = margins.top;
          }
          const optionLines = (doc as any).splitTextToSize(`- ${option}`, contentWidth - 6);
          doc.text(optionLines, margins.left + 6, currentY);
          currentY += optionLines.length * 5 + 2;
        });

        const answerText = `Answer: ${question.correct_answer}${question.explanation ? ` — ${question.explanation}` : ''}`;
        const answerLines = (doc as any).splitTextToSize(answerText, contentWidth - 6);
        doc.setFont('helvetica', 'italic');
        doc.text(answerLines, margins.left + 6, currentY);
        currentY += answerLines.length * 5 + 10;
      });
    }

    // Add footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(9);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Page ${i} of ${pageCount}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: 'center' } as any
      );
    }

    // Download PDF
    const fileName = `${mode}-${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(fileName);

    return true;
  } catch (error) {
    console.error('PDF generation error:', error);
    return false;
  }
};
