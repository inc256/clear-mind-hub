import ReactMarkdown from "react-markdown";
import { Copy, RefreshCw, Check, ChevronRight, Plus, Volume2, VolumeX, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useMemo, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

// Force reload: 2024-04-29-v2

// Custom table components with Tailwind styling for the app theme
const MarkdownTable = ({ children }: { children?: React.ReactNode }) => (
  <div className="overflow-x-auto my-6 rounded-lg border border-border/50 bg-muted/30">
    <table className="w-full border-collapse text-sm">
      {children}
    </table>
  </div>
);

const MarkdownTableHead = ({ children }: { children?: React.ReactNode }) => (
  <thead className="bg-primary/10 border-b border-border/50">
    {children}
  </thead>
);

const MarkdownTableBody = ({ children }: { children?: React.ReactNode }) => (
  <tbody>{children}</tbody>
);

const MarkdownTableRow = ({ children, isHeader }: { children?: React.ReactNode; isHeader?: boolean }) => (
  <tr className="hover:bg-muted/50 transition-colors border-b border-border/30 last:border-b-0">
    {children}
  </tr>
);

const MarkdownTableCell = ({ children, isHeader }: { children?: React.ReactNode; isHeader?: boolean }) => {
  const baseClasses = "px-4 py-3 text-left align-top";
  const headerClasses = "font-semibold text-foreground/90 bg-primary/5";
  const bodyClasses = "text-foreground/75";
  
  return isHeader ? (
    <th className={`${baseClasses} ${headerClasses}`}>{children}</th>
  ) : (
    <td className={`${baseClasses} ${bodyClasses}`}>{children}</td>
  );
};

// Optimized function to clean and format table content - removes separator rows and fixes malformed tables
const cleanTableContent = (text: string): string => {
  let result = text;
  
  // Detect malformed tables: rows joined by " | | " instead of newlines
  // Pattern: | cell | cell | | cell | cell |
  if (result.includes(' | | ')) {
    // This is likely a mangled table - try to fix it
    const rows = result.split(' | | ');
    if (rows.length >= 2) {
      // Reconstruct with proper line breaks
      result = rows.map(r => r.trim()).filter(r => r && r.includes('|')).join('\n');
    }
  }
  
  // Also handle case where rows are separated by just repeated pipes
  const lines = result.split('\n');
  const cleanedLines: string[] = [];
  let skipNext = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Skip markdown table separator rows (e.g., ":---" or "| :--- | :--- |")
    if (/^(\|\s*)?:\s*-+\s*(\|\s*:\s*-+\s*)*(\|)?$/.test(trimmed)) {
      skipNext = false;
      continue;
    }
    
    // Skip completely empty pipes line (which sometimes appears as a separator)
    if (/^\|\s*\|\s*\|\s*\|$/.test(trimmed) || /^(\|\s*)+$/.test(trimmed)) {
      continue;
    }
    
    cleanedLines.push(line);
  }

  return cleanedLines.join('\n');
};

import { AiMode } from "@/services/aiService";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface OutputCardProps {
  content: string;
  steps: Array<{title: string, content: string}>;
  currentStep: number;
  onNext: () => void;
  loading?: boolean;
  onRegenerate?: () => void;
  onNewQuery?: () => void;
  mode?: AiMode;
}

interface PracticeQuestion {
  question: string;
  options: string[];
  correct_answer: string;
}

