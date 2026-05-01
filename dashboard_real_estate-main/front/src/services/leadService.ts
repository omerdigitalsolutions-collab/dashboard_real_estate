import {
    collection,
    query,
    where,
    orderBy,
    onSnapshot,
    doc,
    updateDoc,
    deleteDoc,
    collectionGroup,
    getDocs
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Lead, Property } from '../types';
import { isCityMatch } from '../utils/stringUtils';

export const getCollaborativeLeads = async (): Promise<Lead[]> => {
    const q = query(
        collectionGroup(db, 'leads'),
        where('collaborationStatus', '==', 'collaborative')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Lead));
};

export const matchPropertiesForLeadCF = async (agencyId: string, requirements: Lead['requirements']): Promise<{ matches: any[], totalScanned: number }> => {
    const functions = getFunctions(undefined, 'europe-west1');
    const matchCallable = httpsCallable(functions, 'leads-matchPropertiesForLead');
    const result = await matchCallable({
        agencyId,
        requirements
    });
    return result.data as { matches: any[], totalScanned: number };
};

export const addLead = async (_agencyId: string, data: Partial<Lead>) => {
    const functions = getFunctions(undefined, 'europe-west1');
    const addLeadCallable = httpsCallable(functions, 'leads-addLead');
    const result = await addLeadCallable({
        // Passing data down. The backend function adds agencyId and timestamps inside
        ...data
    });
    return result.data;
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

export const updateLead = async (leadId: string, updates: Partial<Lead>) => {
    const functions = getFunctions(undefined, 'europe-west1');
    const updateLeadCallable = httpsCallable<{ leadId: string; updates: Partial<Lead> }, { success: boolean }>(
        functions, 
        'leads-updateLead'
    );
    await updateLeadCallable({ leadId, updates });
};

export const deleteLead = async (leadId: string): Promise<void> => {
    await deleteDoc(doc(db, 'leads', leadId));
};

export const matchPropertiesForLead = (leadRequirements: Lead['requirements'], allProperties: Property[]): Property[] => {
    if (!leadRequirements) return [];

    return allProperties.filter(property => {
        if (property.status !== 'active') return false;

        if (!isCityMatch(leadRequirements.desiredCity || [], property.address?.city || '')) {
            return false;
        }

        if (leadRequirements.maxBudget != null && leadRequirements.maxBudget > 0) {
            if ((property.financials?.price ?? Infinity) > leadRequirements.maxBudget) return false;
        }

        if (leadRequirements.minRooms != null && leadRequirements.minRooms > 0) {
            if ((property.rooms ?? 0) < leadRequirements.minRooms) return false;
        }

        const propertyTypes = leadRequirements.propertyType ?? [];
        if (propertyTypes.length > 0) {
            if (!propertyTypes.includes(property.transactionType)) return false;
        }

        return true;
    });
};

export const matchLeadsForProperty = (property: Property, allLeads: Lead[]): Lead[] => {
    return allLeads.filter(lead => {
        if (lead.status !== 'new' && lead.status !== 'in_progress' && lead.status !== 'negotiation') return false;
        
        const reqs = lead.requirements;
        if (!reqs) return false;

        if (!isCityMatch(reqs.desiredCity || [], property.address?.city || '')) {
            return false;
        }

        if (reqs.maxBudget != null && reqs.maxBudget > 0) {
            if ((property.financials?.price ?? Infinity) > reqs.maxBudget) return false;
        }

        if (reqs.minRooms != null && reqs.minRooms > 0) {
            if ((property.rooms ?? 0) < reqs.minRooms) return false;
        }

        const propertyTypes = reqs.propertyType ?? [];
        if (propertyTypes.length > 0) {
            if (!propertyTypes.includes(property.transactionType)) return false;
        }

        return true;
    });
};
