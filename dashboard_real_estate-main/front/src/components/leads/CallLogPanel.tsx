import React, { useState, useEffect } from 'react';
import { Phone, PhoneOff, Play, ChevronDown, ChevronUp, Loader2, Clock } from 'lucide-react';
import { CallLog } from '../../types';
import { getCallLogsForLead, getRecordingDownloadUrl } from '../../services/callLogService';

function formatDuration(seconds: number | null): string {
    if (!seconds) return '—';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDateTime(ts: any): string {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function CallEntry({ log }: { log: CallLog }) {
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [loadingAudio, setLoadingAudio] = useState(false);
    const [showTranscription, setShowTranscription] = useState(false);
    const isMissed = log.status === 'missed' || log.status === 'failed' || log.status === 'busy';

    const handlePlay = async () => {
        if (audioUrl) return;
        if (!log.storagePath) return;
        setLoadingAudio(true);
        try {
            const url = await getRecordingDownloadUrl(log.storagePath);
            setAudioUrl(url);
        } catch {
            // Storage file may have been deleted (>30 days)
            setAudioUrl('expired');
        } finally {
            setLoadingAudio(false);
        }
    };

    return (
        <div className={`rounded-xl border p-3 mb-2 ${isMissed ? 'border-red-500/20 bg-red-500/5' : 'border-slate-700/50 bg-slate-800/40'}`}>
            {/* Header row */}
            <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                    {isMissed
                        ? <PhoneOff size={14} className="text-red-400 flex-shrink-0" />
                        : <Phone size={14} className="text-emerald-400 flex-shrink-0" />
                    }
                    <span className={`text-xs font-black ${isMissed ? 'text-red-400' : 'text-emerald-400'}`}>
                        {isMissed ? 'לא נענתה' : 'נענתה'}
                    </span>
                    {log.duration != null && (
                        <span className="flex items-center gap-1 text-[11px] text-slate-400 font-medium">
                            <Clock size={10} />
                            {formatDuration(log.duration)}
                        </span>
                    )}
                </div>
                <span className="text-[11px] text-slate-500 font-medium">{formatDateTime(log.createdAt)}</span>
            </div>

            {/* AI Summary */}
            {log.summary && (
                <p className="text-[12px] text-slate-300 leading-relaxed mb-2 font-medium">
                    {log.summary}
                </p>
            )}

            {/* Audio player — lazy loaded on Play click */}
            {!isMissed && (
                <div className="mb-2">
                    {audioUrl && audioUrl !== 'expired' ? (
                        <audio controls src={audioUrl} className="w-full h-8" style={{ height: 32 }} />
                    ) : audioUrl === 'expired' ? (
                        <p className="text-[11px] text-slate-500 italic">ההקלטה נמחקה (מעל 30 יום) — הסיכום זמין</p>
                    ) : log.storagePath ? (
                        <button
                            onClick={handlePlay}
                            disabled={loadingAudio}
                            className="flex items-center gap-2 text-[12px] font-black text-blue-400 hover:text-blue-300 transition-colors"
                        >
                            {loadingAudio
                                ? <Loader2 size={13} className="animate-spin" />
                                : <Play size={13} />
                            }
                            {loadingAudio ? 'טוען...' : 'נגן הקלטה'}
                        </button>
                    ) : (
                        <p className="text-[11px] text-slate-600 italic">אין הקלטה זמינה</p>
                    )}
                </div>
            )}

            {/* Transcription — collapsible */}
            {log.transcription && (
                <div>
                    <button
                        onClick={() => setShowTranscription((v) => !v)}
                        className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 font-black transition-colors"
                    >
                        {showTranscription ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        {showTranscription ? 'הסתר תמלול' : 'הצג תמלול מלא'}
                    </button>
                    {showTranscription && (
                        <div className="mt-2 p-3 rounded-lg bg-slate-900/60 border border-slate-700/40 text-[11px] text-slate-400 leading-relaxed whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">
                            {log.transcription}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

interface CallLogPanelProps {
    leadId: string;
}

export default function CallLogPanel({ leadId }: CallLogPanelProps) {
    const [logs, setLogs] = useState<CallLog[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        getCallLogsForLead(leadId).then((data) => {
            if (active) {
                setLogs(data);
                setLoading(false);
            }
        });
        return () => { active = false; };
    }, [leadId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-10">
                <Loader2 size={20} className="animate-spin text-slate-500" />
            </div>
        );
    }

    if (logs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-10 text-center text-slate-500">
                <Phone size={32} className="mb-3 opacity-30" />
                <p className="text-sm font-medium">אין שיחות מוקלטות עדיין</p>
                <p className="text-xs text-slate-600 mt-1">שיחות נכנסות למספר הוירטואלי יופיעו כאן</p>
            </div>
        );
    }

    return (
        <div className="p-4 overflow-y-auto">
            <p className="text-[11px] text-slate-500 font-black uppercase tracking-wider mb-3">
                {logs.length} שיח{logs.length === 1 ? 'ה' : 'ות'}
            </p>
            {logs.map((log) => (
                <CallEntry key={log.id} log={log} />
            ))}
        </div>
    );
}
