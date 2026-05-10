/**
 * agencyService.ts — Client-Side Service
 *
 * Real-time listener and update helpers for the `agencies` collection.
 */

import {
    doc,
    onSnapshot,
    updateDoc,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { db, storage, functions } from '../config/firebase';
import { Agency, AgencySpecialization } from '../types';


// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Real-time listener for a single agency document.
 * Returns an unsubscribe function for cleanup.
 */
export function getAgencyData(
    agencyId: string,
    callback: (agency: Agency) => void,
    onError?: (err: Error) => void
): () => void {
    const ref_ = doc(db, 'agencies', agencyId);
    return onSnapshot(
        ref_,
        (snap) => {
            if (snap.exists()) {
                callback({ id: snap.id, ...snap.data() } as Agency);
            }
        },
        onError
    );
}

// ─── Update ───────────────────────────────────────────────────────────────────

/**
 * Updates the agency's performance goals.
 */
export async function updateAgencyGoals(
    agencyId: string,
    monthlyGoals?: Partial<Agency['monthlyGoals']>,
    yearlyGoals?: Partial<NonNullable<Agency['yearlyGoals']>>
): Promise<void> {
    const docRef = doc(db, 'agencies', agencyId);
    const updates: any = {};
    if (monthlyGoals) updates.monthlyGoals = monthlyGoals;
    if (yearlyGoals) updates.yearlyGoals = yearlyGoals;
    await updateDoc(docRef, updates);
}

/**
 * Updates agency display settings (logo URL, theme color).
 */
export async function updateAgencySettings(
    agencyId: string,
    settings: Agency['settings']
): Promise<void> {
    const docRef = doc(db, 'agencies', agencyId);
    await updateDoc(docRef, { settings });
}

/**
 * Updates only the franchise commission fields using dot-notation to avoid
 * overwriting other settings fields (logoUrl, themeColor, etc.).
 */
export async function updateFranchiseSettings(
    agencyId: string,
    franchisePercent: number,
    monthlyFranchiseFee: number
): Promise<void> {
    const docRef = doc(db, 'agencies', agencyId);
    await updateDoc(docRef, {
        'settings.franchisePercent': franchisePercent,
        'settings.monthlyFranchiseFee': monthlyFranchiseFee,
    });
}

/**
 * Updates the agency's lead/property distribution configuration.
 */
export async function updateDistributionConfig(
    agencyId: string,
    config: {
        leadsEnabled: boolean;
        propertiesEnabled: boolean;
        strictness: 'strict' | 'flexible';
    }
): Promise<void> {
    const docRef = doc(db, 'agencies', agencyId);
    await updateDoc(docRef, { distributionConfig: config });
}

/**
 * Updates WeBot (AI bot) configuration.
 */
export async function updateWeBotConfig(
    agencyId: string,
    weBotConfig: any
): Promise<void> {
    const docRef = doc(db, 'agencies', agencyId);
    await updateDoc(docRef, { weBotConfig });
}

/**
 * Updates the agency's display name shown in the header.
 */
export async function updateAgencyName(
    agencyId: string,
    name: string
): Promise<void> {
    const docRef = doc(db, 'agencies', agencyId);
    await updateDoc(docRef, { agencyName: name.trim() });
}

// ─── Onboarding ───────────────────────────────────────────────────────────────

export interface OnboardingProfile {
    agencyName?: string;
    slogan?: string;
    officePhone?: string;
    licenseNumber?: string;
    mainServiceArea?: string;
    specialization?: AgencySpecialization;
    logoUrl?: string;
}

/**
 * Persists the extended profile fields after the Cloud Function has created
 * the initial agency document.
 */
export async function completeOnboarding(
    agencyId: string,
    profile: OnboardingProfile
): Promise<void> {
    const docRef = doc(db, 'agencies', agencyId);
    // Filter out undefined values so Firestore doesn't reject them
    const clean = Object.fromEntries(
        Object.entries(profile).filter(([, v]) => v !== undefined && v !== '')
    );
    await updateDoc(docRef, {
        ...clean,
        // Mirror logoUrl into settings.logoUrl for backward compatibility
        ...(profile.logoUrl ? { 'settings.logoUrl': profile.logoUrl } : {}),
    });
}

/**
 * Uploads the agency logo to Firebase Storage and returns the download URL.
 */
export async function uploadAgencyLogo(
    agencyId: string,
    file: File
): Promise<string> {
    const ext = file.name.split('.').pop() ?? 'png';
    const storageRef = ref(storage, `agencies/${agencyId}/logo.${ext}`);
    const snapshot = await uploadBytes(storageRef, file);
    return getDownloadURL(snapshot.ref);
}

/**
 * Uploads the agency logo and immediately saves its URL to both
 * root and settings paths in Firestore to ensure consistency.
 */
export async function uploadAndSaveAgencyLogo(
    agencyId: string,
    file: File
): Promise<string> {
    const url = await uploadAgencyLogo(agencyId, file);
    const docRef = doc(db, 'agencies', agencyId);

    await updateDoc(docRef, {
        logoUrl: url,
        'settings.logoUrl': url
    });

    return url;
}

/**
 * Generates a unique join code suggestion for the agency.
 */
export async function generateJoinCode(): Promise<string> {
    const fn = httpsCallable<any, { joinCode: string }>(functions, 'users-generateAgencyJoinCode');
    const res = await fn();
    return res.data.joinCode;
}

/**
 * Saves a join code for the agency and enables/disables it.
 */
export async function saveJoinCode(joinCode: string, isEnabled: boolean): Promise<void> {
    const fn = httpsCallable<{ joinCode: string; isEnabled: boolean }, { success: boolean }>(functions, 'users-saveAgencyJoinCode');
    await fn({ joinCode, isEnabled });
}
