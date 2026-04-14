import React from 'react';

interface PrioritySelectorProps {
    label: string;
    value: number;
    onChange: (v: number) => void;
    theme?: 'light' | 'dark';
}

/**
 * A specialized selector for setting the priority/weight of lead matching criteria.
 * Supports 5 levels of importance mapped to numeric weights used by the matching engine.
 */
export const PrioritySelector = ({ label, value, onChange, theme = 'light' }: PrioritySelectorProps) => {
    const levels = [
        { val: 1, label: 'לא חשוב' },
        { val: 3, label: 'חשוב מעט' },
        { val: 5, label: 'בינוני' },
        { val: 8, label: 'חשוב מאוד' },
        { val: 10, label: 'לא מתפשר' }
    ];

    const isDark = theme === 'dark';

    return (
        <div className="space-y-1.5 w-full">
            <label className={`block text-[10px] font-black uppercase tracking-widest mb-1.5 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                {label}
            </label>
            <div className={`flex p-1 rounded-xl gap-1 transition-all ${
                isDark 
                ? 'bg-slate-800/40 border border-slate-800 shadow-inner' 
                : 'bg-slate-100 border border-slate-200 shadow-sm'
            }`}>
                {levels.map(l => (
                    <button
                        key={l.val}
                        type="button"
                        onClick={() => onChange(l.val)}
                        className={`flex-1 py-1.5 text-[10px] font-black rounded-lg transition-all ${
                            value === l.val 
                            ? (isDark ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-blue-600 shadow-md transform scale-[1.02]') 
                            : (isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600 hover:bg-white/50')
                        }`}
                    >
                        {l.label}
                    </button>
                ))}
            </div>
        </div>
    );
};
