// src/lib/analytics.ts
/**
 * Google Analytics tracking utility using gtag
 * Tracks user interactions across the application
 */

export const trackEvent = (
  eventName: string,
  eventParams?: Record<string, any>
) => {
  if (typeof window !== 'undefined' && (window as any).gtag) {
    (window as any).gtag('event', eventName, eventParams || {});
  }
};

// Feature tracking functions
export const analytics = {
  // Navigation
  pageView: (pageName: string) => {
    trackEvent('page_view', {
      page_title: pageName,
      page_location: window.location.href,
    });
  },

  // Tab navigation
  tutorTabClicked: () => trackEvent('ask_tab_clicked'),
  researchTabClicked: () => trackEvent('research_tab_clicked'),
  historyTabClicked: () => trackEvent('history_tab_clicked'),
  profileTabClicked: () => trackEvent('profile_tab_clicked'),

  // Buttons
  speakButtonClicked: () => trackEvent('speak_button_clicked'),
  downloadButtonClicked: (mode?: string) => trackEvent('download_button_clicked', { mode }),

  // Settings/Configurations
  tutorMindsetChanged: (mindset: string) => trackEvent('ask_mindset_changed', { mindset }),
  researchCriteriaChanged: (criteria: string) => trackEvent('research_criteria_changed', { criteria }),
  tutorExplanationDepthChanged: (depth: string) => trackEvent('ask_explanation_depth_changed', { depth }),
  researchExplanationDepthChanged: (depth: string) => trackEvent('research_explanation_depth_changed', { depth }),
  languageChanged: (language: string) => trackEvent('language_changed', { language }),

  // Input methods
  voiceInputUsed: () => trackEvent('voice_input_used'),
  imageInputUsed: () => trackEvent('image_input_used'),
  cameraInputUsed: () => trackEvent('camera_input_used'),
  documentInputUsed: () => trackEvent('document_input_used'),

  // AI operations
  aiRequestStarted: (mode: string) => trackEvent('ai_request_started', { mode }),
  aiRequestCompleted: (mode: string, creditsCost?: number) => trackEvent('ai_request_completed', { mode, credits_cost: creditsCost }),
  aiRequestFailed: (mode: string, error?: string) => trackEvent('ai_request_failed', { mode, error }),

  // Feedback
  feedbackSubmitted: (feedbackType: string) => trackEvent('feedback_submitted', { feedback_type: feedbackType }),

  // Subscription
  subscriptionUpgradeClicked: () => trackEvent('subscription_upgrade_clicked'),
  creditsPurchased: (amount: number) => trackEvent('credits_purchased', { amount }),

  // Authentication
  userSignedUp: () => trackEvent('user_signed_up'),
  userSignedIn: () => trackEvent('user_signed_in'),
  userSignedOut: () => trackEvent('user_signed_out'),

  // Feature usage
  tutorModeUsed: (depth: string) => trackEvent('tutor_mode_used', { depth }),
  researchModeUsed: (depth: string) => trackEvent('research_mode_used', { depth }),
  problemModeUsed: () => trackEvent('problem_mode_used'),
  simplifyModeUsed: () => trackEvent('simplify_mode_used'),
  hintsModeUsed: () => trackEvent('hints_mode_used'),
  rewritesModeUsed: () => trackEvent('rewrites_mode_used'),
};
