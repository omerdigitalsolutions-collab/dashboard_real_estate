import {
    collection,
    query,
    where,
    orderBy,
    onSnapshot,
    doc,
    updateDoc,
    addDoc,
    deleteDoc,
    serverTimestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Lead, Property } from '../types';

export const addLead = async (agencyId: string, data: Partial<Lead>) => {
    return addDoc(collection(db, 'leads'), {
        ...data,
        agencyId,
        status: 'new',
        createdAt: serverTimestamp()
    });
};

export const getLiveLeads = (agencyId: string, callback: (leads: Lead[]) => void) => {
    // Note: This requires a composite index in Firestore: (agencyId ASC, createdAt DESC)
    const q = query(
        collection(db, 'leads'),
        where('agencyId', '==', agencyId),
        orderBy('createdAt', 'desc')
    );

    return onSnapshot(q, (snapshot) => {
        const leads = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })) as Lead[];
        callback(leads);
    });
};

export const updateLead = async (leadId: string, data: Partial<Lead>) => {
    const docRef = doc(db, 'leads', leadId);
    await updateDoc(docRef, data);
};

export const deleteLead = async (leadId: string): Promise<void> => {
    await deleteDoc(doc(db, 'leads', leadId));
};

export const matchPropertiesForLead = (leadRequirements: Lead['requirements'], allProperties: Property[]): Property[] => {
    if (!leadRequirements) return [];

    return allProperties.filter(property => {
        if (property.status !== 'active') return false;

        const desiredCities = leadRequirements.desiredCity?.map(c => c.trim().toLowerCase()) ?? [];
        if (desiredCities.length > 0) {
            const propCity = (property.city ?? '').trim().toLowerCase();
            if (!desiredCities.includes(propCity)) return false;
        }

        if (leadRequirements.maxBudget != null && leadRequirements.maxBudget > 0) {
            if ((property.price ?? Infinity) > leadRequirements.maxBudget) return false;
        }

        if (leadRequirements.minRooms != null && leadRequirements.minRooms > 0) {
            if ((property.rooms ?? 0) < leadRequirements.minRooms) return false;
        }

        const propertyTypes = leadRequirements.propertyType ?? [];
        if (propertyTypes.length > 0) {
            if (!propertyTypes.includes(property.type)) return false;
        }

        return true;
    });
};
