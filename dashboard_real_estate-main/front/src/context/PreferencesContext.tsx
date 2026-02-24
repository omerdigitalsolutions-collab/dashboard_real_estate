import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from './AuthContext';
import { UserPreferences } from '../types';
import debounce from 'lodash.debounce';

interface PreferencesContextType {
    preferences: UserPreferences | null;
    saveLayout: (newLayout: any[]) => void;
    updatePreferences: (newPrefs: Partial<UserPreferences>) => void;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
    const { userData } = useAuth();
    const [preferences, setPreferences] = useState<UserPreferences | null>(null);

    // Initialize from userData on mount or when userData changes
    useEffect(() => {
        if (userData) {
            setPreferences(userData.preferences || {});
        } else {
            setPreferences(null);
        }
    }, [userData]);

    // Creates the debounced function, stabilized via useRef so it's not recreated on every render
    const debouncedSaveToFirestore = useRef(
        debounce(async (uid: string, newPrefs: UserPreferences) => {
            if (!uid || !newPrefs) return;
            try {
                const userRef = doc(db, 'users', uid);

                // Shallow clone to manipulate safely
                const cleanPrefs = { ...newPrefs };

                // 1. Remove any root level undefined fields
                Object.keys(cleanPrefs).forEach(k => {
                    const key = k as keyof UserPreferences;
                    if (cleanPrefs[key] === undefined) {
                        delete cleanPrefs[key];
                    }
                });

                // 2. Strip nested undefined values ONLY from the layout array
                // Do NOT deep traverse the whole object because it destroys serverTimestamp() FieldValue prototypes.
                if (cleanPrefs.dashboardLayout) {
                    cleanPrefs.dashboardLayout = JSON.parse(JSON.stringify(cleanPrefs.dashboardLayout));
                }

                await updateDoc(userRef, {
                    preferences: {
                        ...cleanPrefs,
                        lastUpdated: serverTimestamp()
                    }
                });
                console.log('[PreferencesContext] Auto-saved preferences to Firestore', cleanPrefs);
            } catch (err) {
                console.error('[PreferencesContext] Failed to save preferences to Firestore:', err);
            }
        }, 2000)
    ).current;

    // Manual generic update for any preference (sync locally, fire debounced update)
    const updatePreferences = useCallback((newPrefs: Partial<UserPreferences>) => {
        if (!userData?.id) return;

        setPreferences((prev) => {
            const updated = { ...prev, ...newPrefs };
            debouncedSaveToFirestore(userData.id, updated);
            return updated;
        });
    }, [userData?.id, debouncedSaveToFirestore]);

    // Specialty function for layout since it gets spammed rapidly
    const saveLayout = useCallback((newLayout: any[]) => {
        updatePreferences({ dashboardLayout: newLayout });
    }, [updatePreferences]);

    const value = {
        preferences,
        saveLayout,
        updatePreferences,
    };

    return (
        <PreferencesContext.Provider value={value}>
            {children}
        </PreferencesContext.Provider>
    );
}

export function usePreferences() {
    const context = useContext(PreferencesContext);
    if (context === undefined) {
        throw new Error('usePreferences must be used within a PreferencesProvider');
    }
    return context;
}
