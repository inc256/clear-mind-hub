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
import { MessageCircle, Star, Loader2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

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

  const feedbackTypeOptions = [
    { value: 'bug_report', label: '🐛 Bug Report' },
    { value: 'feature_request', label: '✨ Feature Request' },
    { value: 'general_feedback', label: '💬 General Feedback' },
    { value: 'performance_issue', label: '⚡ Performance Issue' },
  ];

  const handleFileSelect = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      toast.error('File size must be less than 5MB');
      return;
    }

    setAttachmentFile(file);

    // Upload file
    const result = await FeedbackService.uploadAttachment(file);
    if (result) {
      setAttachmentUrl(result.url);
      setAttachmentType(result.type);
      toast.success('Attachment uploaded successfully');
    } else {
      toast.error('Failed to upload attachment');
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) {
      toast.error('Please fill in all required fields');
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
        toast.success('Thank you for your feedback!');
        onOpenChange(false);
        // Reset form
        setTitle('');
        setDescription('');
        setRating(null);
        setAttachmentFile(null);
        setAttachmentUrl(null);
        setAttachmentType(null);
        setFeedbackType('general_feedback');
      } else {
        toast.error(result.error || 'Failed to submit feedback');
      }
    } catch (error: any) {
      toast.error('An error occurred while submitting feedback');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <MessageCircle className="text-primary" size={24} />
            Send Us Your Feedback
          </DialogTitle>
          <DialogDescription>
            Help us improve your experience. Your feedback is valuable and helps shape the future of Xplainfy.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-6">
          {/* Feedback Type */}
          <div className="space-y-2">
            <Label htmlFor="feedback-type" className="font-semibold">
              Feedback Type
            </Label>
            <Select value={feedbackType} onValueChange={(v) => setFeedbackType(v as Feedback['type'])}>
              <SelectTrigger id="feedback-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {feedbackTypeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="feedback-title" className="font-semibold">
              Title <span className="text-red-500">*</span>
            </Label>
            <Input
              id="feedback-title"
              placeholder="Brief summary of your feedback"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="border-border/50"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="feedback-description" className="font-semibold">
              Description <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="feedback-description"
              placeholder="Please provide detailed information about your feedback..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              className="border-border/50 resize-none"
            />
            <p className="text-xs text-muted-foreground">{description.length}/1000 characters</p>
          </div>

          {/* Rating (only for general feedback and feature requests) */}
          {(feedbackType === 'general_feedback' || feedbackType === 'feature_request') && (
            <div className="space-y-3">
              <Label className="font-semibold">How would you rate your experience?</Label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setRating(rating === star ? null : star)}
                    className={`transition-transform duration-200 ${
                      rating && star <= rating ? 'scale-110' : 'scale-100'
                    }`}
                  >
                    <Star
                      size={28}
                      className={`${
                        rating && star <= rating
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'text-muted-foreground hover:text-yellow-300'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Attachment */}
          <div className="space-y-2">
            <Label className="font-semibold">Attachment (Optional)</Label>
            <div className="border-2 border-dashed border-border/50 rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors">
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
                <Upload size={20} className="mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium">Click to upload or drag and drop</p>
                <p className="text-xs text-muted-foreground">Images, PDF, or logs (Max 5MB)</p>
              </label>
            </div>
            {attachmentFile && (
              <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg border border-primary/20">
                <p className="text-sm font-medium truncate">{attachmentFile.name}</p>
                <button
                  onClick={() => {
                    setAttachmentFile(null);
                    setAttachmentUrl(null);
                    setAttachmentType(null);
                  }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !title.trim() || !description.trim()}
            className="gap-2"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? 'Submitting...' : 'Submit Feedback'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
