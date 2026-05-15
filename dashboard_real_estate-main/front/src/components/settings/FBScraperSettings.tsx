import { useEffect, useState } from 'react';
import { Facebook, Save, Loader2, Power, MapPin, Link as LinkIcon, Info, ChevronDown, ChevronUp, Plus, Trash2, Search } from 'lucide-react';
import FBGroupSearchPanel from './FBGroupSearchPanel';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { getAgencyData } from '../../services/agencyService';
import { saveFBScraperConfig } from '../../services/fbLeadService';
import { ISRAEL_CITIES } from '../../utils/constants';
import type { Agency, FBGroupConfig } from '../../types';

function HowToFindGroupUrl() {
    const [open, setOpen] = useState(false);
    return (
        <div className="mt-3 rounded-xl border border-blue-900/40 bg-blue-950/30 overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm text-blue-300 hover:bg-blue-900/20 transition-colors"
            >
                <span className="flex items-center gap-2 font-medium">
                    <Info size={14} />
                    איך מוצאים את הקישור לקבוצת פייסבוק?
                </span>
                {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {open && (
                <div className="px-4 pb-4 text-xs text-blue-200 leading-relaxed space-y-3 border-t border-blue-900/30 pt-3">
                    <p className="font-semibold text-blue-100">שלב אחד מתוך שלושה — מהמחשב (לא מהאפליקציה):</p>
                    <ol className="list-decimal list-inside space-y-2 pr-1">
                        <li>
                            <span className="font-medium text-blue-100">היכנסו לפייסבוק</span> מהדפדפן (chrome, safari וכו׳) ולחצו על <span className="font-medium text-blue-100">קבוצות</span> בסרגל הצד.
                        </li>
                        <li>
                            <span className="font-medium text-blue-100">מצאו את הקבוצה הרצויה</span> (למשל: "נדל״ן תל אביב — ישיר מבעלים") ולחצו עליה.
                        </li>
                        <li>
                            <span className="font-medium text-blue-100">העתיקו את הקישור</span> מסרגל הכתובת בדפדפן — הוא נראה כך:
                            <div dir="ltr" className="mt-1.5 bg-slate-900/60 border border-blue-900/40 rounded-lg px-3 py-1.5 font-mono text-blue-300 text-[11px] select-all break-all">
                                https://www.facebook.com/groups/1234567890
                            </div>
                            <p className="mt-1 text-slate-400">שימו לב: הקישור חייב להכיל <span className="text-blue-200 font-mono">/groups/</span> — לא עמוד עסקי או דף.</p>
                        </li>
                        <li>
                            <span className="font-medium text-blue-100">הדביקו את הקישור</span> בשדה "כתובת הקבוצה" למטה ובחרו את העיר המתאימה.
                        </li>
                    </ol>
                    <p className="text-slate-400 pt-1 border-t border-blue-900/30">
                        <span className="text-yellow-400 font-medium">חשוב:</span> הסורק עובד רק על קבוצות <span className="font-medium text-blue-100">ציבוריות</span>. קבוצות פרטיות (Private) לא ייסרקו. ודאו שאתם חברים בקבוצה ושהיא פתוחה לצפייה.
                    </p>
                </div>
            )}
        </div>
    );
}

export default function FBScraperSettings() {
    const { userData } = useAuth();
    const [enabled, setEnabled] = useState(false);
    const [groups, setGroups] = useState<FBGroupConfig[]>([]);
    const [defaultCity, setDefaultCity] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [showSearch, setShowSearch] = useState(false);

    useEffect(() => {
        if (!userData?.agencyId) return;
        const unsub = getAgencyData(userData.agencyId, (agency: Agency) => {
            const agencyCity = agency.mainServiceArea || '';
            setDefaultCity(agencyCity);
            const cfg = agency.facebookScraper;
            setEnabled(!!cfg?.enabled);
            const saved = (cfg?.groups || []).slice(0, 3);
            setGroups(saved.length > 0 ? saved : [{ url: '', defaultCity: agencyCity }]);
            setLoaded(true);
        });
        return () => unsub();
    }, [userData?.agencyId]);

    const addGroup = () => {
        if (groups.length >= 3) return;
        setGroups(prev => [...prev, { url: '', defaultCity }]);
    };

    const addGroupWithUrl = (url: string, name: string) => {
        if (groups.length >= 3) { toast.error('הגעתם למגבלה של 3 קבוצות'); return; }
        setGroups(prev => [...prev, { url, name, defaultCity }]);
        setShowSearch(false);
    };

    const removeGroup = (index: number) => {
        setGroups(prev => prev.filter((_, i) => i !== index));
    };

    if (userData?.role !== 'admin') {
        return (
            <div dir="rtl" className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 text-slate-400 text-sm">
                רק מנהל משרד יכול להגדיר את סורק הפייסבוק.
            </div>
        );
    }

    const updateGroup = (index: number, patch: Partial<FBGroupConfig>) => {
        setGroups(prev => prev.map((g, i) => i === index ? { ...g, ...patch } : g));
    };

    const handleSave = async () => {
        if (!userData?.agencyId) return;
        const filtered = groups.filter(g => g.url.trim() && g.defaultCity);
        if (enabled && filtered.length === 0) {
            toast.error('יש להגדיר לפחות קבוצה אחת עם עיר');
            return;
        }
        setIsSaving(true);
        try {
            await saveFBScraperConfig(userData.agencyId, { enabled, groups: filtered });
            toast.success('הגדרות סורק פייסבוק נשמרו');
        } catch (err) {
            console.error(err);
            toast.error('שמירה נכשלה');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div dir="rtl" className="space-y-6">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-lg">
                <div className="flex items-start justify-between gap-4 mb-6">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-400 flex items-center justify-center shadow-lg shrink-0">
                            <Facebook size={20} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">סורק פייסבוק</h2>
                            <p className="text-sm text-slate-400 mt-1">
                                הוסיפו עד 3 קבוצות פייסבוק. המערכת תסרוק אותן מדי יום ב-08:00 ותיצור לידים אוטומטית מפוסטים של מוכרים פרטיים.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setEnabled(v => !v)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition border ${
                            enabled
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                    >
                        <Power size={14} />
                        {enabled ? 'פעיל' : 'מושבת'}
                    </button>
                </div>

                {loaded && (
                    <div className="space-y-3">
                        {groups.map((group, index) => (
                            <div
                                key={index}
                                className="bg-slate-950/40 border border-slate-800 rounded-xl p-4"
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <span className="text-xs font-semibold text-slate-500">קבוצה {index + 1}</span>
                                        {group.name && (
                                            <span className="text-xs text-slate-400 mr-2">{group.name}</span>
                                        )}
                                    </div>
                                    {groups.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removeGroup(index)}
                                            className="p-1 text-slate-600 hover:text-red-400 transition rounded"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3">
                                    <label className="block">
                                        <span className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                                            <LinkIcon size={12} />
                                            כתובת הקבוצה
                                        </span>
                                        <input
                                            type="text"
                                            dir="ltr"
                                            placeholder="https://www.facebook.com/groups/..."
                                            value={group.url}
                                            onChange={(e) => updateGroup(index, { url: e.target.value })}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none"
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                                            <MapPin size={12} />
                                            עיר היעד
                                        </span>
                                        <select
                                            value={group.defaultCity}
                                            onChange={(e) => updateGroup(index, { defaultCity: e.target.value })}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none"
                                        >
                                            <option value="">בחרו עיר...</option>
                                            {ISRAEL_CITIES.map(city => (
                                                <option key={city} value={city}>{city}</option>
                                            ))}
                                        </select>
                                    </label>
                                </div>
                                {index === 0 && <HowToFindGroupUrl />}
                            </div>
                        ))}

                        {groups.length < 3 && (
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={addGroup}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-500 text-sm transition"
                                >
                                    <Plus size={14} />
                                    הוספת קבוצה ({groups.length}/3)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowSearch(v => !v)}
                                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm transition ${
                                        showSearch
                                            ? 'bg-blue-600/20 text-blue-300 border-blue-600/30'
                                            : 'border-dashed border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-500'
                                    }`}
                                >
                                    <Search size={14} />
                                    חיפוש בפייסבוק
                                    {showSearch ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                </button>
                            </div>
                        )}

                        {showSearch && (
                            <div className="bg-slate-950/40 border border-blue-900/30 rounded-xl p-4">
                                <FBGroupSearchPanel
                                    onSelectGroup={addGroupWithUrl}
                                    disabled={groups.length >= 3}
                                />
                            </div>
                        )}
                    </div>
                )}

                <div className="flex justify-end mt-6">
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-bold rounded-xl transition shadow-lg"
                    >
                        {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        שמירת הגדרות
                    </button>
                </div>
            </div>

            <div className="bg-blue-950/40 border border-blue-900/40 rounded-xl p-4 text-xs text-blue-200 leading-relaxed">
                <strong>איך זה עובד:</strong> כל יום ב-08:00 בבוקר המערכת סורקת את הקבוצות שהגדרתם.
                פוסטים שמזוהים כ"בעל נכס פרטי" → נוצרים אוטומטית ליד מוכר ונכס בטיוטה (תיאור הנכס יישלף מהפוסט ללא פרטי הקשר).
                פוסטים של מתווכים → ייכנסו לרשימת הצפייה לעיון בלבד.
            </div>
        </div>
    );
}
