import React, { useState, useMemo } from 'react';
import { X, Handshake, AlertCircle, Home, UserCircle } from 'lucide-react';
import { Lead, Property } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { sendCollaborationRequest } from '../../services/collaborationService';
import { matchLeadsForProperty, matchPropertiesForLead } from '../../services/leadService';
import toast from 'react-hot-toast';

interface MarketplaceMatchModalProps {
    sharedItem: Property | Lead;
    itemType: 'property' | 'lead';
    myProperties: Property[];
    myLeads: Lead[];
    onClose: () => void;
}

export default function MarketplaceMatchModal({ sharedItem, itemType, myProperties, myLeads, onClose }: MarketplaceMatchModalProps) {
    const { userData } = useAuth();
    const [sending, setSending] = useState<string | null>(null);
    const [sentIds, setSentIds] = useState<Set<string>>(new Set());

    const matches = useMemo(() => {
        if (itemType === 'property') {
            return matchLeadsForProperty(sharedItem as Property, myLeads);
        } else {
            return matchPropertiesForLead((sharedItem as Lead).requirements, myProperties);
        }
    }, [sharedItem, itemType, myProperties, myLeads]);

    const handleSendRequest = async (matchId: string) => {
        if (!userData?.agencyId || !userData?.uid) return;
        setSending(matchId);
        try {
            await sendCollaborationRequest({
                fromAgencyId: userData.agencyId,
                toAgencyId: sharedItem.agencyId!,
                propertyId: itemType === 'property' ? sharedItem.id : matchId,
                leadId: itemType === 'lead' ? sharedItem.id : matchId,
                agentId: userData.uid
            });
            setSentIds(prev => new Set(prev).add(matchId));
            toast.success('בקשת שיתוף פעולה נשלחה בהצלחה!');
        } catch (err) {
            toast.error('שגיאה בשליחת הבקשה');
            console.error(err);
        } finally {
            setSending(null);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in" dir="rtl">
            <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
                <div className="flex items-center justify-between p-6 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                            {itemType === 'property' ? <Home size={20} /> : <UserCircle size={20} />}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">
                                {itemType === 'property' ? 'קונים פוטנציאליים מהמשרד שלך' : 'נכסים פוטנציאליים מהמשרד שלך'}
                            </h2>
                            <p className="text-sm text-slate-500">
                                {itemType === 'property' ? 'נמצאו ' : 'נמצאו '}
                                <span className="font-bold">{matches.length}</span>
                                {itemType === 'property' ? ' לקוחות מתאימים לנכס זה' : ' נכסים מתאימים לדרישה זו'}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
                    {matches.length === 0 ? (
                        <div className="py-16 flex flex-col items-center justify-center text-slate-400 text-center">
                            <AlertCircle size={40} className="mb-4 text-slate-300" />
                            <h3 className="text-lg font-semibold text-slate-700 mb-1">לא נמצאו התאמות במלאי המשרד</h3>
                            <p className="text-sm max-w-xs">לא נמצאו נתונים אצלך במשרד שתואמים להגדרות של פריט זה.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {matches.map((match: any) => {
                                const isSent = sentIds.has(match.id);
                                const isSending = sending === match.id;

                                return (
                                    <div key={match.id} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
                                                {itemType === 'property' ? <UserCircle size={24} /> : <Home size={24} />}
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-slate-800 text-sm">
                                                    {itemType === 'property' ? match.name : (match.address?.fullAddress || 'נכס מהמאגר')}
                                                </h3>
                                                <p className="text-xs text-slate-500 mt-0.5">
                                                    {itemType === 'property' 
                                                        ? `תקציב: ₪${match.requirements?.maxBudget?.toLocaleString() || 'לא הוגדר'}`
                                                        : `₪${match.financials?.price?.toLocaleString() || 'ללא מחיר'} | ${match.rooms || 0} חדרים`}
                                                </p>
                                            </div>
                                        </div>
                                        
                                        <button
                                            onClick={() => handleSendRequest(match.id)}
                                            disabled={isSent || isSending}
                                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                                                isSent ? 'bg-slate-100 text-slate-400 cursor-not-allowed' :
                                                'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
                                            }`}
                                        >
                                            <Handshake size={16} />
                                            {isSent ? 'בקשה נשלחה' : isSending ? 'שולח...' : 'הצע שיתוף פעולה'}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
