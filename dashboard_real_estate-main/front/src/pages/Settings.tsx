import { useState, useRef, useEffect } from 'react';
import { Bell, Shield, Globe, CreditCard, Users2, Camera, Loader2, Target, CalendarDays, BarChart4, X, Plus, Building } from 'lucide-react';
import TeamManagement from '../components/settings/TeamManagement';
import { WhatsAppSettings } from '../components/settings/WhatsAppSettings';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { uploadProfilePicture } from '../services/storageService';
import { updateUserProfile } from '../services/userService';
import { getAgencyData, updateAgencyGoals, uploadAndSaveAgencyLogo, updateAgencySettings } from '../services/agencyService';
import { isValidPhone } from '../utils/validation';
import { ISRAEL_CITIES } from '../utils/constants';

const sections = [
  { id: 'profile', label: 'פרופיל אישי', icon: Users2 },
  { id: 'team', label: 'ניהול צוות', icon: Users2 },
  { id: 'goals', label: 'יעדי משרד ואזורי שירות', icon: Target },
  { id: 'notifications', label: 'התראות', icon: Bell },
  { id: 'security', label: 'אבטחה', icon: Shield },
  { id: 'integrations', label: 'אינטגרציות', icon: Globe },
  { id: 'billing', label: 'חיובים', icon: CreditCard },
];

