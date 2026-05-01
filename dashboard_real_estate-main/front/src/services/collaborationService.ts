import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  updateDoc, 
  doc, 
  serverTimestamp,
  Timestamp,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { CollaborationRequest } from '../types';

const COLLABORATIONS_COLLECTION = 'collaborations';

/**
 * Sends a new collaboration request for a property
 */
export const sendCollaborationRequest = async (params: {
  fromAgencyId: string;
  toAgencyId: string;
  propertyId?: string;
  leadId?: string;
  agentId: string;
  notes?: string;
}) => {
  const collaborationData = {
    ...params,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, COLLABORATIONS_COLLECTION), collaborationData);
  return docRef.id;
};

/**
 * Fetches all collaboration requests involving the current agency
 */
export const getAgencyCollaborationRequests = async (agencyId: string, role: 'sender' | 'receiver' | 'all' = 'all') => {
  let q;
  if (role === 'sender') {
    q = query(collection(db, COLLABORATIONS_COLLECTION), where('fromAgencyId', '==', agencyId));
  } else if (role === 'receiver') {
    q = query(collection(db, COLLABORATIONS_COLLECTION), where('toAgencyId', '==', agencyId));
  } else {
    // Note: Firestore doesn't support 'OR' queries across different fields easily without composite indexes or multiple queries
    // For simplicity, we'll fetch both and merge or use a different approach if needed
    const q1 = query(collection(db, COLLABORATIONS_COLLECTION), where('fromAgencyId', '==', agencyId));
    const q2 = query(collection(db, COLLABORATIONS_COLLECTION), where('toAgencyId', '==', agencyId));
    
    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
    const results: CollaborationRequest[] = [];
    
    snap1.forEach(doc => results.push({ id: doc.id, ...doc.data() } as CollaborationRequest));
    snap2.forEach(doc => {
      if (!results.find(r => r.id === doc.id)) {
        results.push({ id: doc.id, ...doc.data() } as CollaborationRequest);
      }
    });
    
    return results.sort((a, b) => {
        const tA = (a.createdAt as Timestamp)?.toMillis() || 0;
        const tB = (b.createdAt as Timestamp)?.toMillis() || 0;
        return tB - tA;
    });
  }

  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CollaborationRequest));
};

/**
 * Updates the status of a collaboration request
 */
export const updateCollaborationStatus = async (requestId: string, status: CollaborationRequest['status']) => {
  const docRef = doc(db, COLLABORATIONS_COLLECTION, requestId);
  await updateDoc(docRef, {
    status,
    updatedAt: serverTimestamp(),
  });
};

/**
 * Real-time listener for collaboration requests
 */
export const subscribeToCollaborations = (agencyId: string, callback: (requests: CollaborationRequest[]) => void) => {
  // Similar to getAgencyCollaborationRequests, we might need two listeners or a clever query
  const q = query(
    collection(db, COLLABORATIONS_COLLECTION), 
    where('toAgencyId', '==', agencyId)
  );

  return onSnapshot(q, (snap) => {
    const requests = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CollaborationRequest));
    callback(requests);
  });
};
