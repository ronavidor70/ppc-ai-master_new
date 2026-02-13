
import React, { useState } from 'react';
import { Lead, LeadStatus } from '../types';
import { Icons, COLORS, EXCHANGE_RATE } from '../constants';
import { useTranslation } from '../App';

interface CRMProps {
  leads: Lead[];
  onUpdateLead: (lead: Lead) => void;
}

const CRM: React.FC<CRMProps> = ({ leads, onUpdateLead }) => {
  const { t, dir, currency, lang } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<LeadStatus | 'All'>('All');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const filteredLeads = leads.filter(l => {
    const matchesSearch = 
      l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.phone.includes(searchTerm);
    const matchesStatus = selectedStatus === 'All' || l.status === selectedStatus;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: leads.length,
    converted: leads.filter(l => l.status === LeadStatus.WON).length,
    pipeline: leads.reduce((acc, l) => acc + l.value, 0)
  };

  const convRate = stats.total > 0 ? ((stats.converted / stats.total) * 100).toFixed(1) : '0';

  const formatValue = (val: number) => {
    if (lang === 'he') {
      return Math.round(val * EXCHANGE_RATE).toLocaleString();
    }
    return val.toLocaleString();
  };

  const getStatusColor = (status: LeadStatus) => {
    switch(status) {
      case LeadStatus.NEW: return 'bg-blue-50 text-blue-600';
      case LeadStatus.CONTACTED: return 'bg-yellow-50 text-yellow-600';
      case LeadStatus.QUALIFIED: return 'bg-purple-50 text-purple-600';
      case LeadStatus.WON: return 'bg-green-50 text-green-600';
      case LeadStatus.LOST: return 'bg-red-50 text-red-600';
      default: return 'bg-slate-100 text-slate-500';
    }
  };

  const handleStatusUpdate = (lead: Lead, newStatus: LeadStatus) => {
    const updatedLead = { ...lead, status: newStatus };
    onUpdateLead(updatedLead);
    // שמירה ב-LocalStorage
    localStorage.setItem(`lead_status_${lead.id}`, newStatus);
  };

  const formatPhoneForWhatsApp = (phone: string) => {
    // הסרת תווים מיוחדים והשארת רק מספרים
    const cleaned = phone.replace(/[^\d]/g, '');
    return cleaned;
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* KPI Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('totalLeads')}</p>
            <h4 className="text-3xl font-black text-slate-900 mt-2">{stats.total}</h4>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs font-bold text-green-600">
            <Icons.TrendingUp />
            <span>+12% this month</span>
          </div>
        </div>
        <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('convRate')}</p>
            <h4 className="text-3xl font-black text-slate-900 mt-2">{convRate}%</h4>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs font-bold text-blue-600">
             <Icons.Robot />
             <span>AI Optimizing funnel</span>
          </div>
        </div>
        <div className="bg-blue-600 p-8 rounded-[40px] text-white shadow-xl shadow-blue-100 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10"><Icons.Zap /></div>
          <div>
            <p className="text-[10px] font-black opacity-60 uppercase tracking-widest">{t('pipelineValue')}</p>
            <h4 className="text-3xl font-black mt-2">{currency}{formatValue(stats.pipeline)}</h4>
          </div>
          <p className="mt-4 text-[10px] font-black uppercase opacity-80 tracking-widest">Growth Focused</p>
        </div>
      </div>

      {/* Leads Management Area */}
      <div className="bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[600px]">
        <div className="p-8 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <h3 className="text-xl font-black text-slate-800">{t('allLeads')}</h3>
            <p className="text-xs text-slate-400 font-medium">Manage and nurture your prospects.</p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-4">
             <div className="relative w-full sm:w-64">
                <div className={`absolute inset-y-0 ${dir === 'rtl' ? 'right-4' : 'left-4'} flex items-center pointer-events-none text-slate-400`}>
                  <Icons.Search />
                </div>
                <input 
                  type="text"
                  placeholder={t('searchLeads')}
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className={`w-full py-3 ${dir === 'rtl' ? 'pr-12 pl-4' : 'pl-12 pr-4'} bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all`}
                />
             </div>
             
             <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0">
                {['All', ...Object.values(LeadStatus)].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSelectedStatus(s as any)}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                      selectedStatus === s ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                    }`}
                  >
                    {s}
                  </button>
                ))}
             </div>
          </div>
        </div>

        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-start">
            <thead>
              <tr className="border-b border-slate-50 text-slate-400">
                <th className="px-8 py-5 font-black uppercase text-[10px] tracking-widest text-start">{lang === 'he' ? 'לקוח' : 'Lead'}</th>
                <th className="px-8 py-5 font-black uppercase text-[10px] tracking-widest text-start">{t('status')}</th>
                <th className="px-8 py-5 font-black uppercase text-[10px] tracking-widest text-start">{lang === 'he' ? 'מקור קמפיין' : 'Campaign Source'}</th>
                <th className="px-8 py-5 font-black uppercase text-[10px] tracking-widest text-start">{lang === 'he' ? 'שווי מוערך' : 'Estimated Value'}</th>
                <th className="px-8 py-5 font-black uppercase text-[10px] tracking-widest text-start">{lang === 'he' ? 'תאריך' : 'Date'}</th>
                <th className="px-8 py-5 font-black uppercase text-[10px] tracking-widest text-start">{lang === 'he' ? 'פעולות' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredLeads.map(lead => {
                const whatsappPhone = formatPhoneForWhatsApp(lead.phone);
                const hasPhone = whatsappPhone.length > 0;
                
                return (
                  <tr 
                    key={lead.id} 
                    onClick={() => setSelectedLead(lead)}
                    className="group hover:bg-slate-50/80 cursor-pointer transition-colors"
                  >
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-3">
                         <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center font-black text-slate-400 text-xs">
                           {lead.name.split(' ').map(n => n[0]).join('')}
                         </div>
                         <div>
                           <p className="font-bold text-slate-800 text-sm group-hover:text-blue-600 transition-colors">{lead.name}</p>
                           <p className="text-[10px] text-slate-400">{lead.email}</p>
                         </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase ${getStatusColor(lead.status)}`}>
                        {lead.status}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <p className="text-xs font-bold text-slate-600">{lead.campaignName}</p>
                    </td>
                    <td className="px-8 py-6">
                      <p className="text-sm font-black text-slate-800">{currency}{formatValue(lead.value)}</p>
                    </td>
                    <td className="px-8 py-6">
                      <p className="text-[10px] text-slate-400 font-medium">
                        {new Date(lead.createdAt).toLocaleDateString()}
                      </p>
                    </td>
                    <td className="px-8 py-6" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        {hasPhone && (
                          <>
                            <a
                              href={`https://wa.me/${whatsappPhone}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-[9px] font-black uppercase hover:bg-green-600 transition-colors flex items-center gap-1"
                            >
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                              </svg>
                              WhatsApp
                            </a>
                            <a
                              href={`tel:${lead.phone}`}
                              onClick={(e) => e.stopPropagation()}
                              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[9px] font-black uppercase hover:bg-blue-700 transition-colors flex items-center gap-1"
                            >
                              <Icons.Phone className="w-3 h-3" />
                              Call
                            </a>
                          </>
                        )}
                        {!hasPhone && (
                          <span className="text-[9px] text-slate-400 italic">No phone</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredLeads.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-20 text-center text-slate-400 italic text-sm">
                    No leads found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lead Detail Modal / Panel */}
      {selectedLead && (
        <div className="fixed inset-0 z-[110] flex items-center justify-end">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setSelectedLead(null)} />
          <div className={`relative w-full max-w-xl h-full bg-white shadow-2xl animate-in ${dir === 'rtl' ? 'slide-in-from-left' : 'slide-in-from-right'} duration-500 flex flex-col`}>
             <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                   <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-lg font-black">
                     {selectedLead.name[0]}
                   </div>
                   <div>
                     <h3 className="text-xl font-black text-slate-800">{selectedLead.name}</h3>
                     <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase ${getStatusColor(selectedLead.status)}`}>
                        {selectedLead.status}
                     </span>
                   </div>
                </div>
                <button onClick={() => setSelectedLead(null)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                  <Icons.X />
                </button>
             </div>

             <div className="flex-1 overflow-y-auto p-8 space-y-10">
                {/* AI Score Section */}
                <div className="bg-slate-900 rounded-[32px] p-8 text-white relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-8 opacity-10"><Icons.Robot /></div>
                   <div className="relative z-10 flex items-center justify-between mb-6">
                      <h4 className="text-xs font-black text-blue-400 uppercase tracking-widest">{t('aiScore')}</h4>
                      <div className="flex items-center gap-1">
                        {[1,2,3,4,5].map(star => (
                           <div key={star} className={`w-2 h-2 rounded-full ${star <= (selectedLead.aiScore || 0) / 20 ? 'bg-blue-400' : 'bg-white/10'}`}></div>
                        ))}
                      </div>
                   </div>
                   <div className="flex items-end gap-3 mb-6">
                      <p className="text-5xl font-black">{selectedLead.aiScore}%</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Likelihood to convert</p>
                   </div>
                   <div className="p-4 bg-white/5 rounded-2xl border border-white/10 space-y-2">
                      <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">{t('nextAction')}</p>
                      <p className="text-sm italic opacity-90 leading-relaxed">"{selectedLead.aiInsight}"</p>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                   <div className="space-y-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('contact')}</p>
                      <div className="space-y-3">
                         <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <div className="text-blue-600"><Icons.Mail /></div>
                            <p className="text-xs font-bold text-slate-700">{selectedLead.email}</p>
                         </div>
                         <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <div className="text-blue-600"><Icons.Phone /></div>
                            <p className="text-xs font-bold text-slate-700">{selectedLead.phone}</p>
                         </div>
                      </div>
                   </div>
                   <div className="space-y-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{lang === 'he' ? 'פרטי המרה' : 'Conversion Details'}</p>
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs font-medium"><span className="text-slate-400">Source:</span> <span className="text-slate-800 font-bold">{selectedLead.campaignName}</span></div>
                        <div className="flex justify-between text-xs font-medium"><span className="text-slate-400">Value:</span> <span className="text-slate-800 font-bold">{currency}{formatValue(selectedLead.value)}</span></div>
                        <div className="flex justify-between text-xs font-medium"><span className="text-slate-400">Lead ID:</span> <span className="text-slate-800 font-mono">#{selectedLead.id.substring(0,6)}</span></div>
                      </div>
                   </div>
                </div>

                <div className="space-y-4">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{lang === 'he' ? 'עדכן סטטוס' : 'Update Status'}</p>
                   <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {Object.values(LeadStatus).map(s => (
                        <button
                          key={s}
                          onClick={() => {
                            handleStatusUpdate(selectedLead, s);
                            setSelectedLead({...selectedLead, status: s});
                          }}
                          className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase transition-all border-2 ${
                            selectedLead.status === s ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-slate-50 bg-slate-50 text-slate-400 hover:border-slate-200'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                   </div>
                </div>
             </div>

             <div className="p-8 border-t border-slate-100 grid grid-cols-2 gap-4">
                <a
                  href={`mailto:${selectedLead.email}`}
                  className="py-4 px-6 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-200 transition-all"
                >
                   <Icons.Mail />
                   SEND EMAIL
                </a>
                {selectedLead.phone && (
                  <a
                    href={`tel:${selectedLead.phone}`}
                    className="py-4 px-6 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-100 flex items-center justify-center gap-2 hover:bg-blue-700 transition-all"
                  >
                     <Icons.Phone />
                     CALL NOW
                  </a>
                )}
                {selectedLead.phone && (
                  <a
                    href={`https://wa.me/${formatPhoneForWhatsApp(selectedLead.phone)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-4 px-6 bg-green-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-green-100 flex items-center justify-center gap-2 hover:bg-green-600 transition-all col-span-2"
                  >
                     <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                       <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                     </svg>
                     WHATSAPP
                  </a>
                )}
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CRM;
