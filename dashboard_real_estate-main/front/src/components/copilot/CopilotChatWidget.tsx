import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X, Send, Bot, Loader2, Mic, MicOff } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Message {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    isVoice?: boolean;
}

const INITIAL_MESSAGES: Message[] = [
    {
        id: 'welcome',
        role: 'assistant',
        text: 'שלום! אני hOMER Chat Bot 🏠\nשאל אותי על הסוכנות שלך — ביצועים, לידים, נכסים ועסקאות.',
    },
];

// ── Voice Recording Hook ──────────────────────────────────────────────────────
type RecordingState = 'idle' | 'recording' | 'processing';

function useVoiceRecorder() {
    const [recordingState, setRecordingState] = useState<RecordingState>('idle');
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<BlobPart[]>([]);

    const startRecording = useCallback(async (): Promise<boolean> => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream, { mimeType: getSupportedMimeType() });
            chunksRef.current = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            mediaRecorderRef.current = recorder;
            recorder.start();
            setRecordingState('recording');
            return true;
        } catch {
            return false;
        }
    }, []);

    const stopRecording = useCallback((): Promise<{ base64: string; mimeType: string } | null> => {
        return new Promise((resolve) => {
            const recorder = mediaRecorderRef.current;
            if (!recorder) { resolve(null); return; }

            recorder.onstop = async () => {
                const mimeType = recorder.mimeType || getSupportedMimeType();
                const blob = new Blob(chunksRef.current, { type: mimeType });

                recorder.stream.getTracks().forEach((t) => t.stop());

                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64 = (reader.result as string).replace(/^data:.+;base64,/, '');
                    resolve({ base64, mimeType });
                };
                reader.readAsDataURL(blob);
            };

            recorder.stop();
            setRecordingState('processing');
        });
    }, []);

    const cancelRecording = useCallback(() => {
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state !== 'inactive') {
            recorder.stream.getTracks().forEach((t) => t.stop());
            recorder.stop();
        }
        setRecordingState('idle');
    }, []);

    return { recordingState, setRecordingState, startRecording, stopRecording, cancelRecording };
}

function getSupportedMimeType(): string {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', 'audio/mp4'];
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return 'audio/webm';
}

