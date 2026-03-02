import { useState } from 'react';

export type TimePeriod = '1m' | '3m' | '6m' | '12m';

export interface PeriodPickerProps {
    value: TimePeriod;
    onChange: (period: TimePeriod) => void;
}

const OPTIONS: { label: string; value: TimePeriod }[] = [
    { label: '1M', value: '1m' },
    { label: '3M', value: '3m' },
    { label: '6M', value: '6m' },
    { label: '12M', value: '12m' },
];

export function usePeriod(initial: TimePeriod = '1m') {
    const [period, setPeriod] = useState<TimePeriod>(initial);
    return { period, setPeriod };
}

/** Returns the start date (inclusive) for a given period relative to now. */
export function periodStartDate(period: TimePeriod): Date {
    const now = new Date();
    const months = parseInt(period, 10); // '1m' → 1, '3m' → 3, …
    const d = new Date(now);
    d.setMonth(d.getMonth() - months);
    return d;
}

/** Human-readable period label in Hebrew */
export function periodLabel(period: TimePeriod): string {
    const months: Record<TimePeriod, string> = {
        '1m': 'חודש אחרון',
        '3m': '3 חודשים',
        '6m': '6 חודשים',
        '12m': 'שנה אחרונה',
    };
    return months[period];
}

export default function PeriodPicker({ value, onChange }: PeriodPickerProps) {
    return (
        <div className="flex items-center gap-0.5 bg-slate-900/60 border border-slate-700/50 rounded-lg p-0.5">
            {OPTIONS.map(opt => (
                <button
                    key={opt.value}
                    onClick={() => onChange(opt.value)}
                    className={`px-2 py-0.5 text-xs font-semibold rounded-[5px] transition-all duration-200 ${value === opt.value
                            ? 'bg-cyan-500 text-slate-900 shadow-[0_0_8px_rgba(6,182,212,0.4)]'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
}
