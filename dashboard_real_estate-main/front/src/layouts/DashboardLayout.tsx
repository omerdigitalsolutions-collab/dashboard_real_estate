import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { auth } from '../config/firebase';
import { signOut } from 'firebase/auth';
import { useLiveDashboardData } from '../hooks/useLiveDashboardData';
import { useSuperAdmin } from '../hooks/useSuperAdmin';
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
    Contact,
    Plus,
    Shield,
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
    const { userData } = useAuth();
    const { isSuperAdmin } = useSuperAdmin();
    const { alerts } = useLiveDashboardData();
    const navigate = useNavigate();
    const [showAddProperty, setShowAddProperty] = useState(false);
    const [showAddLead, setShowAddLead] = useState(false);
    const [quickAddOpen, setQuickAddOpen] = useState(false);
    const [notificationsOpen, setNotificationsOpen] = useState(false);

    const handleLogout = async () => {
        try {
            await signOut(auth);
            navigate('/');
        } catch (error) {
            console.error('Logout error:', error);
        }
    };

    return (
        <div className="flex h-screen overflow-hidden bg-[#0a0f1c]" dir="rtl">
            {/* Sidebar */}
            <aside className="w-64 flex-shrink-0 bg-slate-900/50 backdrop-blur-xl border-l border-slate-800 flex flex-col z-20">
                <div className="shrink-0 h-16 flex items-center px-6 border-b border-slate-800">
                    <span className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                        <img src="/homer-logo.png" alt="Homer" className="h-8 w-auto mix-blend-screen brightness-200" />
                    </span>
                </div>

                <nav className="flex-1 px-4 py-6 overflow-y-auto space-y-1">
                    {navigation.map((item) => (
                        <NavLink
                            key={item.name}
                            to={item.href}
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-all duration-300 ${isActive
                                    ? 'bg-blue-500/10 border border-blue-500/20 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                                }`
                            }
                        >
                            <item.icon className="w-5 h-5 flex-shrink-0" />
                            {item.name}
                        </NavLink>
                    ))}

                    {isSuperAdmin && (
                        <NavLink
                            to="/super-admin"
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-3 py-2.5 rounded-lg font-bold transition-all duration-300 mt-6 ${isActive
                                    ? 'bg-purple-500/10 border border-purple-500/30 text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.2)]'
                                    : 'text-purple-400 hover:bg-purple-500/10 hover:text-purple-300 border border-transparent'
                                }`
                            }
                        >
                            <Shield className="w-5 h-5 flex-shrink-0" />
                            SUPER ADMIN
                        </NavLink>
                    )}
                </nav>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
                {/* Subtle background glow */}
                <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-cyan-500/5 rounded-full blur-[100px] pointer-events-none"></div>

                {/* Header */}
                <header className="shrink-0 h-16 bg-[#0a0f1c]/80 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-8 z-10">
                    <div className="flex items-center gap-6">
                        <h1 className="text-lg font-medium text-white">
                            בוקר טוב, <span className="text-cyan-400">{userData?.name || 'אורח'}</span>
                        </h1>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Quick Add Dropdown */}
                        <div className="relative">
                            <button
                                onClick={() => setQuickAddOpen(v => !v)}
                                className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 text-sm font-bold px-4 py-2 rounded-xl transition-all shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:shadow-[0_0_20px_rgba(16,185,129,0.4)]"
                            >
                                <Plus size={16} />
                                חדש
                            </button>

                            {quickAddOpen && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setQuickAddOpen(false)} />
                                    <div className="absolute left-0 top-11 z-20 bg-slate-900 rounded-xl shadow-2xl border border-slate-800 py-1 min-w-[170px] backdrop-blur-xl">
                                        <button
                                            onClick={() => { setShowAddProperty(true); setQuickAddOpen(false); }}
                                            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-cyan-400 transition-colors"
                                        >
                                            <Building2 size={15} className="text-cyan-500" />
                                            הוסף נכס חדש
                                        </button>
                                        <button
                                            onClick={() => { setShowAddLead(true); setQuickAddOpen(false); }}
                                            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-emerald-400 transition-colors"
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
                                <Search className="h-4 w-4 text-slate-500" />
                            </div>
                            <input
                                type="text"
                                placeholder="חיפוש..."
                                className="block w-64 pl-3 pr-10 py-2 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 bg-slate-900/50 backdrop-blur-sm transition-all focus:bg-slate-900"
                            />
                        </div>

                        <div className="relative">
                            <button
                                onClick={() => setNotificationsOpen(v => !v)}
                                className="text-slate-500 hover:text-slate-700 transition-colors relative"
                            >
                                <Bell className="w-5 h-5" />
                                {alerts.length > 0 && (
                                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white border border-white">
                                        {alerts.length}
                                    </span>
                                )}
                            </button>

                            {notificationsOpen && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setNotificationsOpen(false)} />
                                    <div className="absolute left-0 top-10 z-20 bg-slate-900 rounded-xl shadow-2xl border border-slate-800 min-w-[280px] w-max max-w-sm backdrop-blur-xl">
                                        <div className="p-3 border-b border-slate-800 font-semibold text-sm text-white flex items-center justify-between">
                                            התראות
                                            {alerts.length > 0 && <span className="text-xs font-normal text-slate-400">{alerts.length} חדשות</span>}
                                        </div>
                                        <div className="p-2 max-h-80 overflow-y-auto">
                                            {alerts.length > 0 ? (
                                                <div className="space-y-1">
                                                    {alerts.map((alert: any) => (
                                                        <div key={alert.id || Math.random()} className="p-2.5 text-sm text-slate-400 hover:bg-slate-800 rounded-lg flex flex-col gap-1 transition-colors cursor-pointer">
                                                            <span className="font-medium text-slate-200">{alert.title || 'התראה חדשה'}</span>
                                                            <span className="text-xs bg-slate-800/50 p-1.5 rounded-md mt-1">{alert.message || 'יש לך התראה חדשה במערכת.'}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="p-6 text-center text-sm text-slate-500">
                                                    אין התראות חדשות
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

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
