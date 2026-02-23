import { useState } from 'react';
import { Search, Plus, Building, Trash2, LayoutGrid, List, MessageCircle, User as UserIcon, Building2, Upload } from 'lucide-react';
import { useProperties, useAgents, useLeads, useDeals } from '../hooks/useFirestoreData';
import AddPropertyModal from '../components/modals/AddPropertyModal';
import PropertyDetailsModal from '../components/modals/PropertyDetailsModal';
import ImportModal from '../components/modals/ImportModal';
import { Property, AppUser, Lead, Deal } from '../types';
import { deleteProperty } from '../services/propertyService';

export default function Properties() {
    const { data: properties = [], loading: propertiesLoading } = useProperties();
    const { data: agents = [] } = useAgents();
    const { data: leads = [] } = useLeads();
    const { data: deals = [] } = useDeals();

    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('All');
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('grid');
    const [showAddModal, setShowAddModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
    const [selectedPropertyIds, setSelectedPropertyIds] = useState<Set<string>>(new Set());

    const handleSelectAll = () => {
        if (selectedPropertyIds.size === filtered.length) {
            setSelectedPropertyIds(new Set());
        } else {
            setSelectedPropertyIds(new Set(filtered.map((p: Property) => p.id)));
        }
    };

    const toggleSelect = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedPropertyIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleBulkDelete = async () => {
        if (!window.confirm(`למחוק ${selectedPropertyIds.size} נכסים? הפעולה אינה הפיכה.`)) return;
        try {
            await Promise.all([...selectedPropertyIds].map(id => deleteProperty(id)));
            setSelectedPropertyIds(new Set());
        } catch (err) {
            console.error('Failed to bulk delete properties', err);
            alert('שגיאה במחיקה. נסה שוב.');
        }
    };

    const filtered = properties.filter((prop: Property) => {
        const matchesSearch =
            (prop.city && prop.city.toLowerCase().includes(search.toLowerCase())) ||
            (prop.address && prop.address.toLowerCase().includes(search.toLowerCase())) || '';
        const matchesFilter = filter === 'All' || prop.type === filter;
        return matchesSearch && matchesFilter;
    });

    // Helper functions for Grid View
    const getPropertyAgent = (agentId: string) => agents.find((a: AppUser) => a.uid === agentId);

    const getPropertyClient = (propertyId: string) => {
        const relatedDeal = deals.find((d: Deal) => d.propertyId === propertyId);
        if (!relatedDeal) return null;
        return leads.find((l: Lead) => l.id === relatedDeal.leadId);
    };

    const formatPhoneForWhatsApp = (phone?: string) => {
        if (!phone) return null;
        const cleaned = phone.replace(/\D/g, '');
        if (cleaned.startsWith('0')) return `972${cleaned.substring(1)}`;
        if (cleaned.startsWith('972')) return cleaned;
        return `972${cleaned}`;
    };

    return (
        <div className="space-y-6" dir="rtl">
            {/* Header Area */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-slate-900 leading-tight">ניהול נכסים</h1>
                    <p className="text-sm text-slate-500 mt-1">{properties.length} נכסים במערכת</p>
                </div>
                <div className="flex items-center gap-3">
                    {selectedPropertyIds.size > 0 && (
                        <button
                            onClick={handleBulkDelete}
                            className="inline-flex items-center gap-2 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm animate-in fade-in zoom-in duration-200"
                        >
                            <Trash2 size={16} />
                            מחק ({selectedPropertyIds.size})
                        </button>
                    )}
                    <button
                        onClick={() => setShowImportModal(true)}
                        className="inline-flex items-center gap-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
                    >
                        <Upload size={16} />
                        ייבוא מאקסל
                    </button>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
                    >
                        <Plus size={16} />
                        הוסף נכס
                    </button>
                </div>
            </div>

            {/* Table Card wrapper */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                {/* Toolbar */}
                <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 items-center justify-between">
                    <div className="flex gap-3 w-full sm:w-auto">
                        <div className="relative flex-1 sm:w-64">
                            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="חיפוש עיר או רחוב..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all text-right placeholder-slate-400"
                            />
                        </div>
                        <div className="flex bg-slate-100 p-1 rounded-lg">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                                title="תצוגת כרטיסיות"
                            >
                                <LayoutGrid size={16} />
                            </button>
                            <button
                                onClick={() => setViewMode('table')}
                                className={`p-1.5 rounded-md transition-colors ${viewMode === 'table' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                                title="תצוגת טבלה"
                            >
                                <List size={16} />
                            </button>
                        </div>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                        {['All', 'sale', 'rent'].map((f) => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ' + (filter === f ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200')}
                            >
                                {f === 'All' ? 'הכל' : f === 'sale' ? 'למכירה' : 'להשכרה'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content Area */}
                <div className="p-4 bg-slate-50/50 min-h-[400px]">
                    {propertiesLoading ? (
                        <div className="text-center text-slate-400 text-sm py-12">טוען נתונים...</div>
                    ) : filtered.length === 0 ? (
                        <div className="text-center text-slate-400 text-sm py-12">לא נמצאו נכסים התואמים את החיפוש.</div>
                    ) : viewMode === 'grid' ? (
                        // GRID VIEW
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {filtered.map((prop: Property) => {
                                const agent = getPropertyAgent(prop.agentId);
                                const client = getPropertyClient(prop.id);
                                const imgUrl = prop.imageUrls?.[0] || 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80';

                                return (
                                    <div
                                        key={prop.id}
                                        onClick={() => setSelectedProperty(prop)}
                                        className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden flex flex-col group"
                                    >
                                        {/* Thumbnail */}
                                        <div className="relative h-48 overflow-hidden bg-slate-100">
                                            <img
                                                src={imgUrl}
                                                alt="Property"
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                            />
                                            <div className="absolute top-3 right-3 flex flex-col gap-2">
                                                <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg shadow-sm backdrop-blur-md ${prop.type === 'sale' ? 'bg-blue-600/90 text-white' : 'bg-emerald-600/90 text-white'}`}>
                                                    {prop.type === 'sale' ? 'למכירה' : 'להשכרה'}
                                                </span>
                                            </div>
                                            {prop.exclusivityEndDate && prop.exclusivityEndDate.toDate() > new Date() && (
                                                <div className="absolute top-3 left-3 bg-amber-500/90 backdrop-blur-md text-white text-xs font-bold px-2.5 py-1 rounded-lg shadow-sm">
                                                    בלעדיות
                                                </div>
                                            )}
                                        </div>

                                        {/* Details */}
                                        <div className="p-4 flex-1">
                                            <div className="flex justify-between items-start mb-2">
                                                <h3 className="font-bold text-lg text-slate-800 line-clamp-1">{prop.address}</h3>
                                                <span className="font-bold text-lg text-blue-600">₪{prop.price.toLocaleString()}</span>
                                            </div>
                                            <p className="text-sm text-slate-500 font-medium mb-4 flex items-center gap-1.5">
                                                <Building2 size={14} className="text-slate-400" />
                                                {prop.city || 'עיר לא צוינה'} {prop.rooms ? `• ${prop.rooms} חדרים` : ''}
                                            </p>

                                            {/* Contacts Area */}
                                            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100 mt-auto">
                                                {/* Agent */}
                                                <div>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">הסוכן המטפל</p>
                                                    <div className="flex items-center justify-between bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                                                        <div className="flex items-center gap-2 truncate">
                                                            <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold">
                                                                {agent?.name ? agent.name.charAt(0) : <UserIcon size={12} />}
                                                            </div>
                                                            <span className="text-xs font-semibold text-slate-700 truncate">{agent?.name || '---'}</span>
                                                        </div>
                                                        {agent?.phone && (
                                                            <a
                                                                href={`https://wa.me/${formatPhoneForWhatsApp(agent.phone)}`}
                                                                target="_blank" rel="noreferrer"
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="text-emerald-500 hover:text-emerald-600 p-1 hover:bg-emerald-50 rounded-md transition-colors flex-shrink-0"
                                                                title={`שלח הודעה ל${agent.name}`}
                                                            >
                                                                <MessageCircle size={14} />
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Client */}
                                                <div>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">פרטי לקוח</p>
                                                    <div className="flex items-center justify-between bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                                                        <div className="flex items-center gap-2 truncate">
                                                            <div className="w-6 h-6 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-[10px] font-bold">
                                                                {client?.name ? client.name.charAt(0) : <UserIcon size={12} />}
                                                            </div>
                                                            <span className="text-xs font-semibold text-slate-700 truncate">{client?.name || 'לא שויך'}</span>
                                                        </div>
                                                        {client?.phone && (
                                                            <a
                                                                href={`https://wa.me/${formatPhoneForWhatsApp(client.phone)}`}
                                                                target="_blank" rel="noreferrer"
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="text-emerald-500 hover:text-emerald-600 p-1 hover:bg-emerald-50 rounded-md transition-colors flex-shrink-0"
                                                                title={`שלח הודעה ללקוח`}
                                                            >
                                                                <MessageCircle size={14} />
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        // TABLE VIEW
                        <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
                            <table className="w-full text-right border-collapse">
                                <thead className="bg-slate-50 border-b border-slate-100">
                                    <tr>
                                        <th className="px-4 py-3 w-12 text-center">
                                            <input
                                                type="checkbox"
                                                checked={filtered.length > 0 && selectedPropertyIds.size === filtered.length}
                                                onChange={handleSelectAll}
                                                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                            />
                                        </th>
                                        {['כתובת', 'סוג', 'מחיר', 'חדרים ושטח', 'בלעדיות', 'סוכן', 'לקוח', 'פעולות'].map((h) => (
                                            <th key={h} className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filtered.map((prop: Property) => {
                                        const agent = getPropertyAgent(prop.agentId);
                                        const client = getPropertyClient(prop.id);

                                        return (
                                            <tr
                                                key={prop.id}
                                                onClick={() => setSelectedProperty(prop)}
                                                className={`hover:bg-slate-50/80 transition-colors group cursor-pointer ${selectedPropertyIds.has(prop.id) ? 'bg-blue-50/60' : ''}`}
                                            >
                                                <td className="px-4 py-4 text-center" onClick={e => toggleSelect(prop.id, e)}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedPropertyIds.has(prop.id)}
                                                        onChange={() => { }}
                                                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                    />
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${prop.type === 'sale' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                                            <Building size={18} />
                                                        </div>
                                                        <div>
                                                            <span className="block text-sm font-semibold text-slate-800">{prop.address} {prop.city ? `, ${prop.city}` : ''}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 align-top">
                                                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${prop.type === 'sale' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                                        {prop.type === 'sale' ? 'למכירה' : 'להשכרה'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4 align-top">
                                                    <span className="block text-sm font-bold text-slate-700">₪{prop.price.toLocaleString()}</span>
                                                </td>
                                                <td className="px-4 py-4 align-top">
                                                    <div className="text-sm text-slate-600">
                                                        {prop.rooms ? `${prop.rooms} חדרים` : '-'}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 align-top">
                                                    {prop.exclusivityEndDate && prop.exclusivityEndDate.toDate() > new Date() ? (
                                                        <span className="inline-flex text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100">
                                                            בבלעדיות
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-slate-400">-</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-4 align-top">
                                                    <div className="text-sm font-medium text-slate-700">{agent?.name || 'לא משויך'}</div>
                                                </td>
                                                <td className="px-4 py-4 align-top">
                                                    <div className="text-sm font-medium text-slate-700">{client?.name || '-'}</div>
                                                </td>
                                                <td className="px-4 py-4 align-top">
                                                    <button
                                                        onClick={async (e) => {
                                                            e.stopPropagation();
                                                            if (window.confirm('האם אתה בטוח שברצונך למחוק את הנכס?')) {
                                                                try {
                                                                    await deleteProperty(prop.id);
                                                                } catch (err) {
                                                                    console.error('Failed to delete property', err);
                                                                    alert('שגיאה במחיקת הנכס. נסה שוב.');
                                                                }
                                                            }
                                                        }}
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                                                        title="מחק נכס"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Pagination (Mock) */}
                <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <p className="text-xs text-slate-500">
                        מציג <span className="font-semibold text-slate-700">{filtered.length}</span> רשומות
                    </p>
                </div>
            </div>

            <AddPropertyModal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
            />

            <ImportModal
                isOpen={showImportModal}
                onClose={() => setShowImportModal(false)}
                defaultEntityType="property"
            />

            {selectedProperty && (
                <PropertyDetailsModal
                    property={selectedProperty}
                    onClose={() => setSelectedProperty(null)}
                />
            )}
        </div>
    );
}
