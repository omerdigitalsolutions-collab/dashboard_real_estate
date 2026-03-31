import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { auth } from '../config/firebase';
import { signOut } from 'firebase/auth';
import { useAuth } from '../context/AuthContext';
import { useLiveDashboardData } from '../hooks/useLiveDashboardData';
import { useSuperAdmin } from '../hooks/useSuperAdmin';
import AddPropertyModal from '../components/modals/AddPropertyModal';
import AddLeadModal from '../components/modals/AddLeadModal';
import CopilotChatWidget from '../components/copilot/CopilotChatWidget';
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
    Menu,
    X,
    TrendingUp,
    CalendarDays,
} from 'lucide-react';

const navigation = [
    { name: 'לוח בקרה', href: '/dashboard', icon: LayoutDashboard, roles: ['admin'] },
    { name: 'לידים', href: '/dashboard/leads', icon: Contact },
    { name: 'עסקאות', href: '/dashboard/transactions', icon: Handshake },
    { name: 'נכסים', href: '/dashboard/properties', icon: Building2 },
    { name: 'יומן', href: '/dashboard/calendar', icon: CalendarDays },
    { name: 'רווח והפסד', href: '/dashboard/pnl', icon: TrendingUp, roles: ['admin'] },
    { name: 'סוכנים', href: '/dashboard/agents', icon: Users, roles: ['admin'] },
    { name: 'הגדרות', href: '/dashboard/settings', icon: Settings, roles: ['admin'] },
];

export default function DashboardLayout() {
    const { userData } = useAuth();
    const { isSuperAdmin } = useSuperAdmin();
    const { alerts, agencyLogo, agencyName } = useLiveDashboardData();
    const navigate = useNavigate();

    // Filter navigation based on user role
    const filteredNavigation = navigation.filter(item =>
        !item.roles || (userData?.role && item.roles.includes(userData.role))
    );

    const [showAddProperty, setShowAddProperty] = useState(false);
    const [showAddLead, setShowAddLead] = useState(false);
    const [quickAddOpen, setQuickAddOpen] = useState(false);
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
            {/* Mobile Sidebar Overlay */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm transition-opacity"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`fixed inset-y-0 right-0 z-50 w-64 flex-shrink-0 bg-slate-900/95 md:bg-slate-900/50 backdrop-blur-xl border-l border-slate-800 flex flex-col transform transition-transform duration-300 md:relative md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="shrink-0 h-20 flex items-center justify-between px-6 border-b border-slate-800">
                    <span className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                        <img src="/homer-logo-dark.png" alt="Homer" className="h-10 w-auto" />
                    </span>
                    <button
                        className="md:hidden text-slate-400 hover:text-white p-2 mb-1"
                        onClick={() => setIsMobileMenuOpen(false)}
                    >
                        <X size={20} />
                    </button>
                </div>

                <nav className="flex-1 px-4 py-6 overflow-y-auto space-y-1">
                    {filteredNavigation.map((item) => (
                        <NavLink
                            key={item.name}
                            to={item.href}
                            onClick={() => setIsMobileMenuOpen(false)}
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
                            to="/dashboard/super-admin"
                            onClick={() => setIsMobileMenuOpen(false)}
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
                <header className="shrink-0 h-16 bg-[#0a0f1c]/80 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-4 md:px-8 z-10">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setIsMobileMenuOpen(true)}
                            className="md:hidden p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                        >
                            <Menu size={22} />
                        </button>
                        <button
                            onClick={() => navigate('/dashboard/settings')}
                            className="flex items-center gap-3 hover:bg-slate-800/50 p-1.5 -ml-1.5 rounded-xl transition-colors text-right"
                        >
                            {agencyLogo && agencyLogo.trim() !== '' ? (
                                <img
                                    src={agencyLogo}
                                    alt="לוגו סוכנות"
                                    className="h-10 w-auto object-contain rounded-lg shadow-sm bg-white/10"
                                    onError={(e) => {
                                        // Fallback if image fails to load
                                        (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                />
                            ) : (
                                <div className="w-10 h-10 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center flex-shrink-0">
                                    <Building2 className="w-6 h-6 text-cyan-400" />
                                </div>
                            )}
                            <h1 className="text-lg md:text-xl font-bold text-white tracking-tight hidden sm:block max-w-[150px] md:max-w-xs truncate">
                                {agencyName || 'הסוכנות שלי'}
                            </h1>
                        </button>
                    </div>

                    <div className="flex items-center gap-2 md:gap-4">
                        {/* Quick Add Dropdown */}
                        <div className="relative">
                            <button
                                onClick={() => setQuickAddOpen(v => !v)}
                                className="flex items-center gap-1.5 md:gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 text-sm font-bold px-3 md:px-4 py-2 rounded-xl transition-all shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:shadow-[0_0_20px_rgba(16,185,129,0.4)]"
                            >
                                <Plus size={16} />
                                <span className="hidden sm:inline">חדש</span>
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
                        <div className="relative hidden md:block">
                            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                <Search className="h-4 w-4 text-slate-500" />
                            </div>
                            <input
                                type="text"
                                placeholder="חיפוש..."
                                className="block w-48 lg:w-64 pl-3 pr-10 py-2 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 bg-slate-900/50 backdrop-blur-sm transition-all focus:bg-slate-900"
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

                        <div className="h-6 md:h-8 w-px bg-slate-200/20 mx-1 md:mx-2"></div>

                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 text-slate-400 hover:text-red-500 font-medium text-sm transition-colors p-1.5 md:p-0 rounded-lg hover:bg-slate-800 md:hover:bg-transparent"
                            title="התנתק"
                        >
                            <LogOut className="w-5 h-5 md:w-4 md:h-4" />
                            <span className="hidden md:inline">התנתק</span>
                        </button>
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 overflow-y-auto p-4 md:p-8 relative z-0">
                    <Outlet />
                </main>
            </div>

            {/* Global Modals */}
            <AddPropertyModal isOpen={showAddProperty} onClose={() => setShowAddProperty(false)} />
            <AddLeadModal isOpen={showAddLead} onClose={() => setShowAddLead(false)} />

            {/* Global AI Copilot Widget */}
            <CopilotChatWidget />
        </div>
    );
}
