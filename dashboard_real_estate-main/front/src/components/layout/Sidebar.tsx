import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  ArrowLeftRight,
  UserCheck,
  Settings,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const navItems = [
  { to: '/', label: 'לוח בקרה', icon: LayoutDashboard },
  { to: '/leads', label: 'לידים', icon: Users },
  { to: '/transactions', label: 'עסקאות', icon: ArrowLeftRight },
  { to: '/agents', label: 'סוכנים', icon: UserCheck },
  { to: '/settings', label: 'הגדרות', icon: Settings },
];

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { userData } = useAuth();
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
            <div className="bg-white px-3 py-1.5 rounded-xl flex items-center justify-center shadow-sm">
              <img src="/homer-logo.png" alt="Homer CRM" className="h-7 w-auto mix-blend-multiply" />
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white lg:hidden transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-widest px-3 pb-2 pt-1">
            תפריט ראשי
          </p>
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group
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
