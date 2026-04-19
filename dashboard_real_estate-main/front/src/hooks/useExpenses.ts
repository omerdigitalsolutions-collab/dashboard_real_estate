import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, serverTimestamp, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { Expense } from '../types';

export function useExpenses() {
    const { userData } = useAuth();
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!userData?.agencyId) {
            setExpenses([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        // We use a subcollection under the agency doc for tenant isolation
        const expensesRef = collection(db, 'agencies', userData.agencyId, 'expenses');
        const q = query(expensesRef);

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const fetchedExpenses = snapshot.docs.map(
                    (d) => ({ id: d.id, ...d.data() } as Expense)
                );
                // Sort by date descending locally to avoid requiring a composite index
                fetchedExpenses.sort((a, b) => {
                    const timeA = a.date?.toMillis ? a.date.toMillis() : 0;
                    const timeB = b.date?.toMillis ? b.date.toMillis() : 0;
                    return timeB - timeA;
                });
                setExpenses(fetchedExpenses);
                setLoading(false);
            },
            (err) => {
                console.error('Error fetching expenses:', err);
                setError(err);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [userData?.agencyId]);

    const addExpense = async (data: Omit<Expense, 'id' | 'agencyId' | 'createdBy' | 'createdAt'>) => {
        if (!userData?.agencyId || !userData?.uid) {
            throw new Error('User not authenticated properly to add expense');
        }

        const expensesRef = collection(db, 'agencies', userData.agencyId, 'expenses');

        const docRef = await addDoc(expensesRef, {
            ...data,
            agencyId: userData.agencyId,
            createdBy: userData.uid,
            createdAt: serverTimestamp(),
        });

        return docRef.id;
    };

    const deleteExpense = async (expenseId: string) => {
        if (!userData?.agencyId) {
            throw new Error('User not authenticated properly to delete expense');
        }
        const expenseRef = doc(db, 'agencies', userData.agencyId, 'expenses', expenseId);
        await deleteDoc(expenseRef);
    };

    const updateExpense = async (expenseId: string, data: Partial<Expense>) => {
        if (!userData?.agencyId) {
            throw new Error('User not authenticated properly to update expense');
        }
        const expenseRef = doc(db, 'agencies', userData.agencyId, 'expenses', expenseId);
        await updateDoc(expenseRef, {
            ...data,
            updatedAt: serverTimestamp(),
        });
    };

    return { expenses, loading, error, addExpense, deleteExpense, updateExpense };

}
