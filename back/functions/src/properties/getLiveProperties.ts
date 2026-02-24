/**
 * getLiveProperties — Returns a paginated snapshot of properties for an agency.
 *
 * Note: This is implemented as an onCall function for server-side use cases
 * (e.g., admin tooling, webhooks). The primary real-time client listener should
 * use the Firestore SDK directly on the frontend with the query:
 *
 *   query(
 *     collection(db, 'properties'),
 *     where('agencyId', '==', agencyId),
 *     orderBy('createdAt', 'desc')
 *   )
 *
 * ⚠️  COMPOSITE INDEX REQUIRED:
 *   Collection: properties
 *   Fields: agencyId ASC, createdAt DESC
 *   Create at: https://console.firebase.google.com/project/_/firestore/indexes
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

/**
 * Input:  { agencyId: string }
 * Output: { properties: Property[] }
 */
export const getLiveProperties = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required.');
    }

    const { agencyId } = request.data as { agencyId?: string };

    if (!agencyId?.trim()) {
        throw new HttpsError('invalid-argument', 'agencyId is required.');
    }

    // Verify caller belongs to this agency
    const callerDoc = await db.doc(`users/${request.auth.uid}`).get();
    if (!callerDoc.exists || callerDoc.data()?.agencyId !== agencyId) {
        throw new HttpsError('permission-denied', 'Access denied to this agency.');
    }

    const snapshot = await db
        .collection('properties')
        .where('agencyId', '==', agencyId)
        .orderBy('createdAt', 'desc')
        .get();

    const properties = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    return { properties };
});
