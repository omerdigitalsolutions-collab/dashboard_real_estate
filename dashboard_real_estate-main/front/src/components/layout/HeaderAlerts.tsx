import { useState, useEffect, useRef } from 'react';
import { Bell, CheckCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getLiveAlerts, markAlertAsRead } from '../../services/alertService';
import { Alert } from '../../types';

export default function HeaderAlerts() {
    const { userData } = useAuth();
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!userData?.agencyId || !userData?.uid) return;

        // Subscribe to live alerts
        const unsubscribe = getLiveAlerts(
            userData.agencyId,
            userData.uid,
            20, // get last 20
            (liveAlerts) => {
                setAlerts(liveAlerts);
            }
        );

        return () => unsubscribe();
    }, [userData?.agencyId, userData?.uid]);

    // Handle clicking outside to close
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const unreadCount = alerts.filter(a => !a.isRead).length;

    const handleAlertClick = (alert: Alert) => {
        if (!alert.isRead) {
            markAlertAsRead(alert.id).catch(err => console.error('Failed to mark read', err));
        }
        // Optional: Navigate to relevant entity if alert.relatedTo exists
        setIsOpen(false);
    };

    const getTimeAgo = (timestamp?: any) => {
        if (!timestamp) return 'עכשיו';
        const seconds = Math.floor((new Date().getTime() - timestamp.toDate().getTime()) / 1000);
        if (seconds < 60) return 'לפני כמה שניות';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `לפני ${minutes} דק׳`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `לפני ${hours} שעות`;
        return `לפני ${Math.floor(hours / 24)} ימים`;
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
            >
                <Bell size={18} />
                {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white animate-pulse" />
                )}
            </button>

            {isOpen && (
                <div className="absolute left-0 top-11 w-80 bg-white rounded-2xl shadow-xl border border-slate-100 z-20 overflow-hidden flex flex-col max-h-[400px]">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
                        <p className="font-bold text-slate-800 text-sm">התראות המערכת</p>
                        {unreadCount > 0 && (
                            <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">
                                {unreadCount} חדשות
                            </span>
                        )}
                    </div>

                    <div className="overflow-y-auto flex-1 overscroll-contain">
                        {alerts.length === 0 ? (
                            <div className="p-6 text-center text-slate-400">
                                <p className="text-sm">אין התראות כרגע</p>
                            </div>
                        ) : (
                            alerts.map((alert) => (
                                <div
                                    key={alert.id}
                                    onClick={() => handleAlertClick(alert)}
                                    className={`px-4 py-3 flex gap-3 cursor-pointer transition-colors border-b border-slate-50 last:border-0 hover:bg-slate-50 ${!alert.isRead ? 'bg-blue-50/40' : ''}`}
                                >
                                    <div className="mt-1">
                                        {alert.type === 'deal_won' ? (
                                            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                                                <CheckCircle size={14} />
                                            </div>
                                        ) : (
                                            <div className={`w-2 h-2 rounded-full mt-1.5 ml-3 ${!alert.isRead ? 'bg-blue-500' : 'bg-transparent'}`} />
                                        )}
                                    </div>
                                    <div>
                                        {alert.title && <p className="text-sm font-bold text-slate-800">{alert.title}</p>}
                                        <p className="text-xs text-slate-600 mt-0.5 leading-snug">{alert.message}</p>
                                        <p className="text-[10px] text-slate-400 mt-1">{getTimeAgo(alert.createdAt)}</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
