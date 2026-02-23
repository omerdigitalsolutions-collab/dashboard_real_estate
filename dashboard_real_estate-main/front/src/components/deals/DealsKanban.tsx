import { useState, useEffect, useMemo } from 'react';
import {
    DndContext,
    pointerWithin,
    rectIntersection,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragStartEvent,
    DragEndEvent,
    DragOverlay,
    useDroppable,
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Clock, CheckCircle, Trash2 } from 'lucide-react';
import { useLiveDashboardData } from '../../hooks/useLiveDashboardData';
import { updateDealStage, deleteDeal } from '../../services/dealService';
import { Deal, DealStage } from '../../types';

// ─── Constants & Types ────────────────────────────────────────────────────────
const STAGES: { id: DealStage; label: string; color: string; bg: string; border: string; headerBg: string }[] = [
    { id: 'qualification', label: 'בירור צרכים', color: 'text-slate-700', bg: 'bg-slate-100', border: 'border-slate-200', headerBg: 'bg-slate-50' },
    { id: 'viewing', label: 'סיור בנכס', color: 'text-sky-700', bg: 'bg-sky-100', border: 'border-sky-200', headerBg: 'bg-sky-50' },
    { id: 'offer', label: 'הגשת הצעה', color: 'text-amber-700', bg: 'bg-amber-100', border: 'border-amber-200', headerBg: 'bg-amber-50' },
    { id: 'negotiation', label: 'משא ומתן', color: 'text-purple-700', bg: 'bg-purple-100', border: 'border-purple-200', headerBg: 'bg-purple-50' },
    { id: 'contract', label: 'טיוטות וחוזים', color: 'text-blue-700', bg: 'bg-blue-100', border: 'border-blue-200', headerBg: 'bg-blue-50' },
    { id: 'won', label: 'נסגר בהצלחה', color: 'text-emerald-700', bg: 'bg-emerald-100', border: 'border-emerald-200', headerBg: 'bg-emerald-50' },
    { id: 'lost', label: 'לא רלוונטי / הופסד', color: 'text-rose-700', bg: 'bg-rose-100', border: 'border-rose-200', headerBg: 'bg-rose-50' },
];

function DealCard({ deal, leadName, propertyAddress, isOverlay, onDelete }: { deal: Deal; leadName: string; propertyAddress: string; isOverlay?: boolean; onDelete: (id: string) => void }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: deal.id, data: { deal } });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`bg-white rounded-xl border border-slate-200 p-4 shadow-sm group hover:border-blue-300 hover:shadow-md transition-all relative ${isOverlay ? 'rotate-2 shadow-2xl cursor-grabbing' : 'cursor-grab'}`}
        >
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                    <p className="text-base font-bold text-slate-900 leading-snug truncate" title={propertyAddress}>{propertyAddress}</p>
                    <p className="text-sm text-slate-500 mt-0.5 truncate" title={leadName}>{leadName}</p>
                </div>

                <div className="flex items-center gap-1 opacity-100 xl:opacity-0 xl:group-hover:opacity-100 transition-opacity">
                    <button onClick={() => onDelete(deal.id)} className="p-1.5 text-slate-300 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors" title="מחק עסקה">
                        <Trash2 size={16} />
                    </button>
                    <div {...attributes} {...listeners} className="text-slate-300 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-50">
                        <GripVertical size={16} />
                    </div>
                </div>
            </div>

            <p className="text-base font-black text-blue-700 my-2 bg-blue-50 inline-block px-3 py-1.5 rounded-lg border border-blue-100">
                ₪{(deal.projectedCommission || 0).toLocaleString()}
            </p>

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 text-xs font-bold">
                        {deal.createdBy?.substring(0, 2).toUpperCase() || 'AG'}
                    </div>
                </div>
                <div className="flex items-center gap-1.5 text-slate-400 bg-slate-50 px-2 py-1 rounded-md" title="ימים מאז עדכון אחרון">
                    <Clock size={12} />
                    <span className="text-xs font-semibold">
                        {deal.createdAt ? Math.floor((Date.now() - deal.createdAt.toMillis()) / (1000 * 60 * 60 * 24)) : 0} ימים
                    </span>
                </div>
            </div>
        </div>
    );
}

