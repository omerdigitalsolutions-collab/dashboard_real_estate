import React, { useState, useMemo } from 'react';
import { Check, ShieldAlert, Sparkles, Plus } from 'lucide-react';

interface AddOn {
  id: string;
  name: string;
  price: number;
  description: string;
}

const INITIAL_ADDONS: AddOn[] = [
  { id: 'wa_bot',        name: 'בוט WhatsApp AI ומענה אוטומטי',            price: 229, description: 'מענה חכם ומבוסס בינה מלאכותית ללידים 24/7' },
  { id: 'digital_sign',  name: 'חתימות וחוזה דיגיטלי',                     price: 99,  description: 'החתמת לקוחות מרחוק על הסכמי תיווך כחוק' },
  { id: 'wa_marketing',  name: 'שיווק בוואטסאפ (Broadcast)',                price: 149, description: 'שליחת דיוור המוני והודעות תפוצה ישירות מהמערכת' },
  { id: 'db_import',     name: 'גישה למאגר וייבוא יומי של נכסים ומוכרים', price: 300, description: 'סנכרון אוטומטי מול יד2/מדלן ישירות ל-CRM' },
  { id: 'match_landing', name: 'התאמה אוטומטית + דף נחיתה להפצה',          price: 200, description: 'התאמת נכס ללקוח ושליחת קטלוג מעוצב בלחיצת כפתור' },
  { id: 'pnl_management',name: 'ניהול רווח והפסד',                         price: 149, description: 'מעקב פיננסי מלא, עמלות, הוצאות והכנסות המשרד' },
  { id: 'call_summary',  name: 'סיכום והקלטת שיחות + הקמה במערכת',         price: 349, description: 'תיעוד אוטומטי של שיחות לקוח ותמלול מבוסס AI' },
];

const BASE_PLAN_PRICE = 249;
const PREMIUM_PLAN_PRICE = 499;