// ── Typing indicator ────────────────────────────────────────────────────────────
function TypingIndicator() {
    return (
        <div className="flex items-end gap-2 justify-start" dir="rtl">
            <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-md"
                style={{ background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)' }}
            >
                <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="px-4 py-3 rounded-2xl rounded-br-none bg-slate-800/80 border border-slate-700/50 backdrop-blur-sm">
                <div className="flex items-center gap-1.5">
                    {[0, 0.2, 0.4].map((delay, i) => (
                        <span
                            key={i}
                            className="w-2 h-2 rounded-full bg-cyan-400"
                            style={{
                                animation: `bounce 1.2s ease-in-out ${delay}s infinite`,
                            }}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

// ── Main widget ─────────────────────────────────────────────────────────────────
export default function CopilotChatWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
    const [isLoading, setIsLoading] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [error, setError] = useState<string | null>(null);

    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const { recordingState, setRecordingState, startRecording, stopRecording, cancelRecording } = useVoiceRecorder();

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    // Focus input when chat opens
    useEffect(() => {
        if (isOpen && recordingState === 'idle') {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen, recordingState]);

    // ── Handle text sending ──
    const handleSendMessage = useCallback(async () => {
        const prompt = inputValue.trim();
        if (!prompt || isLoading || recordingState !== 'idle') return;

        setError(null);
        setInputValue('');

        const userMsg: Message = {
            id: `u-${Date.now()}`,
            role: 'user',
            text: prompt,
        };

        setMessages(prev => [...prev, userMsg]);
        setIsLoading(true);

        try {
            const homerChatBot = httpsCallable<{ text: string }, { response: string }>(
                functions,
                'ai-homerChatBot'
            );
            const result = await homerChatBot({ text: prompt });

            const assistantMsg: Message = {
                id: `a-${Date.now()}`,
                role: 'assistant',
                text: result.data.response,
            };
            setMessages(prev => [...prev, assistantMsg]);
        } catch (e: any) {
            console.error('[CopilotChatWidget] Error:', e);
            const errText = e?.message?.includes('Super Admin')
                ? 'שגיאת הרשאות — פנה למנהל המערכת.'
                : 'אירעה שגיאה בתקשורת עם הCopilot. נסה שוב.';
            setError(errText);
            setMessages(prev => [
                ...prev,
                { id: `err-${Date.now()}`, role: 'assistant', text: `⚠️ ${errText}` },
            ]);
        } finally {
            setIsLoading(false);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [inputValue, isLoading, recordingState]);

    // ── Handle mic sending ──
    const handleMicClick = async () => {
        if (recordingState === 'recording') {
            // Stop and submit
            const result = await stopRecording();
            if (!result) { setRecordingState('idle'); return; }

            const { base64, mimeType } = result;
            setIsLoading(true);
            setError(null);

            try {
                // For voice recordings, we send to the textToActionAgent function
                const homerChatBot = httpsCallable(
                    functions,
                    'ai-homerChatBot'
                );
                const response = await homerChatBot({ audio: base64, mimeType });
                const data = response.data as any;

                const userText = data.transcribedText || '🎙️ [הודעת קול]';
                const userMsg: Message = {
                    id: `u-${Date.now()}`,
                    role: 'user',
                    text: userText,
                    isVoice: true,
                };
                setMessages((prev) => [...prev, userMsg]);

                const assistantMsg: Message = {
                    id: `a-${Date.now()}`,
                    role: 'assistant',
                    text: data.response || 'הפעולה הושלמה.',
                };
                setMessages((prev) => [...prev, assistantMsg]);
            } catch (err: any) {
                console.error('[CopilotChatWidget] Voice Error:', err);
                const errText = 'לא הצלחתי לעבד את ההקלטה. אנא נסה שנית.';
                setError(errText);
                setMessages((prev) => [
                    ...prev,
                    { id: `err-${Date.now()}`, role: 'assistant', text: `⚠️ ${errText}` },
                ]);
            } finally {
                setIsLoading(false);
                setRecordingState('idle');
            }
        } else if (recordingState === 'idle') {
            const ok = await startRecording();
            if (!ok) {
                const errText = 'לא ניתן לגשת למיקרופון. אנא הרשה גישה בדפדפן.';
                setError(errText);
                setMessages((prev) => [
                    ...prev,
                    { id: `err-${Date.now()}`, role: 'assistant', text: `⚠️ ${errText}` },
                ]);
            }
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    // Calculate mic button classes based on recordingState
    const micButtonClass = (() => {
        const base = 'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ml-1.5';
        if (recordingState === 'recording')
            return `${base} bg-red-500/90 hover:bg-red-500 text-white animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.5)]`;
        if (recordingState === 'processing')
            return `${base} bg-amber-500/90 text-white cursor-wait`;
        return `${base} bg-transparent hover:bg-white/10 text-slate-400 hover:text-cyan-400 border border-transparent hover:border-cyan-500/30`;
    })();

    const MicIcon = recordingState === 'processing' ? Loader2 : recordingState === 'recording' ? MicOff : Mic;

    return (
        <>
            {/* ── Keyframe styles injected inline ──── */}
            <style>{`
                @keyframes bounce {
                    0%, 60%, 100% { transform: translateY(0); }
                    30% { transform: translateY(-6px); }
                }
                @keyframes copilot-slide-up {
                    from { opacity: 0; transform: translateY(20px) scale(0.95); }
                    to   { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes copilot-pulse-glow {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(6,182,212,0); }
                    50% { box-shadow: 0 0 0 8px rgba(6,182,212,0.15); }
                }
            `}</style>

            {/* ── Chat Window ──────────────────────────────────────────────── */}
            {isOpen && (
                <div
                    className="fixed bottom-[85px] sm:bottom-24 left-4 right-4 sm:right-auto sm:left-6 z-[9999] w-auto sm:w-[360px] h-[65vh] xs:h-[70vh] sm:h-[520px] max-h-[85vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl"
                    dir="rtl"
                    style={{
                        animation: 'copilot-slide-up 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) both',
                        background: 'linear-gradient(145deg, #0d1526 0%, #0a0f1c 100%)',
                        border: '1px solid rgba(6,182,212,0.2)',
                        boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 40px rgba(6,182,212,0.08), inset 0 1px 0 rgba(255,255,255,0.05)',
                    }}
                >
                    {/* Header */}
                    <div
                        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
                        style={{
                            background: 'linear-gradient(90deg, rgba(6,182,212,0.1) 0%, rgba(139,92,246,0.08) 100%)',
                            borderBottom: '1px solid rgba(6,182,212,0.15)',
                            backdropFilter: 'blur(12px)',
                        }}
                    >
                        <div className="flex items-center gap-2.5">
                            <div
                                className="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg"
                                style={{ background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)' }}
                            >
                                <Sparkles className="w-4.5 h-4.5 text-white" />
                            </div>
                            <div>
                                <p className="text-white font-bold text-sm leading-tight">hOMER Chat Bot</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <div className={`w-1.5 h-1.5 rounded-full ${recordingState === 'recording' ? 'bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.8)]' : 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]'} animate-pulse`} />
                                    <span className={`text-[10px] ${recordingState === 'recording' ? 'text-red-400' : 'text-emerald-400'} font-medium`}>
                                        {recordingState === 'recording'
                                            ? 'מקשיב...'
                                            : recordingState === 'processing'
                                                ? 'מעבד הקלטה...'
                                                : 'מחובר ופעיל'}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 custom-scrollbar">
                        {messages.map(msg => (
                            <div
                                key={msg.id}
                                className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                {msg.role === 'assistant' && (
                                    <div
                                        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 shadow-md"
                                        style={{ background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)' }}
                                    >
                                        <Bot className="w-3.5 h-3.5 text-white" />
                                    </div>
                                )}
                                <div
                                    className={`relative max-w-[78%] px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${msg.role === 'user'
                                        ? 'rounded-2xl rounded-bl-none text-slate-100'
                                        : 'rounded-2xl rounded-br-none text-slate-200'
                                        }`}
                                    style={
                                        msg.role === 'user'
                                            ? {
                                                background: 'linear-gradient(135deg, rgba(6,182,212,0.25), rgba(139,92,246,0.2))',
                                                border: '1px solid rgba(6,182,212,0.3)',
                                            }
                                            : {
                                                background: 'rgba(30,41,59,0.8)',
                                                border: '1px solid rgba(71,85,105,0.4)',
                                                backdropFilter: 'blur(8px)',
                                            }
                                    }
                                >
                                    {msg.isVoice ? (
                                        <div className="flex flex-col">
                                            <span className="inline-flex items-center gap-1 text-cyan-200 text-[10px] mb-1 opacity-80">
                                                <Mic size={10} /> הודעה קולית
                                            </span>
                                            <span>{msg.text}</span>
                                        </div>
                                    ) : (
                                        msg.text
                                    )}
                                </div>
                            </div>
                        ))}

                        {isLoading && <TypingIndicator />}
                        <div ref={bottomRef} />
                    </div>

                    {/* Recording banner */}
                    {recordingState === 'recording' && (
                        <div className="mx-4 mb-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 flex items-center justify-between backdrop-blur-md">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse shadow-[0_0_8px_rgba(248,113,113,0.8)]" />
                                <span className="text-xs text-red-300 font-medium tracking-wide">מקליט... שוב לחיצה לסיום</span>
                            </div>
                            <button
                                onClick={cancelRecording}
                                className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
                            >
                                ביטול
                            </button>
                        </div>
                    )}

                    {/* Input Area */}
                    <div
                        className="flex-shrink-0 p-3"
                        style={{
                            borderTop: '1px solid rgba(6,182,212,0.1)',
                            background: 'rgba(10,15,28,0.8)',
                            backdropFilter: 'blur(12px)',
                        }}
                    >
                        {error && (
                            <p className="text-xs text-red-400 mb-2 px-1">{error}</p>
                        )}
                        <div
                            className="flex items-end gap-1 rounded-xl p-1.5 pr-2"
                            style={{
                                background: 'rgba(30,41,59,0.7)',
                                border: '1px solid rgba(6,182,212,0.2)',
                            }}
                        >
                            <button
                                onClick={handleMicClick}
                                disabled={recordingState === 'processing' || isLoading}
                                className={micButtonClass}
                                title={recordingState === 'recording' ? 'עצור הקלטה' : 'התחל הקלטה'}
                            >
                                <MicIcon className={`w-4 h-4 ${recordingState === 'processing' ? 'animate-spin' : ''}`} />
                            </button>

                            <textarea
                                ref={inputRef}
                                value={recordingState === 'recording' ? '' : inputValue}
                                onChange={e => setInputValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={recordingState === 'recording' ? '🔴 מקשיב...' : 'שאל אותי ביצועים או קולית...'}
                                rows={1}
                                disabled={isLoading || recordingState !== 'idle'}
                                className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 resize-none focus:outline-none min-h-[28px] max-h-[100px] py-1.5 px-2 leading-relaxed disabled:opacity-50"
                                style={{ direction: 'rtl', scrollbarWidth: 'none' }}
                            />
                            
                            <button
                                onClick={handleSendMessage}
                                disabled={isLoading || !inputValue.trim() || recordingState !== 'idle'}
                                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-40 disabled:cursor-not-allowed ml-0.5"
                                style={{
                                    background: inputValue.trim() && !isLoading && recordingState === 'idle'
                                        ? 'linear-gradient(135deg, #06b6d4, #8b5cf6)'
                                        : 'rgba(71,85,105,0.5)',
                                }}
                            >
                                {isLoading
                                    ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                                    : <Send className="w-3.5 h-3.5 text-white" />
                                }
                            </button>
                        </div>
                        <p className="text-[10px] text-slate-500 text-center mt-1.5 flex justify-center gap-2">
                            <span>Enter לשליחה</span> · <span>Shift+Enter לשורה חדשה</span>
                        </p>
                    </div>
                </div>
            )}

            {/* ── Floating Button ──────────────────────────────────────────── */}
            <button
                onClick={() => setIsOpen(v => !v)}
                aria-label="פתח AI Copilot"
                className="tour-ai-copilot fixed bottom-4 left-4 sm:bottom-6 sm:left-6 z-[9999] w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 shadow-xl"
                style={{
                    background: isOpen
                        ? 'linear-gradient(135deg, #475569, #334155)'
                        : 'linear-gradient(135deg, #06b6d4 0%, #8b5cf6 100%)',
                    boxShadow: isOpen
                        ? '0 4px 20px rgba(0,0,0,0.4)'
                        : '0 8px 30px rgba(6,182,212,0.4), 0 4px 12px rgba(0,0,0,0.3)',
                    animation: isOpen ? 'none' : 'copilot-pulse-glow 3s ease-in-out infinite',
                }}
            >
                {isOpen ? (
                    <X className="w-6 h-6 text-white" />
                ) : (
                    <Sparkles className="w-6 h-6 text-white" />
                )}
            </button>
        </>
    );
}
