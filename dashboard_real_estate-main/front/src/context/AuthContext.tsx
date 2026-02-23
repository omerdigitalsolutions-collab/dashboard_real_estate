import {
    createContext,
    useContext,
    useEffect,
    useState,
    ReactNode,
} from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
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
                // Step 1: Fast path — doc already exists at users/{uid}
                const uidDocRef = doc(db, 'users', firebaseUser.uid);
                const uidDocSnap = await getDoc(uidDocRef);

                if (uidDocSnap.exists()) {
                    setUserData({ id: firebaseUser.uid, uid: firebaseUser.uid, ...uidDocSnap.data() } as AppUser);
                    setRequireOnboarding(false);
                } else {
                    // Step 2: Check for a stub with matching email and uid == null
                    const email = firebaseUser.email || '';
                    const stubsSnap = email
                        ? await getDocs(
                            query(
                                collection(db, 'users'),
                                where('email', '==', email),
                                where('uid', '==', null)
                            )
                        )
                        : null;

                    const stubDoc = stubsSnap && !stubsSnap.empty ? stubsSnap.docs[0] : null;

                    if (stubDoc) {
                        // Invited agent: link UID to stub, then send to /agent-setup
                        await linkStubUser(stubDoc.id, firebaseUser.uid);
                        setUserData({ id: stubDoc.id, uid: firebaseUser.uid, ...stubDoc.data() } as AppUser);
                        setRequireOnboarding(false); // skip onboarding flow
                        // Redirect to agent setup — let ProtectedRoute handle navigation
                        window.location.replace(`/agent-setup?token=${stubDoc.id}`);
                    } else {
                        // Brand-new user — needs full agency onboarding
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
