import { useState } from 'react';
import { FeedbackService, type Feedback } from '@/services/feedbackService';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MessageCircle, Star, Loader2, Upload, X, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

// Styled components matching sidebar aesthetic
const StyledSelectTrigger = ({ className, children, ...props }: React.ComponentProps<typeof SelectTrigger>) => (
  <SelectTrigger
    className={`
      group flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5 
      text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white 
      transition-all duration-200 border border-white/10 bg-slate-900/50
      backdrop-blur-sm shadow-sm
      ${className || ""}
    `}
    {...props}
  >
    {children}
  </SelectTrigger>
);

const StyledSelectItem = ({ className, children, ...props }: React.ComponentProps<typeof SelectItem>) => (
  <SelectItem
    className={`
      rounded-xl px-4 py-2.5 text-sm font-medium text-slate-300
      focus:bg-white/10 focus:text-white focus:outline-none
      data-[highlighted]:bg-white/10 data-[highlighted]:text-white
      cursor-pointer transition-all duration-150
      ${className || ""}
    `}
    {...props}
  >
    {children}
  </SelectItem>
);

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}

export function FeedbackDialog({ open, onOpenChange, userId }: FeedbackDialogProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [feedbackType, setFeedbackType] = useState<Feedback['type']>('general_feedback');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [attachmentType, setAttachmentType] = useState<string | null>(null);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);

  const feedbackTypeOptions = [
    { value: 'bug_report', label: `${t('feedback.typeOptions.bugReport')} 🐛`, icon: '🐛' },
    { value: 'feature_request', label: `${t('feedback.typeOptions.featureRequest')} ✨`, icon: '✨' },
    { value: 'general_feedback', label: `${t('feedback.typeOptions.generalFeedback')} 💬`, icon: '💬' },
    { value: 'performance_issue', label: `${t('feedback.typeOptions.performanceIssue')} ⚡`, icon: '⚡' },
  ];

  const getFeedbackTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      bug_report: 'from-red-500 to-orange-500',
      feature_request: 'from-purple-500 to-pink-500',
      general_feedback: 'from-blue-500 to-cyan-500',
      performance_issue: 'from-yellow-500 to-amber-500',
    };
    return colors[type] || 'from-primary to-primary/70';
  };

  const handleFileSelect = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('feedback.messages.fileTooLarge'));
      return;
    }

    setAttachmentFile(file);

    const result = await FeedbackService.uploadAttachment(file);
    if (result) {
      setAttachmentUrl(result.url);
      setAttachmentType(result.type);
      toast.success(t('feedback.messages.attachmentUploaded'));
    } else {
      toast.error(t('feedback.messages.attachmentUploadFailed'));
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) {
      toast.error(t('feedback.messages.missingFields'));
      return;
    }

    setLoading(true);
    try {
      const result = await FeedbackService.submitFeedback(userId, {
        type: feedbackType,
        title,
        description,
        rating: rating || undefined,
        attachment_url: attachmentUrl || undefined,
        attachment_type: attachmentType || undefined,
      });

      if (result.success) {
        toast.success(t('feedback.messages.success'));
        onOpenChange(false);
        setTitle('');
        setDescription('');
        setRating(null);
        setAttachmentFile(null);
        setAttachmentUrl(null);
        setAttachmentType(null);
        setFeedbackType('general_feedback');
      } else {
        toast.error(result.error || t('feedback.messages.submitFailed'));
      }
    } catch (error: any) {
      toast.error(t('feedback.messages.submitError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-white/20 shadow-2xl p-0">
        {/* Header with gradient bar */}
        <div className={`h-1 w-full bg-gradient-to-r ${getFeedbackTypeColor(feedbackType)} rounded-t-2xl`} />
        
        <div className="p-6 space-y-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-2xl font-bold text-white">
              <div className={`p-2 rounded-xl bg-gradient-to-br ${getFeedbackTypeColor(feedbackType)} shadow-lg`}>
                <MessageCircle size={20} className="text-white" />
              </div>
              {t('feedback.title')}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-sm mt-2">
              {t('feedback.subtitle')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Feedback Type */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <span className="text-primary">✦</span>
                {t('feedback.type')}
              </Label>
              <Select value={feedbackType} onValueChange={(v) => setFeedbackType(v as Feedback['type'])}>
                <StyledSelectTrigger className="w-full">
                  <SelectValue />
                </StyledSelectTrigger>
                <SelectContent className="bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl">
                  {feedbackTypeOptions.map((option) => (
                    <StyledSelectItem key={option.value} value={option.value}>
                      <span className="flex items-center gap-2">
                        <span className="text-lg">{option.icon}</span>
                        <span>{option.label}</span>
                      </span>
                    </StyledSelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="feedback-title" className="text-sm font-semibold text-slate-300">
                {t('feedback.input.title')} <span className="text-red-400">*</span>
              </Label>
              <Input
                id="feedback-title"
                placeholder={t('feedback.input.titlePlaceholder')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="rounded-2xl border-white/10 bg-slate-900/50 text-slate-200 placeholder:text-slate-500 focus:border-primary/50 transition-all duration-200"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="feedback-description" className="text-sm font-semibold text-slate-300">
                {t('feedback.input.description')} <span className="text-red-400">*</span>
              </Label>
              <Textarea
                id="feedback-description"
                placeholder={t('feedback.input.descriptionPlaceholder')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={6}
                className="rounded-2xl border-white/10 bg-slate-900/50 text-slate-200 placeholder:text-slate-500 resize-none focus:border-primary/50 transition-all duration-200"
              />
              <p className="text-xs text-slate-500 text-right">
                {description.length}/1000 characters
              </p>
            </div>

            {/* Rating Section */}
            {(feedbackType === 'general_feedback' || feedbackType === 'feature_request') && (
              <div className="space-y-3 p-4 rounded-2xl bg-slate-800/30 border border-white/10">
                <Label className="text-sm font-semibold text-slate-300">
                  {t('feedback.rating.question')}
                </Label>
                <div className="flex gap-3 justify-center py-2">
                  {[1, 2, 3, 4, 5].map((star) => {
                    const isActive = rating && star <= rating;
                    const isHovered = hoveredRating && star <= hoveredRating;
                    return (
                      <button
                        key={star}
                        onClick={() => setRating(rating === star ? null : star)}
                        onMouseEnter={() => setHoveredRating(star)}
                        onMouseLeave={() => setHoveredRating(null)}
                        className="group transition-all duration-200 focus:outline-none"
                      >
                        <Star
                          size={32}
                          className={`
                            transition-all duration-200
                            ${isActive || isHovered
                              ? 'fill-yellow-400 text-yellow-400 scale-110' 
                              : 'text-slate-600 group-hover:text-yellow-400/50'
                            }
                            ${rating === star ? 'scale-110' : 'scale-100'}
                          `}
                        />
                      </button>
                    );
                  })}
                </div>
                <p className="text-center text-xs text-slate-500">
                  {rating === 5 && t('feedback.rating.messages.excellent')}
                  {rating === 4 && t('feedback.rating.messages.good')}
                  {rating === 3 && t('feedback.rating.messages.okay')}
                  {rating === 2 && t('feedback.rating.messages.notGreat')}
                  {rating === 1 && t('feedback.rating.messages.veryPoor')}
                </p>
              </div>
            )}

            {/* Attachment */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-300">
                Attachment <span className="text-xs text-slate-500 font-normal">(Optional)</span>
              </Label>
              <div className="border-2 border-dashed border-white/10 rounded-2xl p-6 text-center cursor-pointer hover:border-primary/50 transition-all duration-200 bg-slate-800/20 group">
                <input
                  type="file"
                  id="feedback-attachment"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                  }}
                  className="hidden"
                  accept="image/*,.pdf,.txt,.log"
                />
                <label htmlFor="feedback-attachment" className="cursor-pointer block">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-all duration-200">
                    <Upload size={20} className="text-primary" />
                  </div>
                  <p className="text-sm font-medium text-slate-300">{t('feedback.attachment.prompt')}</p>
                  <p className="text-xs text-slate-500 mt-1">{t('feedback.attachment.hint')}</p>
                </label>
              </div>
              {attachmentFile && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-primary/10 border border-primary/20">
                  <div className="flex items-center gap-2">
                    <CheckCircle size={16} className="text-green-500" />
                    <p className="text-sm font-medium text-slate-300 truncate">{attachmentFile.name}</p>
                  </div>
                  <button
                    onClick={() => {
                      setAttachmentFile(null);
                      setAttachmentUrl(null);
                      setAttachmentType(null);
                    }}
                    className="p-1 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-3 pt-4 border-t border-white/10">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="rounded-2xl border-white/10 bg-slate-800/50 text-slate-300 hover:bg-white/10 hover:text-white transition-all duration-200"
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={loading || !title.trim() || !description.trim()}
              className={`rounded-2xl gap-2 bg-gradient-to-r ${getFeedbackTypeColor(feedbackType)} text-white shadow-md hover:shadow-lg transition-all duration-200`}
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? t('feedback.submitting') : t('feedback.submit')}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}