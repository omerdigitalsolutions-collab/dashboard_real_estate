import { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

export interface AuthUser {
    uid: string;
    email: string;
    displayName?: string;
    createdAt: string;
    disabled: boolean;
}

export const useAuthUsers = () => {
    const [authUsers, setAuthUsers] = useState<AuthUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchAuthUsers = async () => {
            try {
                setLoading(true);
                const { functions } = await import('../config/firebase');
                const listAuthUsersFn = httpsCallable<void, { success: boolean, users: AuthUser[] }>(
                    functions, 
                    'superadmin-superAdminListAuthUsers'
                );
                
                const result = await listAuthUsersFn();
                
                if (result.data.success) {
                    setAuthUsers(result.data.users);
                } else {
                    throw new Error('Failed to fetch auth users');
                }
            } catch (err: any) {
                console.error('[useAuthUsers] Error:', err);
                setError(err.message || 'Error fetching Auth users');
                setAuthUsers([]); // Ensure empty array on failure
            } finally {
                setLoading(false);
            }
        };

        fetchAuthUsers();
    }, []);

    return { authUsers, loading, error };
};
