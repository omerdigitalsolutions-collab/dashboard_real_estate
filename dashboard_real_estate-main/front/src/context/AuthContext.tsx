import {
    createContext,
    useContext,
    useEffect,
    useState,
    ReactNode,
} from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, setDoc, serverTimestamp, limit, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { AppUser } from '../types';
import { claimInviteTokenService } from '../services/authService';

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
    /** Allows manually overriding the user data (used for impersonation feature) */
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
        let unsubUserDoc: (() => void) | null = null;

        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            console.log('[AuthContext] onAuthStateChanged fired:', firebaseUser ? `User: ${firebaseUser.email} (UID: ${firebaseUser.uid})` : 'LOGGED OUT');

            // Clean up any previous real-time user doc listener
            if (unsubUserDoc) {
                unsubUserDoc();
                unsubUserDoc = null;
            }

            setLoading(true);

            try {
                setCurrentUser(firebaseUser);

                if (firebaseUser) {
                    console.log('[AuthContext] Refreshing token...');
                    try {
                        await firebaseUser.getIdToken(true);
                    } catch (e) {
                        console.warn('[AuthContext] Token refresh warning:', e);
                    }

                    const uidDocRef = doc(db, 'users', firebaseUser.uid);
                    console.log('[AuthContext] Checking user doc at /users/' + firebaseUser.uid);
                    let uidDocSnap = await getDoc(uidDocRef);

                    // ── INVITE TOKEN FLOW ──────────────────────────────────────────
                    const urlParams = new URLSearchParams(window.location.search);
                    const urlToken = urlParams.get('token');

                    if (urlToken) {
                        console.log('[AuthContext] Token found in URL, prioritizing invite check.');
                        try {
                            const tokenSnap = await getDocs(
                                query(collection(db, 'users'), where('inviteToken', '==', urlToken), limit(1))
                            );

                            if (!tokenSnap.empty) {
                                const stubDoc = tokenSnap.docs[0];
                                const stubData = stubDoc.data();

                                if (stubData.uid === null || stubData.uid === firebaseUser.uid) {
                                    // Always use the Cloud Function to claim — it handles
                                    // both new users and existing-user migration securely.
                                    console.log('[AuthContext] Claiming invite token via Cloud Function...');
                                    try {
                                        await claimInviteTokenService(urlToken);
                                    } catch (cfErr: any) {
                                        console.error('[AuthContext] claimInviteToken failed:', cfErr);
                                        // If already claimed by this user, continue to redirect
                                        if (!cfErr?.message?.includes('already')) {
                                            throw cfErr;
                                        }
                                    }

                                    // Redirect to agent setup
                                    window.location.replace(`/agent-setup?token=${urlToken}`);
                                    return; // Stop here, redirecting
                                } else {
                                    console.log('[AuthContext] Token already linked to a different user.');
                                }
                            } else {
                                // Token not found — might already be claimed & stub deleted.
                                // Check if this user already has a doc (i.e., claim succeeded previously).
                                if (uidDocSnap.exists()) {
                                    console.log('[AuthContext] Token not found but user doc exists — token was already claimed.');
                                    // Continue to normal flow below
                                } else {
                                    console.log('[AuthContext] Token not found in DB — invalid or expired token.');
                                }
                            }
                        } catch (inviteErr) {
                            console.error('[AuthContext] Invite check failed — proceeding as normal auth flow:', inviteErr);
                        }
                    }

                    if (!uidDocSnap.exists()) {
                        console.log('[AuthContext] User doc does not exist.');
                        const email = firebaseUser.email?.toLowerCase();
                        const knownAdmins: Record<string, { agencyId: string, name: string }> = {
                            'omerdigitalsolutions@gmail.com': { agencyId: 'FD1zzacN9WFeSmENqY5G', name: 'OMER' },
                            'omerfm4444@gmail.com': { agencyId: 'P7z9y24z2DBGiCPSgQRI', name: 'עומר עסיס' },
                            'omerasis4@gmail.com': { agencyId: '5QfL1fcRZ4CsZ8ZZmsUK', name: 'OMER ASIS' }
                        };

                        if (email && knownAdmins[email] && !urlToken) {
                            const info = knownAdmins[email];
                            console.log('[RECOVERY] Healing user record for:', email);
                            try {
                                const agencyRef = doc(db, 'agencies', info.agencyId);
                                await setDoc(agencyRef, {
                                    agencyId: info.agencyId,
                                    agencyName: email === 'omerdigitalsolutions@gmail.com' ? "אנגלו" : "סוכנות " + info.name,
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

                                uidDocSnap = await getDoc(uidDocRef);
                                console.log('[RECOVERY] Healing successful.');
                            } catch (healingErr) {
                                console.error('[RECOVERY] Healing process failed:', healingErr);
                            }
                        }
                    }

                    if (uidDocSnap.exists()) {
                        console.log('[AuthContext] Setting userData and starting real-time listener.');
                        setUserData({ id: firebaseUser.uid, uid: firebaseUser.uid, ...uidDocSnap.data() } as AppUser);
                        setRequireOnboarding(false);

                        // ── REAL-TIME LISTENER ──────────────────────────────────
                        unsubUserDoc = onSnapshot(uidDocRef, (snap) => {
                            if (snap.exists()) {
                                console.log('[AuthContext] onSnapshot: user doc updated.');
                                setUserData({ id: firebaseUser.uid, uid: firebaseUser.uid, ...snap.data() } as AppUser);
                            }
                        }, (err) => {
                            console.warn('[AuthContext] onSnapshot error (non-fatal):', err);
                        });
                    } else {
                        // No user doc and no token — this is a brand new user, require onboarding.
                        // We intentionally do NOT search Firestore users/ by email here
                        // to avoid redirect loops. Agents must join via an explicit invite link.
                        console.log('[AuthContext] No user doc found. Require onboarding.');
                        setUserData(null);
                        setRequireOnboarding(true);
                    }
                } else {
                    setUserData(null);
                    setRequireOnboarding(false);
                }
            } catch (globalErr) {
                console.error('[AuthContext] UNEXPECTED GLOBAL ERROR:', globalErr);
            } finally {
                console.log('[AuthContext] Setting loading to FALSE');
                setLoading(false);
                setIsInitial(false);
            }
        });

        return () => {
            unsubscribe();
            if (unsubUserDoc) unsubUserDoc();
        };
    }, []);

    const value: AuthContextType = { currentUser, userData, loading, requireOnboarding, refreshUserData, setUserData };

    return (
        <AuthContext.Provider value={value}>
            {/* Block rendering until initial auth state is resolved.
          This prevents a flash of the login screen for persisted sessions. */}
            {!isInitial && children}
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
