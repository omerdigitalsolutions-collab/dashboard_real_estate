import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { AppUser } from '../types';

/**
 * Updates a user's profile information in Firestore.
 */
export async function updateUserProfile(
    userId: string,
    data: Partial<AppUser>
): Promise<void> {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, data);
}
