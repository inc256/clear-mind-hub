import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Feedback {
  id?: string;
  user_id?: string;
  type: 'bug_report' | 'feature_request' | 'general_feedback' | 'performance_issue';
  title: string;
  description: string;
  rating?: number;
  attachment_url?: string;
  attachment_type?: string;
  status?: 'open' | 'in_review' | 'acknowledged' | 'resolved' | 'closed';
  admin_response?: string;
  admin_responded_at?: string;
  created_at?: string;
  updated_at?: string;
}

export class FeedbackService {
  static async submitFeedback(
    userId: string,
    feedback: Omit<Feedback, 'id' | 'user_id' | 'status' | 'created_at' | 'updated_at'>
  ): Promise<{ success: boolean; data?: Feedback; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('create_feedback', {
        p_user_id: userId,
        p_type: feedback.type,
        p_title: feedback.title,
        p_description: feedback.description,
        p_rating: feedback.rating || null,
        p_attachment_url: feedback.attachment_url || null,
        p_attachment_type: feedback.attachment_type || null,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: { id: data } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  static async getFeedback(feedbackId: string): Promise<Feedback | null> {
    try {
      const { data, error } = await supabase
        .from('feedback')
        .select('*')
        .eq('id', feedbackId)
        .single();

      if (error || !data) return null;
      return data as Feedback;
    } catch {
      return null;
    }
  }

  static async getUserFeedback(userId: string, limit: number = 50, offset: number = 0): Promise<Feedback[]> {
    try {
      const { data, error } = await supabase
        .from('feedback')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error || !data) return [];
      return data as Feedback[];
    } catch {
      return [];
    }
  }

  static async uploadAttachment(file: File): Promise<{ url: string; type: string } | null> {
    try {
      const fileName = `feedback/${Date.now()}_${file.name}`;
      const { data, error } = await supabase.storage
        .from('attachments')
        .upload(fileName, file, { upsert: false });

      if (error) {
        console.error('Upload error:', error);
        return null;
      }

      const { data: publicData } = supabase.storage
        .from('attachments')
        .getPublicUrl(data.path);

      return {
        url: publicData.publicUrl,
        type: file.type.startsWith('image/') ? 'screenshot' : 'other',
      };
    } catch (error) {
      console.error('Upload exception:', error);
      return null;
    }
  }

  static async updateFeedbackStatus(
    feedbackId: string,
    status: Feedback['status'],
    adminResponse?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.rpc('update_feedback_status', {
        p_feedback_id: feedbackId,
        p_status: status,
        p_admin_response: adminResponse || null,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  static async getCreditHistory(userId: string, limit: number = 50, offset: number = 0) {
    try {
      const { data, error } = await supabase.rpc('get_credit_history', {
        p_user_id: userId,
        p_limit: limit,
        p_offset: offset,
      });

      if (error) {
        console.error('Get credit history error:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Get credit history exception:', error);
      return [];
    }
  }

  static async getCreditsUsedToday(userId: string): Promise<number> {
    try {
      const { data, error } = await supabase.rpc('get_credits_used_today', {
        p_user_id: userId,
      });

      if (error) {
        return 0;
      }

      return data || 0;
    } catch {
      return 0;
    }
  }

  static async getCreditAccountability() {
    try {
      const { data, error } = await supabase
        .from('credit_accountability')
        .select('*')
        .single();

      if (error || !data) return null;
      return data;
    } catch {
      return null;
    }
  }
}
