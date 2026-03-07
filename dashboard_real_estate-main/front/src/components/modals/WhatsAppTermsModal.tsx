import { useState } from 'react';
import { AlertTriangle, X, Check } from 'lucide-react';

interface WhatsAppTermsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAccept: () => void;
}

export default function WhatsAppTermsModal({ isOpen, onClose, onAccept }: WhatsAppTermsModalProps) {
    const [isAccepted, setIsAccepted] = useState(false);

    if (!isOpen) return null;

    const handleConfirm = () => {
        if (isAccepted) {
            onAccept();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" dir="rtl">
            {/* Modal Container */}
            <div className="relative w-full max-w-2xl bg-[#0a192f] border border-[#00e5ff]/30 rounded-2xl shadow-[0_0_40px_rgba(0,229,255,0.1)] overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/10 bg-[#020b18]/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-500/10 rounded-lg">
                            <AlertTriangle className="w-6 h-6 text-red-400" />
                        </div>
                        <h2 className="text-xl font-bold text-white">תנאי שימוש והצהרת אחריות - חיבור WhatsApp</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white transition-colors p-1 rounded-md hover:bg-white/5"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Scrollable Content Area */}
                <div className="p-6 overflow-y-auto space-y-6 text-slate-300 leading-relaxed">
                    <p className="text-white font-medium">
                        על ידי סריקת הברקוד וחיבור חשבון ה-WhatsApp שלך למערכת hOMER, הנך מאשר/ת ומסכים/ה לתנאים הבאים:
                    </p>

                    <div className="space-y-4">
                        <section>
                            <h3 className="text-[#00e5ff] font-bold text-lg mb-1">1. היעדר אחריות על חסימות (Ban Liability)</h3>
                            <p className="text-sm">
                                מערכת hOMER מספקת תשתית טכנולוגית בלבד. חברת Meta (פייסבוק) מפעילה מדיניות נוקשה נגד שליחת הודעות בתפוצה רחבה או ספאם. האחריות על כמות ההודעות, אופי התוכן, ותדירות השליחה חלה עליך בלבד. hOMER לא תישא בשום אחריות במקרה של השעיה, חסימה זמנית או חסימה לצמיתות של מספר ה-WhatsApp שלך על ידי Meta, ולא יינתן פיצוי בגין נזק עקיף או ישיר שייגרם מכך לעסק.
                            </p>
                        </section>

                        <section>
                            <h3 className="text-[#00e5ff] font-bold text-lg mb-1">2. עמידה בחוק התקשורת (חוק הספאם)</h3>
                            <p className="text-sm">
                                הנך מצהיר/ה כי שליחת הודעות שיווקיות או אוטומטיות דרך המערכת תיעשה אך ורק לנמענים שנתנו את הסכמתם המפורשת לכך (Opt-in), בהתאם להוראות סעיף 30א לחוק התקשורת (בזק ושידורים). כל תביעה מצד צד שלישי בגין קבלת דבר פרסומת תהיה באחריותך הבלעדית, והנך מתחייב/ת לשפות את hOMER בגין כל נזק או הוצאה משפטית שתיגרם לה עקב הפרה זו.
                            </p>
                        </section>

                        <section>
                            <h3 className="text-[#00e5ff] font-bold text-lg mb-1">3. פרטיות ועיבוד נתונים</h3>
                            <p className="text-sm">
                                לצורך תפעול פיצ'ר "לידים ממתינים" (Pending Leads) וסנכרון ההודעות, המערכת סורקת ומעבדת הודעות נכנסות. הנך מאשר/ת ל-hOMER לקרוא, לעבד ולשמור את נתוני ההודעות בהתאם למדיניות הפרטיות של המערכת, והנך מצהיר/ה כי יש לך את הזכות וההרשאה החוקית לאסוף ולעבד נתונים אלו מלקוחותיך.
                            </p>
                        </section>

                        <section>
                            <h3 className="text-[#00e5ff] font-bold text-lg mb-1">4. זמינות ורציפות השירות</h3>
                            <p className="text-sm">
                                חיבור ה-WhatsApp מבוסס על סנכרון רציף למכשיר הטלפון שלך. המערכת אינה מבטיחה זמינות של 100% (Uptime). ניתוקים עשויים להתרחש עקב בעיות אינטרנט, סוללה חלשה במכשיר, או עדכוני תוכנה של WhatsApp. באחריותך לוודא כי המכשיר מחובר וזמין.
                            </p>
                        </section>
                    </div>
                </div>

                {/* Footer with Checkbox & Actions */}
                <div className="p-6 border-t border-white/10 bg-[#020b18]/80">
                    <label className="flex items-start gap-3 cursor-pointer group mb-6">
                        <div className="relative flex items-center justify-center mt-1">
                            <input
                                type="checkbox"
                                className="peer sr-only"
                                checked={isAccepted}
                                onChange={(e) => setIsAccepted(e.target.checked)}
                            />
                            <div className="w-5 h-5 border-2 border-slate-500 rounded bg-transparent peer-checked:bg-[#00e5ff] peer-checked:border-[#00e5ff] transition-all group-hover:border-[#00e5ff]/70"></div>
                            <Check className="absolute w-3.5 h-3.5 text-[#020b18] opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" strokeWidth={3} />
                        </div>
                        <span className="text-white font-medium select-none group-hover:text-[#00e5ff] transition-colors">
                            קראתי, הבנתי, ואני מסכים/ה לכל תנאי השימוש והצהרת האחריות.
                        </span>
                    </label>

                    <div className="flex items-center justify-end gap-4">
                        <button
                            onClick={onClose}
                            className="px-6 py-2.5 rounded-xl text-slate-300 font-medium hover:bg-white/5 transition-colors"
                        >
                            ביטול
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={!isAccepted}
                            className={`px-8 py-2.5 rounded-xl font-bold transition-all duration-300 flex items-center gap-2
                ${isAccepted
                                    ? 'bg-[#00e5ff] text-[#020b18] hover:shadow-[0_0_20px_rgba(0,229,255,0.4)] hover:bg-cyan-400 cursor-pointer'
                                    : 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-50'
                                }`}
                        >
                            המשך לסריקת ברקוד
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}
