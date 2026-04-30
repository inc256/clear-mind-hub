import { jsPDF } from 'jspdf';



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
  let headerIdx = 0;
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
    doc.text(title, margins.left, currentY);
    currentY += 15;

    // Add metadata
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    const date = new Date().toLocaleDateString();
    doc.text(`Generated on ${date}`, margins.left, currentY);
    currentY += 10;

    // Add content
    for (const step of steps) {
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
      const blocks = parseContent(step.content);

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
