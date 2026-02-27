
import { useState } from 'react';
import { Menu, Search, ChevronDown, LogOut, User, HelpCircle, Sparkles, Upload } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import HeaderAlerts from './HeaderAlerts';
import ImportModal from '../modals/ImportModal';
import { useAgency } from '../../hooks/useFirestoreData';

interface HeaderProps {
  onMenuClick: () => void;
  onAskAI: () => void;
}

export default function Header({ onMenuClick, onAskAI }: HeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const { userData } = useAuth();
  const { agency } = useAgency();

  return (
    <>
      <header className="h-16 bg-white border-b border-slate-100 flex items-center px-4 lg:px-6 gap-4 sticky top-0 z-10 shadow-sm">
        <button
          onClick={onMenuClick}
          className="text-slate-500 hover:text-slate-800 lg:hidden transition-colors p-1"
        >
          <Menu size={22} />
        </button>

        {/* Agency Branding */}
        <div className="hidden lg:flex items-center gap-3 ml-2 border-l border-slate-200 pl-4">
          {agency?.settings?.logoUrl ? (
            <img
              src={agency.settings.logoUrl}
              alt="Agency Logo"
              className="w-10 h-10 rounded-lg object-contain bg-white border border-slate-100 shadow-sm"
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-lg border border-blue-100">
              {agency?.agencyName?.charAt(0) || userData?.name?.charAt(0) || 'A'}
            </div>
          )}
          <div className="flex flex-col">
            <span className="text-sm font-bold text-slate-800 leading-tight">
              {agency?.agencyName || 'הסוכנות שלי'}
            </span>
            {agency?.slogan && (
              <span className="text-[10px] text-slate-500 font-medium">
                {agency.slogan}
              </span>
            )}
          </div>
        </div>

        <div className="relative flex-1 max-w-sm hidden sm:block mr-auto">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="חיפוש לידים, סוכנים, עסקאות..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
          />
        </div>

        {/* AI Ask Button */}
        <button
          onClick={onAskAI}
          className="flex items-center gap-2 bg-gradient-to-l from-indigo-500 to-violet-600 text-white px-3 sm:px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity shadow-md shadow-indigo-200/50 flex-shrink-0"
        >
          <Sparkles size={15} />
          <span className="hidden sm:inline">שאל את העוזר החכם</span>
        </button>

        {/* Import Excel Button */}
        <button
          onClick={() => setIsImportOpen(true)}
          className="hidden md:flex items-center gap-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-xl text-sm font-semibold transition-colors shadow-sm flex-shrink-0"
        >
          <Upload size={15} />
          <span>ייבוא מאקסל</span>
        </button>

        <div className="flex items-center gap-2">
          <HeaderAlerts />

          <div className="relative">
            <button
              onClick={() => { setDropdownOpen(!dropdownOpen); }}
              className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-slate-100 transition-colors"
            >
              <div className="relative w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold overflow-hidden shadow-sm">
                {userData?.photoURL ? (
                  <img src={userData.photoURL} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  userData?.name?.substring(0, 1).toUpperCase() || 'ע'
                )}
              </div>
              <div className="hidden sm:block text-right">
                <p className="text-sm font-semibold text-slate-800 leading-tight truncate max-w-[120px]">
                  {userData?.name || 'עומר'}
                </p>
                <p className="text-xs text-slate-400 capitalize">{userData?.role === 'admin' ? 'מנהל סוכנות' : 'סוכן'}</p>
              </div>
              <ChevronDown size={14} className="text-slate-400 hidden sm:block flex-shrink-0" />
            </button>

            {dropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
                <div className="absolute left-0 top-12 w-52 bg-white rounded-2xl shadow-xl border border-slate-100 z-20 overflow-hidden py-1">
                  {[
                    { icon: User, label: 'הפרופיל שלי' },
                    { icon: HelpCircle, label: 'עזרה ותמיכה' },
                    { icon: LogOut, label: 'יציאה' },
                  ].map(({ icon: Icon, label }) => (
                    <button
                      key={label}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                    >
                      <Icon size={15} className="text-slate-400" />
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <ImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
      />
    </>);
}
