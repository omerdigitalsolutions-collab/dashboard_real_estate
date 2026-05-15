import { useState } from 'react';
import { Search, Loader2, Users, Lock, Globe, Plus, Database, Wifi } from 'lucide-react';
import { searchFBGroups } from '../../services/fbLeadService';
import type { FBGroupSearchResult } from '../../types';

interface Props {
    onSelectGroup: (url: string, name: string) => void;
    disabled: boolean;
}

function SkeletonCard() {
    return (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 animate-pulse">
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-2">
                    <div className="h-4 bg-slate-700 rounded w-2/3" />
                    <div className="h-3 bg-slate-800 rounded w-1/3" />
                    <div className="h-3 bg-slate-800 rounded w-full mt-2" />
                    <div className="h-3 bg-slate-800 rounded w-4/5" />
                </div>
                <div className="h-8 w-20 bg-slate-800 rounded-lg shrink-0" />
            </div>
        </div>
    );
}

export default function FBGroupSearchPanel({ onSelectGroup, disabled }: Props) {
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<FBGroupSearchResult[] | null>(null);
    const [fromCache, setFromCache] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSearch = async () => {
        if (!query.trim()) return;
        setLoading(true);
        setError(null);
        setResults(null);
        try {
            const { groups, fromCache: cached } = await searchFBGroups(query.trim());
            setResults(groups);
            setFromCache(cached);
        } catch (err) {
            console.error('[FBGroupSearchPanel]', err);
            setError('החיפוש נכשל — נסו שוב מאוחר יותר');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div dir="rtl" className="space-y-3 mt-3">
            {/* Search Input */}
            <div className="flex gap-2">
                <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    placeholder="חפשו קבוצה, למשל: דירות תל אביב ישיר מבעלים"
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none"
                />
                <button
                    type="button"
                    onClick={handleSearch}
                    disabled={loading || !query.trim()}
                    className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition"
                >
                    {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                    חפש
                </button>
            </div>

            {/* Source banner */}
            {!loading && results !== null && (
                <div className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg w-fit ${
                    fromCache
                        ? 'bg-slate-800/60 text-slate-400'
                        : 'bg-emerald-900/30 text-emerald-400 border border-emerald-800/40'
                }`}>
                    {fromCache
                        ? <><Database size={12} /> נמצאו {results.length} קבוצות במאגר שלנו</>
                        : <><Wifi size={12} /> {results.length} קבוצות נסרקו חיים מפייסבוק</>
                    }
                </div>
            )}

            {/* Loading skeletons */}
            {loading && (
                <div className="space-y-2">
                    <SkeletonCard />
                    <SkeletonCard />
                    <SkeletonCard />
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="text-sm text-red-400 bg-red-900/20 border border-red-800/30 rounded-xl px-4 py-3">
                    {error}
                </div>
            )}

            {/* Results */}
            {!loading && results !== null && results.length === 0 && (
                <div className="text-sm text-slate-500 text-center py-6">
                    לא נמצאו קבוצות — נסו מילות חיפוש אחרות
                </div>
            )}

            {!loading && results && results.length > 0 && (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-0.5">
                    {results.map((group, i) => (
                        <div
                            key={i}
                            className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-white text-sm truncate">
                                        {group.name}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                        {group.followerText && (
                                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                                                <Users size={10} />
                                                {group.followerText}
                                            </span>
                                        )}
                                        {group.isPrivate ? (
                                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 bg-amber-900/20 border border-amber-800/30 px-2 py-0.5 rounded-full">
                                                <Lock size={10} />
                                                פרטית
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-900/20 border border-emerald-800/30 px-2 py-0.5 rounded-full">
                                                <Globe size={10} />
                                                ציבורית
                                            </span>
                                        )}
                                    </div>
                                    {group.description && (
                                        <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">
                                            {group.description}
                                        </p>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => onSelectGroup(group.url, group.name)}
                                    disabled={disabled}
                                    title={disabled ? 'הגעתם למגבלה של 3 קבוצות' : 'הוסף לסורק'}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition shrink-0 disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600/20 text-blue-300 border border-blue-600/30 hover:bg-blue-600/30"
                                >
                                    <Plus size={12} />
                                    הוסף
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
