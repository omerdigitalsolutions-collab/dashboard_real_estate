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
import { db, storage } from '../config/firebase';
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
