import { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ShieldAlert, ShieldCheck, MoreVertical, Search, Building2 } from 'lucide-react';

interface Agency {
    id: string;
    name: string;
    createdAt?: any;
    status?: 'active' | 'suspended';
    [key: string]: any;
}

export default function SuperAdminDashboard() {
    const [agencies, setAgencies] = useState<Agency[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchAgencies = async () => {
            try {
                const querySnapshot = await getDocs(collection(db, 'agencies'));
                const agenciesData = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as Agency[];
                setAgencies(agenciesData);
            } catch (error) {
                console.error("Error fetching agencies:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchAgencies();
    }, []);

    const activeCount = agencies.filter(a => a.status !== 'suspended').length;
    const suspendedCount = agencies.filter(a => a.status === 'suspended').length;

    const filteredAgencies = agencies.filter(agency =>
        agency.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        agency.id.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6" dir="rtl">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">לוח בקרת מערכת (Super Admin)</h1>
                    <p className="text-slate-500 mt-1">ניהול משרדים, הרשאות וסטטוס מערכת מחשבון אחד.</p>
                </div>
            </div>

            {/* Metrics */}
            <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
                <div className="bg-white rounded-xl border border-slate-200 p-6 flex items-center gap-4 shadow-sm">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                        <Building2 size={24} />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-500">סה״כ משרדים פעילים</p>
                        <h3 className="text-2xl font-bold text-slate-800">{activeCount}</h3>
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-6 flex items-center gap-4 shadow-sm">
                    <div className="p-3 bg-red-50 text-red-600 rounded-lg">
                        <ShieldAlert size={24} />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-500">לקוחות בסיכון/הושעו</p>
                        <h3 className="text-2xl font-bold text-slate-800">{suspendedCount}</h3>
                    </div>
                </div>
            </div>

            {/* Main Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-6">
                <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <h2 className="text-lg font-bold text-slate-800">רשימת משרדים</h2>
                    <div className="relative">
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-slate-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="חיפוש משרד..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="block w-full sm:w-64 pl-3 pr-10 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                            <tr>
                                <th className="px-6 py-4 text-right">שם המשרד</th>
                                <th className="px-6 py-4 text-right">מזהה (ID)</th>
                                <th className="px-6 py-4 text-right">תאריך הצטרפות</th>
                                <th className="px-6 py-4 text-right">סטטוס מנוי</th>
                                <th className="px-6 py-4 text-center w-20">פעולות</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                                        טוען נתונים...
                                    </td>
                                </tr>
                            ) : filteredAgencies.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                                        לא נמצאו משרדים
                                    </td>
                                </tr>
                            ) : (
                                filteredAgencies.map((agency) => (
                                    <tr key={agency.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4 font-medium text-slate-800">
                                            {agency.name || 'ללא שם'}
                                        </td>
                                        <td className="px-6 py-4 text-slate-500 font-mono text-xs">
                                            {agency.id}
                                        </td>
                                        <td className="px-6 py-4 text-slate-500">
                                            {agency.createdAt?.toDate ? agency.createdAt.toDate().toLocaleDateString('he-IL') : 'לא תועד'}
                                        </td>
                                        <td className="px-6 py-4">
                                            {agency.status === 'suspended' ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-red-50 text-red-700">
                                                    <ShieldAlert size={14} /> מושעה
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700">
                                                    <ShieldCheck size={14} /> פעיל
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <button className="text-slate-400 hover:text-slate-600 transition-colors p-1.5 rounded-md hover:bg-slate-100">
                                                <MoreVertical size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
