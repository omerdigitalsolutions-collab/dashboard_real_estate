import {
    createContext,
    useContext,
    useEffect,
    useState,
    ReactNode,
} from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { AppUser } from '../types';

// ─── Context Shape ───────────────────────────────────────────────────────────── 
interface AuthContextType {
    currentUser: User | null;
    userData: AppUser | null;
    loading: boolean;
    requireOnboarding: boolean;
    refreshUserData: () => Promise<void>;
    setUserData: React.Dispatch<React.SetStateAction<AppUser | null>>;
}

// ─── Context ──────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [userData, setUserData] = useState<AppUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [isInitial, setIsInitial] = useState(true);
    const [requireOnboarding, setRequireOnboarding] = useState(false);

    const refreshUserData = async (uid?: string) => {
        const targetUid = uid || currentUser?.uid;
        if (!targetUid) return;

        try {
            const userDocRef = doc(db, 'users', targetUid);
            const userDocSnap = await getDoc(userDocRef);

            if (userDocSnap.exists()) {
                setUserData({ id: targetUid, uid: targetUid, ...userDocSnap.data() } as AppUser);
                setRequireOnboarding(false);
                return;
            }

            const stubSnap = await getDocs(
                query(collection(db, 'users'), where('uid', '==', targetUid))
            );
            if (!stubSnap.empty) {
                const stubDoc = stubSnap.docs[0];
                setUserData({ id: stubDoc.id, uid: targetUid, ...stubDoc.data() } as AppUser);
                setRequireOnboarding(false);
            } else {
                setUserData(null);
                setRequireOnboarding(true);
            }
        } catch (error) {
            console.error('[AuthContext] Error fetching user document:', error);
            setUserData(null);
        }
    };

    useEffect(() => {
        let unsubUserDoc: (() => void) | null = null;

        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            console.log('[AuthContext] onAuthStateChanged fired:', firebaseUser ? `User: ${firebaseUser.email} (UID: ${firebaseUser.uid})` : 'LOGGED OUT');

            // Clean up any previous real-time user doc listener
            if (unsubUserDoc) {
                try { unsubUserDoc(); } catch (e) { console.warn('unsubUserDoc fail', e); }
                unsubUserDoc = null;
            }

            setLoading(true);

            try {
                setCurrentUser(firebaseUser);

                if (firebaseUser) {
                    // 1. Refresh token to ensure custom claims are present
                    try {
                        await firebaseUser.getIdToken(true);
                    } catch (e) {
                        console.warn('[AuthContext] Token refresh warning:', e);
                    }

                    // 2. Fetch user doc with defensive check
                    const uidDocRef = doc(db, 'users', firebaseUser.uid);
                    const uidDocSnap = await getDoc(uidDocRef);
                    
                    // Defensive: if auth state changed while we were fetching, abort
                    if (auth.currentUser?.uid !== firebaseUser.uid) {
                        console.log('[AuthContext] User changed during fetch, aborting.');
                        return;
                    }

                    if (uidDocSnap.exists()) {
                        console.log('[AuthContext] Setting userData and starting real-time listener.');
                        setUserData({ id: firebaseUser.uid, uid: firebaseUser.uid, ...uidDocSnap.data() } as AppUser);
                        setRequireOnboarding(false);

                        // 3. Start real-time listener
                        unsubUserDoc = onSnapshot(uidDocRef, (snap) => {
                            if (snap.exists()) {
                                setUserData({ id: firebaseUser.uid, uid: firebaseUser.uid, ...snap.data() } as AppUser);
                            }
                        }, (err) => {
                            console.warn('[AuthContext] onSnapshot error (non-fatal):', err);
                        });
                    } else {
                        console.log('[AuthContext] No user doc found. Require onboarding.');
                        setUserData(null);
                        setRequireOnboarding(true);
                    }
                } else {
                    // User is logged out
                    setUserData(null);
                    setRequireOnboarding(false);
                }
            } catch (globalErr) {
                console.error('[AuthContext] UNEXPECTED GLOBAL ERROR:', globalErr);
            } finally {
                // Only finalize loading if the current auth state still matches this execution
                if (auth.currentUser?.uid === firebaseUser?.uid || !firebaseUser) {
                    setLoading(false);
                    setIsInitial(false);
                }
            }
        });

        return () => {
            unsubscribe();
            if (unsubUserDoc) {
                try { unsubUserDoc(); } catch (e) { }
            }
        };
    }, []);

    const value: AuthContextType = { currentUser, userData, loading, requireOnboarding, refreshUserData, setUserData };

    return (
        <AuthContext.Provider value={value}>
            {!isInitial && children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextType {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an <AuthProvider>');
    }
    return context;
}
