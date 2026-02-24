import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';

export function useSuperAdmin() {
    const { currentUser } = useAuth();
    const [isSuperAdmin, setIsSuperAdmin] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!currentUser?.uid) {
            setIsSuperAdmin(false);
            setLoading(false);
            return;
        }

        const superAdminRef = doc(db, 'superAdmins', currentUser.uid);

        const unsubscribe = onSnapshot(
            superAdminRef,
            (docSnap) => {
                setIsSuperAdmin(docSnap.exists());
                setLoading(false);
            },
            (error) => {
                console.error('[useSuperAdmin] Error checking super admin status:', error);
                setIsSuperAdmin(false);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [currentUser?.uid]);

    return { isSuperAdmin, loading };
}
