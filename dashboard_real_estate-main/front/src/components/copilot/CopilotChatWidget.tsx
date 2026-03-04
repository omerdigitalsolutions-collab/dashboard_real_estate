import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X, Send, Bot, Loader2 } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Message {
    id: string;
    role: 'user' | 'assistant';
    text: string;
}

const INITIAL_MESSAGES: Message[] = [
    {
        id: 'welcome',
        role: 'assistant',
        text: 'שלום! אני הCopilot של hOMER 🏠\nשאל אותי על הסוכנות שלך — ביצועים, לידים, נכסים ועסקאות.',
    },
];

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

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    // Focus input when chat opens
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    const handleSendMessage = useCallback(async () => {
        const prompt = inputValue.trim();
        if (!prompt || isLoading) return;

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
            const askCopilot = httpsCallable<{ prompt: string }, { response: string }>(
                functions,
                'ai-askCopilot'
            );
            const result = await askCopilot({ prompt });

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
            // Also add error as assistant message for in-chat visibility
            setMessages(prev => [
                ...prev,
                { id: `err-${Date.now()}`, role: 'assistant', text: `⚠️ ${errText}` },
            ]);
        } finally {
            setIsLoading(false);
        }
    }, [inputValue, isLoading]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

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
                                <p className="text-white font-bold text-sm leading-tight">hOMER Copilot</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] animate-pulse" />
                                    <span className="text-[10px] text-emerald-400 font-medium">מחובר ופעיל</span>
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
                                    className={`max-w-[78%] px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${msg.role === 'user'
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
                                    {msg.text}
                                </div>
                            </div>
                        ))}

                        {isLoading && <TypingIndicator />}
                        <div ref={bottomRef} />
                    </div>

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
                            className="flex items-end gap-2 rounded-xl p-1.5 pr-3"
                            style={{
                                background: 'rgba(30,41,59,0.7)',
                                border: '1px solid rgba(6,182,212,0.2)',
                            }}
                        >
                            <textarea
                                ref={inputRef}
                                value={inputValue}
                                onChange={e => setInputValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="שאל אותי כל שאלה עסקית..."
                                rows={1}
                                disabled={isLoading}
                                className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 resize-none focus:outline-none min-h-[28px] max-h-[100px] py-1 leading-relaxed"
                                style={{ direction: 'rtl', scrollbarWidth: 'none' }}
                            />
                            <button
                                onClick={handleSendMessage}
                                disabled={isLoading || !inputValue.trim()}
                                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{
                                    background: inputValue.trim() && !isLoading
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
                        <p className="text-[10px] text-slate-600 text-center mt-1.5">Enter לשליחה · Shift+Enter לשורה חדשה</p>
                    </div>
                </div>
            )}

            {/* ── Floating Button ──────────────────────────────────────────── */}
            <button
                onClick={() => setIsOpen(v => !v)}
                aria-label="פתח AI Copilot"
                className="fixed bottom-4 left-4 sm:bottom-6 sm:left-6 z-[9999] w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 shadow-xl"
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
