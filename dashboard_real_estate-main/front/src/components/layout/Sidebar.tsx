import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  ArrowLeftRight,
  UserCheck,
  Settings,
  X,
  Sparkles,
  Clock,
  FileText,
  Handshake,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLiveDashboardData } from '../../hooks/useLiveDashboardData';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  onAskAI: () => void;
}

const navItems = [
  { to: '/', label: 'לוח בקרה', icon: LayoutDashboard, roles: ['admin'] },
  { to: '/leads', label: 'לידים', icon: Users },
  { to: '/transactions', label: 'עסקאות', icon: ArrowLeftRight },
  { to: '/marketplace', label: 'שיתופי (MLS)', icon: Handshake },
  { to: '/contracts', label: 'חוזים', icon: FileText, roles: ['admin'] },
  { to: '/agents', label: 'סוכנים', icon: UserCheck, roles: ['admin'] },
  { to: '/settings', label: 'הגדרות', icon: Settings, roles: ['admin'] },
];

export default function Sidebar({ open, onClose, onAskAI }: SidebarProps) {
  const { userData } = useAuth();
  const { rawAgency } = useLiveDashboardData();

  // Filter navigation based on user role
  const filteredNavItems = navItems.filter(item =>
    !item.roles || (userData?.role && item.roles.includes(userData.role))
  );

  // Trial calculations
  const billing = rawAgency?.billing;
  const isTrial = billing?.status === 'trialing';
  let trialDaysLeft = 0;

  if (isTrial && billing?.trialEndsAt) {
    const endsAt = billing.trialEndsAt.toDate ? billing.trialEndsAt.toDate() : new Date(billing.trialEndsAt);
    const diffMs = endsAt.getTime() - Date.now();
    trialDaysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 right-0 h-full w-64 bg-slate-900 flex flex-col z-30 transition-transform duration-300
          ${open ? 'translate-x-0' : 'translate-x-full'} lg:translate-x-0`}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-700/60">
          <div className="flex items-center pr-1">
            <img src="/homer-logo-dark.png" alt="Homer CRM" className="h-12 w-auto" />
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white lg:hidden transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {isTrial && trialDaysLeft > 0 && (
            <div className="mb-4 px-3 py-2.5 mx-1 bg-gradient-to-r from-blue-900/40 to-indigo-900/40 border border-blue-500/30 rounded-lg flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2 text-blue-200">
                <Clock size={16} className="text-blue-400" />
                <span className="text-xs font-semibold">תקופת ניסיון</span>
              </div>
              <div className="text-xs font-bold text-white bg-blue-600/80 px-2 py-0.5 rounded-md">
                {trialDaysLeft} ימים
              </div>
            </div>
          )}

          <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-widest px-3 pb-2 pt-1">
            תפריט ראשי
          </p>
          {filteredNavItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group
                ${to === '/transactions' ? 'tour-kanban' : ''}
                ${to === '/leads' ? 'tour-webot tour-whatsapp-control' : ''}
                ${isActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`
              }
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}

          <button
            onClick={() => {
              onAskAI();
              onClose();
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group text-indigo-400 hover:text-white hover:bg-slate-800"
          >
            <Sparkles size={17} />
            קופילוט AI
          </button>
        </nav>

        <div className="px-4 py-4 border-t border-slate-700/60">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg">
            <div className="relative w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 overflow-hidden shadow-sm">
              {userData?.photoURL ? (
                <img src={userData.photoURL} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                userData?.name?.substring(0, 1).toUpperCase() || 'ע'
              )}
            </div>
            <div className="min-w-0 text-right">
              <p className="text-white text-sm font-medium leading-tight truncate">
                {userData?.name || 'עומר'}
              </p>
              <p className="text-slate-400 text-xs truncate capitalize">{userData?.role === 'admin' ? 'מנהל סוכנות' : 'סוכן'}</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
