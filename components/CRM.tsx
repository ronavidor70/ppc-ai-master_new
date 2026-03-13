import React, { useState, useRef } from 'react';
import { Lead, LeadStatus } from '../types';
import { Icons, COLORS, EXCHANGE_RATE } from '../constants';
import { useTranslation } from '../App';
import * as XLSX from 'xlsx';

interface CRMProps {
  leads: Lead[];
  onUpdateLead: (lead: Lead) => void;
  onAddLeads?: (leads: Lead[]) => void;
}

type ImportTab = 'manual' | 'csv' | 'excel';

/** Field keys that can be mapped from CSV/Excel columns */
export type LeadFieldKey = 'name' | 'email' | 'phone' | 'value' | 'campaign' | 'skip';

/** Detect which column index maps to which field (same logic as before, for initial suggestion) */
const detectColumnMapping = (header: string[]): (LeadFieldKey | null)[] => {
  const normalized = header.map(h => String(h || '').toLowerCase().trim());
  const col = (names: string[]) => {
    const i = normalized.findIndex(h => names.some(n => h.includes(n) || h === n));
    return i >= 0 ? i : -1;
  };
  const mapping: (LeadFieldKey | null)[] = normalized.map(() => null);
  const nameIdx = col(['name', 'full_name', 'fullname', 'שם']);
  const emailIdx = col(['email', 'mail', 'אימייל']);
  const phoneIdx = col(['phone', 'tel', 'mobile', 'נייד', 'טלפון']);
  const valueIdx = col(['value', 'estimated_value', 'שווי']);
  const campaignIdx = col(['campaign', 'source', 'קמפיין', 'מקור']);
  if (nameIdx >= 0) mapping[nameIdx] = 'name';
  if (emailIdx >= 0) mapping[emailIdx] = 'email';
  if (phoneIdx >= 0) mapping[phoneIdx] = 'phone';
  if (valueIdx >= 0) mapping[valueIdx] = 'value';
  if (campaignIdx >= 0) mapping[campaignIdx] = 'campaign';
  return mapping;
};

/** Parse rows into leads using explicit column mapping. Ensures unique IDs and ordered createdAt. */
const parseRowsWithMapping = (
  rows: string[][],
  mapping: (LeadFieldKey | null)[],
  importSource: string,
  lang: string
): Lead[] => {
  if (!rows.length) return [];
  const baseTime = Date.now();
  const leads: Lead[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    let name = '';
    let email = '';
    let phone = '';
    let value = 0;
    let campaignName = importSource;
    mapping.forEach((field, colIdx) => {
      if (!field || field === 'skip') return;
      const val = String((row[colIdx] ?? '') || '').trim();
      if (field === 'name') name = val;
      else if (field === 'email') email = val;
      else if (field === 'phone') phone = val;
      else if (field === 'value') value = parseFloat(val) || 0;
      else if (field === 'campaign') campaignName = val || importSource;
    });
    if (!name && !email) continue;
    leads.push({
      id: `custom_${baseTime}_${i}`,
      name,
      email,
      phone,
      status: LeadStatus.NEW,
      campaignId: 'import',
      campaignName: campaignName || (lang === 'he' ? 'ייבוא' : 'Import'),
      value,
      createdAt: new Date(baseTime + i * 1000).toISOString(),
      aiScore: 0,
      aiInsight: ''
    });
  }
  return leads;
};

const PREVIEW_ROWS = 5;

