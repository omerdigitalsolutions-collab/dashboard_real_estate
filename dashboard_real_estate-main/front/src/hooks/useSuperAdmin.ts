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
                // 1. Check the firestore collection ONLY (this is the single source of truth)
                const superAdminRef = doc(db, 'superAdmins', currentUser.uid);
                const docSnap = await getDoc(superAdminRef);

                const doesExist = docSnap.exists();
                console.log(`[useSuperAdmin] Checking UID ${currentUser.uid}: ${doesExist ? 'IS SUPER ADMIN' : 'NOT Super Admin'}`);

                if (isMounted) {
                    setIsSuperAdmin(doesExist);
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
