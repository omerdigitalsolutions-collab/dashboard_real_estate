import { useState, useEffect, useRef } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import {
    MessageCircle, CheckCircle, Loader2,
    Smartphone, QrCode, RefreshCw, Unlink, WifiOff, AlertCircle,
} from 'lucide-react';

// ─── Cloud Function Callables ─────────────────────────────────────────────────
const fns = getFunctions(undefined, 'europe-west1');
const cfConnectInstance = httpsCallable<{}, { success: boolean, message: string }>(fns, 'whatsapp-connectAgencyWhatsApp');
const cfGenerateQR = httpsCallable<{}, { qrCode: string }>(fns, 'whatsapp-generateWhatsAppQR');
const cfCheckStatus = httpsCallable<{}, { status: string }>(fns, 'whatsapp-checkWhatsAppStatus');
const cfDisconnect = httpsCallable<{}, { success: boolean }>(fns, 'whatsapp-disconnectAgencyWhatsApp');

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

    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Real-time agency status listener ─────────────────────────────────────
    useEffect(() => {
        if (!userData?.agencyId) return;
        const unsub = onSnapshot(doc(db, 'agencies', userData.agencyId), (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                if (data.isWhatsappConnected) {
                    setStatus('connected');
                } else if (data.whatsappIntegration?.status === 'PENDING_SCAN') {
                    setStatus('pending');
                } else {
                    setStatus('disconnected');
                }
            }
        });
        return () => unsub();
    }, [userData?.agencyId]);

    // ── Stop polling when connected or modal closed ───────────────────────────
    const stopPoll = () => {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };

    const startPolling = () => {
        stopPoll();
        pollRef.current = setInterval(async () => {
            try {
                const result = await cfCheckStatus({});
                if (result.data.status === 'connected') {
                    stopPoll();
                    setShowModal(false);
                    setQrCode(null);
                }
            } catch (_) { /* ignore transient errors */ }
        }, POLL_INTERVAL_MS);
    };

    useEffect(() => () => stopPoll(), []); // cleanup on unmount

    // ── Generate QR & Connect Instance ───────────────────────────────────────────
    const handleConnect = async () => {
        setShowModal(true);
        setQrCode(null);
        setError('');
        setLoadingQR(true);

        try {
            // 1. Allocate Instance
            await cfConnectInstance({});
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
            // Success assumes the real-time listener will update the status and unmount this view
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

    // ── Close modal ────────────────────────────────────────────────────────────
    const handleCloseModal = () => {
        stopPoll();
        setShowModal(false);
        setQrCode(null);
        setError('');
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
            </div>
        );
    }

    // ─── Not connected state ───────────────────────────────────────────────────
    return (
        <>
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

                {/* Pending hint */}
                {status === 'pending' && (
                    <div className="mb-4 flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                        <WifiOff size={15} className="shrink-0" />
                        ממתין לסריקה — פתח את הקוד שנוצר בעבר, או צור קוד חדש.
                    </div>
                )}

                {/* CTA Button */}
                <button
                    onClick={handleConnect}
                    className="w-full flex items-center justify-center gap-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition-colors text-sm shadow-sm shadow-emerald-600/20"
                >
                    <QrCode size={18} />
                    חבר ווצאפ
                </button>
            </div>

            {/* ── QR Modal ──────────────────────────────────────────────────── */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={handleCloseModal} />

                    <div
                        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 flex flex-col items-center"
                        dir="rtl"
                    >
                        {/* Header */}
                        <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center mb-4">
                            <Smartphone size={24} className="text-emerald-600" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 mb-1">סרוק לחיבור ווצאפ</h3>
                        <p className="text-sm text-slate-500 text-center mb-6">
                            הגדרות ➜ מכשירים מקושרים ➜ קשר מכשיר — וסרוק את הקוד
                        </p>

                        {/* Loading */}
                        {loadingQR && (
                            <div className="flex flex-col items-center gap-3 py-10">
                                <Loader2 size={40} className="animate-spin text-emerald-500" />
                                <p className="text-sm text-slate-500">מייצר קוד QR...</p>
                            </div>
                        )}

                        {/* Error */}
                        {!loadingQR && error && (
                            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 w-full mb-4">
                                <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-500" />
                                <span>{error}</span>
                            </div>
                        )}

                        {/* QR Code */}
                        {!loadingQR && qrCode && (
                            <>
                                <div className="relative w-full flex justify-center mb-1">
                                    {/* animated top border */}
                                    <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500 rounded-full animate-pulse" />
                                    <div className="bg-white p-3 rounded-2xl shadow border border-slate-100">
                                        <img
                                            src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                                            alt="WhatsApp QR Code"
                                            className="w-[220px] h-[220px] object-contain"
                                        />
                                    </div>
                                </div>

                                {/* Polling hint */}
                                <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
                                    <Loader2 size={12} className="animate-spin text-emerald-500" />
                                    ממתין לסריקה — מתעדכן אוטומטית...
                                </div>
                            </>
                        )}

                        {/* Actions */}
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
