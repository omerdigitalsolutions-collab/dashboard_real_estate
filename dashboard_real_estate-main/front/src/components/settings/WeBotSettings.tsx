import { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Save,
  Loader2,
  Info,
  Shield,
  MessageSquare,
  SlidersHorizontal,
  AlertCircle,
  CheckCircle2,
  Power,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface WeBotFormData {
  isActive: boolean;
  toneOfVoice: 'professional' | 'friendly_emoji' | 'direct_sales' | 'custom';
  customToneOfVoice: string;
  fallbackPolicy: 'apologize' | 'collect' | 'human_handoff' | 'collect_details' | 'custom';
  customFallbackPolicy: string;
  muteDuration: '1h' | '12h' | '24h';
  guardrails: string;
}

// ─── Tooltip Component ────────────────────────────────────────────────────────
function Tooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setVisible(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative inline-flex items-center" ref={ref}>
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="text-slate-500 hover:text-blue-400 transition-colors focus:outline-none ml-1.5"
        aria-label="מידע נוסף"
      >
        <Info size={14} />
      </button>
      {visible && (
        <div
          dir="rtl"
          className="absolute bottom-full mb-2 right-0 w-64 bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-xl p-3 shadow-xl z-50 leading-relaxed"
        >
          <div className="absolute bottom-[-5px] right-3 w-2.5 h-2.5 bg-slate-800 border-b border-r border-slate-700 rotate-45" />
          {text}
        </div>
      )}
    </div>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────
function SectionCard({
  icon,
  title,
  badge,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-lg transition-all hover:border-slate-700">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800 bg-slate-800/40">
        <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center text-blue-400 shrink-0">
          {icon}
        </div>
        <h2 className="font-semibold text-white text-sm flex-1">{title}</h2>
        {badge && (
          <span className="text-[10px] font-bold uppercase tracking-widest bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2.5 py-0.5 rounded-full">
            {badge}
          </span>
        )}
      </div>
      <div className="p-5 space-y-5">{children}</div>
    </div>
  );
}

// ─── Field Wrapper ────────────────────────────────────────────────────────────
function Field({
  label,
  hint,
  tooltipText,
  children,
}: {
  label: string;
  hint?: string;
  tooltipText?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <label className="text-sm font-medium text-slate-300">{label}</label>
        {tooltipText && <Tooltip text={tooltipText} />}
      </div>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
      {children}
    </div>
  );
}

// ─── Styled Select ────────────────────────────────────────────────────────────
function StyledSelect({
  value,
  onChange,
  children,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full appearance-none bg-slate-800/80 border border-slate-700 text-slate-200 text-sm rounded-xl px-4 py-2.5 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:border-slate-600 cursor-pointer"
      >
        {children}
      </select>
      {/* Dropdown chevron — positioned for RTL */}
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </span>
    </div>
  );
}

// ─── Master Toggle ────────────────────────────────────────────────────────────
function MasterToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex items-center w-14 h-7 rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 ${
        checked
          ? 'bg-emerald-500 focus:ring-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)]'
          : 'bg-slate-700 focus:ring-slate-500'
      }`}
    >
      <span
        className={`absolute w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300 ${
          checked ? 'right-1' : 'left-1'
        }`}
      />
    </button>
  );
}

// ─── Default Form State ───────────────────────────────────────────────────────
import { useAuth } from '../../context/AuthContext';
import { updateWeBotConfig, getAgencyData } from '../../services/agencyService';

const DEFAULT_FORM: WeBotFormData = {
  isActive: true,
  toneOfVoice: 'professional',
  customToneOfVoice: '',
  fallbackPolicy: 'human_handoff',
  customFallbackPolicy: '',
  muteDuration: '1h',
  guardrails: '',
};

// ═══════════════════════════════════════════════════════════════════════════════
//  WeBotSettings Page
// ═══════════════════════════════════════════════════════════════════════════════
export default function WeBotSettings() {
  const { userData } = useAuth();
  const [form, setForm] = useState<WeBotFormData>(DEFAULT_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  // Load backend config
  useEffect(() => {
    if (!userData?.agencyId) return;

    // We subscribe to the agency document to get the latest weBotConfig
    const unsubscribe = getAgencyData(userData.agencyId, (agency) => {
        const savedConfig: any = (agency as any).weBotConfig || {};
        
        setForm(prev => ({
            ...prev,
            isActive: savedConfig.isActive !== false,
            toneOfVoice: savedConfig.tone ?? 'professional',
            customToneOfVoice: savedConfig.customTone ?? '',
            fallbackPolicy: savedConfig.fallbackAction ?? 'human_handoff',
            customFallbackPolicy: savedConfig.customFallbackAction ?? '',
            muteDuration: savedConfig.firewallMuteHours === 1 ? '1h' 
                         : savedConfig.firewallMuteHours === 12 ? '12h' 
                         : '24h',
            guardrails: savedConfig.generalNotes ?? '',
        }));
    });

    return () => unsubscribe();
  }, [userData?.agencyId]);

  // ── Helpers ──────────────────────────────────────────────────────────────
  const update = <K extends keyof WeBotFormData>(key: K, val: WeBotFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    if (!userData?.agencyId) return;
    setIsSaving(true);
    setSavedOk(false);
    try {
        const payload = {
            isActive: form.isActive,
            tone: form.toneOfVoice,
            customTone: form.customToneOfVoice,
            fallbackAction: form.fallbackPolicy,
            customFallbackAction: form.customFallbackPolicy,
            generalNotes: form.guardrails,
            firewallMuteHours: form.muteDuration === '1h' ? 1 : form.muteDuration === '12h' ? 12 : 24,
        };
        await updateWeBotConfig(userData.agencyId, payload);
        setSavedOk(true);
        setTimeout(() => setSavedOk(false), 3000);
    } catch(err) {
        console.error('Failed to save WhatsApp Bot config', err);
    } finally {
        setIsSaving(false);
    }
  };

  // ── Whether controls should be disabled ──────────────────────────────────
  const disabled = !form.isActive;

  // ── Status pill label ─────────────────────────────────────────────────────
  const statusLabel = form.isActive ? 'פעיל' : 'מושבת';

  return (
    <div
      dir="rtl"
      className="max-w-3xl mx-auto w-full px-4 sm:px-6 pb-16 pt-4"
    >
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        {/* Title block */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-900/40 shrink-0 mt-0.5">
            <Bot size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white leading-tight">
              הגדרות WhatsApp Bot — עוזר ה-AI של המשרד
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              הגדירו את סגנון הדיבור וגבולות הגזרה של הבוט שלכם.
            </p>
          </div>
        </div>

        {/* Master Status Toggle */}
        <div className="flex items-center gap-3 bg-slate-900/60 border border-slate-800 rounded-2xl px-4 py-3 shrink-0 self-start sm:self-auto">
          <div className="text-right">
            <p className="text-xs font-semibold text-slate-400 leading-none mb-1">סטטוס הבוט</p>
            <div className="flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  form.isActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                }`}
              />
              <span
                className={`text-sm font-bold ${
                  form.isActive ? 'text-emerald-400' : 'text-slate-500'
                }`}
              >
                {statusLabel}
              </span>
            </div>
          </div>
          <MasterToggle checked={form.isActive} onChange={(v) => update('isActive', v)} />
        </div>
      </div>

      {/* ── Inactive Banner ───────────────────────────────────────────────── */}
      {!form.isActive && (
        <div className="mb-6 flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3.5 text-sm text-amber-300">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>
            הבוט כרגע <strong>מושבת</strong>. הגדרות ניתן לשמור, אך הבוט לא יגיב ללקוחות עד שיופעל מחדש.
          </span>
        </div>
      )}

      {/* ── Form Sections ─────────────────────────────────────────────────── */}
      <div className="space-y-5">

        {/* ── Group A: Personality ─────────────────────────────────── */}
        <SectionCard
          icon={<MessageSquare size={16} />}
          title="אפיון אישיות"
          badge="A"
        >
          <Field
            label="סגנון דיבור וטון"
            hint="כיצד הבוט יתקשר עם הלקוחות בוואטסאפ?"
          >
            <StyledSelect
              value={form.toneOfVoice}
              onChange={(v) => update('toneOfVoice', v as WeBotFormData['toneOfVoice'])}
              disabled={disabled}
            >
              <option value="professional">🎩 מקצועי ורשמי</option>
              <option value="friendly_emoji">😊 קליל, חברי ועם אימוג'ים</option>
              <option value="direct_sales">⚡ קצר, מכירתי ולעניין</option>
              <option value="custom">✏️ טקסט חופשי (התאמה אישית)</option>
            </StyledSelect>
            {form.toneOfVoice === 'custom' && (
              <div className="mt-2">
                <textarea
                  value={form.customToneOfVoice}
                  onChange={(e) => update('customToneOfVoice', e.target.value)}
                  disabled={disabled}
                  rows={2}
                  dir="rtl"
                  placeholder="הקלד כאן את סגנון הדיבור המועדף עליך..."
                  className="w-full resize-none bg-slate-800/80 border border-slate-700 text-slate-200 text-sm rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all placeholder:text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:border-slate-600"
                />
              </div>
            )}
          </Field>

          <Field
            label="מדיניות חוסר ודאות"
            hint="מה יעשה הבוט כאשר הוא לא יודע את התשובה?"
          >
            <StyledSelect
              value={form.fallbackPolicy}
              onChange={(v) => update('fallbackPolicy', v as WeBotFormData['fallbackPolicy'])}
              disabled={disabled}
            >
              <option value="human_handoff">🤝 התנצל והצע שיחה עם סוכן אנושי</option>
              <option value="collect_details">🔍 נסה לאסוף פרטים נוספים מהלקוח</option>
              <option value="custom">✏️ טקסט חופשי (התאמה אישית)</option>
            </StyledSelect>
            {form.fallbackPolicy === 'custom' && (
              <div className="mt-2">
                <textarea
                  value={form.customFallbackPolicy}
                  onChange={(e) => update('customFallbackPolicy', e.target.value)}
                  disabled={disabled}
                  rows={2}
                  dir="rtl"
                  placeholder="הקלד כאן מה הבוט צריך לעשות..."
                  className="w-full resize-none bg-slate-800/80 border border-slate-700 text-slate-200 text-sm rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all placeholder:text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:border-slate-600"
                />
              </div>
            )}
          </Field>
        </SectionCard>

        {/* ── Group B: AI Firewall ──────────────────────────────────── */}
        <SectionCard
          icon={<Shield size={16} />}
          title='מנגנון AI Firewall'
          badge="B"
        >
          <Field
            label="השתקת בוט בעת התערבות סוכן"
            tooltipText="כאשר סוכן שולח הודעה ידנית לוואטסאפ, הבוט יושתק אוטומטית לפרק זמן זה כדי לא להפריע לשיחה."
          >
            <StyledSelect
              value={form.muteDuration}
              onChange={(v) => update('muteDuration', v as WeBotFormData['muteDuration'])}
              disabled={disabled}
            >
              <option value="1h">⏱ לשעה אחת</option>
              <option value="12h">🕛 ל-12 שעות</option>
              <option value="24h">📅 עד 24 שעות</option>
            </StyledSelect>
          </Field>

          {/* Explainer Pill */}
          <div className="flex items-start gap-2.5 bg-blue-500/8 border border-blue-500/20 rounded-xl p-3.5">
            <Info size={14} className="text-blue-400 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-400 leading-relaxed">
              מנגנון ה-Firewall מזהה אוטומטית שהסוכן נכנס לשיחה ומשתיק את הבוט כדי למנוע הודעות כפולות ומתסכלות.
            </p>
          </div>
        </SectionCard>

        {/* ── Group C: Guardrails ───────────────────────────────────── */}
        <SectionCard
          icon={<SlidersHorizontal size={16} />}
          title="גבולות גזרה והנחיות מיוחדות"
          badge="C"
        >
          <Field
            label='מה חשוב שהבוט ידע? (חוקי ברזל של המשרד)'
            hint="הנחיות שיוזנו ישירות ל-system prompt של הבוט. כתבו בשפה פשוטה."
          >
            <textarea
              value={form.guardrails}
              onChange={(e) => update('guardrails', e.target.value)}
              disabled={disabled}
              rows={6}
              dir="rtl"
              placeholder={
                'לדוגמה: אנחנו סגורים בשבתות, לעולם אל תמסור מספר דירה או קומה לפני שהלקוח מגיע למשרד, עמלת התיווך שלנו היא תמיד 2% + מע״מ...'
              }
              className="w-full resize-none bg-slate-800/80 border border-slate-700 text-slate-200 text-sm rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all placeholder:text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:border-slate-600 leading-relaxed"
            />
            <div className="flex justify-between items-center mt-1.5">
              <p className="text-[11px] text-slate-600">
                {form.guardrails.length} / 2000 תווים
              </p>
              {form.guardrails.length > 1800 && (
                <p className="text-[11px] text-amber-400">מתקרבים למגבלת התווים</p>
              )}
            </div>
          </Field>
        </SectionCard>
      </div>

      {/* ── Save Footer ───────────────────────────────────────────────────── */}
      <div className="mt-8 flex flex-col sm:flex-row-reverse items-center justify-between gap-4 pt-6 border-t border-slate-800">
        {/* Primary Save Button */}
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className={`relative inline-flex items-center gap-2.5 font-bold text-sm px-7 py-3 rounded-xl transition-all duration-200 shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0f172a] disabled:opacity-70 disabled:cursor-not-allowed w-full sm:w-auto justify-center ${
            savedOk
              ? 'bg-emerald-500 text-white focus:ring-emerald-500 shadow-emerald-900/40'
              : 'bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white focus:ring-blue-500 shadow-blue-900/40'
          }`}
        >
          {isSaving ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              שומר הגדרות...
            </>
          ) : savedOk ? (
            <>
              <CheckCircle2 size={16} />
              ההגדרות נשמרו!
            </>
          ) : (
            <>
              <Save size={16} />
              שמור הגדרות AI
            </>
          )}
        </button>

        {/* Inactive hint */}
        {!form.isActive && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Power size={12} />
            <span>הפעל את הבוט כדי שהשינויים ייכנסו לתוקף</span>
          </div>
        )}
      </div>
    </div>
  );
}
