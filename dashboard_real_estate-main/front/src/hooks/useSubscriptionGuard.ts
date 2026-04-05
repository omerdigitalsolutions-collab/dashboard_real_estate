/**
 * useSubscriptionGuard
 *
 * Reads the agency's `billing` field in real time and determines whether
 * the current user should be locked out of the dashboard.
 *
 * Lock-out logic:
 *  - status === 'trialing' AND now > trialEndsAt  → locked
 *  - status === 'past_due'                        → locked
 *  - status === 'canceled'                        → locked
 *  - status === 'active' / 'paid'                 → NOT locked
 *
 * Returns:
 *  { isLockedOut: boolean, billingStatus: string | null, trialEndsAt: Date | null, loading: boolean }
 */
import { useState, useEffect } from 'react';
import { doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { getPlanFeatures, PlanFeatures } from '../config/plans';

interface BillingInfo {
    planId?: string;
    status?: 'trialing' | 'active' | 'paid' | 'past_due' | 'canceled' | string;
    trialEndsAt?: Timestamp;
    ownerPhone?: string;
}

export interface SubscriptionGuardResult {
    isLockedOut: boolean;
    billingStatus: string | null;
    planId: string | null;
    features: PlanFeatures;
    trialEndsAt: Date | null;
    loading: boolean;
}

export function useSubscriptionGuard(): SubscriptionGuardResult {
    const { userData, loading: authLoading } = useAuth();
    const agencyId = userData?.agencyId;

    const [billing, setBilling] = useState<BillingInfo | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (authLoading) return;

        // No agency yet — not locked (e.g., during onboarding)
        if (!agencyId) {
            setLoading(false);
            return;
        }

        const agencyRef = doc(db, 'agencies', agencyId);
        const unsub = onSnapshot(
            agencyRef,
            (snap) => {
                if (snap.exists()) {
                    const data = snap.data();
                    // Some agencies have planId at the root, some in billing. Handle both.
                    const planId = data.planId || data.billing?.planId || 'basic';
                    setBilling({
                        ...(data.billing as BillingInfo),
                        planId
                    });
                } else {
                    setBilling(null);
                }
                setLoading(false);
            },
            (err) => {
                console.error('[useSubscriptionGuard] Error reading agency billing:', err);
                setLoading(false);
            }
        );

        return () => unsub();
    }, [agencyId, authLoading]);

    const isLockedOut = (() => {
        if (loading || !billing) return false;

        const status = billing.status;

        // Hard locked statuses
        if (status === 'past_due' || status === 'canceled') return true;

        // Trial expired
        if (status === 'trialing' && billing.trialEndsAt) {
            const trialEnd = billing.trialEndsAt.toDate();
            if (new Date() > trialEnd) return true;
        }

        return false;
    })();

    const trialEndsAt =
        billing?.trialEndsAt instanceof Timestamp
            ? billing.trialEndsAt.toDate()
            : null;

    const planId = billing?.planId || 'basic';
    const features = getPlanFeatures(planId);

    return {
        isLockedOut,
        billingStatus: billing?.status ?? null,
        planId,
        features,
        trialEndsAt,
        loading,
    };
}
