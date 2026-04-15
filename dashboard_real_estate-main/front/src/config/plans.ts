/**
 * CRM Subscription Plans Configuration
 * 
 * Defines feature access flags for each tier:
 * - basic (formerly starter)
 * - advanced (formerly pro)
 * - premium (formerly enterprise)
 */

export type PlanId = 'basic' | 'advanced' | 'premium' | 'starter' | 'pro' | 'enterprise' | 'free_trial';

export interface PlanFeatures {
    canAccessAiBot: boolean;
    canAccessBroadcast: boolean;
    canAccessAiImport: boolean;
    canAccessAiInsights: boolean;
    canAccessSourcing: boolean;
    canAccessAdvancedFiltering: boolean;
}

export const PLAN_FEATURES: Record<PlanId, PlanFeatures> = {
    // New Tiers
    basic: {
        canAccessAiBot: false,
        canAccessBroadcast: false,
        canAccessAiImport: false,
        canAccessAiInsights: false,
        canAccessSourcing: false,
        canAccessAdvancedFiltering: false,
    },
    advanced: {
        canAccessAiBot: false,
        canAccessBroadcast: true,
        canAccessAiImport: false,
        canAccessAiInsights: true,
        canAccessSourcing: true,
        canAccessAdvancedFiltering: true,
    },
    premium: {
        canAccessAiBot: true,
        canAccessBroadcast: true,
        canAccessAiImport: true,
        canAccessAiInsights: true,
        canAccessSourcing: true,
        canAccessAdvancedFiltering: true,
    },
    // Trial plan — used during onboarding. Backend grants full access during trial;
    // frontend mirrors that so users with this planId see all features.
    free_trial: {
        canAccessAiBot: true,
        canAccessBroadcast: true,
        canAccessAiImport: true,
        canAccessAiInsights: true,
        canAccessSourcing: true,
        canAccessAdvancedFiltering: true,
    },
    // Legacy Fallback (Migration Period)
    starter: {
        canAccessAiBot: false,
        canAccessBroadcast: false,
        canAccessAiImport: false,
        canAccessAiInsights: false,
        canAccessSourcing: false,
        canAccessAdvancedFiltering: false,
    },
    pro: {
        canAccessAiBot: false,
        canAccessBroadcast: true,
        canAccessAiImport: false,
        canAccessAiInsights: true,
        canAccessSourcing: true,
        canAccessAdvancedFiltering: true,
    },
    enterprise: {
        canAccessAiBot: true,
        canAccessBroadcast: true,
        canAccessAiImport: true,
        canAccessAiInsights: true,
        canAccessSourcing: true,
        canAccessAdvancedFiltering: true,
    },
};

/**
 * Gets the feature set for a given plan ID.
 * Defaults to 'basic' if planId is unknown.
 */
export function getPlanFeatures(planId?: string): PlanFeatures {
    const id = (planId || 'basic').toLowerCase() as PlanId;
    return PLAN_FEATURES[id] || PLAN_FEATURES.basic;
}

/**
 * Normalizes legacy plan IDs for display/logic.
 */
export function normalizePlanId(planId?: string): string {
    const id = (planId || 'basic').toLowerCase();
    if (id === 'starter') return 'basic';
    if (id === 'pro') return 'advanced';
    if (id === 'enterprise') return 'premium';
    return id;
}
