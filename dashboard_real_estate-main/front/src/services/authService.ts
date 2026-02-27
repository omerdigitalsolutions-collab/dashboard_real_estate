import { signInWithRedirect, getRedirectResult } from 'firebase/auth';
import { doc, getDoc, getDocs, collection, query, where, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, googleProvider, functions } from '../config/firebase';

/**
 * Sign in using Google Provider
 */
export const signInWithGoogle = async () => {
    try {
        await signInWithRedirect(auth, googleProvider);
        // The result will be handled after the redirect in getGoogleRedirectResult()
        return null as any; // will never reach here
    } catch (error) {
        console.error("Error signing in with Google", error);
        throw error;
    }
};

/**
 * Call this on app load to handle the result after a Google redirect.
 * Returns the user if a redirect login just completed, otherwise null.
 */
export const getGoogleRedirectResult = async () => {
    try {
        const result = await getRedirectResult(auth);
        return result?.user ?? null;
    } catch (error) {
        console.error("Error getting redirect result", error);
        return null;
    }
};

/**
 * Check if the user document exists in Firestore
 * @param uid - The Firebase Auth UID
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
 * Complete the onboarding process by calling the secure Cloud Function.
 * The function creates the agency and user documents server-side using Admin SDK.
 */
export const completeOnboarding = async (
    _uid: string,       // kept for signature compatibility; server reads auth.uid directly
    _email: string,     // kept for signature compatibility; server reads auth.token.email
    userName: string,
    phone: string,
    agencyName: string
): Promise<{ agencyId: string }> => {
    try {
        const createAgencyAccount = httpsCallable<
            { agencyName: string; userName: string; phone: string },
            { success: boolean; agencyId: string }
        >(functions, 'agencies-createAgencyAccount');

        const result = await createAgencyAccount({ agencyName, userName, phone });

        await forceRefreshToken(); // Example: Immediately refresh token so new claims take effect

        return { agencyId: result.data.agencyId };
    } catch (error) {
        console.error("Error completing onboarding via Cloud Function", error);
        throw error;
    }
};

/**
 * Force a refresh of the user's ID token.
 * This is crucial for picking up new Custom Claims (e.g. agencyId, role) 
 * immediately after an onboarding or role-change Cloud Function executes,
 * preventing "Access Denied" errors from strict Firestore rules.
 * 
 * Example usage:
 * 1. Agent accepts invite -> Cloud Function assigns 'agencyId' claim.
 * 2. Client calls `await forceRefreshToken()`.
 * 3. Client can now navigate to protected dashboard and read `agencies/{agencyId}`.
 */
export const forceRefreshToken = async (): Promise<void> => {
    if (auth.currentUser) {
        await auth.currentUser.getIdToken(true);
    }
};

/**

 * Find a user document by email address.
 * Used to detect stub (invited but not yet logged in) user documents.
 * Returns the Firestore document ID of the stub, or null if not found.
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
 * Links a stub user document to a real Firebase Auth UID.
 * Called when an invited agent logs in for the first time.
 */
export const linkStubUser = async (stubDocId: string, uid: string): Promise<void> => {
    const userRef = doc(db, 'users', stubDocId);
    await updateDoc(userRef, { uid });
};

