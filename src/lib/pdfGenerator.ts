import { jsPDF } from 'jspdf';

// Convert LaTeX-like content to plain text with Unicode subscripts/superscripts
export const cleanLaTeXContent = (content: string): string => {
  let cleaned = content;

  // Remove unnecessary characters: / , , ] , [
  cleaned = cleaned.replace(/[\/,\[\]]/g, '');

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

// Process content for display (removes empty sections, cleans LaTeX, etc.)
export const processContentForDisplay = (content: string): string => {
  let processed = cleanLaTeXContent(content);
  processed = removeEmptyFormulasSection(processed);
  return processed;
};

// Remove marker comments from research PDF content
export const removeMarkerComments = (content: string): string => {
  // Remove all SECTION_START and SECTION_END markers
  let cleaned = content.replace(/<!--\s*SECTION_(START|END):[^>]+-->/g, '');
  // Also remove any HTML-style comments that might contain markers
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
  return cleaned;
};

interface TableData {
  headers: string[];
  rows: string[][];
}

const stripMarkdownSeparators = (line: string) => {
  const trimmed = line.trim();
  return trimmed === '---' || trimmed === '***' || trimmed === '___';
};

const removeEmptyFormulasSection = (content: string): string => {
  return content.replace(/(^|\n)#+\s*Formulas\s*&\s*Equations\s*\n([\s\S]*?)(?=(\n#+\s|$))/g, (match, prefix, sectionBody) => {
    const body = sectionBody.trim();
    const hasFormula = /\\frac|\\sqrt|\\\[|\\\]|\$|\^|_|=/.test(body) && !/This topic doesn’t have any formulas or equations\./i.test(body);
    return hasFormula ? match : prefix;
  });
};

