import { signInAnonymously, Auth } from 'firebase/auth';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable, Functions } from 'firebase/functions';
import { db, functions, auth } from '../config/firebase';
import { Field } from '../types';

/**
 * Service for client-side contract signing.
 * Manages anonymous auth, field value updates, and Cloud Function calls.
 */
export const signingService = {
    /**
     * Ensure the user is signed in (anonymously if not already authenticated).
     * Returns the current user or creates an anonymous session.
     */
    async ensureAnonymousAuth() {
        if (!auth.currentUser) {
            await signInAnonymously(auth);
        }
        return auth.currentUser;
    },

    /**
     * Update the fields array in a contract document with user-captured values.
     * Called after the client fills in text, dates, and signatures.
     *
     * @param agencyId The agency ID that owns the contract
     * @param contractId The contract document ID
     * @param fields The updated fields array with values populated
     */
    async updateFieldValues(agencyId: string, contractId: string, fields: Field[]): Promise<void> {
        await this.ensureAnonymousAuth();

        const contractRef = doc(db, `agencies/${agencyId}/contracts`, contractId);
        await updateDoc(contractRef, {
            fields,
            updatedAt: serverTimestamp(),
        });
    },

    /**
     * Trigger the backend signDeal Cloud Function to burn the PDF and save it.
     *
     * @param dealId The deal document ID (from the contract)
     * @param agencyId The agency ID (required for anonymous users)
     */
    async triggerSignFunction(dealId: string, agencyId: string): Promise<any> {
        await this.ensureAnonymousAuth();

        const signDeal = httpsCallable(functions, 'contracts-signDeal');
        return signDeal({ dealId, agencyId });
    },
};
