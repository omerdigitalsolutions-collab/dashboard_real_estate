import { useState, useEffect } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import {
    MessageCircle, CheckCircle, AlertCircle, Loader2,
    Smartphone, QrCode, RefreshCw, Unlink,
} from 'lucide-react';

// ─── Admin-only: these come from Green API dashboard ─────────────────────────
// We store them in env or hardcode for a single-tenant setup.
// For multi-tenant the admin enters them once; after that the UI hides them.
const STEPS = [
    { icon: '1', text: 'לחץ על "חבר ווצאפ" להצגת קוד QR' },
    { icon: '2', text: 'פתח ווצאפ במכשיר שלך' },
    { icon: '3', text: 'עבור אל הגדרות ‣ מכשירים מקושרים ‣ קשר מכשיר' },
    { icon: '4', text: 'סרוק את הקוד שמופיע על המסך' },
];

export const WhatsAppSettings = () => {
    const { userData } = useAuth();

    // Hidden technical fields — admin can expand to enter them
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [idInstance, setIdInstance] = useState('');
    const [apiToken, setApiToken] = useState('');

    const [qrCodeData, setQrCodeData] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [status, setStatus] = useState<'disconnected' | 'pending' | 'connected'>('disconnected');

    // Listen to agency Firestore doc in real-time
    useEffect(() => {
        if (!userData?.agencyId) return;
        const unsub = onSnapshot(doc(db, 'agencies', userData.agencyId), (snap) => {
            if (snap.exists()) {
                const wa = snap.data().whatsappIntegration;
                if (wa) {
                    setStatus(wa.status || 'disconnected');
                    if (wa.idInstance) setIdInstance(wa.idInstance);
                    if (wa.apiTokenInstance) setApiToken(wa.apiTokenInstance);
                }
            }
        });
        return () => unsub();
    }, [userData?.agencyId]);

    const handleConnect = async () => {
        if (!idInstance || !apiToken) {
            setShowAdvanced(true);
            setError('נדרש להזין פרטי חיבור לפני שניתן לחבר ווצאפ.');
            return;
        }
        if (!userData?.agencyId) return;

        setLoading(true);
        setError('');
        setQrCodeData(null);

        try {
            const fns = getFunctions();
            const getQR = httpsCallable(fns, 'getWhatsAppQrCode');
            const result = await getQR({
                idInstance: idInstance.trim(),
                apiTokenInstance: apiToken.trim(),
                agencyId: userData.agencyId,
            });
            const data = result.data as { qrCode: string };
            if (data.qrCode) setQrCodeData(data.qrCode);
        } catch (err: any) {
            console.error(err);
            setError('לא ניתן ליצור קוד חיבור. בדוק שהגדרות ה-API תקינות ונסה שוב.');
        } finally {
            setLoading(false);
        }
    };

    // ── Connected state ───────────────────────────────────────────────────────
    if (status === 'connected') {
        return (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6" dir="rtl">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-11 h-11 bg-emerald-100 rounded-2xl flex items-center justify-center">
                        <MessageCircle size={22} className="text-emerald-600" />
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-slate-900">חיבור ווצאפ</h2>
                        <p className="text-sm text-slate-500">מנהל הודעות ושיחות עם לקוחות</p>
                    </div>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-start gap-4">
                    <CheckCircle size={26} className="text-emerald-600 mt-0.5 shrink-0" />
                    <div>
                        <p className="font-bold text-emerald-800 text-base">ווצאפ מחובר ופעיל ✓</p>
                        <p className="text-sm text-emerald-700 mt-1">
                            המערכת מקבלת הודעות מהלקוחות ומפנה אותן אוטומטית לכרטיסי הלידים.
                        </p>
                        <button
                            onClick={() => setStatus('disconnected')}
                            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-red-600 transition-colors"
                        >
                            <Unlink size={13} />
                            נתק חיבור
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Not connected state ───────────────────────────────────────────────────
    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6" dir="rtl">

            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <div className="w-11 h-11 bg-emerald-100 rounded-2xl flex items-center justify-center">
                    <MessageCircle size={22} className="text-emerald-600" />
                </div>
                <div>
                    <h2 className="text-base font-bold text-slate-900">חיבור ווצאפ</h2>
                    <p className="text-sm text-slate-500">חבר את מספר הווצאפ של המשרד לפתיחת שיחות עם לידים</p>
                </div>
            </div>

            {/* How-to steps */}
            {!qrCodeData && (
                <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {STEPS.map((s) => (
                        <div key={s.icon} className="flex items-start gap-3 bg-slate-50 rounded-xl px-4 py-3">
                            <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                                {s.icon}
                            </span>
                            <p className="text-sm text-slate-700 leading-snug">{s.text}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="mb-4 bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl flex items-center gap-2 text-sm">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* QR Code */}
            {qrCodeData ? (
                <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-emerald-200 rounded-2xl bg-emerald-50 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500 animate-pulse" />
                    <div className="flex items-center gap-2 mb-5 text-slate-700 font-semibold">
                        <Smartphone size={18} className="text-emerald-600" />
                        סרוק את הקוד עם הווצאפ שלך
                    </div>
                    <div className="bg-white p-4 rounded-2xl shadow border border-slate-100">
                        <QRCodeCanvas value={qrCodeData} size={220} level="H" />
                    </div>
                    <p className="text-xs text-slate-500 mt-4 text-center max-w-xs leading-relaxed">
                        הגדרות ➜ מכשירים מקושרים ➜ קשר מכשיר — וסרוק את הקוד
                    </p>
                    <button
                        onClick={handleConnect}
                        disabled={loading}
                        className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800 transition-colors"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        רענן קוד
                    </button>
                </div>
            ) : (
                <>
                    {/* Main CTA */}
                    <button
                        onClick={handleConnect}
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-60 text-sm"
                    >
                        {loading
                            ? <><Loader2 size={18} className="animate-spin" /> מייצר קוד...</>
                            : <><QrCode size={18} /> חבר ווצאפ</>
                        }
                    </button>

                    {/* Hidden advanced section — admin only */}
                    <div className="mt-4">
                        <button
                            onClick={() => setShowAdvanced(v => !v)}
                            className="text-xs text-slate-400 hover:text-slate-600 transition-colors underline underline-offset-2"
                        >
                            {showAdvanced ? 'הסתר הגדרות מתקדמות' : 'הגדרות חיבור מתקדמות'}
                        </button>

                        {showAdvanced && (
                            <div className="mt-3 space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-200 animate-in fade-in duration-200">
                                <p className="text-xs text-slate-500">הגדרות אלו מוזנות פעם אחת ע"י מנהל המערכת</p>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">מזהה Instance</label>
                                    <input
                                        type="text"
                                        value={idInstance}
                                        onChange={e => setIdInstance(e.target.value)}
                                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 outline-none"
                                        placeholder="1101812345"
                                        dir="ltr"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">טוקן API</label>
                                    <input
                                        type="password"
                                        value={apiToken}
                                        onChange={e => setApiToken(e.target.value)}
                                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 outline-none"
                                        placeholder="••••••••••••••••"
                                        dir="ltr"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};