// Parse markdown content and extract tables and text
const parseContent = (content: string): (TextBlock | TableBlock)[] => {
  const blocks: (TextBlock | TableBlock)[] = [];
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip empty lines or markdown separators
    if (!line.trim() || stripMarkdownSeparators(line)) {
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

// Helper function to add text with 2pt line spacing (12pt font + 2pt = 14pt total)
const addTextWithSpacing = (
  doc: jsPDF, 
  text: string, 
  x: number, 
  y: number, 
  maxWidth: number,
  fontSize: number = 12
): number => {
  doc.setFontSize(fontSize);
  doc.setFont('times', 'normal');
  
  // Line height: 12pt font + 2pt spacing = 14pt total = 4.94mm
  // Formula: (fontSize + 2) * 0.352778 = mm
  const lineHeightMm = (fontSize + 2) * 0.352778;
  
  // Split text into lines
  const lines = (doc as any).splitTextToSize(text, maxWidth);
  
  // Add each line with 2pt spacing
  lines.forEach((line: string, index: number) => {
    const currentY = y + (index * lineHeightMm);
    if (currentY < doc.internal.pageSize.getHeight() - 15) {
      doc.text(line, x, currentY);
    }
  });
  
  return lines.length * lineHeightMm;
};

// Helper function to add paragraph with indent (0.5 inch = 12.7 mm)
const addParagraph = (
  doc: jsPDF, 
  text: string, 
  x: number, 
  y: number, 
  maxWidth: number,
  indent: boolean = true
): number => {
  const indentAmount = indent ? 12.7 : 0; // 0.5 inch in mm
  const textX = x + indentAmount;
  const actualMaxWidth = maxWidth - indentAmount;
  
  return addTextWithSpacing(doc, text, textX, y, actualMaxWidth, 12);
};

// Generate PDF with all specifications
export const generatePDF = async (
  title: string,
  steps: Array<{ title: string; content: string }>,
  mode: string
): Promise<boolean> => {
  try {
    // Create PDF with A4 format
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    // Convert 1 inch to mm (25.4 mm)
    const marginInch = 25.4;
    
    const pageWidth = doc.internal.pageSize.getWidth(); // 210 mm for A4
    const pageHeight = doc.internal.pageSize.getHeight(); // 297 mm for A4
    const margins = { 
      top: marginInch,      // 1 inch top margin
      left: marginInch,     // 1 inch left margin
      right: marginInch,    // 1 inch right margin
      bottom: marginInch    // 1 inch bottom margin
    };
    const contentWidth = pageWidth - margins.left - margins.right;
    
    // Calculate line height: 12pt font + 2pt spacing = 14pt = 4.94mm
    const lineHeightMm = (12 + 2) * 0.352778;
    
    let currentY = margins.top;
    
    // Helper function to check and add new page
    const checkAndAddPage = (additionalHeight: number): boolean => {
      if (currentY + additionalHeight > pageHeight - margins.bottom) {
        doc.addPage();
        currentY = margins.top;
        return true;
      }
      return false;
    };

    // DECLARE displayTitle HERE - before using it
    const displayTitle = title;
    const now = new Date();
    const dateValue = now.toLocaleDateString('en-GB');
    const timeValue = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    let activeSteps = steps;

    if (mode === 'research') {
      // Clean content by removing marker comments
      activeSteps = steps.map(step => ({
        ...step,
        content: removeMarkerComments(step.content)
      }));
      
      // RESEARCH MODE - Title Page (2pt spacing, Times New Roman)
      const centerX = pageWidth / 2;
      const titlePageY = margins.top;
      
      // Add title (centered, bold, 12pt)
      doc.setFontSize(12);
      doc.setFont('times', 'bold');
      doc.setTextColor(0, 0, 0);
      
      // Split title into multiple lines if needed
      const titleLines = (doc as any).splitTextToSize(displayTitle, contentWidth);
      let titleY = titlePageY;
      titleLines.forEach((line: string) => {
        doc.text(line, centerX, titleY, { align: 'center' } as any);
        titleY += lineHeightMm;
      });
      
      currentY = titleY + 15;
      
      // Author (centered)
      doc.setFont('times', 'normal');
      const authorText = 'Author: Xplainfy';
      doc.text(authorText, centerX, currentY, { align: 'center' } as any);
      currentY += lineHeightMm;
      
      // Institution (centered)
      const institutionText = 'Institution: Xplainfy University';
      doc.text(institutionText, centerX, currentY, { align: 'center' } as any);
      currentY += lineHeightMm;
      
      // Course (centered)
      const courseText = 'Course: Introduction to Biology';
      doc.text(courseText, centerX, currentY, { align: 'center' } as any);
      currentY += lineHeightMm;
      
      // Date (centered)
      const dateText = `Date: ${dateValue}`;
      doc.text(dateText, centerX, currentY, { align: 'center' } as any);
      currentY += 20;
      
      // Add new page for content
      doc.addPage();
      currentY = margins.top;
    } else {
      // Regular mode - add header
      doc.setFontSize(12);
      doc.setFont('times', 'bold');
      doc.text(displayTitle, margins.left, currentY);
      currentY += lineHeightMm;

      doc.setFontSize(10);
      doc.setFont('times', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(`Generated on ${dateValue} at ${timeValue}`, margins.left, currentY);
      currentY += lineHeightMm;
      doc.setTextColor(0, 0, 0);
    }
    
    // Extract practice questions
    const practiceQuestions = extractPracticeQuestionsFromSteps(activeSteps);
    
    // Add main content
    for (const step of activeSteps) {
      const isPracticeStep = /practice_questions|practice questions/i.test(step.title) ||
        step.content.includes('"practice_questions"');
      if (isPracticeStep) continue;
      
      // Add space before section
      currentY += 3;
      
      // Check if we need a new page for section title
      checkAndAddPage(20);
      
      // Add step title (12pt bold)
      doc.setFontSize(12);
      doc.setFont('times', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(step.title, margins.left, currentY);
      currentY += lineHeightMm;
      
      // Parse and add content without markers
      let cleanedContent = removeEmptyFormulasSection(cleanLaTeXContent(step.content));
      cleanedContent = mode === 'research' ? removeMarkerComments(cleanedContent) : cleanedContent;
      const blocks = parseContent(cleanedContent);
      
      for (const block of blocks) {
        if (block.type === 'text') {
          // Split content into paragraphs (by double newlines)
          const paragraphs = block.content.split(/\n\s*\n/);
          
          for (const paragraph of paragraphs) {
            if (!paragraph.trim()) continue;
            
            // Check if we need a new page for this paragraph
            const estimatedHeight = (paragraph.length / 60) * lineHeightMm; // Rough estimate
            checkAndAddPage(estimatedHeight);
            
            // Add paragraph with 0.5 inch indent
            const heightAdded = addParagraph(doc, paragraph.trim(), margins.left, currentY, contentWidth, true);
            currentY += heightAdded + 2; // Extra space between paragraphs
          }
        } else if (block.type === 'table' && block.data) {
          // Add table with 2pt spacing
          const tableData = block.data;
          
          // Estimate table height
          const estimatedTableHeight = (tableData.rows.length + 1) * lineHeightMm + 10;
          checkAndAddPage(estimatedTableHeight);
          
          currentY += 3;
          
          // Table headers (bold, 12pt)
          doc.setFontSize(12);
          doc.setFont('times', 'bold');
          const headerText = tableData.headers.join(' | ');
          doc.text(headerText, margins.left, currentY);
          currentY += lineHeightMm;
          
          // Draw separator line
          doc.setDrawColor(0, 0, 0);
          doc.line(margins.left, currentY - 2, pageWidth - margins.right, currentY - 2);
          
          // Table rows (normal, 12pt)
          doc.setFont('times', 'normal');
          for (const row of tableData.rows) {
            if (currentY + lineHeightMm > pageHeight - margins.bottom) {
              doc.addPage();
              currentY = margins.top;
            }
            const rowText = row.join(' | ');
            doc.text(rowText, margins.left, currentY);
            currentY += lineHeightMm;
          }
          currentY += 3;
        }
      }
      
      currentY += 3; // Extra space between sections
    }
    
    // Add Practice Questions section if they exist
    if (practiceQuestions.length > 0) {
      checkAndAddPage(30);
      
      // Section title
      doc.setFontSize(12);
      doc.setFont('times', 'bold');
      doc.text('Practice Questions', margins.left, currentY);
      currentY += lineHeightMm;
      currentY += 3;
      
      practiceQuestions.forEach((question, index) => {
        // Check if we need a new page
        checkAndAddPage(40);
        
        // Question (bold)
        doc.setFont('times', 'bold');
        const questionText = `${index + 1}. ${question.question}`;
        const questionLines = (doc as any).splitTextToSize(questionText, contentWidth - 12.7); // Account for indent
        doc.text(questionLines, margins.left + 12.7, currentY);
        currentY += questionLines.length * lineHeightMm;
        currentY += 2;
        
        // Options (normal)
        doc.setFont('times', 'normal');
        question.options.forEach((option) => {
          const optionLines = (doc as any).splitTextToSize(`   ${option}`, contentWidth - 12.7);
          doc.text(optionLines, margins.left + 12.7, currentY);
          currentY += optionLines.length * lineHeightMm;
          currentY += 1;
        });
        
        // Answer (italic)
        const answerText = `   Answer: ${question.correct_answer}${question.explanation ? ` — ${question.explanation}` : ''}`;
        const answerLines = (doc as any).splitTextToSize(answerText, contentWidth - 12.7);
        doc.setFont('times', 'italic');
        doc.text(answerLines, margins.left + 12.7, currentY);
        currentY += answerLines.length * lineHeightMm;
        currentY += 5; // Extra space between questions
      });
    }
    
    // Add page numbers in top-right corner for all pages
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(12);
      doc.setFont('times', 'normal');
      doc.setTextColor(0, 0, 0);
      
      // Page number at top-right (1 inch from top, right margin)
      const pageNumberX = pageWidth - margins.right;
      const pageNumberY = margins.top - 8; // Slightly above the top margin
      doc.text(`${i}`, pageNumberX, pageNumberY, { align: 'right' } as any);
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