import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { auth } from '../config/firebase';
import { signOut } from 'firebase/auth';
import { seedInitialData } from '../utils/seedDatabase';
import { useLiveDashboardData } from '../hooks/useLiveDashboardData';
import AddPropertyModal from '../components/modals/AddPropertyModal';
import AddLeadModal from '../components/modals/AddLeadModal';
import {
    LayoutDashboard,
    Handshake,
    Building2,
    Users,
    Settings,
    Search,
    Bell,
    LogOut,
    Database,
    Contact,
    Plus,
} from 'lucide-react';

const navigation = [
    { name: 'לוח בקרה', href: '/', icon: LayoutDashboard },
    { name: 'לידים', href: '/leads', icon: Contact },
    { name: 'עסקאות', href: '/transactions', icon: Handshake },
    { name: 'נכסים', href: '/properties', icon: Building2 },
    { name: 'סוכנים', href: '/agents', icon: Users },
    { name: 'הגדרות', href: '/settings', icon: Settings },
];

export default function DashboardLayout() {
    const { userData, currentUser } = useAuth();
    const { alerts } = useLiveDashboardData();
    const navigate = useNavigate();
    const [isSeeding, setIsSeeding] = useState(false);
    const [showAddProperty, setShowAddProperty] = useState(false);
    const [showAddLead, setShowAddLead] = useState(false);
    const [quickAddOpen, setQuickAddOpen] = useState(false);

    const handleSeed = async () => {
        if (!currentUser) return;
        setIsSeeding(true);
        const result = await seedInitialData(currentUser.uid);
        setIsSeeding(false);
        if (result.success) {
            alert('✅ הנתונים נטענו בהצלחה! רענן את הדף כדי לראות אותם.');
        } else {
            alert('❌ שגיאה בטעינת הנתונים. בדוק את הקונסול.');
        }
    };

    const handleLogout = async () => {
        try {
            await signOut(auth);
            navigate('/login');
        } catch (error) {
            console.error('Logout error:', error);
        }
    };

    return (
        <div className="flex h-screen overflow-hidden bg-slate-50" dir="rtl">
            {/* Sidebar */}
            <aside className="w-64 flex-shrink-0 bg-white border-l border-slate-200 flex flex-col z-20">
                <div className="shrink-0 h-16 flex items-center px-6 border-b border-slate-200">
                    <span className="text-xl font-bold text-slate-800">Omer Digital</span>
                </div>

                <nav className="flex-1 px-4 py-6 overflow-y-auto space-y-1">
                    {navigation.map((item) => (
                        <NavLink
                            key={item.name}
                            to={item.href}
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors ${isActive
                                    ? 'bg-blue-50 text-blue-700'
                                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                }`
                            }
                        >
                            <item.icon className="w-5 h-5 flex-shrink-0" />
                            {item.name}
                        </NavLink>
                    ))}
                </nav>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Header */}
                <header className="shrink-0 h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 z-10">
                    <div className="flex items-center gap-6">
                        <h1 className="text-lg font-medium text-slate-800">
                            בוקר טוב, {userData?.name || 'אורח'}
                        </h1>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Quick Add Dropdown */}
                        <div className="relative">
                            <button
                                onClick={() => setQuickAddOpen(v => !v)}
                                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm"
                            >
                                <Plus size={16} />
                                חדש
                            </button>

                            {quickAddOpen && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setQuickAddOpen(false)} />
                                    <div className="absolute left-0 top-11 z-20 bg-white rounded-xl shadow-xl border border-slate-100 py-1 min-w-[170px]">
                                        <button
                                            onClick={() => { setShowAddProperty(true); setQuickAddOpen(false); }}
                                            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                                        >
                                            <Building2 size={15} className="text-blue-500" />
                                            הוסף נכס חדש
                                        </button>
                                        <button
                                            onClick={() => { setShowAddLead(true); setQuickAddOpen(false); }}
                                            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                                        >
                                            <Contact size={15} className="text-emerald-500" />
                                            הוסף ליד חדש
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                        <div className="relative">
                            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                <Search className="h-4 w-4 text-slate-400" />
                            </div>
                            <input
                                type="text"
                                placeholder="חיפוש..."
                                className="block w-64 pl-3 pr-10 py-2 border border-slate-200 rounded-lg text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50 transition-all focus:bg-white"
                            />
                        </div>

                        <button className="text-slate-500 hover:text-slate-700 transition-colors relative">
                            <Bell className="w-5 h-5" />
                            {alerts.length > 0 && (
                                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white border border-white">
                                    {alerts.length}
                                </span>
                            )}
                        </button>

                        {/* DEV ONLY — Remove before production */}
                        <button
                            onClick={handleSeed}
                            disabled={isSeeding}
                            title="Seed Database (Dev)"
                            className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1.5 rounded-md disabled:opacity-50 transition-colors"
                        >
                            <Database className="w-3.5 h-3.5" />
                            {isSeeding ? 'טוען...' : 'Seed DB'}
                        </button>

                        <div className="h-8 w-px bg-slate-200 mx-2"></div>

                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 text-slate-600 hover:text-red-600 font-medium text-sm transition-colors"
                        >
                            <LogOut className="w-4 h-4" />
                            <span>התנתק</span>
                        </button>
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 overflow-y-auto p-4 md:p-8">
                    <Outlet />
                </main>
            </div>

            {/* Global Modals */}
            <AddPropertyModal isOpen={showAddProperty} onClose={() => setShowAddProperty(false)} />
            <AddLeadModal isOpen={showAddLead} onClose={() => setShowAddLead(false)} />
        </div>
    );
}
