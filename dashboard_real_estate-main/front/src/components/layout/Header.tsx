
import { useState } from 'react';
import { Menu, Search, ChevronDown, LogOut, User, HelpCircle, Sun, Sparkles, Database, Upload } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { seedInitialData } from '../../utils/seedDatabase';
import HeaderAlerts from './HeaderAlerts';
import ImportModal from '../modals/ImportModal';

interface HeaderProps {
  onMenuClick: () => void;
  onAskAI: () => void;
}

export default function Header({ onMenuClick, onAskAI }: HeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const { currentUser, userData } = useAuth();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'בוקר טוב';
    if (hour >= 12 && hour < 18) return 'צהריים טובים';
    if (hour >= 18 && hour < 22) return 'ערב טוב';
    return 'לילה טוב';
  };

  const handleSeed = async () => {
    if (!currentUser?.uid) {
      alert('You must be logged in to seed the database.');
      return;
    }

    if (!window.confirm('WARNING: Dev Only. Are you sure you want to seed mock data into Firestore?')) return;

    setIsSeeding(true);
    const result = await seedInitialData(currentUser.uid);
    setIsSeeding(false);

    if (result.success) {
      alert('✅ Database seeded successfully!');
    } else {
      alert('❌ Failed to seed database. Check console.');
    }
  };

  return (<>
    <header className="h-16 bg-white border-b border-slate-100 flex items-center px-4 lg:px-6 gap-4 sticky top-0 z-10 shadow-sm">
      <button
        onClick={onMenuClick}
        className="text-slate-500 hover:text-slate-800 lg:hidden transition-colors p-1"
      >
        <Menu size={22} />
      </button>

      {/* Greeting */}
      <div className="hidden lg:flex items-center gap-2 text-slate-600">
        <Sun size={16} className="text-amber-400" />
        <span className="text-sm font-medium">{getGreeting()}, {userData?.name?.split(' ')[0] || 'עומר'}</span>
      </div>

      <div className="relative flex-1 max-w-sm hidden sm:block mr-auto">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="חיפוש לידים, סוכנים, עסקאות..."
          className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
        />
      </div>

      {/* DEV ONLY SEED BUTTON */}
      <button
        onClick={handleSeed}
        disabled={isSeeding || !currentUser}
        className="hidden md:flex items-center gap-2 bg-gradient-to-l from-orange-400 to-red-500 text-white px-4 py-2 rounded-xl text-sm font-bold hover:opacity-90 transition-opacity shadow-md shadow-red-200/50 flex-shrink-0 disabled:opacity-50"
      >
        <Database size={15} className={isSeeding ? 'animate-pulse' : ''} />
        <span>{isSeeding ? 'Seeding...' : 'Seed DB (Dev)'}</span>
      </button>

      {/* AI Ask Button */}
      <button
        onClick={onAskAI}
        className="hidden md:flex items-center gap-2 bg-gradient-to-l from-indigo-500 to-violet-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity shadow-md shadow-indigo-200/50 flex-shrink-0"
      >
        <Sparkles size={15} />
        <span>שאל את העוזר החכם</span>
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
