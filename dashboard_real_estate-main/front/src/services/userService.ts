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

/**
 * Saves the user's custom dashboard widget layout to Firestore.
 */
export async function updateDashboardLayout(
    userId: string,
    layout: any[]
): Promise<void> {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { dashboardLayout: layout });
}

/**
 * Saves the user's custom WhatsApp message templates to Firestore.
 */
export async function updateUserWhatsAppTemplates(
    userId: string,
    templates: { id: string; name: string; content: string }[]
): Promise<void> {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { whatsappTemplates: templates });
}
