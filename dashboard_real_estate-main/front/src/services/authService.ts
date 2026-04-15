import { signInWithRedirect, getRedirectResult, signInWithPopup } from 'firebase/auth';
import { doc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, googleProvider, functions } from '../config/firebase';

/**
 * Sign in using Google Provider (Popup) - Better for local dev
 */
export const signInWithGooglePopup = async () => {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        return result.user;
    } catch (error) {
        console.error("Error signing in with Google Popup", error);
        throw error;
    }
};

/**
 * Sign in using Google Provider (Redirect)
 */
export const signInWithGoogle = async () => {
    try {
        await signInWithRedirect(auth, googleProvider);
        return null as any; 
    } catch (error) {
        console.error("Error signing in with Google Redirect", error);
        throw error;
    }
};

/**
 * Call this on app load to handle the result after a Google redirect.
 */
export const getGoogleRedirectResult = async () => {
    try {
        const result = await getRedirectResult(auth);
        if (result) {
            console.log('[authService] Redirect result found user:', result.user.email);
        }
        return result?.user ?? null;
    } catch (error) {
        console.error("Error getting redirect result", error);
        return null;
    }
};

/**
 * Check if the user document exists in Firestore
 */
export const checkUserExists = async (uid: string): Promise<boolean> => {
    try {
        const userDocRef = doc(db, 'users', uid);
        const userDocSnap = await getDoc(userDocRef);
        return userDocSnap.exists();
    } catch (error) {
        console.error("Error checking if user exists", error);
        throw error;
    }
};

/**
 * Check if a phone number is available for registration via Cloud Function.
 */
export const checkPhoneAvailableService = async (phone: string): Promise<boolean> => {
    try {
        const checkFn = httpsCallable<{ phone: string }, { available: boolean }>(functions, 'agencies-checkPhoneAvailable');
        const result = await checkFn({ phone });
        return result.data.available;
    } catch (error) {
        console.error("Error checking phone availability:", error);
        throw error;
    }
};

/**
 * captureLeadService — Records initial onboarding data (Step 0) for lead management.
 * Returns a leadId.
 */
export const captureLeadService = async (data: { name: string; email?: string; phone: string }): Promise<string> => {
    try {
        const captureFn = httpsCallable<
            { name: string; email?: string; phone: string },
            { leadId: string }
        >(functions, 'agencies-captureLead');
        const result = await captureFn(data);
        return result.data.leadId;
    } catch (error) {
        console.error("Error capturing lead:", error);
        throw error;
    }
};

/**
 * Complete the onboarding process by calling the secure Cloud Function.
 * The function creates the agency and user documents server-side using Admin SDK.
 */
export const completeOnboarding = async (
    _uid: string,       // kept for signature compatibility
    _email: string,     // kept for signature compatibility
    userName: string,
    phone: string,
    agencyName: string,
    legalConsent: { acceptedAt: string; version: string },
    leadId?: string
): Promise<{ agencyId: string }> => {
    try {
        const createAgencyAccount = httpsCallable<
            { 
                agencyName: string; 
                userName: string; 
                phone: string; 
                legalConsent: { acceptedAt: string; version: string };
                leadId?: string;
            },
            { success: boolean; agencyId: string }
        >(functions, 'agencies-createAgencyAccount');

        const result = await createAgencyAccount({ agencyName, userName, phone, legalConsent, leadId });

        await forceRefreshToken(); 

        return { agencyId: result.data.agencyId };
    } catch (error) {
        console.error("Error completing onboarding via Cloud Function", error);
        throw error;
    }
};

/**
 * Force a refresh of the user's ID token.
 */
export const forceRefreshToken = async (): Promise<void> => {
    if (auth.currentUser) {
        await auth.currentUser.getIdToken(true);
    }
};

/**
 * Find a user document by email address.
 */
export const findUserByEmail = async (email: string): Promise<{ docId: string } | null> => {
    try {
        const q = query(collection(db, 'users'), where('email', '==', email));
        const snap = await getDocs(q);
        if (snap.empty) return null;
        return { docId: snap.docs[0].id };
    } catch (error) {
        console.error('[authService] Error finding user by email:', error);
        return null;
    }
};

/**
 * claimInviteTokenService — Securely links a newly authenticated user mapped by their invite token 
 * to the agency backend. Evaluated entirely via Cloud Functions to bypass firestore rules.
 */
export const claimInviteTokenService = async (token: string): Promise<void> => {
    try {
        const fn = httpsCallable<{ token: string }, { success: boolean; agencyId: string }>(
            functions, 'users-claimInviteToken'
        );
        await fn({ token });
        await forceRefreshToken();
    } catch (error) {
        console.error('[authService] Error claiming invite token:', error);
        throw error;
    }
};

/**
 * Internal system join via code — validates the code and creates/updates a stub user.
 * Returns the inviteToken.
 */
export const joinWithCode = async (email: string, joinCode: string): Promise<string> => {
    try {
        const fn = httpsCallable<{ email: string; joinCode: string }, { success: boolean; inviteToken: string }>(
            functions, 'users-joinWithCode'
        );
        const result = await fn({ email, joinCode });
        return result.data.inviteToken;
    } catch (error) {
        console.error('[authService] Error joining with code:', error);
        throw error;
    }
};
