import React, { useState, useEffect } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { Smartphone, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export const WhatsAppSettings = () => {
    const { userData } = useAuth();
    const [idInstance, setIdInstance] = useState('');
    const [apiToken, setApiToken] = useState('');

    const [qrCodeData, setQrCodeData] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const [status, setStatus] = useState<'disconnected' | 'pending' | 'connected'>('disconnected');

    // האזנה בזמן אמת למסמך הסוכנות כדי לדעת אם הווטסאפ התחבר
    useEffect(() => {
        if (!userData?.agencyId) return;

        const unsub = onSnapshot(doc(db, 'agencies', userData.agencyId), (docSnap) => {
            if (docSnap.exists()) {
                const waData = docSnap.data().whatsappIntegration;
                if (waData) {
                    setStatus(waData.status || 'disconnected');
                    if (waData.idInstance) setIdInstance(waData.idInstance);
                    if (waData.apiTokenInstance) setApiToken(waData.apiTokenInstance);
                }
            }
        });

        return () => unsub();
    }, [userData?.agencyId]);

    const handleGenerateQR = async () => {
        if (!idInstance || !apiToken) {
            setError('יש להזין idInstance ו- apiTokenInstance מלוח הבקרה של Green API');
            return;
        }

        if (!userData?.agencyId) return;

        setLoading(true);
        setError('');
        setQrCodeData(null);

        try {
            const functions = getFunctions();
            const getWhatsAppQrCode = httpsCallable(functions, 'getWhatsAppQrCode');

            const result = await getWhatsAppQrCode({
                idInstance: idInstance.trim(),
                apiTokenInstance: apiToken.trim(),
                agencyId: userData.agencyId
            });

            const data = result.data as { qrCode: string };
            if (data.qrCode) {
                setQrCodeData(data.qrCode);
            }
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'שגיאה ביצירת קוד QR. בדוק שהמפתחות שהזנת נכונים.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100" dir="rtl">
            <div className="flex items-center gap-3 mb-6">
                <div className="bg-green-100 p-3 rounded-full text-green-600">
                    <Smartphone size={24} />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-gray-800">חיבור לווטסאפ (Green API)</h2>
                    <p className="text-sm text-gray-500">חבר את מספר הווטסאפ של המשרד לקבלת הודעות ישירות לכרטיסי הלידים.</p>
                </div>
            </div>

            {status === 'connected' ? (
                <div className="bg-green-50 border border-green-200 p-5 rounded-lg flex items-start gap-4 text-green-800">
                    <CheckCircle size={24} className="mt-0.5 shrink-0" />
                    <div>
                        <strong className="block text-lg mb-1">הווטסאפ מחובר ופעיל!</strong>
                        <p className="text-sm text-green-700">
                            המערכת מקבלת הודעות מהלקוחות ומנתבת אותן ללידים הרלוונטיים באופן אוטומטי.
                            המזהה שלך: <span className="font-mono bg-white px-2 py-0.5 rounded text-xs ml-1">{idInstance}</span>
                        </p>
                    </div>
                </div>
            ) : (
                <div className="space-y-4 max-w-md">
                    {error && (
                        <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-lg flex items-center gap-2 text-sm">
                            <AlertCircle size={18} className="shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">מזהה Instance (idInstance)</label>
                        <input
                            type="text"
                            value={idInstance}
                            onChange={(e) => setIdInstance(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-green-500 outline-none transition"
                            placeholder="לדוגמה: 1101812345"
                            dir="ltr"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">טוקן API (apiTokenInstance)</label>
                        <input
                            type="text"
                            value={apiToken}
                            onChange={(e) => setApiToken(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-green-500 outline-none transition"
                            placeholder="הזן את הטוקן..."
                            dir="ltr"
                        />
                    </div>

                    <button
                        onClick={handleGenerateQR}
                        disabled={loading || !idInstance || !apiToken}
                        className="w-full bg-green-600 text-white font-medium py-2.5 rounded-lg hover:bg-green-700 transition disabled:bg-gray-400 flex justify-center items-center gap-2 mt-4"
                    >
                        {loading ? <Loader2 size={18} className="animate-spin" /> : 'הפק קוד QR לסריקה'}
                    </button>

                    {qrCodeData && (
                        <div className="mt-8 flex flex-col items-center justify-center p-8 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-1 bg-green-500 animate-pulse"></div>
                            <p className="text-center font-medium mb-5 text-gray-800">סרוק את הברקוד עם מכשיר הווטסאפ שלך:</p>
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                                <QRCodeCanvas value={qrCodeData} size={220} level="H" />
                            </div>
                            <p className="text-sm text-gray-500 mt-5 text-center max-w-xs">
                                פתח את ווטסאפ במכשיר ➡️ מכשירים מקושרים ➡️ קישור מכשיר, וסרוק את הקוד.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
