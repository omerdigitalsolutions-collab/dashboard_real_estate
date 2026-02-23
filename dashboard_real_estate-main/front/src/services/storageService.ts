import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../config/firebase';

/**
 * Uploads an agent's profile picture to Firebase Storage and returns the download URL.
 * File path: users/{userId}/profile/avatar.jpg
 */
export async function uploadProfilePicture(
    userId: string,
    file: File
): Promise<string> {
    const ext = file.name.split('.').pop() ?? 'jpg';
    const storageRef = ref(storage, `users/${userId}/profile/avatar.${ext}`);
    const snapshot = await uploadBytes(storageRef, file);
    return getDownloadURL(snapshot.ref);
}
