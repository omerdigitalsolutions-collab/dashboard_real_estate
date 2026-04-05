/**
 * BotToggle — One-click AI bot mute/activate control for a lead.
 *
 * Placed inside the WhatsApp tab of LeadProfilePanel.
 * Updates `isBotActive` directly in Firestore.
 *
 * Design: "Dark Analytics" theme — glowing cyan (active) / muted outline (inactive).
 */

import { doc, updateDoc } from 'firebase/firestore';
import { useState } from 'react';
import { db } from '../../config/firebase';
import { Bot, BotMessageSquare, Loader2 } from 'lucide-react';
import UpgradeModal from '../ui/UpgradeModal';
import { useSubscriptionGuard } from '../../hooks/useSubscriptionGuard';

interface BotToggleProps {
    leadId: string;
    isBotActive: boolean;
}

export default function BotToggle({ leadId, isBotActive }: BotToggleProps) {
    const { features, loading: billingLoading } = useSubscriptionGuard();
    const [loading, setLoading] = useState(false);
    const [localActive, setLocalActive] = useState(isBotActive);
    const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

    const handleToggle = async () => {
        // Enforce Feature Gating
        if (!features.canAccessAiBot) {
            setIsUpgradeModalOpen(true);
            return;
        }

        if (loading || billingLoading) return;
        setLoading(true);
        const next = !localActive;
        try {
            await updateDoc(doc(db, 'leads', leadId), { isBotActive: next });
            setLocalActive(next);
        } catch (err) {
            console.error('[BotToggle] Failed to update isBotActive:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="tour-whatsapp-control px-4 py-3 border-b border-slate-100 bg-[#020b18]/95">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Bot size={11} className="text-[#00e5ff]" />
                שליטת בוט AI
            </p>

            <button
                onClick={handleToggle}
                disabled={loading}
                className={[
                    'w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 disabled:opacity-60',
                    localActive
                        // Active state — glowing cyan
                        ? 'bg-[#00e5ff] text-[#020b18] shadow-[0_0_18px_rgba(0,229,255,0.45)] hover:shadow-[0_0_26px_rgba(0,229,255,0.65)] hover:bg-[#33eeff]'
                        // Muted state — subtle outline
                        : 'bg-transparent border border-slate-600 text-slate-400 hover:text-white hover:border-slate-400'
                ].join(' ')}
            >
                {loading ? (
                    <Loader2 size={15} className="animate-spin" />
                ) : localActive ? (
                    <BotMessageSquare size={15} />
                ) : (
                    <Bot size={15} />
                )}
                {loading
                    ? 'מעדכן...'
                    : localActive
                        ? 'כיבוי בוט (קח טיפול)'
                        : 'הפעל בוט מחדש'}
            </button>

            {/* Status indicator */}
            <p className={`text-[10px] mt-2 text-center font-medium ${localActive ? 'text-[#00e5ff]/70' : 'text-slate-600'}`}>
                {localActive
                    ? '● הבוט פעיל — מגיב אוטומטית להודעות'
                    : '○ הבוט מושתק — מגיב רק אתה'}
            </p>

            <UpgradeModal
                isOpen={isUpgradeModalOpen}
                onClose={() => setIsUpgradeModalOpen(false)}
                featureName="בוט WhatsApp AI וסינון"
            />
        </div>
    );
}
