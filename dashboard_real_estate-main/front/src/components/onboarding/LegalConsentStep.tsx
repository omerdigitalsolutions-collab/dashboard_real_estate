import React, { useState } from 'react';
import { ShieldCheck, Info, Loader2 } from 'lucide-react';

interface LegalConsentStepProps {
  onConsentComplete: (consentData: { acceptedAt: string; version: string }) => void;
  isLoading: boolean;
}

const LegalConsentStep: React.FC<LegalConsentStepProps> = ({ onConsentComplete, isLoading }) => {
  const [isAccepted, setIsAccepted] = useState(false);

  const handleComplete = () => {
    if (isAccepted) {
      onConsentComplete({
        acceptedAt: new Date().toISOString(),
        version: '1.0.0',
      });
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-2 duration-300">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">תנאי שימוש והסכם התקשרות</h2>
          <p className="text-slate-500 text-xs mt-1">שלב אחרון לפני שמתחילים לעבוד</p>
        </div>
        {/* Antigravity Badge */}
        <div className="flex items-center gap-2 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100 shadow-sm">
          <ShieldCheck className="text-indigo-600" size={16} />
          <span className="text-[10px] font-bold text-indigo-700 tracking-tight uppercase">Antigravity - AI Verified</span>
        </div>
      </div>

      {/* Contract Textbox */}
      <div className="relative border border-slate-200 rounded-2xl bg-slate-50 h-72 overflow-y-auto p-5 text-sm text-slate-600 leading-relaxed custom-scrollbar shadow-inner">
        <div className="space-y-4" dir="rtl">
          <h3 className="font-bold text-slate-800 text-base"># תנאי שימוש והתקשרות – מערכת hOMER CRM</h3>
          <p>
            ברוכים הבאים למערכת hOMER (להלן: "<b>המערכת</b>" או "<b>השירות</b>"), המפותחת, מנוהלת ומופעלת על ידי עומר פתרונות דיגיטליים (להלן: "<b>החברה</b>" או "<b>אנחנו</b>").
          </p>
          <p>
            תנאי שימוש אלו (להלן: "<b>ההסכם</b>") מהווים חוזה משפטי מחייב בינך, בין אם כמשתמש פרטי, סוכן או כמורשה מטעם סוכנות תיווך (להלן: "<b>הלקוח</b>" או "<b>המשתמש</b>"), לבין החברה. בעצם ההרשמה למערכת, ההתחברות אליה או השימוש בה, הנך מצהיר כי קראת, הבנת והסכמת לכל התנאים המפורטים להלן.
          </p>

          <h4 className="font-bold text-slate-800">1. מהות השירות ורישיון השימוש</h4>
          <p>
            1.1 המערכת מספקת פלטפורמה אינטרנטית בתצורת תוכנה כשירות (SaaS) לניהול סוכנויות תיווך, ניהול לידים, נכסים וסוכנים.
          </p>
          <p>
            1.2 החברה מעניקה ללקוח רישיון שימוש מוגבל, אישי, לא-בלעדי, שאינו ניתן להעברה ושאינו ניתן להענקת רישיונות-משנה, לשימוש במערכת למטרותיו העסקיות והחוקיות בלבד.
          </p>

          <h4 className="font-bold text-slate-800">2. הגבלות שימוש (איסור חיקוי, העתקה ושימוש לרעה)</h4>
          <p>
            הלקוח מתחייב להשתמש במערכת בהתאם לחוק ובתום לב. חל איסור מוחלט על הלקוח או מי מטעמו לבצע, במישרין או בעקיפין, את הפעולות הבאות: העתקה, חיקוי, או יצירת יצירות נגזרות של המערכת, קוד המקור, או ממשק המשתמש.
          </p>
          <p>
            חל איסור על הנדסה חוזרת (Reverse Engineering), פירוק (Decompilation) או ניסיון לחשוף את קוד המקור של המערכת. כל ניסיון לעקוף את מנגנוני האבטחה של המערכת יהווה הפרה יסודית של ההסכם ויגרור נקיטת הליכים משפטיים.
          </p>

          <h4 className="font-bold text-slate-800">3. קניין רוחני</h4>
          <p>
            כל זכויות הקניין הרוחני במערכת, לרבות עיצוב, קוד מקור, סימני מסחר, לוגואים וטכנולוגיה, שייכים באופן בלעדי לחברה. אין בשימוש במערכת כדי להעניק ללקוח זכות כלשהי מעבר לרישיון השימוש המוגדר לעיל.
          </p>

          <h4 className="font-bold text-slate-800">4. סודיות והגנת נתונים</h4>
          <p>
            החברה מתחייבת לשמור על סודיות המידע של הלקוח בהתאם למדיניות הפרטיות. הלקוח אחראי על אבטחת פרטי הגישה לחשבונו ועל כל פעילות המתבצעת תחת החשבון.
          </p>

          <h4 className="font-bold text-slate-800">5. אחריות ושיפוי</h4>
          <p>
            השירות ניתן כפי שהוא (AS IS). החברה לא תישא באחריות לכל נזק ישיר או עקיף שייגרם כתוצאה מהשימוש במערכת או מאי-יכולת להשתמש בה.
          </p>
        </div>
      </div>

      {/* Consent Area */}
      <div className="flex flex-col gap-4 bg-blue-50/50 p-5 rounded-2xl border border-blue-100 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="pt-1.5 cursor-help group relative">
            <Info size={18} className="text-blue-500" />
            {/* Tooltip */}
            <div className="absolute bottom-full right-0 mb-3 w-64 bg-slate-800 text-white text-[11px] p-3 rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none z-50 leading-relaxed border border-white/10 backdrop-blur-sm">
              על מנת להגן על המערכת מפני חיקוי ושימוש לא ראוי, חובה לאשר את ההסכם לפני ההרשמה.
              <div className="absolute top-full right-4 w-2 h-2 bg-slate-800 transform rotate-45 -mt-1" />
            </div>
          </div>
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input 
              type="checkbox" 
              className="mt-1 w-5 h-5 rounded-lg border-slate-300 text-blue-600 focus:ring-blue-500/20 transition-all cursor-pointer shadow-sm"
              checked={isAccepted}
              onChange={(e) => setIsAccepted(e.target.checked)}
            />
            <span className="text-slate-700 text-sm font-semibold leading-tight">
              קראתי והבנתי את תנאי השימוש ומדיניות הפרטיות, ואני מסכים להם.
            </span>
          </label>
        </div>
      </div>

      {/* Submit Button */}
      <button 
        onClick={handleComplete}
        disabled={!isAccepted || isLoading}
        className={`
          w-full py-4 rounded-2xl font-bold text-sm transition-all flex justify-center items-center gap-2 shadow-sm
          ${isAccepted 
            ? 'bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98] shadow-blue-200' 
            : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
          }
        `}
      >
        {isLoading ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> מקים את סביבת העבודה...</>
        ) : (
          <>סיום והרשמה למערכת</>
        )}
      </button>
    </div>
  );
};

export default LegalConsentStep;
