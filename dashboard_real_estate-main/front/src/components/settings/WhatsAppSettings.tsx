import { useState, useEffect, useRef } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import {
    MessageCircle,
    CheckCircle,
    Loader2,
    Smartphone,
    QrCode,
    RefreshCw,
    Unlink,
    WifiOff,
    AlertCircle,
    Users,
    Check,
    Search
} from 'lucide-react';

// ─── Cloud Function Callables ─────────────────────────────────────────────────
const fns = getFunctions(undefined, 'europe-west1');
const cfConnectInstance = httpsCallable<{}, { success: boolean, message: string }>(fns, 'whatsapp-connectAgencyWhatsApp');
const cfGenerateQR = httpsCallable<{}, { qrCode: string }>(fns, 'whatsapp-generateWhatsAppQR');
const cfCheckStatus = httpsCallable<{}, { status: string }>(fns, 'whatsapp-checkWhatsAppStatus');
const cfDisconnect = httpsCallable<{}, { success: boolean }>(fns, 'whatsapp-disconnectAgencyWhatsApp');
const cfGetGroups = httpsCallable<{}, { success: boolean, groups: { id: string, name: string }[] }>(fns, 'whatsapp-getGroups');

const POLL_INTERVAL_MS = 5_000;

// ─── Onboarding Steps ─────────────────────────────────────────────────────────
const STEPS = [
    { n: '1', text: 'לחץ על "חבר ווצאפ" להצגת קוד QR' },
    { n: '2', text: 'פתח ווצאפ במכשיר שלך' },
    { n: '3', text: 'הגדרות ‣ מכשירים מקושרים ‣ קשר מכשיר' },
    { n: '4', text: 'סרוק את הקוד שמופיע על המסך' },
];

