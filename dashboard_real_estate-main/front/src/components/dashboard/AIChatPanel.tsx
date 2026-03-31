import { X, Sparkles, Send, Mic, MicOff, Loader2 } from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { httpsCallable, getFunctions } from 'firebase/functions';

interface Message {
    id: number;
    role: 'ai' | 'user';
    text: string;
    time: string;
    isVoice?: boolean;
}

interface AIChatPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

const quickPrompts = [
    'איזו עסקה הכי קרובה לסגירה?',
    'מה המצב עם נכסי היוקרה?',
    'כמה לידים נכנסו היום?',
    'תנתח את ביצועי נועה',
];

const initialMessages = [
    {
        id: 1,
        role: 'ai' as const,
        text: 'שלום! 🏠 אני hOMER Chat Bot של המשרד. שאל אותי על הסוכנות שלך — ביצועים, לידים, נכסים ועסקאות.',
        time: 'עכשיו',
    },
];

// ─── Voice Recording Hook ──────────────────────────────────────────────────────

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

                // Stop all tracks
                recorder.stream.getTracks().forEach((t) => t.stop());

                // Convert to base64
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

// ─── Component ─────────────────────────────────────────────────────────────────

export default function AIChatPanel({ isOpen, onClose }: AIChatPanelProps) {
    const [messages, setMessages] = useState<Message[]>(initialMessages);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    const { recordingState, setRecordingState, startRecording, stopRecording, cancelRecording } =
        useVoiceRecorder();

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    // ─── Send text message ─────────────────────────────────────────────────────

    const handleSend = async (text?: string) => {
        const msg = text ?? input;
        if (!msg.trim()) return;

        const userMsg: Message = { id: Date.now(), role: 'user', text: msg, time: 'עכשיו' };
        setMessages((prev) => [...prev, userMsg]);
        setInput('');
        setIsTyping(true);

        try {
            const askAgencyAgent = httpsCallable(getFunctions(undefined, 'europe-west1'), 'ai-askAgencyAgent');
            const result = await askAgencyAgent({ message: msg });
            const reply = (result.data as any).reply;

            setMessages((prev) => [
                ...prev,
                { id: Date.now() + 1, role: 'ai', text: reply, time: 'עכשיו' },
            ]);
        } catch (error) {
            console.error('AI Chat Error:', error);
            setMessages((prev) => [
                ...prev,
                {
                    id: Date.now() + 1,
                    role: 'ai',
                    text: '⚠️ אירעה שגיאה בתקשורת עם הCopilot. נסה שוב.',
                    time: 'עכשיו',
                },
            ]);
        } finally {
            setIsTyping(false);
        }
    };

    // ─── Voice recording toggle ────────────────────────────────────────────────

    const handleMicClick = async () => {
        if (recordingState === 'recording') {
            // Stop and transcribe
            const result = await stopRecording();
            if (!result) { setRecordingState('idle'); return; }

            const { base64, mimeType } = result;
            setIsTyping(true);

            try {
                const textToActionAgent = httpsCallable(
                    getFunctions(undefined, 'europe-west1'),
                    'ai-textToActionAgent'
                );
                const response = await textToActionAgent({ audio: base64, mimeType });
                const data = response.data as any;

                // Show transcribed text as the user's bubble
                const userText = data.transcribedText || '🎙️ [הודעת קול]';
                const userMsg: Message = {
                    id: Date.now(),
                    role: 'user',
                    text: userText,
                    time: 'עכשיו',
                    isVoice: true,
                };
                setMessages((prev) => [...prev, userMsg]);

                // Show agent response
                setMessages((prev) => [
                    ...prev,
                    {
                        id: Date.now() + 1,
                        role: 'ai',
                        text: data.message || 'הפעולה הושלמה.',
                        time: 'עכשיו',
                    },
                ]);
            } catch (err) {
                console.error('Voice AI Error:', err);
                setMessages((prev) => [
                    ...prev,
                    {
                        id: Date.now() + 1,
                        role: 'ai',
                        text: '⚠️ לא הצלחתי לעבד את ההקלטה. אנא נסה שנית.',
                        time: 'עכשיו',
                    },
                ]);
            } finally {
                setIsTyping(false);
                setRecordingState('idle');
            }
        } else if (recordingState === 'idle') {
            const ok = await startRecording();
            if (!ok) {
                setMessages((prev) => [
                    ...prev,
                    {
                        id: Date.now(),
                        role: 'ai',
                        text: '⚠️ לא ניתן לגשת למיקרופון. אנא הרשה גישה בהגדרות הדפדפן.',
                        time: 'עכשיו',
                    },
                ]);
            }
        }
    };

    // ─── Mic button styles ─────────────────────────────────────────────────────

    const micButtonClass = (() => {
        const base = 'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-all';
        if (recordingState === 'recording')
            return `${base} bg-red-500 hover:bg-red-600 text-white animate-pulse`;
        if (recordingState === 'processing')
            return `${base} bg-amber-400 text-white cursor-wait`;
        return `${base} bg-slate-100 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 border border-slate-200`;
    })();

    const MicIcon = recordingState === 'processing' ? Loader2 : recordingState === 'recording' ? MicOff : Mic;

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                className={`fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            />

            {/* Panel */}
            <div
                dir="rtl"
                className={`fixed top-0 left-0 h-full w-full sm:w-[420px] bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
            >
                {/* Header */}
                <div className="flex items-center gap-3 p-5 border-b border-slate-100 bg-gradient-to-l from-indigo-50 to-violet-50">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-200 flex-shrink-0">
                        <Sparkles size={20} className="text-white" />
                    </div>
                    <div className="flex-1">
                        <h2 className="text-base font-bold text-slate-900">hOMER Chat Bot</h2>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-xs text-slate-500">
                                {recordingState === 'recording'
                                    ? '🔴 מקשיב...'
                                    : recordingState === 'processing'
                                    ? 'מעבד הקלטה...'
                                    : 'מחובר ופעיל'}
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                            {msg.role === 'ai' && (
                                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0 mt-1">
                                    <Sparkles size={12} className="text-white" />
                                </div>
                            )}
                            <div
                                className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'ai' ? 'bg-slate-50 border border-slate-100 text-slate-700 rounded-tr-sm' : 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white rounded-tl-sm'}`}
                            >
                                {msg.isVoice && (
                                    <span className="inline-flex items-center gap-1 text-indigo-200 text-xs mb-1">
                                        <Mic size={10} /> קולי
                                    </span>
                                )}
                                <p>{msg.text}</p>
                            </div>
                        </div>
                    ))}

                    {/* Typing indicator */}
                    {isTyping && (
                        <div className="flex gap-3">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0 mt-1">
                                <Sparkles size={12} className="text-white" />
                            </div>
                            <div className="bg-slate-50 border border-slate-100 rounded-2xl rounded-tr-sm px-4 py-3 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0ms]" />
                                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:150ms]" />
                                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:300ms]" />
                            </div>
                        </div>
                    )}
                    <div ref={bottomRef} />
                </div>

                {/* Quick Prompts */}
                <div className="px-5 pb-3 flex flex-wrap gap-2">
                    {quickPrompts.map((prompt) => (
                        <button
                            key={prompt}
                            onClick={() => handleSend(prompt)}
                            disabled={recordingState !== 'idle' || isTyping}
                            className="text-xs text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 rounded-full px-3 py-1.5 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {prompt}
                        </button>
                    ))}
                </div>

                {/* Recording banner */}
                {recordingState === 'recording' && (
                    <div className="mx-4 mb-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-xs text-red-600 font-medium">מקליט... לחץ על המיקרופון לסיום</span>
                        </div>
                        <button
                            onClick={cancelRecording}
                            className="text-xs text-slate-400 hover:text-slate-600 underline"
                        >
                            ביטול
                        </button>
                    </div>
                )}

                {/* Input */}
                <div className="p-4 border-t border-slate-100">
                    <div className="flex gap-2 bg-slate-50 rounded-xl border border-slate-200 p-1">
                        {/* Mic button */}
                        <button
                            onClick={handleMicClick}
                            disabled={recordingState === 'processing' || isTyping}
                            className={micButtonClass}
                            title={recordingState === 'recording' ? 'עצור הקלטה' : 'התחל הקלטה'}
                        >
                            <MicIcon size={15} className={recordingState === 'processing' ? 'animate-spin' : ''} />
                        </button>

                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                            placeholder={recordingState === 'recording' ? '🔴 מקשיב...' : 'שאל אותי כל שאלה עסקית...'}
                            disabled={recordingState !== 'idle'}
                            className="flex-1 bg-transparent text-sm text-slate-700 px-3 py-2 outline-none placeholder:text-slate-400 disabled:opacity-60"
                        />

                        <button
                            onClick={() => handleSend()}
                            disabled={!input.trim() || recordingState !== 'idle' || isTyping}
                            className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white hover:opacity-90 transition-opacity flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <Send size={15} />
                        </button>
                    </div>
                    <p className="text-center text-[10px] text-slate-400 mt-1.5">
                        Enter לשליחה · Shift+Enter לשורה חדשה · 🎙️ להקלטה לחץ על המיקרופון
                    </p>
                </div>
            </div>
        </>
    );
}