function Toggle({ defaultChecked = false }: { defaultChecked?: boolean }) {
  const [on, setOn] = useState(defaultChecked);
  return (
    <button
      onClick={() => setOn(!on)}
      className={`relative w-10 h-[22px] rounded-full transition-colors duration-200 flex-shrink-0 ${on ? 'bg-blue-600' : 'bg-slate-200'}`}
      style={{ height: '22px', width: '40px' }}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-[18px] h-[18px] rounded-full bg-white shadow transition-transform duration-200 ${on ? 'translate-x-[18px]' : 'translate-x-0'}`}
        style={{ width: '18px', height: '18px' }}
      />
    </button>
  );
}

export default function Settings() {
  const [activeSection, setActiveSection] = useState('profile');
  const { userData, refreshUserData } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [agencyGoalsSaving, setAgencyGoalsSaving] = useState(false);
  const [agencyLogoUploading, setAgencyLogoUploading] = useState(false);
  const agencyLogoInputRef = useRef<HTMLInputElement>(null);
  const [agencyLogoUrl, setAgencyLogoUrl] = useState<string>('');
  const [currentAgencySettings, setCurrentAgencySettings] = useState<any>(null); // To keep old settings intact

  // Form states for goals
  const [monthlyRevenue, setMonthlyRevenue] = useState(0);
  const [monthlyDeals, setMonthlyDeals] = useState(0);
  const [yearlyRevenue, setYearlyRevenue] = useState(0);
  const [yearlyDeals, setYearlyDeals] = useState(0);

  // Form states for profile
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  // Global settings
  const [activeGlobalCities, setActiveGlobalCities] = useState<string[]>([]);
  const [newCityInput, setNewCityInput] = useState('');

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    if (type === 'success') toast.success(message);
    else toast.error(message);
  };

  // Fetch Agency Data for goals and user data for profile
  useEffect(() => {
    if (userData?.name) setProfileName(userData.name);
    if (userData?.phone) setProfilePhone(userData.phone);

    if (!userData?.agencyId) return;
    const unsub = getAgencyData(userData.agencyId, (agency) => {
      setMonthlyRevenue(agency.monthlyGoals?.commissions || 0);
      setMonthlyDeals(agency.monthlyGoals?.deals || 0);
      setYearlyRevenue(agency.yearlyGoals?.commissions || 0);
      setYearlyDeals(agency.yearlyGoals?.deals || 0);
      setAgencyLogoUrl(agency.settings?.logoUrl || agency.logoUrl || '');
      setCurrentAgencySettings(agency.settings || {});

      const loadedCities = agency.settings?.activeGlobalCities || (agency.mainServiceArea ? [agency.mainServiceArea] : []);
      setActiveGlobalCities(loadedCities);
    });
    return () => unsub();
  }, [userData?.agencyId]);

  const handleSaveAgencyGoals = async () => {
    if (!userData?.agencyId) return;
    setAgencyGoalsSaving(true);
    try {
      await updateAgencyGoals(
        userData.agencyId,
        { commissions: monthlyRevenue, deals: monthlyDeals, leads: 0 },
        { commissions: yearlyRevenue, deals: yearlyDeals, leads: 0 }
      );
      await updateAgencySettings(
        userData.agencyId,
        { ...currentAgencySettings, activeGlobalCities }
      );
      showToast('הגדרות המשרד עודכנו בהצלחה! 🎯');
    } catch (err) {
      console.error('Failed to update agency goals', err);
      showToast('שגיאה בשמירת הגדרות המשרד.', 'error');
    } finally {
      setAgencyGoalsSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const docId = userData?.id ?? userData?.uid;
    if (!file || !docId) return;

    if (file.size > 2 * 1024 * 1024) {
      showToast('התמונה גדולה מ-2MB. אנא בחר תמונה קטנה יותר.', 'error');
      return;
    }

    try {
      setIsUploading(true);
      // Upload to storage (use auth uid for the storage path)
      const photoURL = await uploadProfilePicture(userData!.uid!, file);
      // Update the Firestore doc using the actual document ID
      await updateUserProfile(docId!, { photoURL });
      // The auth context listener should automatically pick up the new photoURL and update the UI
      await refreshUserData(); // Force instant refresh 
      showToast('תמונת הפרופיל עודכנה בהצלחה 🎉');
    } catch (err) {
      console.error('Failed to upload profile picture:', err);
      showToast('שגיאה בהעלאת התמונה. נסה שוב מאוחר יותר.', 'error');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAgencyLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const agencyId = userData?.agencyId;
    if (!file || !agencyId) return;

    if (file.size > 2 * 1024 * 1024) {
      showToast('התמונה גדולה מ-2MB. אנא בחר תמונה קטנה יותר.', 'error');
      return;
    }

    try {
      setAgencyLogoUploading(true);
      const newUrl = await uploadAndSaveAgencyLogo(agencyId, file);
      setAgencyLogoUrl(newUrl);
      showToast('לוגו הסוכנות עודכן בהצלחה! 🏢');
    } catch (err) {
      console.error('Failed to upload agency logo:', err);
      showToast('שגיאה בהעלאת לוגו הסוכנות. נסה שוב מאוחר יותר.', 'error');
    } finally {
      setAgencyLogoUploading(false);
      if (agencyLogoInputRef.current) agencyLogoInputRef.current.value = '';
    }
  };

  const handleSaveProfile = async () => {
    const docId = userData?.id ?? userData?.uid;
    if (!docId) return;

    if (profilePhone && !isValidPhone(profilePhone)) {
      showToast('מספר הטלפון שהוזן אינו תקין', 'error');
      return;
    }

    setProfileSaving(true);
    try {
      await updateUserProfile(docId, {
        name: profileName,
        phone: profilePhone
      });
      await refreshUserData(); // Update UI immediately without refresh
      showToast('הפרופיל עודכן בהצלחה! ✅');
    } catch (err) {
      console.error('Failed to update profile:', err);
      showToast('שגיאה בעדכון הפרופיל.', 'error');
    } finally {
      setProfileSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">הגדרות</h1>
        <p className="text-sm text-slate-500 mt-0.5">נהל את החשבון וההעדפות שלך</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:w-56 flex-shrink-0">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-2">
            {sections.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveSection(id)}
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${activeSection === id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                  }`}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-4">
          {activeSection === 'profile' && (
            <div className="space-y-4">
              {/* ── Card 1: My Personal Details ── */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6">
                <div className="flex items-center gap-2.5 pb-1 border-b border-slate-100">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Users2 size={14} className="text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">הפרופיל שלי</h2>
                    <p className="text-xs text-slate-400">פרטים אישיים של המשתמש המחובר</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xl font-bold overflow-hidden shadow-sm">
                    {isUploading ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : userData?.photoURL ? (
                      <img src={userData.photoURL} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      userData?.name?.substring(0, 1).toUpperCase() || 'ע'
                    )}
                  </div>
                  <div>
                    <input
                      type="file"
                      accept="image/jpeg, image/png, image/gif"
                      className="hidden"
                      ref={fileInputRef}
                      onChange={handlePhotoUpload}
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="text-sm font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Camera size={14} />
                      {isUploading ? 'מעלה...' : 'שנה תמונה'}
                    </button>
                    <p className="text-xs text-slate-400 mt-0.5">JPG, GIF או PNG. גודל מקסימלי 2MB</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">שם מלא</label>
                    <input
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all bg-slate-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">כתובת אימייל (לקריאה בלבד)</label>
                    <input
                      disabled
                      value={userData?.email || ''}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-400 bg-slate-100 cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">מספר טלפון</label>
                    <input
                      value={profilePhone}
                      onChange={(e) => setProfilePhone(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all bg-slate-50"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">תפקיד (לקריאה בלבד)</label>
                    <input
                      disabled
                      value={userData?.role === 'admin' ? 'מנהל סוכנות' : 'סוכן'}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-400 bg-slate-100 cursor-not-allowed"
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-4 border-t border-slate-100">
                  <button
                    onClick={handleSaveProfile}
                    disabled={profileSaving}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center min-w-[120px]"
                  >
                    {profileSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור שינויים'}
                  </button>
                </div>
              </div>

              {/* ── Card 2: Agency Details (admin only) ── */}
              {userData?.role === 'admin' && (
                <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-6 space-y-4">
                  <div className="flex items-center gap-2.5 pb-1 border-b border-slate-100">
                    <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
                      <Building size={14} className="text-amber-600" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">פרטי הסוכנות</h2>
                      <p className="text-xs text-slate-400">לוגו ופרטים של המשרד — נראים ללקוחות ובקטלוגים</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="relative w-24 h-24 rounded-2xl border-2 border-dashed border-amber-200 bg-amber-50 flex items-center justify-center overflow-hidden">
                      {agencyLogoUploading ? (
                        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                      ) : agencyLogoUrl ? (
                        <img src={agencyLogoUrl} alt="Agency Logo" className="w-full h-full object-contain p-2" />
                      ) : (
                        <Building size={28} className="text-amber-300" />
                      )}
                    </div>
                    <div className="space-y-2">
                      <input
                        type="file"
                        accept="image/jpeg, image/png, image/webp"
                        className="hidden"
                        ref={agencyLogoInputRef}
                        onChange={handleAgencyLogoUpload}
                      />
                      <button
                        onClick={() => agencyLogoInputRef.current?.click()}
                        disabled={agencyLogoUploading}
                        className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        <Camera size={16} className="text-slate-500" />
                        {agencyLogoUploading ? 'מעלה לוגו...' : 'העלה לוגו חדש'}
                      </button>
                      <p className="text-xs text-slate-400">מומלץ תמונת PNG שקופה (עד 2MB)</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeSection === 'notifications' && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h2 className="text-base font-semibold text-slate-900 mb-5">העדפות התראות</h2>
              <div className="space-y-4">
                {[
                  { label: 'לידים חדשים', sub: 'קבל התראה כשליד חדש נקלט', on: true },
                  { label: 'עסקה נסגרה', sub: 'הודע לי כשסוכן סוגר עסקה', on: true },
                  { label: 'עדכוני קמפיין', sub: 'התראות ביצועי קמפיין שיווקי', on: false },
                  { label: 'דוחות שבועיים', sub: 'סיכום אוטומטי כל יום ראשון בבוקר', on: true },
                  { label: 'פעילות סוכנים', sub: 'התראות על כניסות ועדכוני סוכנים', on: false },
                  { label: 'התראות מערכת', sub: 'הודעות חשובות על הפלטפורמה או אבטחה', on: true },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{item.sub}</p>
                    </div>
                    <Toggle defaultChecked={item.on} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'security' && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
              <h2 className="text-base font-semibold text-slate-900">אבטחה</h2>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">סיסמה נוכחית</label>
                <input type="password" placeholder="••••••••" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">סיסמה חדשה</label>
                  <input type="password" placeholder="••••••••" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">אמת סיסמה חדשה</label>
                  <input type="password" placeholder="••••••••" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
                </div>
              </div>
              <div className="flex justify-end">
                <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors">
                  עדכן סיסמה
                </button>
              </div>
            </div>
          )}

          {activeSection === 'team' && (
            <TeamManagement />
          )}

          {activeSection === 'goals' && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-8 animate-in fade-in duration-300">
              <div>
                <h2 className="text-base font-semibold text-slate-900">יעדי המשרד</h2>
                <p className="text-sm text-slate-500 mt-0.5">הגדר את היעדים הכלליים שמוצגים בדשבורד הראשי של הסוכנות</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Monthly Agency Goals */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <CalendarDays size={18} className="text-blue-500" />
                    <h3 className="font-bold text-slate-800 text-sm">יעד חודשי</h3>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">הכנסות חודשי (₪)</label>
                    <div className="relative">
                      <BarChart4 className="absolute right-3.5 top-3.5 h-4 w-4 text-slate-400" />
                      <input type="number" value={monthlyRevenue || ''} onChange={(e) => setMonthlyRevenue(Number(e.target.value))} className="w-full border border-slate-200 rounded-xl px-4 py-3 pr-10 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" dir="ltr" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">עסקאות בחודש</label>
                    <div className="relative">
                      <Target className="absolute right-3.5 top-3.5 h-4 w-4 text-slate-400" />
                      <input type="number" value={monthlyDeals || ''} onChange={(e) => setMonthlyDeals(Number(e.target.value))} className="w-full border border-slate-200 rounded-xl px-4 py-3 pr-10 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" dir="ltr" />
                    </div>
                  </div>
                </div>

                {/* Yearly Agency Goals */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <CalendarDays size={18} className="text-violet-500" />
                    <h3 className="font-bold text-slate-800 text-sm">יעד שנתי</h3>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">הכנסות לשנה (₪)</label>
                    <div className="relative">
                      <BarChart4 className="absolute right-3.5 top-3.5 h-4 w-4 text-slate-400" />
                      <input type="number" value={yearlyRevenue || ''} onChange={(e) => setYearlyRevenue(Number(e.target.value))} className="w-full border border-slate-200 rounded-xl px-4 py-3 pr-10 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" dir="ltr" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">עסקאות בשנה</label>
                    <div className="relative">
                      <Target className="absolute right-3.5 top-3.5 h-4 w-4 text-slate-400" />
                      <input type="number" value={yearlyDeals || ''} onChange={(e) => setYearlyDeals(Number(e.target.value))} className="w-full border border-slate-200 rounded-xl px-4 py-3 pr-10 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" dir="ltr" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Global Service Areas Section */}
              <div className="pt-8 border-t border-slate-100">
                <div className="flex items-center gap-2 pb-2 mb-4 border-b border-slate-100">
                  <Globe size={18} className="text-blue-500" />
                  <h3 className="font-bold text-slate-800 text-sm">אזורי שירות (מאגר ארצי)</h3>
                </div>
                <p className="text-xs text-slate-500 mb-4">
                  בחר את הערים שבהן תרצה לראות נכסים מהמאגר הארצי המשותף. נכסים אלו יופיעו תחת לשונית "נכסים" ויסומנו כ"מאגר ארצי".
                </p>

                <div className="space-y-3">
                  {/* Selected Cities Pills */}
                  <div className="flex flex-wrap gap-2">
                    {activeGlobalCities.map((city) => (
                      <div key={city} className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg text-sm font-medium border border-blue-100">
                        {city}
                        <button
                          onClick={() => setActiveGlobalCities(prev => prev.filter(c => c !== city))}
                          className="text-blue-400 hover:text-blue-600 focus:outline-none transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    {activeGlobalCities.length === 0 && (
                      <span className="text-sm text-slate-400 py-1.5">לא נבחרו ערים אזוריות. נכסים ארציים לא יוצגו.</span>
                    )}
                  </div>

                  {/* Add New City Input */}
                  <div className="flex items-center gap-2 relative max-w-sm">
                    <input
                      type="text"
                      value={newCityInput}
                      onChange={(e) => setNewCityInput(e.target.value)}
                      placeholder="הקלד שם עיר או ישוב..."
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newCityInput.trim()) {
                          e.preventDefault();
                          const city = newCityInput.trim();
                          if (!activeGlobalCities.includes(city)) {
                            setActiveGlobalCities(prev => [...prev, city]);
                          }
                          setNewCityInput('');
                        }
                      }}
                    />
                    <button
                      onClick={() => {
                        const city = newCityInput.trim();
                        if (city && !activeGlobalCities.includes(city)) {
                          setActiveGlobalCities(prev => [...prev, city]);
                          setNewCityInput('');
                        }
                      }}
                      disabled={!newCityInput.trim()}
                      className="bg-slate-800 hover:bg-slate-900 text-white p-2.5 rounded-xl transition-colors disabled:opacity-50"
                    >
                      <Plus size={18} />
                    </button>

                    {/* Autocomplete Dropdown - searches across all Israeli cities and settlements */}
                    {newCityInput.trim().length > 0 && (
                      <ul className="absolute z-10 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg">
                        {ISRAEL_CITIES
                          .filter(city => city.includes(newCityInput.trim()) && !activeGlobalCities.includes(city))
                          .slice(0, 12)
                          .map((city) => (
                            <li
                              key={city}
                              onClick={() => {
                                setActiveGlobalCities(prev => [...prev, city]);
                                setNewCityInput('');
                              }}
                              className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer"
                            >
                              {city}
                            </li>
                          ))}
                        {/* Always show "add custom" option if no exact match found */}
                        {!ISRAEL_CITIES.includes(newCityInput.trim()) && newCityInput.trim().length >= 2 && (
                          <li
                            onClick={() => {
                              const city = newCityInput.trim();
                              if (!activeGlobalCities.includes(city)) {
                                setActiveGlobalCities(prev => [...prev, city]);
                              }
                              setNewCityInput('');
                            }}
                            className="px-4 py-2 text-sm text-blue-600 font-semibold hover:bg-blue-50 cursor-pointer border-t border-slate-100"
                          >
                            + הוסף &quot;{newCityInput.trim()}&quot; כישוב מותאם
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-100">
                <button onClick={handleSaveAgencyGoals} disabled={agencyGoalsSaving} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-6 py-3 rounded-xl transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50">
                  {agencyGoalsSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור יעדים'}
                </button>
              </div>
            </div>
          )}

          {activeSection === 'integrations' && (
            <WhatsAppSettings />
          )}

          {(activeSection === 'billing') && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center">
              <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                {(() => {
                  const s = sections.find(s => s.id === activeSection);
                  const Icon = s ? s.icon : Globe;
                  return <Icon size={22} className="text-slate-400" />;
                })()}
              </div>
              <p className="text-slate-700 font-semibold text-sm">בקרוב</p>
              <p className="text-slate-400 text-xs mt-1">חלק זה יהיה זמין לאחר חיבור צד שרת.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