export const CustomPlanBuilder: React.FC = () => {
  const [addOns, setAddOns] = useState<AddOn[]>(INITIAL_ADDONS);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [newFeatureName, setNewFeatureName] = useState('');
  const [newFeaturePrice, setNewFeaturePrice] = useState('');

  const toggleAddOn = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleAddCustomFeature = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newFeatureName.trim();
    if (!name) return;
    const price = parseFloat(newFeaturePrice);
    if (isNaN(price) || price <= 0) return;
    if (addOns.some(a => a.name === name)) return;

    const newId = `custom_${Date.now()}`;
    setAddOns(prev => [...prev, { id: newId, name, price, description: 'פיצ׳ר מותאם אישית' }]);
    setSelectedIds(prev => [...prev, newId]);
    setNewFeatureName('');
    setNewFeaturePrice('');
  };

  const addOnsTotal = useMemo(
    () => addOns.filter(a => selectedIds.includes(a.id)).reduce((sum, a) => sum + a.price, 0),
    [addOns, selectedIds]
  );

  const currentTotal = BASE_PLAN_PRICE + addOnsTotal;
  const potentialSavings = currentTotal - PREMIUM_PLAN_PRICE;
  const isPremiumCheaper = currentTotal > PREMIUM_PLAN_PRICE;

  return (
    <div dir="rtl" className="w-full max-w-5xl mx-auto p-6 bg-slate-950 text-slate-100 rounded-3xl border border-slate-800 shadow-2xl">
      <div className="text-center mb-8">
        <h3 className="text-2xl font-bold text-white mb-2">הרכב את המסלול שלך (Add-ons)</h3>
        <p className="text-slate-400 text-sm">בחר את התוספות הדרושות למשרד שלך וראה את המחיר המצטבר</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Add-on list + custom feature form */}
        <div className="md:col-span-2 space-y-3 max-h-[520px] overflow-y-auto pl-2">
          {addOns.map(addon => {
            const isSelected = selectedIds.includes(addon.id);
            return (
              <div
                key={addon.id}
                onClick={() => toggleAddOn(addon.id)}
                className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-4 ${
                  isSelected
                    ? 'bg-cyan-950/40 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded flex items-center justify-center border shrink-0 ${
                    isSelected ? 'bg-cyan-500 border-cyan-500 text-slate-950' : 'border-slate-600'
                  }`}>
                    {isSelected && <Check size={14} strokeWidth={3} />}
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-white">{addon.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{addon.description}</p>
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <span className="font-bold text-cyan-400">₪{addon.price}</span>
                  <span className="text-xs text-slate-500 block">/חודש</span>
                </div>
              </div>
            );
          })}

          {/* Custom feature form */}
          <form
            onSubmit={handleAddCustomFeature}
            className="p-4 bg-slate-900/60 rounded-xl border border-dashed border-slate-700 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end mt-4"
          >
            <div className="sm:col-span-1">
              <label className="block text-xs text-slate-400 mb-1">שם הפיצ׳ר המותאם</label>
              <input
                type="text"
                value={newFeatureName}
                onChange={e => setNewFeatureName(e.target.value)}
                placeholder="לדוגמה: חיבור ל-API חיצוני"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:border-cyan-500 outline-none text-white placeholder-slate-600"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">מחיר חודשי (₪)</label>
              <input
                type="number"
                min="1"
                value={newFeaturePrice}
                onChange={e => setNewFeaturePrice(e.target.value)}
                placeholder="149"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:border-cyan-500 outline-none text-white placeholder-slate-600"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-slate-800 hover:bg-slate-700 text-white font-semibold py-1.5 px-3 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <Plus size={14} /> הוסף לרשימה
            </button>
          </form>
        </div>

        {/* Summary sidebar */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 flex flex-col justify-between h-fit sticky top-6">
          <div>
            <h4 className="font-bold text-white mb-4 border-b border-slate-800 pb-2">סיכום מסלול מורכב</h4>
            <div className="space-y-2.5 text-sm text-slate-400">
              <div className="flex justify-between">
                <span>מסלול בסיס:</span>
                <span className="text-white font-medium">₪{BASE_PLAN_PRICE}</span>
              </div>
              <div className="flex justify-between">
                <span>תוספות שנבחרו ({selectedIds.length}):</span>
                <span className="text-white font-medium">₪{addOnsTotal}</span>
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-800 text-center">
              <p className="text-xs text-slate-400">סה״כ לתשלום חודשי:</p>
              <p className="text-4xl font-black text-white mt-1">₪{currentTotal}</p>
            </div>
          </div>

          {/* Upsell trigger */}
          <div className="mt-6">
            {isPremiumCheaper ? (
              <div className="p-4 bg-amber-950/40 border border-amber-500/50 rounded-xl space-y-3 animate-pulse">
                <div className="flex items-start gap-2 text-amber-400">
                  <ShieldAlert size={18} className="shrink-0 mt-0.5" />
                  <p className="text-xs font-bold leading-tight">עצור! חבילת הפרימיום משתלמת לך הרבה יותר</p>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  במקום לשלם <span className="font-bold text-white">₪{currentTotal}</span> על חבילה מורכבת, חבילת הפרימיום המלאה מעניקה לך את כל היכולות ב-<span className="font-bold text-white">₪{PREMIUM_PLAN_PRICE} בלבד</span>.
                </p>
                <div className="text-xs font-black text-amber-400 bg-amber-900/40 py-1.5 px-2 rounded text-center tracking-wide">
                  חיסכון של ₪{potentialSavings} בכל חודש!
                </div>
                <button className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-black py-2.5 px-4 rounded-xl text-xs transition-all shadow-lg shadow-orange-500/20">
                  שדרג לפרימיום ב-₪499 →
                </button>
              </div>
            ) : (
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-center space-y-2">
                <div className="flex justify-center text-cyan-400">
                  <Sparkles size={18} />
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">הוסף פיצ׳רים מהרשימה כדי לבנות את המערכת המושלמת עבורך ולראות את עלות הבנייה העצמית.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
