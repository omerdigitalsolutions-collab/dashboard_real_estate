import React, { useState, useEffect } from 'react';
import { RecaptchaVerifier, linkWithPhoneNumber, ConfirmationResult } from 'firebase/auth';
import { auth } from '../../config/firebase';
import { Loader2, Phone, XCircle, CheckCircle2 } from 'lucide-react';

interface VerifyPhoneModalProps {
    phone: string;
    isOpen: boolean;
    onVerified: () => void;
    onCancel: () => void;
}

export default function VerifyPhoneModal({ phone, isOpen, onVerified, onCancel }: VerifyPhoneModalProps) {
    const [step, setStep] = useState<'send' | 'verify'>('send');
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

    // Provide a stable div ID for reCAPTCHA
    const recaptchaContainerId = 'recaptcha-container';

    useEffect(() => {
        if (!isOpen) {
            setStep('send');
            setCode('');
            setError('');
            setConfirmationResult(null);
            setIsLoading(false);

            // Cleanup reCAPTCHA when modal closes
            if ((window as any).recaptchaVerifier) {
                (window as any).recaptchaVerifier.clear();
                (window as any).recaptchaVerifier = undefined;
            }
        }
    }, [isOpen]);

    const sendSms = async () => {
        if (!auth.currentUser) {
            setError('שגיאה: משתמש לא מחובר.');
            return;
        }

        setIsLoading(true);
        setError('');
        try {
            if (!(window as any).recaptchaVerifier) {
                (window as any).recaptchaVerifier = new RecaptchaVerifier(auth, recaptchaContainerId, {
                    size: 'invisible' // Use invisible recaptcha normally
                });
            }

            const result = await linkWithPhoneNumber(auth.currentUser, phone, (window as any).recaptchaVerifier);
            setConfirmationResult(result);
            setStep('verify');
        } catch (err: any) {
            console.error('Error sending SMS:', err);
            // Translate common Firebase Phone Auth errors
            if (err.code === 'auth/invalid-phone-number') {
                setError('מספר הטלפון לא תקין או שהקידומת שגויה.');
            } else if (err.code === 'auth/credential-already-in-use') {
                setError('מספר הטלפון הזה כבר מקושר לחשבון אחר במערכת.');
            } else if (err.code === 'auth/too-many-requests') {
                setError('יותר מדי ניסיונות. אנא נסה שוב מאוחר יותר.');
            } else {
                setError('שגיאה בשליחת קוד אימות. ודא שהרשאת SMS מופעלת במסוף ה-Firebase.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const verifyCode = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!confirmationResult || code.length !== 6) return;

        setIsLoading(true);
        setError('');

        try {
            await confirmationResult.confirm(code);
            // Ensure the local token is refreshed to pick up the confirmed phone
            if (auth.currentUser) {
                await auth.currentUser.getIdToken(true);
            }
            onVerified();
        } catch (err: any) {
            console.error('Error verifying code:', err);
            if (err.code === 'auth/invalid-verification-code') {
                setError('הקוד שהוזן שגוי.');
            } else if (err.code === 'auth/code-expired') {
                setError('הקוד פג תוקף, אנא בקש קוד חדש.');
            } else {
                setError('שגיאה באימות הקוד.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Auto-send SMS when modal opens (if we haven't already)
    useEffect(() => {
        if (isOpen && step === 'send' && !isLoading && phone) {
            sendSms();
        }
    }, [isOpen, step, phone]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto" dir="rtl">
            <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <Phone size={22} className="text-blue-600" />
                        אימות מספר נייד
                    </h3>
                    {/* Only allow cancel if we force it, handleCancel should clean up user if needed */}
                    <button
                        onClick={onCancel}
                        className="text-slate-400 hover:text-slate-600 transition-colors p-1"
                    >
                        <XCircle size={24} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    <div className="mb-6 text-center">
                        <p className="text-slate-600 mb-2">
                            כדי לאבטח את חשבונך ולמנוע כפילויות, אנו מזהים סוכנויות לפי מספר טלפון.
                        </p>
                        <p className="text-sm font-semibold text-slate-800" dir="ltr">
                            {phone}
                        </p>
                    </div>

                    {error && (
                        <div className="mb-4 bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100">
                            {error}
                        </div>
                    )}

                    <div id={recaptchaContainerId} className="flex justify-center mb-4"></div>

                    {step === 'send' ? (
                        <div className="flex flex-col items-center justify-center p-4">
                            {isLoading ? (
                                <div className="flex flex-col items-center text-blue-600">
                                    <Loader2 size={32} className="animate-spin mb-3" />
                                    <p className="text-sm font-medium">שולח קוד SMS...</p>
                                </div>
                            ) : (
                                <button
                                    onClick={sendSms}
                                    className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors"
                                >
                                    נסה שוב
                                </button>
                            )}
                        </div>
                    ) : (
                        <form onSubmit={verifyCode} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    הכנס את הקוד בן 6 ספרות שנשלח לנייד שלך:
                                </label>
                                <input
                                    type="text"
                                    maxLength={6}
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
                                    className="w-full text-center text-3xl tracking-[1em] font-bold p-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:ring-0 transition-colors"
                                    placeholder="------"
                                    dir="ltr"
                                    autoFocus
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading || code.length !== 6}
                                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl disabled:opacity-50 transition-colors flex justify-center items-center gap-2"
                            >
                                {isLoading ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} />}
                                אימות וסיום
                            </button>

                            <div className="text-center mt-4">
                                <button
                                    type="button"
                                    onClick={sendSms}
                                    disabled={isLoading}
                                    className="text-sm text-blue-600 font-medium hover:underline disabled:opacity-50"
                                >
                                    לא קיבלת קוד? שלח שוב
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
