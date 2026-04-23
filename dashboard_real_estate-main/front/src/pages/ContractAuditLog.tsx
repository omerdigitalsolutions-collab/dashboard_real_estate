import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getContract } from '../services/contractService';
import { getContractAuditLogs } from '../services/auditLogService';
import { Contract, AuditLog } from '../types';
import { ArrowRight, FileText, Clock, ExternalLink, Activity, Eye } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ContractAuditLog() {
    const { contractId } = useParams<{ contractId: string }>();
    const navigate = useNavigate();
    const { userData } = useAuth();
    
    const [contract, setContract] = useState<Contract | null>(null);
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!userData?.agencyId || !contractId) return;

        const loadData = async () => {
            try {
                setLoading(true);
                const [contractData, auditLogs] = await Promise.all([
                    getContract(userData.agencyId, contractId),
                    getContractAuditLogs(userData.agencyId, contractId)
                ]);

                if (!contractData) {
                    toast.error('חוזה לא נמצא');
                    navigate('/dashboard/contracts');
                    return;
                }

                setContract(contractData);
                setLogs(auditLogs);
            } catch (error) {
                console.error('Failed to load audit logs:', error);
                toast.error('שגיאה בטעינת היסטוריית פעולות');
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [userData?.agencyId, contractId, navigate]);

    if (loading) {
        return (
            <div className="p-8 flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (!contract) return null;

    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-4xl mx-auto" dir="rtl">
            <div className="flex items-center gap-4 mb-6">
                <button
                    onClick={() => navigate('/dashboard/contracts')}
                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                    <ArrowRight size={20} className="text-slate-600" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">היסטוריית חוזה</h1>
                    <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1">
                        <FileText size={14} /> חוזה #{contractId?.slice(-6).toUpperCase()}
                    </p>
                </div>
            </div>

            {/* Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                            <Eye size={20} className="text-blue-600" />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-slate-700">צפיות בחוזה</h3>
                            <p className="text-2xl font-bold text-slate-900">{contract.viewCount || 0}</p>
                        </div>
                    </div>
                    {contract.viewedAt && (
                        <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                            <Clock size={12} /> נצפה לראשונה: {contract.viewedAt.toDate().toLocaleString('he-IL')}
                        </p>
                    )}
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
                            <Activity size={20} className="text-green-600" />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-slate-700">סטטוס נוכחי</h3>
                            <p className="text-lg font-bold text-slate-900">
                                {contract.status === 'completed' ? 'נחתם' : contract.status === 'active' ? 'פעיל' : 'טיוטה'}
                            </p>
                        </div>
                    </div>
                    {contract.signedPdfUrl && (
                        <a
                            href={contract.signedPdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 mt-2 font-medium"
                        >
                            <ExternalLink size={12} /> צפה בחוזה החתום
                        </a>
                    )}
                </div>
            </div>

            {/* Timeline */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mt-6">
                <div className="px-5 py-4 border-b border-slate-200 bg-slate-50">
                    <h2 className="text-sm font-bold text-slate-800">יומן פעולות (Audit Trail)</h2>
                </div>
                
                <div className="p-5">
                    {logs.length === 0 ? (
                        <p className="text-sm text-slate-500 text-center py-8">אין פעולות מתועדות עדיין.</p>
                    ) : (
                        <div className="relative border-r-2 border-slate-200 pr-6 space-y-6 ml-2 my-2">
                            {logs.map((log, index) => (
                                <div key={log.id} className="relative">
                                    <div className="absolute -right-[31px] top-1 w-4 h-4 rounded-full bg-white border-2 border-blue-500"></div>
                                    <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="text-sm font-bold text-slate-800">
                                                {log.type === 'contract_signed' ? 'חוזה נחתם' : 
                                                 log.type === 'contract_opened' ? 'חוזה נפתח' : log.type}
                                            </h4>
                                            <span className="text-xs text-slate-400">
                                                {log.createdAt?.toDate().toLocaleString('he-IL')}
                                            </span>
                                        </div>
                                        <div className="text-xs text-slate-600 space-y-1">
                                            {log.ipAddress && <p>IP: {log.ipAddress}</p>}
                                            {log.signedBy && <p>נחתם ע"י: {log.signedBy}</p>}
                                            {log.signedByEmail && <p>דוא"ל: {log.signedByEmail}</p>}
                                            {log.fieldCount && <p>שדות שמולאו: {log.fieldCount}</p>}
                                            {log.signedPdfUrl && (
                                                <a href={log.signedPdfUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1 mt-2 inline-flex">
                                                    <ExternalLink size={12} /> קובץ חתום
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
