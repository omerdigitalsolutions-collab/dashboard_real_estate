import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';
import { auth } from '../config/firebase';
import { CheckCircle2, XCircle, Lock, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function ResetPassword() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const oobCode = searchParams.get('oobCode');

    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isValidatingCode, setIsValidatingCode] = useState(true);
    const [emailOfAccount, setEmailOfAccount] = useState<string | null>(null);

    useEffect(() => {
        if (!oobCode) {
            setError('קישור איפוס הסיסמה חסר או לא תקין.');
            setIsValidatingCode(false);
            return;
        }

        const validateCode = async () => {
            try {
                const email = await verifyPasswordResetCode(auth, oobCode);
                setEmailOfAccount(email);
            } catch (err: any) {
                console.error('Error verifying reset code:', err);
                setError('פג תוקפו של הקישור או שהוא כבר נוצל. אנא בקש קישור חדש.');
            } finally {
                setIsValidatingCode(false);
            }
        };

        validateCode();
    }, [oobCode]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (newPassword !== confirmPassword) {
            setError('הסיסמאות אינן תואמות.');
            return;
        }

        if (newPassword.length < 6) {
            setError('הסיסמה חייבת לכלול לפחות 6 תווים.');
            return;
        }

        if (!oobCode) return;

        setError(null);
        setIsLoading(true);

        try {
            await confirmPasswordReset(auth, oobCode, newPassword);
            setSuccess(true);
            toast.success('הסיסמה שונתה בהצלחה!');
        } catch (err: any) {
            console.error('Error confirming password reset:', err);
            setError('אירעה שגיאה בעת איפוס הסיסמה. נסה שוב.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#020b18] flex items-center justify-center p-4 relative overflow-hidden" dir="rtl">
            {/* Background elements */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-[#00e5ff]/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2"></div>
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-600/10 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/2"></div>

            <div className="w-full max-w-md relative z-10">
                <div className="text-center mb-8">
                    <img src="/homer-logo.png" alt="Homer CRM" className="h-16 mx-auto mb-6 drop-shadow-lg" />
                    <h2 className="text-3xl font-black text-white tracking-tight">איפוס סיסמה</h2>
                </div>

                <div className="bg-[#0a192f]/80 backdrop-blur-md border border-[#00e5ff]/30 shadow-[0_0_20px_rgba(0,229,255,0.05)] rounded-2xl p-8">

                    {isValidatingCode ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
                            <Loader2 className="w-12 h-12 text-[#00e5ff] animate-spin" />
                            <p className="text-slate-300 font-medium text-lg">מאמת את הקישור שלך...</p>
                        </div>
                    ) : success ? (
                        <div className="flex flex-col items-center text-center space-y-6">
                            <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center border-2 border-emerald-500/50">
                                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                            </div>
                            <div>
                                <h3 className="text-2xl font-bold text-white mb-2">הסיסמה שונתה בהצלחה!</h3>
                                <p className="text-slate-400">כעת תוכלו להתחבר למערכת עם הסיסמה החדשה.</p>
                            </div>
                            <button
                                onClick={() => navigate('/login')}
                                className="w-full bg-[#00e5ff] hover:bg-[#00cce6] text-[#020b18] font-black py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(0,229,255,0.4)] hover:shadow-[0_0_30px_rgba(0,229,255,0.6)]"
                            >
                                חזור להתחברות
                            </button>
                        </div>
                    ) : error && !emailOfAccount ? (
                        <div className="flex flex-col items-center text-center space-y-6">
                            <div className="w-20 h-20 bg-rose-500/20 rounded-full flex items-center justify-center border-2 border-rose-500/50">
                                <XCircle className="w-10 h-10 text-rose-400" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-white mb-2">קישור לא תקין</h3>
                                <p className="text-rose-400 font-medium">{error}</p>
                            </div>
                            <button
                                onClick={() => navigate('/login')}
                                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 rounded-xl transition-all border border-slate-700"
                            >
                                חזור להתחברות
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {emailOfAccount && (
                                <div className="bg-blue-900/30 border border-blue-500/30 rounded-xl p-4 text-center">
                                    <p className="text-slate-400 text-sm mb-1">מאפס סיסמה עבור:</p>
                                    <p className="text-white font-bold">{emailOfAccount}</p>
                                </div>
                            )}

                            {error && (
                                <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex items-start gap-3">
                                    <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                                    <p className="text-rose-400 text-sm font-medium">{error}</p>
                                </div>
                            )}

                            <div>
                                <label className="block text-slate-300 font-medium mb-2 pr-1">סיסמה חדשה</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                                        <Lock className="h-5 w-5 text-slate-500" />
                                    </div>
                                    <input
                                        type="password"
                                        required
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="w-full bg-slate-900/50 border border-slate-700 text-white rounded-xl py-3.5 pr-12 pl-4 focus:ring-2 focus:ring-[#00e5ff]/50 focus:border-[#00e5ff] transition-all"
                                        placeholder="הזן סיסמה חדשה (6 תווים לפחות)"
                                        dir="ltr"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-slate-300 font-medium mb-2 pr-1">אימות סיסמה חדשה</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                                        <Lock className="h-5 w-5 text-slate-500" />
                                    </div>
                                    <input
                                        type="password"
                                        required
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="w-full bg-slate-900/50 border border-slate-700 text-white rounded-xl py-3.5 pr-12 pl-4 focus:ring-2 focus:ring-[#00e5ff]/50 focus:border-[#00e5ff] transition-all"
                                        placeholder="הזן סיסמה חדשה שוב"
                                        dir="ltr"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full bg-[#00e5ff] hover:bg-[#00cce6] text-[#020b18] font-black py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(0,229,255,0.4)] hover:shadow-[0_0_30px_rgba(0,229,255,0.6)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        שומר...
                                    </>
                                ) : (
                                    'שמור סיסמה חדשה'
                                )}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