function DealsColumn({ stage, deals, leads, properties, onDelete }: { stage: typeof STAGES[0]; deals: Deal[]; leads: any[]; properties: any[]; onDelete: (id: string) => void }) {
    const { setNodeRef } = useDroppable({ id: stage.id });
    const totalCommission = deals.reduce((sum, d) => sum + (d.actualCommission ?? d.projectedCommission ?? 0), 0);

    return (
        <div ref={setNodeRef} className="w-[320px] flex-shrink-0 flex flex-col h-[480px] bg-slate-50/70 rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className={`p-4 border-b ${stage.border} ${stage.headerBg}`}>
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                        <span className={`text-base font-bold ${stage.color}`}>{stage.label}</span>
                        <span className={`text-sm font-black px-2.5 py-0.5 rounded-full ${stage.bg} ${stage.color}`}>{deals.length}</span>
                    </div>
                </div>
                <p className="text-sm font-bold text-slate-500">
                    ₪{(totalCommission / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k פוטנציאל
                </p>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3 pretty-scroll">
                <SortableContext items={deals.map(d => d.id)} strategy={verticalListSortingStrategy}>
                    {deals.map(deal => (
                        <DealCard
                            key={deal.id}
                            deal={deal}
                            leadName={leads.find(l => l.id === deal.leadId)?.name || 'ליד לא ידוע'}
                            propertyAddress={properties.find(p => p.id === deal.propertyId)?.address || 'נכס לא ידוע'}
                            onDelete={onDelete}
                        />
                    ))}
                </SortableContext>
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function DealsKanban() {
    const { deals: liveDeals, leads, properties } = useLiveDashboardData();
    const [deals, setDeals] = useState<Deal[]>([]);

    // For Drag and Drop
    const [activeId, setActiveId] = useState<string | null>(null);
    const activeDeal = useMemo(() => deals.find(d => d.id === activeId), [activeId, deals]);

    // For "Won" Modal Workflow
    const [wonModalDeal, setWonModalDeal] = useState<Deal | null>(null);
    const [actualCommissionInput, setActualCommissionInput] = useState('');

    useEffect(() => {
        setDeals(liveDeals);
    }, [liveDeals]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);

        if (!over) return;

        const activeDealObj = deals.find(d => d.id === active.id);
        if (!activeDealObj) return;

        // over.id may be either a stage id (column droppable) or a deal id (card).
        // Resolve to a stage: check column first, then look up from card.
        let targetStage: DealStage;
        if (STAGES.some(s => s.id === (over.id as string))) {
            // Dropped directly on a column droppable
            targetStage = over.id as DealStage;
        } else {
            // Dropped on another deal card — use that card's stage
            const overDealObj = deals.find(d => d.id === over.id);
            if (!overDealObj) return;
            targetStage = overDealObj.stage;
        }

        if (activeDealObj.stage === targetStage) return; // Didn't change stages

        // If dropped into 'won', halt generic update and show modal
        if (targetStage === 'won') {
            setWonModalDeal(activeDealObj);
            setActualCommissionInput(activeDealObj.projectedCommission.toString());
            // Do not update optimistically until they confirm
            return;
        }

        // Optimistic generic stage update
        const originalDeals = [...deals];
        setDeals(deals.map(d => d.id === active.id ? { ...d, stage: targetStage } : d));

        try {
            await updateDealStage(active.id as string, targetStage);
        } catch (error) {
            console.error('Update deal failed:', error);
            setDeals(originalDeals); // Revert
            alert('שגיאה בעדכון שלב העסקה');
        }
    };

    const handleConfirmWon = async () => {
        if (!wonModalDeal) return;

        const actualNum = Number(actualCommissionInput.replace(/[^0-9.-]+/g, ""));
        if (isNaN(actualNum)) {
            alert('אנא הזן סכום חוקי');
            return;
        }

        // Optimistic Update
        const originalDeals = [...deals];
        setDeals(deals.map(d => d.id === wonModalDeal.id ? { ...d, stage: 'won', actualCommission: actualNum } : d));
        setWonModalDeal(null);

        try {
            await updateDealStage(wonModalDeal.id, 'won', actualNum);
        } catch (error) {
            console.error('Failed to mark as won:', error);
            setDeals(originalDeals);
            alert('שגיאה בשמירת העמלה ושמירת העסקה');
        }
    };

    const handleDelete = async (dealId: string) => {
        if (confirm('האם אתה בטוח שברצונך למחוק עסקה זו? הפעולה אינה הפיכה.')) {
            const originalDeals = [...deals];
            setDeals(deals.filter(d => d.id !== dealId));
            try {
                await deleteDeal(dealId);
            } catch (err) {
                console.error("Failed to delete deal", err);
                setDeals(originalDeals);
                alert('שגיאה במחיקת העסקה');
            }
        }
    };

    return (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[700px] h-[calc(100vh-12rem)]">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-slate-900">לוח עסקאות דינמי</h2>
                    <p className="text-sm font-medium text-slate-500 mt-1">גרור עסקאות בין השלבים השונים למעקב חכם אחריהן</p>
                </div>
            </div>

            <div className="p-6 flex-grow overflow-y-auto bg-slate-50/30">
                <DndContext
                    sensors={sensors}
                    collisionDetection={(args) => {
                        const pointerCollisions = pointerWithin(args);
                        return pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args);
                    }}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                >
                    {/* FLEX WRAP container for 2 rows effect */}
                    <div className="flex flex-wrap gap-6 items-start pb-4">
                        {STAGES.map(stage => (
                            <SortableContext
                                key={stage.id}
                                id={stage.id}
                                items={deals.filter(d => d.stage === stage.id).map(d => d.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                <DealsColumn
                                    stage={stage}
                                    deals={deals.filter(d => d.stage === stage.id)}
                                    leads={leads}
                                    properties={properties}
                                    onDelete={handleDelete}
                                />
                            </SortableContext>
                        ))}
                    </div>

                    <DragOverlay>
                        {activeDeal ? (
                            <DealCard
                                deal={activeDeal}
                                leadName={leads.find(l => l.id === activeDeal.leadId)?.name || 'ליד לא ידוע'}
                                propertyAddress={properties.find(p => p.id === activeDeal.propertyId)?.address || 'נכס לא ידוע'}
                                isOverlay
                                onDelete={handleDelete}
                            />
                        ) : null}
                    </DragOverlay>
                </DndContext>
            </div>

            {/* Won Modal Workflow */}
            {wonModalDeal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setWonModalDeal(null)} />
                    <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl relative z-10 overflow-hidden text-center p-8">
                        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 mx-auto mb-4">
                            <CheckCircle size={32} />
                        </div>
                        <h2 className="text-xl font-bold text-slate-900 mb-2">מזל טוב על הסגירה!</h2>
                        <p className="text-sm text-slate-500 mb-6">רגע לפני שאנחנו חוגגים, מה הייתה עמלת הסגירה הסופית בעסקה זו?</p>

                        <div className="text-right mb-6">
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1.5">עמלה ריאלית (₪)</label>
                            <input
                                autoFocus
                                type="number"
                                value={actualCommissionInput}
                                onChange={(e) => setActualCommissionInput(e.target.value)}
                                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all outline-none bg-slate-50 focus:bg-white text-slate-900 font-bold"
                            />
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setWonModalDeal(null)}
                                className="flex-1 py-3 text-sm font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                            >
                                ביטול
                            </button>
                            <button
                                onClick={handleConfirmWon}
                                className="flex-1 py-3 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors shadow-lg shadow-emerald-200"
                            >
                                אישור וסגירה
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
