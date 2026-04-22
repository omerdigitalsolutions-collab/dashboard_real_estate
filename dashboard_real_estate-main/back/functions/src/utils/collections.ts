import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Returns the agency-scoped properties subcollection reference.
 * Use this everywhere instead of db.collection('properties').where('agencyId', ...)
 */
export const agencyPropsCol = (agencyId: string): admin.firestore.CollectionReference =>
    db.collection('agencies').doc(agencyId).collection('properties');

/**
 * Returns a specific property document reference.
 */
export const agencyPropDoc = (
    agencyId: string,
    propertyId: string
): admin.firestore.DocumentReference =>
    db.collection('agencies').doc(agencyId).collection('properties').doc(propertyId);
