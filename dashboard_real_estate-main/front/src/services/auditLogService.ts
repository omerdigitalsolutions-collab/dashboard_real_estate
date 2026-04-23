import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';
import { AuditLog } from '../types';

export async function getContractAuditLogs(agencyId: string, contractId: string): Promise<AuditLog[]> {
    const logsRef = collection(db, `agencies/${agencyId}/auditLogs`);
    const q = query(
        logsRef,
        where('contractId', '==', contractId),
        orderBy('createdAt', 'asc')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    })) as AuditLog[];
}
