import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';

export function useSuperAdmin() {
    const { currentUser } = useAuth();
    const [isSuperAdmin, setIsSuperAdmin] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;

        if (!currentUser?.uid) {
            setIsSuperAdmin(false);
            setLoading(false);
            return;
        }

        const checkSuperAdmin = async () => {
            try {
                const superAdminRef = doc(db, 'superAdmins', currentUser.uid);
                const docSnap = await getDoc(superAdminRef);

                if (isMounted) {
                    setIsSuperAdmin(docSnap.exists());
                    setLoading(false);
                }
            } catch (error) {
                console.error('[useSuperAdmin] Error checking super admin status:', error);
                if (isMounted) {
                    setIsSuperAdmin(false);
                    setLoading(false);
                }
            }
        };

        checkSuperAdmin();

        return () => {
            isMounted = false;
        };
    }, [currentUser?.uid]);

    return { isSuperAdmin, loading };
}
