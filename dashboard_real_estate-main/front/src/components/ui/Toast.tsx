import { useEffect } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';

export interface ToastState {
    show: boolean;
    message: string;
    type: 'success' | 'error';
}

interface ToastProps extends ToastState {
    onClose: () => void;
}

export function Toast({ show, message, type, onClose }: ToastProps) {
    useEffect(() => {
        if (show) {
            const timer = setTimeout(() => {
                onClose();
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [show, onClose]);

    if (!show) return null;

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-5 fade-in duration-300" dir="rtl">
            <div className={`flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-xl border ${type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800 shadow-emerald-500/10'
                    : 'bg-red-50 border-red-200 text-red-800 shadow-red-500/10'
                }`}>
                {type === 'success' ? <CheckCircle size={20} className="text-emerald-600" /> : <XCircle size={20} className="text-red-600" />}
                <span className="font-bold text-sm">{message}</span>
            </div>
        </div>
    );
}
