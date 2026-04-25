import React, { useState, useMemo, useRef, useEffect } from 'react';
import { X, Search, Sparkles, Check, Home, MapPin, DollarSign, Zap, Layers, Clock, Car, Wind, Shield, Loader2, Filter, Trash2 } from 'lucide-react';
import { Property } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { createCatalog } from '../../services/catalogService';
import { formatNumberWithCommas, parseFormattedNumber } from '../../utils/formatters';
import { PrioritySelector } from '../common/PrioritySelector';
import { httpsCallable, getFunctions } from 'firebase/functions';
import { app } from '../../config/firebase';

interface PropertyCatalogCreatorModalProps {
    properties: Property[];
    onClose: () => void;
    onSuccess?: (catalogId: string) => void;
}

const PROPERTY_KINDS = ['דירה', 'דירת גן', 'וילה', 'פנטהאוז', 'דופלקס', 'קוטג׳'];

export default function PropertyCatalogCreatorModal({ properties, onClose, onSuccess }: PropertyCatalogCreatorModalProps) {
    const { userData } = useAuth();
    
    // --- Step State ---
    const [step, setStep] = useState<'select' | 'details'>('select');
    const [isGenerating, setIsGenerating] = useState(false);
    const [title, setTitle] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // --- Filter State (Requirements) ---
    const [searchTerm, setSearchTerm] = useState('');
    const [desiredCities, setDesiredCities] = useState<string[]>([]);
    const [cityQuery, setCityQuery] = useState('');
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const suggestionsRef = useRef<HTMLDivElement>(null);

    const [desiredNeighborhoods, setDesiredNeighborhoods] = useState<string[]>([]);
    const [neighborhoodInput, setNeighborhoodInput] = useState('');
    const [desiredStreets, setDesiredStreets] = useState<string[]>([]);
    const [streetInput, setStreetInput] = useState('');

    const [transactionType, setTransactionType] = useState<'sale' | 'rent' | 'all'>('all');
    const [maxBudget, setMaxBudget] = useState('');
    const [minRooms, setMinRooms] = useState<number | 'all'>('all');
    const [maxRooms, setMaxRooms] = useState<number | 'all'>('all');
    const [minArea, setMinArea] = useState('');
    const [floorMin, setFloorMin] = useState('');
    const [floorMax, setFloorMax] = useState('');
    const [selectedPropertyKinds, setSelectedPropertyKinds] = useState<string[]>([]);

    const [mustHaveElevator, setMustHaveElevator] = useState(false);
    const [mustHaveParking, setMustHaveParking] = useState(false);
    const [mustHaveBalcony, setMustHaveBalcony] = useState(false);
    const [mustHaveSafeRoom, setMustHaveSafeRoom] = useState(false);
    const [condition, setCondition] = useState<'new' | 'renovated' | 'needs_renovation' | 'any'>('any');
    const [urgency, setUrgency] = useState<'immediate' | '1-3_months' | '3-6_months' | 'flexible'>('flexible');

    // --- Weights ---
    const [weights, setWeights] = useState({
        budget: 5,
        rooms: 5,
        location: 5,
        amenities: 5
    });

    // --- Filtering Logic ---
    const filteredProperties = useMemo(() => {
        return properties.filter(p => {
            // 1. Basic Text Search
            const text = searchTerm.toLowerCase();
            const matchesSearch = !text || 
                (p.address?.city || '').toLowerCase().includes(text) ||
                (p.address?.street || '').toLowerCase().includes(text) ||
                (p.propertyType || '').toLowerCase().includes(text);
            if (!matchesSearch) return false;

            // 2. Cities
            if (desiredCities.length > 0) {
                const city = (p.address?.city || '').trim();
                if (!desiredCities.some(c => c.trim() === city)) return false;
            }

            // 3. Neighborhoods
            if (desiredNeighborhoods.length > 0) {
                const neighborhood = (p.address?.neighborhood || '').trim();
                if (!desiredNeighborhoods.some(n => n.trim() === neighborhood)) return false;
            }

            // 4. Streets
            if (desiredStreets.length > 0) {
                const street = (p.address?.street || '').trim();
                if (!desiredStreets.some(s => s.trim() === street)) return false;
            }

            // 5. Transaction Type
            if (transactionType !== 'all') {
                const target = transactionType === 'sale' ? 'forsale' : 'rent';
                if (p.transactionType !== target) return false;
            }

            // 6. Budget
            if (maxBudget) {
                const price = p.price || 0;
                if (price > parseFloat(maxBudget)) return false;
            }

            // 7. Property Kinds
            if (selectedPropertyKinds.length > 0) {
                if (!selectedPropertyKinds.includes(p.propertyType || '')) return false;
            }

            // 8. Rooms
            const rooms = p.rooms || 0;
            if (minRooms !== 'all' && rooms < (minRooms as number)) return false;
            if (maxRooms !== 'all' && rooms > (maxRooms as number)) return false;

            // 9. Area
            if (minArea && (p.sizeSqf || 0) < parseFloat(minArea)) return false;

            // 10. Floor
            const floor = p.floor || 0;
            if (floorMin && floor < parseInt(floorMin)) return false;
            if (floorMax && floor > parseInt(floorMax)) return false;

            // 11. Amenities
            if (mustHaveElevator && !p.hasElevator) return false;
            if (mustHaveParking && !p.hasParking) return false;
            if (mustHaveBalcony && !p.hasBalcony) return false;
            if (mustHaveSafeRoom && !p.hasSafeRoom) return false;

            // 12. Condition
            if (condition !== 'any' && p.condition !== condition) return false;

            return true;
        }).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    }, [properties, searchTerm, desiredCities, desiredNeighborhoods, desiredStreets, transactionType, maxBudget, selectedPropertyKinds, minRooms, maxRooms, minArea, floorMin, floorMax, mustHaveElevator, mustHaveParking, mustHaveBalcony, mustHaveSafeRoom, condition]);

    // --- Helpers ---
    const toggleProperty = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const toggleAllFiltered = () => {
        const next = new Set(selectedIds);
        const allFilteredIds = filteredProperties.map(p => p.id);
        const areAllSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => next.has(id));
        if (areAllSelected) allFilteredIds.forEach(id => next.delete(id));
        else allFilteredIds.forEach(id => next.add(id));
        setSelectedIds(next);
    };

    const clearFilters = () => {
        setSearchTerm('');
        setDesiredCities([]);
        setDesiredNeighborhoods([]);
        setDesiredStreets([]);
        setTransactionType('all');
        setMaxBudget('');
        setMinRooms('all');
        setMaxRooms('all');
        setMinArea('');
        setFloorMin('');
        setFloorMax('');
        setSelectedPropertyKinds([]);
        setMustHaveElevator(false);
        setMustHaveParking(false);
        setMustHaveBalcony(false);
        setMustHaveSafeRoom(false);
        setCondition('any');
        setUrgency('flexible');
    };

    // --- Google Places Logic ---
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) setSuggestions([]);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchSuggestions = async (query: string) => {
        if (!query || query.length < 2) { setSuggestions([]); return; }
        setIsSearching(true);
        try {
            const fns = getFunctions(app, 'europe-west1');
            const getSuggestions = httpsCallable(fns, 'properties-getAddressSuggestions');
            const res = await getSuggestions({ query });
            const data = res.data;
            let results: any[] = [];
            if (Array.isArray(data)) results = data;
            else if (data && typeof data === 'object' && Array.isArray((data as any).predictions)) results = (data as any).predictions;
            setSuggestions(results.slice(0, 5));
        } catch (error) {
            console.error('Error fetching city suggestions:', error);
            setSuggestions([]);
        } finally {
            setIsSearching(false);
        }
    };

    const searchTimeout = useRef<any>(null);
    const handleCityQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setCityQuery(val);
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        if (!val || val.length < 2) { setSuggestions([]); return; }
        searchTimeout.current = setTimeout(() => fetchSuggestions(val), 400);
    };

    const addCityTag = (city: string) => {
        if (city && !desiredCities.includes(city)) setDesiredCities(prev => [...prev, city]);
        setCityQuery('');
        setSuggestions([]);
    };

    const removeCityTag = (city: string) => setDesiredCities(prev => prev.filter(c => c !== city));

    const handleCreate = async () => {
        if (!userData?.agencyId || selectedIds.size === 0) return;
        setIsGenerating(true);
        try {
            const selectedProps = properties.filter(p => selectedIds.has(p.id));
            const propertyItems = selectedProps.map(p => ({
                id: p.id,
                collectionPath: (p as any).collectionPath || (p.isGlobalCityProperty ? `cities/${p.address?.city?.toLowerCase().replace(/\s+/g, '-')}/properties` : `agencies/${userData.agencyId}/properties`)
            }));

            // Prepare requirements to save
            const requirements = {
                desiredCity: desiredCities,
                desiredNeighborhoods,
                desiredStreet: desiredStreets,
                maxBudget: maxBudget ? parseFloat(maxBudget) : null,
                minRooms: minRooms === 'all' ? null : minRooms,
                maxRooms: maxRooms === 'all' ? null : maxRooms,
                minSizeSqf: minArea ? parseInt(minArea) : null,
                floorMin: floorMin ? parseInt(floorMin) : null,
                floorMax: floorMax ? parseInt(floorMax) : null,
                propertyType: selectedPropertyKinds,
                mustHaveElevator,
                mustHaveParking,
                mustHaveBalcony,
                mustHaveSafeRoom,
                condition,
                urgency,
                weights,
                transactionType: transactionType === 'all' ? 'sale' : transactionType
            };

            const catalogId = await createCatalog(
                userData.agencyId,
                null,
                undefined,
                propertyItems,
                title,
                requirements
            );

            onSuccess?.(catalogId);
            onClose();
        } catch (error) {
            console.error('Failed to create catalog', error);
            alert('שגיאה ביצירת הקטלוג');
        } finally {
            setIsGenerating(false);
        }
    };

    const labelCls = 'block text-xs font-black text-slate-500 mb-2 uppercase tracking-wider';
    const inputCls = 'w-full bg-slate-800/40 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all font-bold';
    const sectionCls = 'space-y-4 p-5 bg-slate-800/20 border border-slate-800/50 rounded-2xl';
    const sectionTitleCls = 'flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-[0.1em] mb-4';

    const MustHaveBtn = ({ icon: Icon, label, active, onClick }: { icon: any; label: string; active: boolean; onClick: () => void }) => (
        <button
            type="button"
            onClick={onClick}
            className={`flex flex-col items-center gap-2 p-3 rounded-xl border text-[10px] font-black transition-all ${active
                ? 'bg-blue-600/20 text-blue-400 border-blue-500/50 shadow-lg shadow-blue-500/10'
                : 'bg-slate-800/40 text-slate-500 border-slate-700 hover:bg-slate-800/60 hover:border-slate-600'
                }`}
        >
            <Icon size={16} />
            {label}
        </button>
    );

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 md:p-8 bg-slate-950/80 backdrop-blur-xl" dir="rtl">
            <div className="bg-slate-900 border border-slate-800 w-full max-w-7xl h-full max-h-[95vh] rounded-[32px] md:rounded-[48px] shadow-[0_0_100px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-500">
                
                {/* Header */}
                <div className="flex items-center justify-between p-6 md:p-8 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-10">
                    <div className="flex items-center gap-4 md:gap-6">
                        <div className="w-12 h-12 md:w-16 md:h-16 rounded-[20px] md:rounded-[24px] bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-[0_8px_24px_rgba(37,99,235,0.3)] transform -rotate-3 hover:rotate-0 transition-transform">
                            <Sparkles size={24} className="md:w-8 md:h-8" />
                        </div>
                        <div>
                            <h2 className="text-xl md:text-3xl font-black text-white tracking-tight leading-none">יצירת קטלוג חכם</h2>
                            <p className="text-slate-400 text-sm font-bold mt-2 opacity-80">סנן נכסים לפי דרישות מדויקות וצור קטלוג משותף</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={clearFilters}
                            className="hidden md:flex items-center gap-2 px-5 py-3 rounded-2xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all text-xs font-black uppercase tracking-widest"
                        >
                            <Trash2 size={16} />
                            נקה מסננים
                        </button>
                        <button onClick={onClose} className="p-3 text-slate-500 hover:text-white hover:bg-slate-800 rounded-2xl transition-all border border-transparent hover:border-slate-700">
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Main Layout */}
                <div className="flex-1 flex overflow-hidden">
                    {step === 'select' ? (
                        <>
                            {/* Right Sidebar: Filters ( Requirements ) */}
                            <div className="w-[380px] border-l border-slate-800 flex flex-col bg-slate-900/50 overflow-hidden hidden lg:flex">
                                <div className="p-4 border-b border-slate-800 bg-slate-900 flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-blue-400 font-black text-xs uppercase tracking-widest">
                                        <Filter size={14} />
                                        דרישות וסינון
                                    </div>
                                    <div className="text-[10px] font-black text-slate-500 bg-slate-800 px-2 py-1 rounded-md">
                                        {filteredProperties.length} תוצאות
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
                                    
                                    {/* Location & Budget */}
                                    <div className={sectionCls}>
                                        <div className={sectionTitleCls}><MapPin size={12} className="text-blue-500" />מיקום ותקציב</div>
                                        
                                        <div className="relative" ref={suggestionsRef}>
                                            <label className={labelCls}>עיר (Google Maps)</label>
                                            <div className="relative">
                                                <input
                                                    value={cityQuery}
                                                    onChange={handleCityQueryChange}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') { e.preventDefault(); if (cityQuery.trim()) addCityTag(cityQuery.trim()); }
                                                    }}
                                                    placeholder="חפש עיר..."
                                                    className={inputCls}
                                                />
                                                {isSearching && <div className="absolute left-3 top-1/2 -translate-y-1/2"><Loader2 size={14} className="animate-spin text-slate-400" /></div>}
                                            </div>
                                            {suggestions.length > 0 && (
                                                <ul className="absolute z-[100] w-full mt-2 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl max-h-48 overflow-y-auto overflow-x-hidden backdrop-blur-xl">
                                                    {suggestions.map((s, i) => {
                                                        const mainText = s.structured_formatting?.main_text || s.display_name || s.description || '';
                                                        return (
                                                            <li key={i} onClick={() => addCityTag(mainText)}
                                                                className="px-4 py-3 text-sm text-slate-300 hover:bg-blue-600/20 hover:text-white cursor-pointer border-b border-slate-700/50 last:border-0 transition-colors font-bold">
                                                                {mainText}
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            )}
                                            {desiredCities.length > 0 && (
                                                <div className="flex flex-wrap gap-1.5 mt-3">
                                                    {desiredCities.map(city => (
                                                        <span key={city} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-600/10 text-blue-400 rounded-xl text-[10px] font-black border border-blue-500/20">
                                                            {city}
                                                            <button onClick={() => removeCityTag(city)} className="hover:text-red-500 transition-colors"><X size={12} /></button>
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className={labelCls}>שכונה</label>
                                                <input value={neighborhoodInput} onChange={e => setNeighborhoodInput(e.target.value)} onKeyDown={e => { if(e.key === 'Enter') { e.preventDefault(); const v = neighborhoodInput.trim(); if(v && !desiredNeighborhoods.includes(v)) setDesiredNeighborhoods(p=>[...p, v]); setNeighborhoodInput(''); } }} placeholder="הוסף..." className={inputCls} />
                                            </div>
                                            <div>
                                                <label className={labelCls}>רחוב</label>
                                                <input value={streetInput} onChange={e => setStreetInput(e.target.value)} onKeyDown={e => { if(e.key === 'Enter') { e.preventDefault(); const v = streetInput.trim(); if(v && !desiredStreets.includes(v)) setDesiredStreets(p=>[...p, v]); setStreetInput(''); } }} placeholder="הוסף..." className={inputCls} />
                                            </div>
                                        </div>

                                        <div>
                                            <label className={labelCls}>תקציב מקסימלי (₪)</label>
                                            <input type="text" inputMode="numeric" value={formatNumberWithCommas(maxBudget)} onChange={e => setMaxBudget(parseFormattedNumber(e.target.value))} placeholder="ללא הגבלה" className={inputCls} dir="ltr" />
                                        </div>

                                        <div>
                                            <label className={labelCls}>דחיפות</label>
                                            <div className="grid grid-cols-2 gap-1.5">
                                                {[
                                                    { id: 'immediate', label: '⚡ מיידי' },
                                                    { id: '1-3_months', label: '1–3 חודשים' },
                                                    { id: '3-6_months', label: '3–6 חודשים' },
                                                    { id: 'flexible', label: 'גמיש' }
                                                ].map(u => (
                                                    <button 
                                                        key={u.id} 
                                                        onClick={() => setUrgency(u.id as any)} 
                                                        className={`py-2 text-[10px] font-black rounded-xl transition-all border ${
                                                            urgency === u.id 
                                                            ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/20' 
                                                            : 'bg-slate-800/40 text-slate-500 border-slate-700 hover:bg-slate-800/60'
                                                        }`}
                                                    >
                                                        {u.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Property Specs */}
                                    <div className={sectionCls}>
                                        <div className={sectionTitleCls}><Home size={12} className="text-emerald-500" />מאפייני הנכס</div>
                                        
                                        <div>
                                            <label className={labelCls}>סוג עסקה</label>
                                            <div className="grid grid-cols-3 gap-1.5 bg-slate-800/40 p-1 rounded-xl">
                                                {[
                                                    { id: 'all', label: 'הכל' },
                                                    { id: 'sale', label: 'קנייה' },
                                                    { id: 'rent', label: 'שכירות' }
                                                ].map(t => (
                                                    <button key={t.id} onClick={() => setTransactionType(t.id as any)} className={`py-1.5 text-[10px] font-black rounded-lg transition-all ${transactionType === t.id ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>{t.label}</button>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <label className={labelCls}>סוגי נכס</label>
                                            <div className="flex flex-wrap gap-1.5">
                                                {PROPERTY_KINDS.map(k => (
                                                    <button key={k} onClick={() => setSelectedPropertyKinds(p => p.includes(k) ? p.filter(x => x !== k) : [...p, k])}
                                                        className={`text-[10px] font-black px-2.5 py-1.5 rounded-lg border transition-all ${selectedPropertyKinds.includes(k) ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/50' : 'bg-slate-800/40 text-slate-500 border-slate-700 hover:bg-slate-800/60'}`}>{k}</button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className={labelCls}>חדרים (מין׳)</label>
                                                <select value={minRooms} onChange={e => setMinRooms(e.target.value === 'all' ? 'all' : Number(e.target.value))} className={inputCls}>
                                                    <option value="all">הכל</option>
                                                    {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}{n === 6 ? '+' : ''}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className={labelCls}>חדרים (מקס׳)</label>
                                                <select value={maxRooms} onChange={e => setMaxRooms(e.target.value === 'all' ? 'all' : Number(e.target.value))} className={inputCls}>
                                                    <option value="all">הכל</option>
                                                    {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}{n === 6 ? '+' : ''}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className={labelCls}>שטח מינימלי (מ"ר)</label>
                                                <input type="number" value={minArea} onChange={e => setMinArea(e.target.value)} placeholder="0" className={inputCls} dir="ltr" />
                                            </div>
                                            <div>
                                                <label className={labelCls}>קומה (מין/מקס)</label>
                                                <div className="flex gap-1.5 items-center">
                                                    <input type="number" value={floorMin} onChange={e => setFloorMin(e.target.value)} placeholder="0" className={inputCls + ' text-center px-1'} dir="ltr" />
                                                    <input type="number" value={floorMax} onChange={e => setFloorMax(e.target.value)} placeholder="30" className={inputCls + ' text-center px-1'} dir="ltr" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Amenities */}
                                    <div className={sectionCls}>
                                        <div className={sectionTitleCls}><Zap size={12} className="text-purple-500" />חובה בנכס</div>
                                        <div className="grid grid-cols-4 gap-2">
                                            <MustHaveBtn icon={Layers} label="מעלית" active={mustHaveElevator} onClick={() => setMustHaveElevator(p => !p)} />
                                            <MustHaveBtn icon={Car} label="חניה" active={mustHaveParking} onClick={() => setMustHaveParking(p => !p)} />
                                            <MustHaveBtn icon={Wind} label="מרפסת" active={mustHaveBalcony} onClick={() => setMustHaveBalcony(p => !p)} />
                                            <MustHaveBtn icon={Shield} label='ממ"ד' active={mustHaveSafeRoom} onClick={() => setMustHaveSafeRoom(p => !p)} />
                                        </div>
                                    </div>

                                    {/* Priorities */}
                                    <div className={sectionCls}>
                                        <div className={sectionTitleCls}><Layers size={12} className="text-amber-500" />עדיפויות וחשיבות</div>
                                        <div className="space-y-4 pt-2">
                                            <PrioritySelector label="תקציב" value={weights.budget} onChange={v => setWeights(p=>({...p, budget: v}))} theme="dark" />
                                            <PrioritySelector label="חדרים" value={weights.rooms} onChange={v => setWeights(p=>({...p, rooms: v}))} theme="dark" />
                                            <PrioritySelector label="מיקום" value={weights.location} onChange={v => setWeights(p=>({...p, location: v}))} theme="dark" />
                                            <PrioritySelector label="אבזור" value={weights.amenities} onChange={v => setWeights(p=>({...p, amenities: v}))} theme="dark" />
                                        </div>
                                    </div>

                                </div>
                            </div>

                            {/* Main Grid: Properties */}
                            <div className="flex-1 flex flex-col min-w-0 bg-slate-950/20 overflow-hidden">
                                
                                {/* Toolbar */}
                                <div className="p-6 bg-slate-900 border-b border-slate-800 flex flex-col md:flex-row gap-4 items-center justify-between">
                                    <div className="relative flex-1 max-w-xl w-full">
                                        <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                                        <input
                                            type="text"
                                            placeholder="חיפוש מהיר בתוצאות..."
                                            className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl pr-12 pl-4 py-3.5 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-bold"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                        />
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <button 
                                            onClick={toggleAllFiltered}
                                            disabled={filteredProperties.length === 0}
                                            className="px-6 py-3.5 bg-slate-800 border border-slate-700 rounded-2xl text-white font-black hover:bg-slate-700 transition-all text-xs flex items-center gap-3 disabled:opacity-50 uppercase tracking-widest"
                                        >
                                            <Check size={18} className={filteredProperties.length > 0 && filteredProperties.every(p => selectedIds.has(p.id)) ? 'text-emerald-400' : 'text-blue-400'} />
                                            {filteredProperties.length > 0 && filteredProperties.every(p => selectedIds.has(p.id)) ? 'בטל בחירה' : 'בחר הכל'}
                                        </button>
                                        <div className="h-10 w-px bg-slate-800 mx-2" />
                                        <div className="flex items-center gap-3 px-6 py-3.5 bg-blue-600/10 border border-blue-500/20 rounded-2xl text-blue-400 font-black whitespace-nowrap">
                                            <span className="text-xl leading-none">{selectedIds.size}</span>
                                            <span className="text-[10px] uppercase tracking-widest mt-0.5">נבחרו</span>
                                        </div>
                                    </div>
                                </div>

                                {/* List */}
                                <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                                    {filteredProperties.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-center p-12 bg-slate-900/30 rounded-[40px] border-2 border-dashed border-slate-800">
                                            <div className="w-24 h-24 rounded-full bg-slate-800/50 flex items-center justify-center mb-6">
                                                <Home size={40} className="text-slate-600" />
                                            </div>
                                            <h3 className="text-xl font-black text-white mb-2">לא נמצאו נכסים תואמים</h3>
                                            <p className="text-slate-500 font-bold max-w-sm">נסה לשנות את דרישות הסינון או להרחיב את החיפוש שלך</p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                            {filteredProperties.map(property => (
                                                <div 
                                                    key={property.id}
                                                    onClick={() => toggleProperty(property.id)}
                                                    className={`group relative cursor-pointer rounded-[32px] overflow-hidden transition-all duration-300 border-2 ${
                                                        selectedIds.has(property.id) 
                                                        ? 'border-blue-500 bg-blue-600/10 ring-4 ring-blue-500/10 scale-[0.98]' 
                                                        : 'border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/60'
                                                    }`}
                                                >
                                                    <div className="aspect-[16/10] overflow-hidden relative">
                                                        <img 
                                                            src={property.images?.[0] || 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=1000&auto=format&fit=crop'} 
                                                            alt={property.address?.city}
                                                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                                                        />
                                                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-60" />
                                                        
                                                        {/* Status Badges */}
                                                        <div className="absolute top-4 right-4 flex flex-col gap-2">
                                                            <span className="px-3 py-1 rounded-full bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest shadow-lg">
                                                                {property.transactionType === 'forsale' ? 'מכירה' : 'השכרה'}
                                                            </span>
                                                            {property.isGlobalCityProperty && (
                                                                <span className="px-3 py-1 rounded-full bg-amber-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center gap-1">
                                                                    <Sparkles size={10} /> מאגר כללי
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Selection Indicator */}
                                                        <div className={`absolute top-4 left-4 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 border-2 shadow-xl ${
                                                            selectedIds.has(property.id) 
                                                            ? 'bg-blue-600 border-white scale-110' 
                                                            : 'bg-white/20 backdrop-blur-md border-white/40 opacity-0 group-hover:opacity-100'
                                                        }`}>
                                                            {selectedIds.has(property.id) && <Check size={16} className="text-white" />}
                                                        </div>
                                                    </div>

                                                    <div className="p-6">
                                                        <div className="flex justify-between items-start mb-4">
                                                            <div>
                                                                <h4 className="text-lg font-black text-white leading-tight group-hover:text-blue-400 transition-colors">
                                                                    {property.address?.street} {property.address?.streetNumber}
                                                                </h4>
                                                                <p className="text-slate-500 font-bold text-sm">{property.address?.city}</p>
                                                            </div>
                                                            <div className="text-left">
                                                                <div className="text-blue-400 font-black text-lg">₪{property.price?.toLocaleString()}</div>
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-3 gap-2 border-t border-slate-800 pt-4">
                                                            <div className="flex flex-col items-center p-2 rounded-xl bg-slate-800/30">
                                                                <span className="text-[10px] font-black text-slate-500 uppercase">חדרים</span>
                                                                <span className="text-sm font-black text-slate-300">{property.rooms}</span>
                                                            </div>
                                                            <div className="flex flex-col items-center p-2 rounded-xl bg-slate-800/30">
                                                                <span className="text-[10px] font-black text-slate-500 uppercase">מ"ר</span>
                                                                <span className="text-sm font-black text-slate-300">{property.sizeSqf}</span>
                                                            </div>
                                                            <div className="flex flex-col items-center p-2 rounded-xl bg-slate-800/30">
                                                                <span className="text-[10px] font-black text-slate-500 uppercase">קומה</span>
                                                                <span className="text-sm font-black text-slate-300">{property.floor}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    ) : (
                        /* Step 2: Details (Naming the catalog) */
                        <div className="flex-1 flex items-center justify-center p-8 bg-slate-950/40">
                            <div className="w-full max-w-xl bg-slate-900/80 border border-slate-800 rounded-[48px] p-10 md:p-14 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-8">
                                <div className="w-24 h-24 rounded-[32px] bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center mx-auto mb-10 shadow-lg shadow-emerald-500/20">
                                    <Sparkles size={48} />
                                </div>
                                <h3 className="text-3xl font-black text-white text-center mb-4 tracking-tight">כמעט סיימנו!</h3>
                                <p className="text-slate-400 text-center mb-10 font-bold leading-relaxed">
                                    בחרת <span className="text-emerald-400">{selectedIds.size} נכסים</span> מעולים.
                                    איך תרצה לקרוא לקטלוג הזה?
                                </p>
                                
                                <div className="space-y-2 mb-10">
                                    <label className="block text-xs font-black text-slate-500 uppercase tracking-[0.2em] px-2 mb-2">שם הקטלוג (יוצג ללקוח)</label>
                                    <input 
                                        type="text" 
                                        className="w-full bg-slate-800/50 border-2 border-slate-700 rounded-[28px] px-8 py-5 text-xl text-white font-black placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/10 transition-all text-center"
                                        placeholder="לדוג׳: נכסים נבחרים במרכז העיר"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        autoFocus
                                    />
                                </div>

                                <div className="flex flex-col gap-3">
                                    <button 
                                        onClick={handleCreate}
                                        disabled={!title || isGenerating}
                                        className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white h-16 rounded-[24px] font-black text-lg shadow-xl shadow-emerald-600/20 transition-all flex items-center justify-center gap-3 disabled:opacity-50 group"
                                    >
                                        {isGenerating ? (
                                            <Loader2 className="animate-spin" size={24} />
                                        ) : (
                                            <>
                                                צור ושתף קטלוג
                                                <Sparkles size={20} className="group-hover:rotate-12 transition-transform" />
                                            </>
                                        )}
                                    </button>
                                    <button 
                                        onClick={() => setStep('select')}
                                        className="w-full bg-slate-800 text-slate-400 h-16 rounded-[24px] font-black text-lg hover:bg-slate-700 hover:text-white transition-all"
                                    >
                                        חזור לבחירת נכסים
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer (Actions) */}
                {step === 'select' && (
                    <div className="p-6 md:p-8 bg-slate-900 border-t border-slate-800 flex items-center justify-between">
                        <div className="hidden md:flex flex-col">
                            <div className="flex items-center gap-2 text-white font-black text-lg leading-none">
                                {selectedIds.size} נכסים נבחרו
                            </div>
                            <div className="text-slate-500 text-xs font-bold mt-1 uppercase tracking-widest">
                                מתוך {filteredProperties.length} תוצאות סינון
                            </div>
                        </div>
                        <div className="flex items-center gap-4 w-full md:w-auto">
                            <button 
                                onClick={onClose}
                                className="flex-1 md:flex-none px-8 py-4 rounded-2xl text-slate-400 font-black text-sm hover:bg-slate-800 transition-all uppercase tracking-widest"
                            >
                                ביטול
                            </button>
                            <button 
                                onClick={() => setStep('details')}
                                disabled={selectedIds.size === 0}
                                className="flex-[2] md:flex-none px-12 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-sm shadow-xl shadow-blue-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 uppercase tracking-widest"
                            >
                                המשך לשלב הבא
                                <Sparkles size={18} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
