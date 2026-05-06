import React, { useEffect, useState } from 'react';
import { Search, Filter, Handshake, Info, MapPin, Home, Maximize2, Users, UserCircle } from 'lucide-react';
import { Property, Lead } from '../types';
import { getCollaborativeProperties } from '../services/propertyService';
import { getCollaborativeLeads } from '../services/leadService';
import MarketplaceMatchModal from '../components/modals/MarketplaceMatchModal';
import { useLiveDashboardData } from '../hooks/useLiveDashboardData';
import { sendCollaborationRequest, getAgencyCollaborationRequests } from '../services/collaborationService';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function Marketplace() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'properties' | 'leads'>('properties');
  const [matchModalItem, setMatchModalItem] = useState<{ item: Property | Lead, type: 'property' | 'lead' } | null>(null);
  
  const { userData } = useAuth();
  const { leads: myLeads, properties: myProperties } = useLiveDashboardData(userData?.agencyId || '');

  const [sentRequests, setSentRequests] = useState<Record<string, string>>({});

  useEffect(() => {
    if (userData?.agencyId) {
      loadMarketplaceData();
      loadRequests();
    }
  }, [userData?.agencyId]);

  const loadRequests = async () => {
    if (!userData?.agencyId) return;
    try {
      const requests = await getAgencyCollaborationRequests(userData.agencyId, 'sender');
      const reqMap: Record<string, string> = {};
      requests.forEach(r => {
        reqMap[r.propertyId] = r.status;
      });
      setSentRequests(reqMap);
    } catch (error) {
      console.error('Error loading collaboration requests:', error);
    }
  };


  const loadMarketplaceData = async () => {
    try {
      setLoading(true);
      const [propsData, leadsData] = await Promise.all([
        getCollaborativeProperties(),
        getCollaborativeLeads()
      ]);
      // Filter out properties and leads from the user's own agency
      setProperties(propsData.filter(p => p.agencyId !== userData?.agencyId));
      setLeads(leadsData.filter(l => l.agencyId !== userData?.agencyId));
    } catch (error) {
      console.error('Error loading marketplace:', error);
      toast.error('שגיאה בטעינת המאגר השיתופי');
    } finally {
      setLoading(false);
    }
  };

  const filteredProperties = properties.filter(p => 
    p.address.city.includes(searchTerm) || 
    p.address.street?.includes(searchTerm) ||
    p.propertyType.includes(searchTerm)
  );

  const filteredLeads = leads.filter(l => 
    l.requirements?.desiredCity?.some(c => c.includes(searchTerm)) ||
    (l.requirements?.propertyType && l.requirements.propertyType.some(t => t.includes(searchTerm)))
  );

  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Handshake className="text-blue-400" />
            מאגר שיתופי (MLS)
          </h1>
          <p className="text-slate-400 text-sm mt-1">נכסים בבלעדיות ממשרדים אחרים הפתוחים לשיתוף פעולה</p>
        </div>
      </header>

      {/* Search & Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-3 relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="חפש לפי עיר, רחוב או סוג נכס..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-10 pl-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
          />
        </div>
        <button className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-xl text-slate-300 hover:text-white hover:bg-slate-700 transition-all">
          <Filter size={18} />
          <span>סינון מתקדם</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-800/50 p-1 rounded-2xl w-full max-w-sm border border-slate-700">
        <button
          onClick={() => setActiveTab('properties')}
          className={`flex-1 py-2.5 px-4 text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-all ${
            activeTab === 'properties' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          <Home size={16} />
          נכסים ({filteredProperties.length})
        </button>
        <button
          onClick={() => setActiveTab('leads')}
          className={`flex-1 py-2.5 px-4 text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-all ${
            activeTab === 'leads' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          <Users size={16} />
          לידים קונים ({filteredLeads.length})
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-80 bg-slate-800/20 animate-pulse rounded-2xl border border-slate-700/50" />
          ))}
        </div>
      ) : (
        <>
        {activeTab === 'properties' && (
          filteredProperties.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProperties.map((property) => (
            <div 
              key={property.id} 
              className="group bg-slate-800/40 backdrop-blur-md border border-slate-700/50 rounded-2xl overflow-hidden hover:border-blue-500/50 transition-all duration-300 shadow-xl"
            >
              <div className="relative h-48 overflow-hidden">
                {property.hideImagesFromPublic ? (
                  <div className="w-full h-full bg-gradient-to-br from-slate-700 to-slate-800 flex flex-col items-center justify-center text-slate-400">
                    <Home size={36} className="mb-2 opacity-60" />
                    <span className="text-xs font-medium">תמונות זמינות לפי בקשה</span>
                  </div>
                ) : (
                  <img
                    src={property.media?.mainImage || (property.media?.images && property.media.images[0]) || 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800&auto=format&fit=crop&q=60'}
                    alt={property.address.fullAddress}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                )}
                <div className="absolute top-3 right-3 px-3 py-1 bg-blue-600/90 text-white text-xs font-bold rounded-full backdrop-blur-md shadow-lg">
                  {property.transactionType === 'forsale' ? 'למכירה' : 'להשכרה'}
                </div>
                <div className="absolute bottom-3 left-3 px-3 py-1 bg-black/60 text-white text-xs font-medium rounded-lg backdrop-blur-md">
                  {property.propertyType}
                </div>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-white truncate">{property.address.fullAddress}</h3>
                  <div className="flex items-center gap-1 text-slate-400 text-sm mt-1">
                    <MapPin size={14} />
                    <span>{property.address.city}</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col items-center p-2 bg-slate-900/50 rounded-xl border border-slate-700/30">
                    <Home size={16} className="text-blue-400 mb-1" />
                    <span className="text-white text-sm font-semibold">{property.rooms || '-'} חדרים</span>
                  </div>
                  <div className="flex flex-col items-center p-2 bg-slate-900/50 rounded-xl border border-slate-700/30">
                    <Maximize2 size={16} className="text-emerald-400 mb-1" />
                    <span className="text-white text-sm font-semibold">{property.squareMeters || '-'} מ"ר</span>
                  </div>
                  <div className="flex flex-col items-center p-2 bg-slate-900/50 rounded-xl border border-slate-700/30">
                    <Users size={16} className="text-purple-400 mb-1" />
                    <span className="text-white text-sm font-semibold">קומה {property.floor ?? '-'}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
                  <div className="text-xl font-black text-white">
                    ₪{property.financials.price.toLocaleString()}
                  </div>
                  <div className="flex flex-col items-end">
                    <div className="text-blue-400 text-xs font-bold uppercase tracking-wider">
                      שיתוף פעולה פעיל
                    </div>
                    {property.management?.assignedAgentName && (
                        <div className="flex items-center gap-1 mt-1 text-slate-400 text-xs bg-slate-800/50 px-2 py-0.5 rounded-md border border-slate-700/50">
                            <UserCircle size={12} className="text-slate-500" />
                            <span>סוכן מפרסם: {property.management.assignedAgentName}</span>
                        </div>
                    )}
                  </div>
                </div>

                {sentRequests[property.id] ? (
                  <button 
                    disabled
                    className="w-full py-3 bg-slate-700 text-slate-300 font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all cursor-not-allowed"
                  >
                    <Handshake size={18} />
                    {sentRequests[property.id] === 'pending' ? 'בקשה נשלחה (בהמתנה)' : 
                     sentRequests[property.id] === 'approved' ? 'שיתוף אושר!' : 
                     'בקשה נשלחה'}
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setMatchModalItem({ item: property, type: 'property' })}
                      className="flex-1 py-3 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all"
                      title="חפש התאמות מהמשרד שלי"
                    >
                      <Search size={18} />
                      מצא קונים
                    </button>
                    <button 
                      onClick={async () => {
                        if (!userData?.agencyId || !userData?.uid) return;
                        try {
                          await sendCollaborationRequest({
                            fromAgencyId: userData.agencyId,
                            toAgencyId: property.agencyId,
                            propertyId: property.id,
                            agentId: userData.uid
                          });
                          setSentRequests(prev => ({ ...prev, [property.id]: 'pending' }));
                          toast.success('בקשת שיתוף פעולה נשלחה בהצלחה!');
                        } catch (err) {
                          toast.error('שגיאה בשליחת הבקשה');
                          console.error(err);
                        }
                      }}
                      className="flex-[2] py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95"
                    >
                      <Handshake size={18} />
                      הצע שיתוף פעולה
                    </button>
                  </div>
                )}

                
                {property.collaborationTerms && (
                  <div className="flex items-start gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                    <Info size={16} className="text-blue-400 mt-0.5 shrink-0" />
                    <p className="text-blue-200 text-xs leading-relaxed">
                      <strong>תנאי שיתוף:</strong> {property.collaborationTerms}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 bg-slate-800/20 rounded-3xl border border-dashed border-slate-700">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center text-slate-500">
              <Handshake size={32} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">אין נכסים משותפים כרגע</h3>
              <p className="text-slate-400 max-w-md mt-2">
                כאן יופיעו נכסים ממשרדים אחרים שפתחו את הנכסים שלהם לשיתוף פעולה. חזור לכאן בקרוב!
              </p>
            </div>
          </div>
        )
        )}

        {activeTab === 'leads' && (
          filteredLeads.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredLeads.map((lead) => (
                <div 
                  key={lead.id} 
                  className="group bg-slate-800/40 backdrop-blur-md border border-slate-700/50 rounded-2xl overflow-hidden hover:border-emerald-500/50 transition-all duration-300 shadow-xl p-5 space-y-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Users className="text-emerald-400" />
                        דרישת לקוח אנונימית
                      </h3>
                      <div className="flex items-center gap-1 text-slate-400 text-sm mt-1">
                        <MapPin size={14} />
                        <span>{lead.requirements?.desiredCity?.join(', ') || 'עיר לא הוגדרה'}</span>
                      </div>
                    </div>
                    <div className="px-3 py-1 bg-emerald-600/90 text-white text-xs font-bold rounded-full backdrop-blur-md shadow-lg">
                      לקוח קונה
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col items-center p-2 bg-slate-900/50 rounded-xl border border-slate-700/30">
                      <Home size={16} className="text-blue-400 mb-1" />
                      <span className="text-white text-sm font-semibold">מעל {lead.requirements?.minRooms || 0} חדרים</span>
                    </div>
                    <div className="flex flex-col items-center p-2 bg-slate-900/50 rounded-xl border border-slate-700/30">
                      <span className="text-emerald-400 font-bold mb-1">₪</span>
                      <span className="text-white text-sm font-semibold">עד {lead.requirements?.maxBudget?.toLocaleString() || '-'}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
                    <div className="flex flex-col">
                      <div className="text-emerald-400 text-xs font-bold uppercase tracking-wider">
                        שיתוף פעולה פעיל
                      </div>
                      {lead.collaborationAgentName && (
                        <div className="flex items-center gap-1 mt-1 text-slate-400 text-xs bg-slate-800/50 px-2 py-0.5 rounded-md border border-slate-700/50">
                            <UserCircle size={12} className="text-slate-500" />
                            <span>סוכן: {lead.collaborationAgentName}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {sentRequests[lead.id] ? (
                    <button 
                      disabled
                      className="w-full py-3 bg-slate-700 text-slate-300 font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all cursor-not-allowed"
                    >
                      <Handshake size={18} />
                      {sentRequests[lead.id] === 'pending' ? 'בקשה נשלחה (בהמתנה)' : 
                       sentRequests[lead.id] === 'approved' ? 'שיתוף אושר!' : 
                       'בקשה נשלחה'}
                    </button>
                  ) : (
                    <div className="flex gap-2 mt-4">
                      <button 
                        onClick={() => setMatchModalItem({ item: lead, type: 'lead' })}
                        className="flex-1 py-3 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all"
                        title="חפש התאמות מהמשרד שלי"
                      >
                        <Search size={18} />
                        מצא נכסים
                      </button>
                      <button 
                        onClick={async () => {
                          if (!userData?.agencyId || !userData?.uid) return;
                          try {
                            await sendCollaborationRequest({
                              fromAgencyId: userData.agencyId,
                              toAgencyId: lead.agencyId!,
                              leadId: lead.id,
                              agentId: userData.uid
                            });
                            setSentRequests(prev => ({ ...prev, [lead.id]: 'pending' }));
                            toast.success('בקשת שיתוף פעולה נשלחה בהצלחה!');
                          } catch (err) {
                            toast.error('שגיאה בשליחת הבקשה');
                            console.error(err);
                          }
                        }}
                        className="flex-[2] py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95"
                      >
                        <Handshake size={18} />
                        הצע שיתוף פעולה
                      </button>
                    </div>
                  )}

                  {lead.collaborationTerms && (
                    <div className="flex items-start gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl mt-3">
                      <Info size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                      <p className="text-emerald-200 text-xs leading-relaxed">
                        <strong>תנאי שיתוף:</strong> {lead.collaborationTerms}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 bg-slate-800/20 rounded-3xl border border-dashed border-slate-700">
              <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center text-slate-500">
                <Users size={32} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">אין דרישות קונים משותפות כרגע</h3>
                <p className="text-slate-400 max-w-md mt-2">
                  כאן יופיעו דרישות אנונימיות של קונים ממשרדים אחרים המחפשים נכסים במערכת.
                </p>
              </div>
            </div>
          )
        )}
        </>
      )}

      {matchModalItem && (
        <MarketplaceMatchModal
          sharedItem={matchModalItem.item}
          itemType={matchModalItem.type}
          myProperties={myProperties}
          myLeads={myLeads}
          onClose={() => setMatchModalItem(null)}
        />
      )}
    </div>
  );
}
