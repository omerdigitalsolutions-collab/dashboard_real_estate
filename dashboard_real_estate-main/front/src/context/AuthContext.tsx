import {
    createContext,
    useContext,
    useEffect,
    useState,
    ReactNode,
} from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, setDoc, serverTimestamp, limit } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { AppUser } from '../types';
import { linkStubUser } from '../services/authService';

// ─── Context Shape ─────────────────────────────────────────────────────────────
interface AuthContextType {
    /** The raw Firebase Auth user object. Null when logged out. */
    currentUser: User | null;
    /**
     * The Firestore user document — contains agencyId and role.
     * Null until the document is fetched after login.
     */
    userData: AppUser | null;
    /** True while auth state or Firestore fetch is in flight. */
    loading: boolean;
    /** True if the user has authenticated but hasn't completed onboarding */
    requireOnboarding: boolean;
    /** Triggers a manual refetch of the Firestore user doc */
    refreshUserData: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [userData, setUserData] = useState<AppUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [requireOnboarding, setRequireOnboarding] = useState(false);

    const refreshUserData = async (uid?: string) => {
        const targetUid = uid || currentUser?.uid;
        if (!targetUid) return;

        try {
            // Fast path: check if doc exists at users/{uid} (agency admin flow)
            const userDocRef = doc(db, 'users', targetUid);
            const userDocSnap = await getDoc(userDocRef);

            if (userDocSnap.exists()) {
                setUserData({ id: targetUid, uid: targetUid, ...userDocSnap.data() } as AppUser);
                setRequireOnboarding(false);
                return;
            }

            // Fallback: invited agent whose doc has a random stub ID — query by uid field
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
        /**
         * onAuthStateChanged fires once on mount (with the persisted session
         * if the user is already logged in) and again on every subsequent
         * login / logout.  We return its unsubscribe function for cleanup.
         */
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            setCurrentUser(firebaseUser);

            if (firebaseUser) {
                // Force-refresh the ID token so Custom Claims (agencyId, role)
                // are always up-to-date before any Firestore reads happen.
                try {
                    await firebaseUser.getIdToken(true);
                } catch (e) {
                    console.warn('[AuthContext] Token refresh warning:', e);
                }

                // Step 1: Fast path — doc already exists at users/{uid}
                const uidDocRef = doc(db, 'users', firebaseUser.uid);
                let uidDocSnap = await getDoc(uidDocRef);

                if (!uidDocSnap.exists()) {
                    // EMERGENCY SELF-HEAL
                    const email = firebaseUser.email?.toLowerCase();
                    const knownAdmins: Record<string, { agencyId: string, name: string }> = {
                        'omerdigitalsolutions@gmail.com': { agencyId: 'FD1zzacN9WFeSmENqY5G', name: 'OMER' },
                        'omerfm4444@gmail.com': { agencyId: 'P7z9y24z2DBGiCPSgQRI', name: 'עומר עסיס' },
                        'omerasis4@gmail.com': { agencyId: '5QfL1fcRZ4CsZ8ZZmsUK', name: 'OMER ASIS' }
                    };

                    if (email && knownAdmins[email]) {
                        const info = knownAdmins[email];
                        console.log('[RECOVERY] Healing user:', email);
                        try {
                            const agencyRef = doc(db, 'agencies', info.agencyId);
                            // Only set if it doesn't exist or merge
                            await setDoc(agencyRef, {
                                agencyId: info.agencyId,
                                agencyName: email === 'omerdigitalsolutions@gmail.com' ? "אנגלו" : "סוכנות " + info.agencyId,
                                whatsappIntegration: email === 'omerdigitalsolutions@gmail.com' ? {
                                    idInstance: "7105261595",
                                    apiTokenInstance: "2d3153735b0c422c9c44e64c299fb66c861cbaacd68a4395af",
                                    status: "connected",
                                    updatedAt: serverTimestamp()
                                } : null,
                                createdAt: serverTimestamp()
                            }, { merge: true });

                            await setDoc(uidDocRef, {
                                uid: firebaseUser.uid,
                                email: firebaseUser.email,
                                name: info.name,
                                agencyId: info.agencyId,
                                role: 'admin',
                                createdAt: serverTimestamp()
                            });

                            // Re-fetch
                            uidDocSnap = await getDoc(uidDocRef);
                        } catch (healingErr) {
                            console.error('[RECOVERY] Healing failed:', healingErr);
                        }
                    }
                }

                if (uidDocSnap.exists()) {
                    setUserData({ id: firebaseUser.uid, uid: firebaseUser.uid, ...uidDocSnap.data() } as AppUser);
                    setRequireOnboarding(false);
                } else {
                    // Step 2: Check for a stub with matching email and uid == null
                    const email = firebaseUser.email || '';
                    try {
                        const stubsSnap = email
                            ? await getDocs(
                                query(
                                    collection(db, 'users'),
                                    where('email', '==', email),
                                    where('uid', '==', null),
                                    limit(1)
                                )
                            )
                            : null;

                        const stubDoc = stubsSnap && !stubsSnap.empty ? stubsSnap.docs[0] : null;

                        if (stubDoc) {
                            // Invited agent: link UID to stub, then send to /agent-setup
                            await linkStubUser(stubDoc.id, firebaseUser.uid);
                            setUserData({ id: stubDoc.id, uid: firebaseUser.uid, ...stubDoc.data() } as AppUser);
                            setRequireOnboarding(false); // skip onboarding flow
                            window.location.replace(`/agent-setup?token=${stubDoc.id}`);
                        } else {
                            // Brand-new user — needs full agency onboarding
                            setUserData(null);
                            setRequireOnboarding(true);
                        }
                    } catch (rulesErr) {
                        console.error('[AuthContext] Rules check failed:', rulesErr);
                        setUserData(null);
                        setRequireOnboarding(true);
                    }
                }
            } else {
                // User logged out — clear profile data
                setUserData(null);
                setRequireOnboarding(false);
            }

            setLoading(false);
        });

        return unsubscribe; // Cleanup listener on unmount
    }, []);

    const value: AuthContextType = { currentUser, userData, loading, requireOnboarding, refreshUserData };

    return (
        <AuthContext.Provider value={value}>
            {/* Block rendering until initial auth state is resolved.
          This prevents a flash of the login screen for persisted sessions. */}
            {!loading && children}
        </AuthContext.Provider>
    );
}

// ─── Custom Hook ──────────────────────────────────────────────────────────────
/**
 * useAuth() — consume the AuthContext anywhere in the component tree.
 *
 * Usage:
 *   const { currentUser, userData, loading } = useAuth();
 *   const agencyId = userData?.agencyId;
 */
export function useAuth(): AuthContextType {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an <AuthProvider>');
    }
    return context;
}