export function OutputCard({ content, steps, currentStep, onNext, loading, onRegenerate, onNewQuery, mode }: OutputCardProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [practiceAnswers, setPracticeAnswers] = useState<Record<number, string>>({});
  const [showingPracticeQuestions, setShowingPracticeQuestions] = useState(false);
  const [speechRate, setSpeechRate] = useState<number>(1);
  const [isRenderingTable, setIsRenderingTable] = useState(false);

  // Memoize the cleaned content to avoid re-processing on every render
  const cleanedContent = useMemo(() => {
    if (!content) return '';
    try {
      return cleanTableContent(
        mode === "research" && currentStep === steps.length - 1
          ? steps.map(s => `## ${s.title.replace(/[\^\$]/g, '')}\n${s.content.replace(/[\^\$]/g, '')}`).join('\n\n')
          : (steps[currentStep]?.content.replace(/\[CORRECT\]/g, '').replace(/\{"practice_questions"[\s\S]*?\}\s*$/, '').replace(/[\^\$]/g, '') || "")
      );
    } catch (e) {
      return content;
    }
  }, [content, steps, currentStep, mode]);

  // Track when content changes to show loading state
  useEffect(() => {
    if (!loading && cleanedContent && cleanedContent.trim()) {
      setIsRenderingTable(true);
      const timer = setTimeout(() => setIsRenderingTable(false), 50);
      return () => clearTimeout(timer);
    } else if (loading) {
      setIsRenderingTable(false);
    }
  }, [cleanedContent, loading]);

  const parsePackageContent = (content: string) => {
    const lines = content.split('\n');
    const fields: Record<string, string> = {};
    lines.forEach(line => {
      const [key, ...valueParts] = line.split(':');
      if (key && valueParts.length) {
        fields[key.trim()] = valueParts.join(':').trim();
      }
    });
    return fields;
  };

  const parseMultipleChoice = (content: string) => {
    const lines = content.split('\n');
    const options: { letter: string; text: string; correct: boolean }[] = [];
    lines.forEach(line => {
      const match = line.match(/^([A-D])\)\s*(.+?)(?:\s*\[CORRECT\])?$/i);
      if (match) {
        const [, letter, text] = match;
        const correct = line.includes('[CORRECT]');
        // Clean up text - remove markdown formatting
        const cleanText = text.trim().replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');
        options.push({ letter: letter.toUpperCase(), text: cleanText, correct });
      }
    });
    return options;
  };

  const extractPracticeQuestions = (text: string): PracticeQuestion[] => {
    try {
      const jsonMatch = text.match(/\{"practice_questions":\s*\[[\s\S]*\]\s*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.practice_questions || [];
      }
    } catch (e) {
      // Silently fail if JSON parsing doesn't work
    }
    return [];
  };

  const handleAnswerSelect = (letter: string) => {
    setSelectedAnswer(letter);
    const options = parseMultipleChoice(steps[currentStep]?.content || '');
    const selected = options.find(o => o.letter === letter);
    if (selected?.correct) {
      toast.success("Correct! Well done!");
    } else {
      const correct = options.find(o => o.correct);
      toast.error(`Wrong. The correct answer is ${correct?.letter}) ${correct?.text}`);
    }
  };

  const handlePracticeAnswerSelect = (questionIndex: number, selectedOption: string) => {
    setPracticeAnswers(prev => ({
      ...prev,
      [questionIndex]: selectedOption
    }));

    const questions = extractPracticeQuestions(content);
    const question = questions[questionIndex];
    const correctLetter = question.correct_answer.match(/^[A-D]/)?.[0];

    if (selectedOption === correctLetter) {
      toast.success("Correct! Great job practicing!");
    } else {
      toast.error(`Not quite. The correct answer is ${correctLetter}) ${question.options.find(opt => opt.startsWith(correctLetter))}`);
    }
  };

  const handleSpeak = () => {
    if (!('speechSynthesis' in window)) {
      toast.error("Text-to-speech not supported in this browser");
      return;
    }

    if (speaking) {
      speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }

    // Get clean text from current section only (remove markdown and JSON)
    const currentContent = steps[currentStep]?.content || '';
    const cleanText = cleanTextForSpeech(currentContent);
    
    if (!cleanText.trim()) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = speechRate;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => {
      setSpeaking(false);
      toast.error("Speech synthesis failed");
    };

    speechSynthesis.speak(utterance);
  };

  const cleanTextForSpeech = (text: string): string => {
    // Remove [CORRECT] markers
    let cleaned = text.replace(/\[CORRECT\]/g, '');
    // Remove practice questions JSON
    cleaned = cleaned.replace(/\{"practice_questions"[\s\S]*?\}\s*$/, '');
    // Remove markdown headers but keep the content
    cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');
    // Clean up extra whitespace
    cleaned = cleaned.replace(/\n\n+/g, '\n\n');
    return cleaned.trim();
  };

  const downloadDocument = () => {
    try {
      const fileName = `${mode}-${new Date().toISOString().slice(0, 10)}.txt`;
      const fullText = steps.map(s => `${s.title}\n${'='.repeat(s.title.length)}\n${cleanTextForSpeech(s.content)}`).join('\n\n---\n\n');
      
      const element = document.createElement('a');
      element.setAttribute('href', `data:text/plain;charset=utf-8,${encodeURIComponent(fullText)}`);
      element.setAttribute('download', fileName);
      element.style.display = 'none';
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      
      toast.success("Document downloaded");
    } catch (e) {
      toast.error("Failed to download document");
    }
  };

  const getCopyText = useCallback(() => {
    if (mode === "research" && currentStep === steps.length - 1) {
      return steps.map(s => `## ${s.title}\n${s.content}`).join('\n\n');
    }
    return content;
  }, [content, steps, currentStep, mode]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(getCopyText());
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy");
    }
  }, [getCopyText]);

  if (!loading && steps.length === 0) return null;

  return (
    <div className="glass-card rounded-2xl p-4 sm:p-6 lg:p-7 animate-slide-up">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {loading ? t('workspace.thinking') : (steps[currentStep]?.title || t('workspace.response')).replace(/[\^\$]/g, '')}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!loading && !showingPracticeQuestions && (
              <Select value={speechRate.toString()} onValueChange={(val) => setSpeechRate(parseFloat(val))}>
                <SelectTrigger className="w-[120px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.75">0.75x</SelectItem>
                  <SelectItem value="1">1x (Normal)</SelectItem>
                  <SelectItem value="1.25">1.25x</SelectItem>
                  <SelectItem value="1.5">1.5x</SelectItem>
                  <SelectItem value="2">2x (Fast)</SelectItem>
                </SelectContent>
              </Select>
            )}
          {onNewQuery && (
            <Button size="sm" variant="ghost" onClick={onNewQuery}>
              <Plus size={14} className="mr-1.5" /> {t('workspace.newQuery')}
            </Button>
          )}
          {onRegenerate && (
            <Button size="sm" variant="ghost" onClick={onRegenerate} disabled={loading}>
              <RefreshCw size={14} className="mr-1.5" /> {t('workspace.regenerate')}
            </Button>
          )}
            <Button size="sm" variant="ghost" onClick={handleSpeak} disabled={!content || showingPracticeQuestions}>
              {speaking ? <VolumeX size={14} className="mr-1.5" /> : <Volume2 size={14} className="mr-1.5" />}
              {speaking ? t('workspace.stop') : t('workspace.speak')}
            </Button>
            <Button size="sm" variant="ghost" onClick={downloadDocument} disabled={!content || loading}>
              <Download size={14} className="mr-1.5" /> {t('workspace.download')}
            </Button>
            <Button size="sm" variant="ghost" onClick={handleCopy} disabled={!content}>
              {copied ? <Check size={14} className="mr-1.5" /> : <Copy size={14} className="mr-1.5" />}
              {copied ? t('workspace.copied') : t('workspace.copy')}
            </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[80, 95, 70, 88, 60].map((w, i) => (
            <div
              key={i}
              className="h-3 rounded-full bg-muted animate-pulse"
              style={{ width: `${w}%` }}
            />
          ))}
        </div>
      ) : isRenderingTable ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={32} className="animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{t('workspace.renderingContent') || 'Rendering content...'}</p>
          </div>
        </div>
      ) : (
        <>
          {!showingPracticeQuestions ? (
            <>
              <article className="prose prose-sm sm:prose-base max-w-none prose-headings:font-display prose-headings:tracking-tight prose-headings:text-primary-deep prose-headings:mt-6 prose-headings:mb-2 prose-h2:text-lg prose-h3:text-base prose-p:text-foreground/85 prose-li:text-foreground/85 prose-strong:text-foreground">
                <ReactMarkdown
                  components={{
                    table: ({ node, ...props }) => <MarkdownTable {...props} />,
                    thead: ({ node, ...props }) => <MarkdownTableHead {...props} />,
                    tbody: ({ node, ...props }) => <MarkdownTableBody {...props} />,
                    tr: ({ node, ...props }) => <MarkdownTableRow {...props} />,
                    th: ({ node, ...props }) => <MarkdownTableCell isHeader {...props} />,
                    td: ({ node, ...props }) => <MarkdownTableCell {...props} />,
                    p: ({ children, node }) => {
                      // Check if paragraph contains pipe syntax (potential table)
                      const textContent = node?.children?.map((c: any) => c.value || c.raw || '').join('') || '';
                      if (textContent.includes('|') && (textContent.match(/\|/g) || []).length > 4) {
                        // Try to parse as table
                        const lines = textContent.split('\n');
                        const rows = lines.filter(r => r.trim().includes('|'));
                        
                        if (rows.length >= 2) {
                          // Find separator row or assume first row is header
                          let separatorIdx = rows.findIndex(r => {
                            const cells = r.split('|').slice(1, -1);
                            return cells.every(c => /^:?-+:?$/.test(c.trim()) || c.trim() === '');
                          });
                          
                          // If no separator found, assume first row is header
                          if (separatorIdx < 0) {
                            separatorIdx = 0;
                          }
                          
                          if (separatorIdx >= 0) {
                            try {
                              const headerRowIdx = Math.max(0, separatorIdx);
                              const headerRow = rows[headerRowIdx];
                              const headerCells = headerRow.split('|').slice(1, -1).map((c: string) => c.trim()).filter(c => c);
                              
                              // Get body rows - either after separator or all rows if no separator
                              let bodyRowIndices = separatorIdx >= 0 ? rows.slice(separatorIdx + 1) : rows.slice(1);
                              
                              const bodyRows = bodyRowIndices.map((row: string) =>
                                row.split('|').slice(1, -1).map((c: string) => c.trim())
                              ).filter(row => row.some(cell => cell));
                              
                              if (headerCells.length > 0 && bodyRows.length > 0) {
                                return (
                                  <MarkdownTable>
                                    <MarkdownTableHead>
                                      <MarkdownTableRow>
                                        {headerCells.map((cell: string, idx: number) => (
                                          <MarkdownTableCell key={idx} isHeader>{cell}</MarkdownTableCell>
                                        ))}
                                      </MarkdownTableRow>
                                    </MarkdownTableHead>
                                    <MarkdownTableBody>
                                      {bodyRows.map((row: string[], rowIdx: number) => (
                                        <MarkdownTableRow key={rowIdx}>
                                          {headerCells.map((_, cellIdx: number) => (
                                            <MarkdownTableCell key={cellIdx}>{row[cellIdx] || ''}</MarkdownTableCell>
                                          ))}
                                        </MarkdownTableRow>
                                      ))}
                                    </MarkdownTableBody>
                                  </MarkdownTable>
                                );
                              }
                            } catch (e) {
                              // Fallback to normal paragraph
                            }
                          }
                        }
                      }
                      return <p>{children}</p>;
                    },
                  }}
                >
                  {cleanedContent}
                </ReactMarkdown>
              </article>

              {mode === "problem" && currentStep === steps.length - 1 && (
                <div className="mt-6 space-y-4">
                  <p className="font-semibold">{t('workspace.selectCorrectAnswer')}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {parseMultipleChoice(steps[currentStep]?.content || '').map((option) => (
                      <Button
                        key={option.letter}
                        onClick={() => handleAnswerSelect(option.letter)}
                        variant={selectedAnswer === option.letter ? (option.correct ? "default" : "destructive") : "outline"}
                        className="justify-start text-left"
                        disabled={selectedAnswer !== null}
                      >
                        {option.letter}) {option.text}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {mode === "tutor" && currentStep === steps.length - 1 && extractPracticeQuestions(content).length > 0 && (
                <div className="mt-6 pt-6 border-t border-border">
                  <Button
                    onClick={() => setShowingPracticeQuestions(true)}
                    variant="outline"
                    className="w-full"
                  >
                    {t('workspace.practiceQuestions')} ({extractPracticeQuestions(content).length})
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">{t('workspace.practiceQuestionsTitle')}</h3>
                {extractPracticeQuestions(content).map((question, qIndex) => (
                  <div key={qIndex} className="border border-border rounded-lg p-4 space-y-3">
                    <p className="font-medium">{qIndex + 1}. {question.question}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {question.options.map((option, optIndex) => {
                        const letter = String.fromCharCode(65 + optIndex); // A, B, C, D
                        const isSelected = practiceAnswers[qIndex] === letter;
                        const isCorrect = question.correct_answer.startsWith(letter);

                        return (
                          <Button
                            key={letter}
                            onClick={() => handlePracticeAnswerSelect(qIndex, letter)}
                            variant={isSelected ? (isCorrect ? "default" : "destructive") : "outline"}
                            className="justify-start text-left"
                            disabled={practiceAnswers[qIndex] !== undefined}
                          >
                            {letter}) {option.replace(/^[A-D]\)\s*/, '')}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 pt-6 border-t border-border">
                <Button
                  onClick={() => setShowingPracticeQuestions(false)}
                  variant="outline"
                  className="w-full"
                >
                  {t('workspace.backToLesson')}
                </Button>
              </div>
            </>
          )}
        </>
      )}

      {!loading && currentStep < steps.length - 1 && !showingPracticeQuestions && (
        <div className="flex justify-center mt-6">
          <Button onClick={onNext} className="bg-primary hover:opacity-90 btn-glow">
            {t('workspace.nextStep')} <ChevronRight size={16} className="ml-2" />
          </Button>
        </div>
      )}


    </div>
  );
}
