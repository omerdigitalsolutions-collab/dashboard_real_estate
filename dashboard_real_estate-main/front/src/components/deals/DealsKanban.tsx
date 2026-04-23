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
import { GripVertical, Clock, CheckCircle, Trash2, FileText, FilePlus } from 'lucide-react';
import { useLiveDashboardData } from '../../hooks/useLiveDashboardData';
import { updateDealStage, deleteDeal } from '../../services/dealService';
import { Deal, DealStage, CustomDealStage, Property, Lead } from '../../types';
import { Link, useNavigate } from 'react-router-dom';
import { triggerWonConfetti } from '../../utils/effects';
import { useAuth } from '../../context/AuthContext';

// ─── Constants & Types ────────────────────────────────────────────────────────
export const MANDATORY_STAGES: { id: DealStage; label: string; color: string; bg: string; border: string; headerBg: string }[] = [
    { id: 'won', label: 'נסגר בהצלחה', color: 'text-emerald-700', bg: 'bg-emerald-100', border: 'border-emerald-200', headerBg: 'bg-emerald-50' },
];

function DealCard({
    deal,
    buyer,
    seller,
    property,
    isOverlay,
    canEdit = true,
    onDelete,
    onClick
}: {
    deal: Deal;
    buyer?: Lead;
    seller?: Lead;
    property?: Property;
    isOverlay?: boolean;
    canEdit?: boolean;
    onDelete: (id: string) => void;
    onClick?: (deal: Deal) => void;
}) {
    const navigate = useNavigate();
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: deal.id, data: { deal }, disabled: !canEdit });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            onClick={(e) => {
                // Prevent click if we are clicking a button or link
                if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('a')) return;
                if (onClick) onClick(deal);
            }}
            className={`bg-white rounded-xl border border-slate-200 p-4 shadow-sm group hover:border-blue-300 hover:shadow-md transition-all relative ${isOverlay ? 'rotate-2 shadow-2xl cursor-grabbing' : 'cursor-grab'} ${onClick ? 'cursor-pointer hover:bg-slate-50' : ''}`}
        >
            {property?.media?.images?.[0] && (
                <div className="w-full h-32 rounded-lg mb-4 bg-slate-100 overflow-hidden relative">
                    <img src={property.media.images[0]} alt={property.address?.fullAddress} className="w-full h-full object-cover" />
                </div>
            )}

            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                    <p className="text-base font-bold text-slate-900 leading-snug line-clamp-2" title={property?.address?.fullAddress || 'נכס לא ידוע'}>{property?.address?.fullAddress || 'נכס לא ידוע'}</p>
                    {buyer || seller ? (
                        <div className="flex flex-col mt-0.5">
                            {buyer && (
                                <span className="text-xs text-slate-500 truncate">
                                    קונה: <Link to={`/leads?search=${encodeURIComponent(buyer.name)}`} className="font-medium text-blue-600 hover:text-blue-800 hover:underline" title={buyer.name} onClick={(e) => e.stopPropagation()}>{buyer.name}</Link>
                                </span>
                            )}
                            {seller && (
                                <span className="text-xs text-slate-500 truncate">
                                    מוכר: <Link to={`/leads?search=${encodeURIComponent(seller.name)}`} className="font-medium text-emerald-600 hover:text-emerald-800 hover:underline" title={seller.name} onClick={(e) => e.stopPropagation()}>{seller.name}</Link>
                                </span>
                            )}
                        </div>
                    ) : (
                        <p className="text-sm text-slate-500 mt-0.5 truncate">ללא לקוחות משויכים</p>
                    )}
                </div>

                <div className="flex items-center gap-1 opacity-100 xl:opacity-0 xl:group-hover:opacity-100 transition-opacity">
                    {/* Contract button — shown for all; green when contract exists */}
                    <button
                        onClick={() => navigate(`/dashboard/contracts/${deal.id}/edit`)}
                        title={deal.contract?.contractId ? 'ערוך חוזה' : 'צור חוזה'}
                        className={`p-1.5 rounded-lg transition-colors ${
                            deal.contract?.status === 'completed'
                                ? 'text-green-500 hover:bg-green-50'
                                : deal.contract?.contractId
                                    ? 'text-blue-500 hover:bg-blue-50'
                                    : 'text-slate-300 hover:text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                        {deal.contract?.contractId ? <FileText size={16} /> : <FilePlus size={16} />}
                    </button>

                    {canEdit && (
                        <>
                            <button onClick={() => onDelete(deal.id)} className="p-1.5 text-slate-300 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors" title="מחק עסקה">
                                <Trash2 size={16} />
                            </button>
                            <div {...attributes} {...listeners} className="text-slate-300 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-50">
                                <GripVertical size={16} />
                            </div>
                        </>
                    )}
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

function DealsColumn({
    stage,
    deals,
    leads,
    properties,
    onDelete,
    onOpenProfile,
    currentUid,
    isAgent
}: {
    stage: CustomDealStage;
    deals: Deal[];
    leads: Lead[];
    properties: Property[];
    onDelete: (id: string) => void;
    onOpenProfile: (deal: Deal) => void;
    currentUid: string | undefined;
    isAgent: boolean;
}) {
    const { setNodeRef } = useDroppable({ id: stage.id });
    const totalCommission = deals.reduce((sum, d) => sum + (d.actualCommission ?? d.projectedCommission ?? 0), 0);

    return (
        <div ref={setNodeRef} className="snap-center w-[85vw] sm:w-[320px] 2xl:w-[340px] flex-shrink-0 flex flex-col h-[600px] sm:h-[650px] 2xl:h-[750px] bg-slate-50/70 rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
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
                    {deals.map(deal => {
                        const canEdit = !isAgent || deal.createdBy === currentUid || deal.agentId === currentUid;
                        return (
                            <DealCard
                                key={deal.id}
                                deal={deal}
                                buyer={deals.map(d => d.buyerId ? leads.find(l => l.id === d.buyerId) : undefined).find((_, i) => deals[i].id === deal.id)}
                                seller={deals.map(d => d.sellerId ? leads.find(l => l.id === d.sellerId) : undefined).find((_, i) => deals[i].id === deal.id)}
                                property={properties.find(p => p.id === deal.propertyId)}
                                canEdit={canEdit}
                                onDelete={onDelete}
                                onClick={onOpenProfile}
                            />
                        );
                    })}
                </SortableContext>
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────
import { Settings } from 'lucide-react';
import DealStagesModal from '../modals/DealStagesModal';
import DealProfileModal from '../modals/DealProfileModal';

export default function DealsKanban({ dealsProps }: { dealsProps?: Deal[] }) {
    const { userData } = useAuth();
    const isAgent = userData?.role === 'agent';
    const currentUid = userData?.uid ?? undefined;

    const { deals: liveDealsHook, leads, properties, agencySettings } = useLiveDashboardData();
    const liveDeals = dealsProps ?? liveDealsHook;
    const [deals, setDeals] = useState<Deal[]>([]);

    const activeStages = useMemo(() => {
        const customStages = agencySettings?.customDealStages || [];
        const won = MANDATORY_STAGES[0];

        if (customStages.length === 0) {
            // Provide sensible defaults if they haven't set any up yet
            return [
                { id: 'qualification', label: 'בירור צרכים', color: 'text-slate-700', bg: 'bg-slate-100', border: 'border-slate-200', headerBg: 'bg-slate-50' },
                { id: 'negotiation', label: 'משא ומתן', color: 'text-purple-700', bg: 'bg-purple-100', border: 'border-purple-200', headerBg: 'bg-purple-50' },
                won
            ];
        }

        return [...customStages, won];
    }, [agencySettings?.customDealStages]);

    // For Drag and Drop
    const [activeId, setActiveId] = useState<string | null>(null);
    const activeDeal = useMemo(() => deals.find(d => d.id === activeId), [activeId, deals]);

    // For "Won" Modal Workflow
    const [wonModalDeal, setWonModalDeal] = useState<Deal | null>(null);
    const [actualCommissionInput, setActualCommissionInput] = useState('');

    // For Settings Modal
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

    // For Deal Profile
    const [profileModalDeal, setProfileModalDeal] = useState<Deal | null>(null);

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
        if (activeStages.some(s => s.id === (over.id as string))) {
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

        // Trigger celebration!
        triggerWonConfetti();

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
        <div className="tour-kanban bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[600px] sm:min-h-[800px] h-[calc(100vh-8rem)] relative">
            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-slate-900">לוח עסקאות דינמי</h2>
                    <p className="text-sm font-medium text-slate-500 mt-1">גרור עסקאות בין השלבים השונים למעקב חכם אחריהן</p>
                </div>
                {!isAgent && (
                    <button
                        onClick={() => setIsSettingsModalOpen(true)}
                        className="p-2 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors border border-slate-200"
                        title="הגדרות סטטוסים"
                    >
                        <Settings size={20} />
                    </button>
                )}
            </div>

            <div className="p-4 sm:p-6 flex-grow overflow-x-hidden sm:overflow-x-auto overflow-y-auto bg-slate-50/30">
                <DndContext
                    sensors={sensors}
                    collisionDetection={(args) => {
                        const pointerCollisions = pointerWithin(args);
                        return pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args);
                    }}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                >
                    {/* FLEX container with overflow-x-auto for horizontal scroll on mobile, wrap on desktop */}
                    <div className="flex flex-nowrap sm:flex-wrap overflow-x-auto sm:overflow-x-visible snap-x snap-mandatory sm:snap-none gap-4 sm:gap-6 items-start pb-6 -mx-4 px-4 sm:mx-0 sm:px-0">
                        {activeStages.map(stage => (
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
                                        onOpenProfile={setProfileModalDeal}
                                        currentUid={currentUid}
                                        isAgent={isAgent}
                                    />
                            </SortableContext>
                        ))}

                        {/* Fallback column for deals with an unrecognised stage */}
                        {(() => {
                            const knownStageIds = new Set(activeStages.map(s => s.id));
                            const orphaned = deals.filter(d => !knownStageIds.has(d.stage));
                            if (orphaned.length === 0) return null;
                            const fallbackStage = { id: '__orphan__' as any, label: 'חדש / לא מסווג', color: 'text-slate-700', bg: 'bg-slate-100', border: 'border-slate-300', headerBg: 'bg-slate-100' };
                            return (
                                <SortableContext
                                    key="__orphan__"
                                    id="__orphan__"
                                    items={orphaned.map(d => d.id)}
                                    strategy={verticalListSortingStrategy}
                                >
                                    <DealsColumn
                                        stage={fallbackStage}
                                        deals={orphaned}
                                        leads={leads}
                                        properties={properties}
                                        onDelete={handleDelete}
                                        onOpenProfile={setProfileModalDeal}
                                        currentUid={currentUid}
                                        isAgent={isAgent}
                                    />
                                </SortableContext>
                            );
                        })()}
                    </div>


                    <DragOverlay>
                        {activeDeal ? (
                            <DealCard
                                deal={activeDeal}
                                buyer={activeDeal.buyerId ? leads.find(l => l.id === activeDeal.buyerId) : undefined}
                                seller={activeDeal.sellerId ? leads.find(l => l.id === activeDeal.sellerId) : undefined}
                                property={properties.find(p => p.id === activeDeal.propertyId)}
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

            {profileModalDeal && (
                <DealProfileModal
                    deal={profileModalDeal}
                    buyer={profileModalDeal.buyerId ? leads.find(l => l.id === profileModalDeal.buyerId) : undefined}
                    seller={profileModalDeal.sellerId ? leads.find(l => l.id === profileModalDeal.sellerId) : undefined}
                    property={properties.find(p => p.id === profileModalDeal.propertyId)}
                    stages={activeStages}
                    isOpen={!!profileModalDeal}
                    onClose={() => setProfileModalDeal(null)}
                />
            )}

            {isSettingsModalOpen && (
                <DealStagesModal
                    isOpen={isSettingsModalOpen}
                    onClose={() => setIsSettingsModalOpen(false)}
                />
            )}
        </div>
    );
}
