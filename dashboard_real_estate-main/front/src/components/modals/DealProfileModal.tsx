import { X, Calendar, DollarSign, User, MapPin, Building2, TrendingUp, Clock, FileText, CheckSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Deal, Lead, Property, CustomDealStage } from '../../types';

interface DealProfileModalProps {
    deal: Deal;
    lead?: Lead;
    property?: Property;
    stages: CustomDealStage[];
    isOpen: boolean;
    onClose: () => void;
}

export default function DealProfileModal({ deal, lead, property, stages, isOpen, onClose }: DealProfileModalProps) {
    if (!isOpen) return null;

    const currentStageInfo = stages.find(s => s.id === deal.stage) || { label: deal.stage, color: 'text-slate-700', bg: 'bg-slate-100' };

    // Formatting dates safely
    const createdDate = deal.createdAt?.toMillis ? new Date(deal.createdAt.toMillis()) : new Date();
    const updatedDate = deal.updatedAt?.toMillis ? new Date(deal.updatedAt.toMillis()) : createdDate;

    // Calculate days active
    const daysActive = Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm" dir="rtl">
            <div className="w-full max-w-4xl bg-slate-50 rounded-[2rem] shadow-2xl flex flex-col overflow-hidden max-h-[90vh] animate-in slide-in-from-bottom-8 duration-300">

                {/* Header (Property Image + Title overlay) */}
                <div className="relative h-48 md:h-64 bg-slate-800 shrink-0">
                    {property?.images && property.images.length > 0 ? (
                        <img
                            src={property.images[0]}
                            alt={property.address}
                            className="w-full h-full object-cover opacity-60"
                        />
                    ) : (
                        <div className="w-full h-full bg-gradient-to-br from-blue-900 to-slate-900" />
                    )}

                    <button
                        onClick={onClose}
                        className="absolute top-4 left-4 p-2 bg-white/20 hover:bg-white/40 backdrop-blur-md rounded-full text-white transition-all"
                    >
                        <X size={20} />
                    </button>

                    <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-slate-900/90 to-transparent flex items-end justify-between">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <span className={`px-3 py-1 rounded-full text-xs font-bold ${currentStageInfo.bg} ${currentStageInfo.color} shadow-sm border border-white/20 backdrop-blur-sm`}>
                                    {currentStageInfo.label}
                                </span>
                                {deal.stage === 'won' && (
                                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                                        <TrendingUp size={12} /> עסקת זהב
                                    </span>
                                )}
                            </div>
                            <h2 className="text-2xl md:text-3xl font-black text-white drop-shadow-md">
                                {property?.address || 'נכס לא משויך'}
                            </h2>
                            {property?.city && (
                                <p className="text-slate-300 flex items-center gap-1 mt-1 text-sm font-medium">
                                    <MapPin size={14} /> {property.city}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 md:p-8">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                        {/* Right column - Financials & Details */}
                        <div className="lg:col-span-2 space-y-6">

                            {/* Commission Card */}
                            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-bold text-slate-400 mb-1 flex items-center gap-1.5">
                                        <DollarSign size={16} /> עמלה מיועדת
                                    </p>
                                    <p className="text-3xl font-black text-blue-700">
                                        ₪{deal.projectedCommission?.toLocaleString()}
                                    </p>
                                </div>
                                {deal.actualCommission !== undefined && (
                                    <div className="text-left">
                                        <p className="text-sm font-bold text-emerald-600/70 mb-1 flex items-center gap-1.5 justify-end">
                                            <CheckSquare size={16} /> נסגר בפועל
                                        </p>
                                        <p className="text-3xl font-black text-emerald-600">
                                            ₪{deal.actualCommission.toLocaleString()}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Timeline & Metadata */}
                            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                                    <Calendar size={18} className="text-blue-500" /> ציר זמן
                                </h3>

                                <div className="space-y-4">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                                            <Clock size={18} className="text-slate-400" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-900">נוצר במערכת</p>
                                            <p className="text-xs text-slate-500 mt-0.5">{createdDate.toLocaleDateString('he-IL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                                            <TrendingUp size={18} className="text-blue-500" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-900">עדכון אחרון בשלבים</p>
                                            <p className="text-xs text-slate-500 mt-0.5">{updatedDate.toLocaleDateString('he-IL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-6 pt-5 border-t border-slate-100">
                                    <p className="text-sm font-medium text-slate-600 flex justify-between items-center">
                                        <span>ימים בפייפליין העסקאות:</span>
                                        <span className="font-bold text-slate-900 bg-slate-100 px-3 py-1 rounded-lg">
                                            {daysActive} ימים
                                        </span>
                                    </p>
                                </div>
                            </div>

                            {/* Notes */}
                            {deal.notes && (
                                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                    <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                                        <FileText size={16} className="text-slate-400" /> הערות עסקה
                                    </h3>
                                    <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100">
                                        {deal.notes}
                                    </p>
                                </div>
                            )}

                        </div>

                        {/* Left column - Entities (Lead, Agent, Property Profile) */}
                        <div className="space-y-4">

                            {/* Lead Profile */}
                            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                                <p className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">לקוח משויך</p>
                                {lead ? (
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-lg font-black shrink-0">
                                            {lead.name.substring(0, 1)}
                                        </div>
                                        <div>
                                            <Link to={`/leads?search=${encodeURIComponent(lead.name)}`} className="text-base font-bold text-slate-900 hover:text-blue-600 hover:underline">
                                                {lead.name}
                                            </Link>
                                            <p className="text-sm text-slate-500 mt-0.5">{lead.phone}</p>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-slate-500 italic">ליד לא נמצא או נמחק</p>
                                )}
                            </div>

                            {/* Agent Profile */}
                            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                                <p className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">סוכן מטפל</p>
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-lg font-black shrink-0 border border-slate-200">
                                        <User size={20} />
                                    </div>
                                    <div>
                                        <div className="text-base font-bold text-slate-900">
                                            {/* Currently createdBy holds ID/name. In a real expansion this links to /agents */}
                                            {deal.createdBy || 'סוכן כלשהו'}
                                        </div>
                                        <p className="text-xs text-slate-400 mt-0.5 font-bold tracking-wide uppercase">צוות hOMER</p>
                                    </div>
                                </div>
                            </div>

                            {/* Property Extra summary */}
                            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                                <p className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">תקציר הנכס</p>
                                {property ? (
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 text-slate-400 flex items-center justify-center shrink-0">
                                            <Building2 size={24} />
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold text-slate-900">
                                                {property.type === 'sale' ? 'למכירה' : 'להשכרה'} / {property.rooms} חדרים
                                            </div>
                                            <p className="text-sm text-slate-500 mt-0.5 font-semibold">
                                                ₪{property.price.toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-slate-500 italic">פרטי נכס חסרים</p>
                                )}
                            </div>

                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
