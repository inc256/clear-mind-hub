/**
 * Plan Configuration Constants
 * Centralized definitions for all subscription plans and their features
 */

export enum PlanId {
  TRIAL = 'trial',
  BASIC = 'basic',
  PRO = 'pro',
  ULTRA = 'ultra',
}

export enum PlanName {
  TRIAL = 'Trial',
  BASIC = 'Basic',
  PRO = 'Pro',
  ULTRA = 'Ultra',
}

// ═══════════════════════════════════════════════════════════════
// FEATURE LIMITS BY PLAN
// ═══════════════════════════════════════════════════════════════

export const PLAN_FEATURES = {
  [PlanId.TRIAL]: {
    name: PlanName.TRIAL,
    description: 'Try Xplainfy free for 30 days',
    price: 0,
    period: '/month (first 30 days)',
    credits: '10 daily',
    dailyCredits: 10,
    durationMonths: 1,
    
    // Access levels
    tutorLevels: ['fundamental', 'intermediate', 'higher'], // Advanced requires upgrade
    // Trial Research: intermediate & higher are credit-gated (not premium-blocked)
    researchLevels: ['fundamental', 'intermediate', 'higher'], // Advanced requires Ultra
    
    // Limits
    uploadSizeMB: 1,
    maxInputWords: 250,
    aiIllustrations: false,
    
    // Citations
    availableCitations: ['APA', 'MLA', 'IEEE', 'AMA'],
    
    // Models
    defaultModel: 'gpt-4.1-mini',
    complexResearchModel: 'gpt-4.1-mini',
    imageGenerationModel: null,
  },
  
  [PlanId.BASIC]: {
    name: PlanName.BASIC,
    description: 'Flexible credit-based usage',
    price: 4,
    period: 'one-time',
    credits: '1,000 total',
    dailyCredits: 0,
    
    // Access levels
    tutorLevels: ['fundamental', 'intermediate', 'higher', 'advanced'],
    researchLevels: ['fundamental', 'intermediate', 'higher'], // Advanced requires Ultra
    
    // Limits
    uploadSizeMB: 1,
    maxInputWords: 500,
    aiIllustrations: false,
    
    // Citations
    availableCitations: ['APA', 'MLA', 'IEEE', 'AMA'],
    
    // Models
    defaultModel: 'gpt-4.1',
    complexResearchModel: 'gpt-4.1',
    imageGenerationModel: null,
  },
  
  [PlanId.PRO]: {
    name: PlanName.PRO,
    description: 'Daily productivity & research',
    price: 15,
    period: '/ month',
    credits: 'Unlimited',
    dailyCredits: 0,
    
    // Access levels
    tutorLevels: ['fundamental', 'intermediate', 'higher', 'advanced'],
    researchLevels: ['fundamental', 'intermediate', 'higher'], // Advanced is Ultra-only
    
    // Limits
    uploadSizeMB: 5,
    maxInputWords: 1000,
    aiIllustrations: false,
    
    // Citations
    availableCitations: ['APA', 'MLA', 'IEEE', 'AMA'],
    
    // Models
    defaultModel: 'gpt-4.1',
    complexResearchModel: 'gpt-5.5',
    imageGenerationModel: null,
  },
  
  [PlanId.ULTRA]: {
    name: PlanName.ULTRA,
    description: 'Maximum AI power & advanced workflows',
    price: 35,
    period: '/ month',
    credits: 'Unlimited',
    dailyCredits: 0,
    
    // Access levels - FULL ACCESS
    tutorLevels: ['fundamental', 'intermediate', 'higher', 'advanced'],
    researchLevels: ['fundamental', 'intermediate', 'higher', 'advanced'],
    
    // Limits
    uploadSizeMB: 10000,
    maxInputWords: 100000,
    aiIllustrations: true,
    
    // Citations
    availableCitations: ['APA', 'MLA', 'IEEE', 'AMA'],
    
    // Models
    defaultModel: 'gpt-4.1',
    complexResearchModel: 'gpt-5.5',
    imageGenerationModel: 'gpt-image-2',
  },
} as const;

// ═══════════════════════════════════════════════════════════════
// CREDIT COSTS BY MODE AND DEPTH
// ═══════════════════════════════════════════════════════════════

export const CREDIT_COSTS = {
  tutor: {
    fundamental: 1,
    intermediate: 2,
    higher: 25,
    advanced: 50,
  },
  research: {
    fundamental: 3,
    intermediate: 5,
    higher: 25,
    advanced: 100,
  },
  simplify: 0,
  hints: 0,
  rewrites: 0,
  problem: 0,
} as const;

// ═══════════════════════════════════════════════════════════════
// SUBSCRIPTION TIERS
// ═══════════════════════════════════════════════════════════════

export type SubscriptionPlan = typeof PLAN_FEATURES[keyof typeof PLAN_FEATURES];

export const PLANS_ARRAY = Object.values(PLAN_FEATURES) as SubscriptionPlan[];

export function getPlanByName(name: string): SubscriptionPlan | undefined {
  return Object.values(PLAN_FEATURES).find(
    plan => plan.name.toLowerCase() === name.toLowerCase()
  );
}

export function getPlanById(id: string): SubscriptionPlan | undefined {
  return PLAN_FEATURES[id as PlanId];
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

export function canAccessTutorLevel(planId: string, depth: string): boolean {
  const plan = getPlanById(planId);
  if (!plan) return false;
  return (plan.tutorLevels as readonly string[]).includes(depth);
}

export function canAccessResearchLevel(planId: string, depth: string): boolean {
  const plan = getPlanById(planId);
  if (!plan) return false;
  return (plan.researchLevels as readonly string[]).includes(depth);
}

export function canUseCitationStyle(planId: string, citationStyle: string): boolean {
  const plan = getPlanById(planId);
  if (!plan) return false;
  return (plan.availableCitations as readonly string[]).includes(citationStyle);
}

export function getUploadLimitMB(planId: string): number {
  const plan = getPlanById(planId);
  return plan?.uploadSizeMB ?? 1;
}

export function getMaxInputWords(planId: string): number {
  const plan = getPlanById(planId);
  return plan?.maxInputWords ?? 250;
}

export function canGenerateAIIllustrations(planId: string): boolean {
  const plan = getPlanById(planId);
  return plan?.aiIllustrations ?? false;
}

export function getModelForMode(
  planId: string,
  mode: 'complex-research' | 'standard' | 'image'
): string {
  const plan = getPlanById(planId);
  if (!plan) return 'gpt-4.1-mini';

  if (mode === 'complex-research') {
    return plan.complexResearchModel || 'gpt-4.1';
  } else if (mode === 'image') {
    return plan.imageGenerationModel || null;
  }
  return plan.defaultModel;
}