const CRM: React.FC<CRMProps> = ({ leads, onUpdateLead, onAddLeads }) => {
  const { t, dir, currency, lang } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<LeadStatus | 'All'>('All');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [importTab, setImportTab] = useState<ImportTab>('manual');
  const [manualLead, setManualLead] = useState({ name: '', email: '', phone: '', value: 0, campaignName: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Import flow: after file select → show mapping step (like Facebook/Lead platforms)
  const [importStep, setImportStep] = useState<'select' | 'mapping'>('select');
  const [fileParseResult, setFileParseResult] = useState<{ headers: string[]; rows: string[][]; fileName: string } | null>(null);
  const [columnMapping, setColumnMapping] = useState<(LeadFieldKey | null)[]>([]);

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
    const cleaned = phone.replace(/[^\d]/g, '');
    return cleaned;
  };

  const handleAddManual = () => {
    if (!manualLead.name.trim() || !manualLead.email.trim() || !onAddLeads) return;
    const lead: Lead = {
      id: `custom_${Date.now()}`,
      name: manualLead.name.trim(),
      email: manualLead.email.trim(),
      phone: manualLead.phone.trim(),
      status: LeadStatus.NEW,
      campaignId: 'manual',
      campaignName: manualLead.campaignName.trim() || (lang === 'he' ? 'הוזן ידנית' : 'Manual Entry'),
      value: manualLead.value || 0,
      createdAt: new Date().toISOString(),
      aiScore: 0,
      aiInsight: ''
    };
    onAddLeads([lead]);
    setManualLead({ name: '', email: '', phone: '', value: 0, campaignName: '' });
    setShowAddModal(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = ev.target?.result;
        let rows: string[][] = [];
        if (file.name.endsWith('.csv')) {
          const text = String(data);
          rows = text.split(/\r?\n/).map(line => {
            const result: string[] = [];
            let cur = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
              const c = line[i];
              if (c === '"') inQuotes = !inQuotes;
              else if ((c === ',' || c === ';') && !inQuotes) { result.push(cur.trim()); cur = ''; }
              else cur += c;
            }
            result.push(cur.trim());
            return result;
          });
        } else {
          const wb = XLSX.read(data, { type: 'binary' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' });
        }
        if (!rows.length) {
          alert(lang === 'he' ? 'הקובץ ריק או ללא שורות.' : 'File is empty or has no rows.');
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }
        const headers = rows[0].map(h => String(h ?? '').trim());
        const suggested = detectColumnMapping(headers);
        setFileParseResult({ headers, rows, fileName: file.name });
        setColumnMapping(suggested);
        setImportStep('mapping');
      } catch (err) {
        console.error(err);
        alert(lang === 'he' ? 'שגיאה בקריאת הקובץ' : 'Error reading file');
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    if (file.name.endsWith('.csv')) reader.readAsText(file);
    else reader.readAsBinaryString(file);
  };

  const handleConfirmImport = () => {
    if (!fileParseResult || !onAddLeads) return;
    const hasNameOrEmail = columnMapping.some(m => m === 'name' || m === 'email');
    if (!hasNameOrEmail) {
      alert(lang === 'he' ? 'יש למפות לפחות עמודה אחת לשם או לאימייל.' : 'Map at least one column to Name or Email.');
      return;
    }
    const importSource = lang === 'he' ? 'ייבוא' : 'Import';
    const parsed = parseRowsWithMapping(fileParseResult.rows, columnMapping, importSource, lang);
    if (parsed.length === 0) {
      alert(lang === 'he' ? 'לא נמצאו שורות עם שם או אימייל.' : 'No rows with name or email found.');
      return;
    }
    onAddLeads(parsed);
    setFileParseResult(null);
    setColumnMapping([]);
    setImportStep('select');
    setShowAddModal(false);
  };

  const handleCloseAddModal = () => {
    setShowAddModal(false);
    setImportStep('select');
    setFileParseResult(null);
    setColumnMapping([]);
  };

  const openFileDialog = (accept: string) => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = accept;
      fileInputRef.current.click();
    }
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
            {onAddLeads && (
              <button
                onClick={() => setShowAddModal(true)}
                className="px-4 py-3 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" strokeWidth="2"/><line x1="5" y1="12" x2="19" y2="12" strokeWidth="2"/></svg>
                {t('addLeads')}
              </button>
            )}
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

      {/* Add / Import Leads Modal */}
      {showAddModal && onAddLeads && (
        <>
          <div className="fixed inset-0 z-[120] flex items-center justify-center">
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={handleCloseAddModal} />
            <div className={`relative bg-white rounded-[32px] shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-lg font-black text-slate-800">
                  {importStep === 'mapping' ? (lang === 'he' ? 'אישור מיפוי עמודות' : 'Confirm column mapping') : t('addLeadsTitle')}
                </h3>
                <button onClick={handleCloseAddModal} className="p-2 text-slate-400 hover:text-slate-600">
                  <Icons.X />
                </button>
              </div>
              <div className="p-6 space-y-6 overflow-y-auto">
                {importStep === 'mapping' && fileParseResult ? (
                  /* Step 2: Mapping & preview (like Facebook / lead platforms) */
                  <div className="space-y-6">
                    <p className="text-sm text-slate-600">
                      {lang === 'he'
                        ? 'המערכת זיהתה את העמודות בקובץ. אשר שהמיפוי נכון או שנה לפי הצורך, ואז ייבא את הלידים.'
                        : 'We detected the columns in your file. Confirm the mapping is correct or change it, then import.'}
                    </p>
                    <p className="text-xs text-slate-400 font-medium">
                      {fileParseResult.fileName} · {fileParseResult.rows.length - 1} {lang === 'he' ? 'שורות' : 'rows'}
                    </p>
                    <div className="space-y-3">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        {lang === 'he' ? 'מיפוי עמודה → שדה ב-CRM' : 'Column → CRM field'}
                      </p>
                      <div className="grid gap-2 max-h-48 overflow-y-auto">
                        {fileParseResult.headers.map((header, idx) => (
                          <div key={idx} className="flex items-center gap-3 flex-wrap">
                            <span className="text-sm font-bold text-slate-700 min-w-[120px] truncate" title={header}>
                              {header || `(${lang === 'he' ? 'ריק' : 'empty'})`}
                            </span>
                            <span className="text-slate-300">→</span>
                            <select
                              value={columnMapping[idx] ?? 'skip'}
                              onChange={e => {
                                const v = e.target.value as LeadFieldKey | 'skip';
                                setColumnMapping(prev => {
                                  const next = [...prev];
                                  next[idx] = v === 'skip' ? null : v;
                                  return next;
                                });
                              }}
                              className="flex-1 min-w-[140px] py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:ring-2 focus:ring-blue-100 focus:outline-none"
                            >
                              <option value="skip">{lang === 'he' ? 'לא לייבא' : "Don't import"}</option>
                              <option value="name">{lang === 'he' ? 'שם' : 'Name'}</option>
                              <option value="email">{lang === 'he' ? 'אימייל' : 'Email'}</option>
                              <option value="phone">{lang === 'he' ? 'טלפון' : 'Phone'}</option>
                              <option value="value">{lang === 'he' ? 'שווי' : 'Value'}</option>
                              <option value="campaign">{lang === 'he' ? 'קמפיין / מקור' : 'Campaign / Source'}</option>
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="border border-slate-100 rounded-2xl overflow-hidden">
                      <p className="px-4 py-2 bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        {lang === 'he' ? 'תצוגה מקדימה (5 שורות ראשונות)' : 'Preview (first 5 rows)'}
                      </p>
                      <div className="overflow-x-auto max-h-40 overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/50">
                              {fileParseResult.headers.slice(0, 6).map((h, i) => (
                                <th key={i} className="px-3 py-2 text-left font-bold text-slate-500 text-[10px] uppercase truncate max-w-[100px]">
                                  {h || `C${i + 1}`}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {fileParseResult.rows.slice(1, 1 + PREVIEW_ROWS).map((row, ri) => (
                              <tr key={ri} className="border-b border-slate-50">
                                {fileParseResult.headers.slice(0, 6).map((_, ci) => (
                                  <td key={ci} className="px-3 py-2 text-slate-700 truncate max-w-[100px]">
                                    {String(row[ci] ?? '')}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => { setImportStep('select'); setFileParseResult(null); setColumnMapping([]); }}
                        className="px-4 py-3 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
                      >
                        {lang === 'he' ? 'חזור' : 'Back'}
                      </button>
                      <button
                        onClick={handleConfirmImport}
                        className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all"
                      >
                        {lang === 'he' ? 'אשר וייבא לידים' : 'Confirm & import leads'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      {(['manual', 'csv', 'excel'] as const).map((tab) => (
                        <button
                          key={tab}
                          onClick={() => { setImportTab(tab); setImportStep('select'); setFileParseResult(null); }}
                          className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                            importTab === tab ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          {tab === 'manual' ? t('addLeadsManual') : tab === 'csv' ? t('addLeadsCSV') : t('addLeadsExcel')}
                        </button>
                      ))}
                    </div>

                    {importTab === 'manual' && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">{lang === 'he' ? 'שם' : 'Name'} *</label>
                          <input
                            type="text"
                            value={manualLead.name}
                            onChange={e => setManualLead(prev => ({ ...prev, name: e.target.value }))}
                            className="w-full py-3 px-4 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-100 focus:outline-none"
                            placeholder={lang === 'he' ? 'שם מלא' : 'Full name'}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Email *</label>
                          <input
                            type="email"
                            value={manualLead.email}
                            onChange={e => setManualLead(prev => ({ ...prev, email: e.target.value }))}
                            className="w-full py-3 px-4 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-100 focus:outline-none"
                            placeholder="email@example.com"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">{lang === 'he' ? 'טלפון' : 'Phone'}</label>
                          <input
                            type="tel"
                            value={manualLead.phone}
                            onChange={e => setManualLead(prev => ({ ...prev, phone: e.target.value }))}
                            className="w-full py-3 px-4 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-100 focus:outline-none"
                            placeholder={lang === 'he' ? '050-1234567' : '+1234567890'}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">{lang === 'he' ? 'שווי מוערך' : 'Estimated Value'}</label>
                          <input
                            type="number"
                            value={manualLead.value || ''}
                            onChange={e => setManualLead(prev => ({ ...prev, value: parseFloat(e.target.value) || 0 }))}
                            className="w-full py-3 px-4 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-100 focus:outline-none"
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">{lang === 'he' ? 'מקור / קמפיין' : 'Campaign / Source'}</label>
                          <input
                            type="text"
                            value={manualLead.campaignName}
                            onChange={e => setManualLead(prev => ({ ...prev, campaignName: e.target.value }))}
                            className="w-full py-3 px-4 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-100 focus:outline-none"
                            placeholder={lang === 'he' ? 'אופציונלי' : 'Optional'}
                          />
                        </div>
                        <button
                          onClick={handleAddManual}
                          disabled={!manualLead.name.trim() || !manualLead.email.trim()}
                          className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                          {lang === 'he' ? 'הוסף ליד' : 'Add Lead'}
                        </button>
                      </div>
                    )}

                    {(importTab === 'csv' || importTab === 'excel') && (
                      <div className="space-y-4">
                        <p className="text-sm text-slate-500">
                          {lang === 'he'
                            ? 'העלה קובץ CSV או Excel. השורה הראשונה צריכה להכיל כותרות. אחרי ההעלאה תראה מיפוי עמודות לאישור (כמו בפייסבוק).'
                            : 'Upload a CSV or Excel file. First row should be headers. After upload you will confirm column mapping (like Facebook lead import).'}
                        </p>
                        <button
                          onClick={() => openFileDialog(importTab === 'csv' ? '.csv' : '.xlsx,.xls')}
                          className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-600 font-bold text-sm hover:border-blue-300 hover:bg-blue-50/50 transition-all flex items-center justify-center gap-2"
                        >
                          <Icons.CRM className="w-5 h-5" />
                          {importTab === 'csv' ? t('addLeadsCSV') : t('addLeadsExcel')}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileUpload}
            className="hidden"
          />
        </>
      )}
    </div>
  );
};

export default CRM;