// ─── Component ────────────────────────────────────────────────────────────────
export const WhatsAppSettings = () => {
    const { userData } = useAuth();

    // Live status from Firestore
    const [status, setStatus] = useState<'disconnected' | 'pending' | 'connected'>('disconnected');

    // Modal/QR state
    const [showModal, setShowModal] = useState(false);
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [loadingQR, setLoadingQR] = useState(false);
    const [error, setError] = useState('');
    const [disconnecting, setDisconnecting] = useState(false);

    // B2B Groups State
    const [monitoredGroups, setMonitoredGroups] = useState<{ id: string, name: string }[]>([]);
    const [availableGroups, setAvailableGroups] = useState<{ id: string, name: string }[]>([]);
    const [groupSearch, setGroupSearch] = useState('');
    const [isFetchingGroups, setIsFetchingGroups] = useState(false);
    const [savingGroups, setSavingGroups] = useState(false);
    const [fetchError, setFetchError] = useState('');

    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Filtered groups based on search
    const filteredGroups = availableGroups.filter(g =>
        g.name.toLowerCase().includes(groupSearch.toLowerCase()) ||
        g.id.split('@')[0].includes(groupSearch)
    );

    // ── Real-time agency status listener ─────────────────────────────────────
    useEffect(() => {
        if (!userData?.agencyId) return;
        const unsub = onSnapshot(doc(db, 'agencies', userData.agencyId), (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                // Normalize legacy string[] to {id, name}[]
                const rawGroups = data.whatsappIntegration?.monitoredGroups || [];
                const normalized = rawGroups.map((g: any) =>
                    typeof g === 'string' ? { id: g, name: g.split('@')[0] } : g
                );
                setMonitoredGroups(normalized);

                const currentStatus = data.whatsappIntegration?.status?.toUpperCase();
                if (data.isWhatsappConnected || currentStatus === 'CONNECTED') {
                    setStatus('connected');
                } else if (currentStatus === 'PENDING_SCAN') {
                    setStatus('pending');
                } else {
                    setStatus('disconnected');
                }
            }
        });
        return () => unsub();
    }, [userData?.agencyId]);

    // ── Fetch available groups when connected ──────────────────────────────
    useEffect(() => {
        if (status === 'connected') {
            fetchAvailableGroups();
        }
    }, [status]);

    const fetchAvailableGroups = async () => {
        setIsFetchingGroups(true);
        setFetchError('');
        try {
            const result = await cfGetGroups({});
            if (result.data.success) {
                setAvailableGroups(result.data.groups);
            } else {
                setFetchError('לא הצלחנו למשוך את רשימת הקבוצות.');
            }
        } catch (err: any) {
            console.error('Failed to fetch WhatsApp groups:', err);
            setFetchError(err?.message || 'שגיאת תקשורת בטעינת הקבוצות.');
        } finally {
            setIsFetchingGroups(false);
        }
    };

    // ── Stop polling when connected or modal closed ───────────────────────────
    const stopPoll = () => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    };

    const startPolling = () => {
        stopPoll();
        pollRef.current = setInterval(async () => {
            try {
                const result = await cfCheckStatus({});
                if (result.data.status?.toUpperCase() === 'CONNECTED') {
                    stopPoll();
                    setShowModal(false);
                    setQrCode(null);
                }
            } catch (_) { /* ignore transient errors */ }
        }, POLL_INTERVAL_MS);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => () => stopPoll(), []); // cleanup on unmount

    // ── Generate QR & Connect Instance ───────────────────────────────────────────
    const handleConnect = async () => {
        setShowModal(true);
        setQrCode(null);
        setError('');
        setLoadingQR(true);

        try {
            // 1. Allocate Instance
            try {
                await cfConnectInstance({});
            } catch (err: any) {
                if (err?.code !== 'already-exists' && !err?.message?.includes('already has an allocated')) {
                    throw err;
                }
                console.log('WhatsApp instance already allocated for this agency, proceeding to QR.');
            }

            // 2. Generate QR
            const result = await cfGenerateQR({});
            setQrCode(result.data.qrCode);
            startPolling();
        } catch (err: any) {
            console.error(err);
            setError(err?.message || 'שגיאה ביצירת קוד QR. יש לוודא שיש Instances זמינים במאגר.');
        } finally {
            setLoadingQR(false);
        }
    };

    // ── Disconnect ────────────────────────────────────────────────────────────
    const handleDisconnect = async () => {
        if (!confirm('האם לנתק את חיבור הווצאפ?')) return;
        setDisconnecting(true);
        try {
            await cfDisconnect({});
        } catch (err) {
            console.error('Failed to disconnect:', err);
            alert('שגיאה בניתוק הווצאפ. נסה שוב מאוחר יותר.');
        } finally {
            setDisconnecting(false);
        }
    };

    // ── Refresh QR ────────────────────────────────────────────────────────────
    const handleRefreshQR = async () => {
        stopPoll();
        setQrCode(null);
        setError('');
        setLoadingQR(true);
        try {
            const result = await cfGenerateQR({});
            setQrCode(result.data.qrCode);
            startPolling();
        } catch (err: any) {
            setError(err?.message || 'שגיאה בריענון הקוד');
        } finally {
            setLoadingQR(false);
        }
    };

    const handleCloseModal = () => {
        stopPoll();
        setShowModal(false);
        setQrCode(null);
        setError('');
    };

    // ── Manage Groups ─────────────────────────────────────────────────────────
    const handleToggleGroup = async (group: { id: string, name: string }) => {
        if (!userData?.agencyId) return;

        const isSelected = monitoredGroups.some(g => g.id === group.id);
        let updated;

        if (isSelected) {
            updated = monitoredGroups.filter(g => g.id !== group.id);
        } else {
            if (monitoredGroups.length >= 5) return;
            updated = [...monitoredGroups, group];
        }

        setSavingGroups(true);
        try {
            await updateDoc(doc(db, 'agencies', userData.agencyId), {
                'whatsappIntegration.monitoredGroups': updated
            });
        } catch (err) {
            console.error('Failed to update groups:', err);
        } finally {
            setSavingGroups(false);
        }
    };

    // ─── Connected state ───────────────────────────────────────────────────────
    if (status === 'connected') {
        return (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6" dir="rtl">
                <div className="flex items-center gap-3 mb-5">
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
                    <div className="flex-1">
                        <p className="font-bold text-emerald-800 text-base">ווצאפ מחובר ופעיל ✓</p>
                        <p className="text-sm text-emerald-700 mt-1">
                            המערכת מקבלת הודעות מהלקוחות ומפנה אותן אוטומטית לכרטיסי הלידים.
                        </p>
                        <button
                            onClick={handleDisconnect}
                            disabled={disconnecting}
                            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-red-600 transition-colors disabled:opacity-50"
                        >
                            {disconnecting
                                ? <Loader2 size={13} className="animate-spin" />
                                : <Unlink size={13} />}
                            נתק חיבור
                        </button>
                    </div>
                </div>

                {/* ── B2B Monitored Groups ── */}
                <div className="mt-6 border-t border-slate-100 pt-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2 text-slate-800">
                            <Users size={18} className="text-indigo-500" />
                            <h3 className="font-bold">קבוצות מתווכים (B2B)</h3>
                        </div>
                        <button
                            onClick={fetchAvailableGroups}
                            disabled={isFetchingGroups}
                            className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded-lg transition-colors"
                        >
                            <RefreshCw size={12} className={isFetchingGroups ? 'animate-spin' : ''} />
                            {availableGroups.length > 0 ? 'רענן רשימה' : 'טען קבוצות'}
                        </button>
                    </div>
                    <p className="text-sm text-slate-500 mb-4">
                        בחר עד 5 קבוצות ווצאפ לסריקה אוטומטית של נכסים חדשים.
                    </p>

                    {/* ── Search Input (Always Visible) ── */}
                    <div className="relative mb-4">
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            placeholder="חפש קבוצה לפי שם..."
                            value={groupSearch}
                            onChange={(e) => setGroupSearch(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pr-10 pl-4 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                        />
                    </div>

                    {fetchError && (
                        <div className="mb-4 p-3 bg-amber-50 border border-amber-100 rounded-xl flex items-start gap-2">
                            <AlertCircle size={14} className="text-amber-600 mt-0.5 shrink-0" />
                            <p className="text-xs text-amber-800 font-medium">{fetchError}</p>
                        </div>
                    )}

                    {isFetchingGroups && availableGroups.length === 0 ? (
                        <div className="flex flex-col items-center py-6 gap-2 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                            <Loader2 size={24} className="animate-spin text-slate-400" />
                            <p className="text-xs text-slate-400">טוען קבוצות מהוואטסאפ...</p>
                        </div>
                    ) : (
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                            {filteredGroups.length > 0 ? (
                                filteredGroups.map((group) => {
                                    const isSelected = monitoredGroups.some(g => g.id === group.id);
                                    const isDisabled = !isSelected && monitoredGroups.length >= 5;

                                    return (
                                        <label
                                            key={group.id}
                                            className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${isSelected ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-100 hover:border-slate-200'} ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>
                                                    {isSelected && <Check size={14} className="text-white" />}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold text-slate-700">{group.name}</span>
                                                    <span className="text-[10px] text-slate-400 font-mono" dir="ltr">{group.id.split('@')[0]}</span>
                                                </div>
                                            </div>
                                            <input
                                                type="checkbox"
                                                className="hidden"
                                                checked={isSelected}
                                                disabled={isDisabled || savingGroups}
                                                onChange={() => handleToggleGroup(group)}
                                            />
                                        </label>
                                    );
                                })
                            ) : (
                                <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200 space-y-2">
                                    <p className="text-sm text-slate-500 font-medium">לא נמצאו קבוצות התואמות לחיפוש.</p>
                                    <p className="text-[11px] text-slate-400">
                                        אם קבוצה חסרה, נסה לשלוח בה הודעה ואז ללחוץ על "רענן רשימה".
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {monitoredGroups.length >= 5 && (
                        <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                            <AlertCircle size={12} />
                            הגעת למגבלה המקסימלית של 5 קבוצות.
                        </p>
                    )}
                </div>
            </div>
        );
    }

    // ─── Not connected state ───────────────────────────────────────────────────
    return (
        <>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6" dir="rtl">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-11 h-11 bg-emerald-100 rounded-2xl flex items-center justify-center">
                        <MessageCircle size={22} className="text-emerald-600" />
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-slate-900">חיבור ווצאפ</h2>
                        <p className="text-sm text-slate-500">חבר את מספר הווצאפ של המשרד לפתיחת שיחות עם לידים</p>
                    </div>
                </div>

                <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {STEPS.map(s => (
                        <div key={s.n} className="flex items-start gap-3 bg-slate-50 rounded-xl px-4 py-3">
                            <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                                {s.n}
                            </span>
                            <p className="text-sm text-slate-700 leading-snug">{s.text}</p>
                        </div>
                    ))}
                </div>

                {status === 'pending' && (
                    <div className="mb-4 flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                        <WifiOff size={15} className="shrink-0" />
                        ממתין לסריקה — פתח את הקוד שנוצר בעבר, או צור קוד חדש.
                    </div>
                )}

                <button
                    onClick={handleConnect}
                    className="w-full flex items-center justify-center gap-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition-colors text-sm shadow-sm shadow-emerald-600/20"
                >
                    <QrCode size={18} />
                    חבר ווצאפ
                </button>
            </div>

            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={handleCloseModal} />

                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 flex flex-col items-center" dir="rtl">
                        <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center mb-4">
                            <Smartphone size={24} className="text-emerald-600" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 mb-1">סרוק לחיבור ווצאפ</h3>
                        <p className="text-sm text-slate-500 text-center mb-6">
                            הגדרות ➜ מכשירים מקושרים ➜ קשר מכשיר — וסרוק את הקוד
                        </p>

                        {loadingQR && (
                            <div className="flex flex-col items-center gap-3 py-10">
                                <Loader2 size={40} className="animate-spin text-emerald-500" />
                                <p className="text-sm text-slate-500">מייצר קוד QR...</p>
                            </div>
                        )}

                        {!loadingQR && error && (
                            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 w-full mb-4">
                                <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-500" />
                                <span>{error}</span>
                            </div>
                        )}

                        {!loadingQR && qrCode && (
                            <>
                                <div className="relative w-full flex justify-center mb-1">
                                    <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500 rounded-full animate-pulse" />
                                    <div className="bg-white p-3 rounded-2xl shadow border border-slate-100">
                                        <img
                                            src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                                            alt="WhatsApp QR Code"
                                            className="w-[220px] h-[220px] object-contain"
                                        />
                                    </div>
                                </div>
                                <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
                                    <Loader2 size={12} className="animate-spin text-emerald-500" />
                                    ממתין לסריקה — מתעדכן אוטומטית...
                                </div>
                            </>
                        )}

                        <div className="mt-6 flex gap-3 w-full">
                            <button
                                onClick={handleCloseModal}
                                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                            >
                                סגור
                            </button>
                            {!loadingQR && (
                                <button
                                    onClick={handleRefreshQR}
                                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors flex items-center justify-center gap-1.5"
                                >
                                    <RefreshCw size={14} />
                                    רענן קוד
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
