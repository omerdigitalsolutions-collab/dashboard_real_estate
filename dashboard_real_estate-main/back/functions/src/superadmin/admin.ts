import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

/**
 * superAdminListAuthUsers
 * 
 * Fetches ALL users from Firebase Authentication using a pagination loop.
 * Strictly restricted to users with the 'superadmin' role in their custom claims.
 */
export const superAdminListAuthUsers = functions.https.onCall({ cors: true }, async (request) => {
    // 1. Role verification
    if (request.auth?.token.role !== 'superadmin') {
        throw new functions.https.HttpsError('permission-denied', 'Unauthorized service access');
    }

    try {
        const auth = admin.auth();
        const users: any[] = [];
        let nextPageToken: string | undefined = undefined;

        // Fetch all users using a pagination loop
        do {
            const listUsersResult = await auth.listUsers(1000, nextPageToken);
            const batch = listUsersResult.users.map((userRecord) => ({
                uid: userRecord.uid,
                email: userRecord.email || '',
                displayName: userRecord.displayName || '',
                createdAt: userRecord.metadata.creationTime || new Date().toISOString(),
                disabled: userRecord.disabled || false,
            }));
            users.push(...batch);
            nextPageToken = listUsersResult.pageToken;
        } while (nextPageToken);

        console.log(`[superAdminListAuthUsers] Successfully fetched ${users.length} users.`);
        return { success: true, users };
    } catch (error: any) {
        console.error('[superAdminListAuthUsers] Error:', error);
        throw new functions.https.HttpsError(
            'internal',
            'Failed to fetch users from Firebase Auth.'
        );
    }
});
