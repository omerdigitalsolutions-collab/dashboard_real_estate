import { X, Sparkles, Send } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { httpsCallable, getFunctions } from 'firebase/functions';

interface Message {
    id: number;
    role: 'ai' | 'user';
    text: string;
    time: string;
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
        text: 'היי עומר 👋 אני מנתח את נתוני המשרד בזמן אמת. מה תרצה לדעת היום?',
        time: 'עכשיו',
    },
];

export default function AIChatPanel({ isOpen, onClose }: AIChatPanelProps) {
    const [messages, setMessages] = useState<Message[]>(initialMessages);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    const handleSend = async (text?: string) => {
        const msg = text ?? input;
        if (!msg.trim()) return;

        const userMsg = { id: Date.now(), role: 'user' as const, text: msg, time: 'עכשיו' };
        setMessages((prev) => [...prev, userMsg]);
        setInput('');
        setIsTyping(true);

        try {
            const askAgencyAgent = httpsCallable(getFunctions(undefined, 'europe-west1'), 'ai-askAgencyAgent');
            const result = await askAgencyAgent({ message: msg });
            const reply = (result.data as any).reply;

            setMessages((prev) => [
                ...prev,
                {
                    id: Date.now() + 1,
                    role: 'ai',
                    text: reply,
                    time: 'עכשיו',
                },
            ]);
        } catch (error) {
            console.error('AI Chat Error:', error);
            setMessages((prev) => [
                ...prev,
                {
                    id: Date.now() + 1,
                    role: 'ai',
                    text: 'מצטער, אירעה שגיאה בתקשורת עם השרת. אנא נסה שוב מאוחר יותר.',
                    time: 'עכשיו',
                },
            ]);
        } finally {
            setIsTyping(false);
        }
    };

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
                        <h2 className="text-base font-bold text-slate-900">העוזר החכם</h2>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-xs text-slate-500">מנתח נתונים בזמן אמת</span>
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
                                {msg.text}
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
                            className="text-xs text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 rounded-full px-3 py-1.5 font-medium transition-colors"
                        >
                            {prompt}
                        </button>
                    ))}
                </div>

                {/* Input */}
                <div className="p-4 border-t border-slate-100">
                    <div className="flex gap-2 bg-slate-50 rounded-xl border border-slate-200 p-1">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            placeholder="שאל אותי כל דבר על המשרד..."
                            className="flex-1 bg-transparent text-sm text-slate-700 px-3 py-2 outline-none placeholder:text-slate-400"
                        />
                        <button
                            onClick={() => handleSend()}
                            className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white hover:opacity-90 transition-opacity flex-shrink-0"
                        >
                            <Send size={15} />
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
