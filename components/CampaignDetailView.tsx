
import React, { useState, useEffect } from 'react';
import { Campaign, CampaignStatus } from '../types';
import { Icons, EXCHANGE_RATE } from '../constants';
import { useTranslation } from '../App';
import { openaiService } from '../services/openaiService';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

interface CampaignDetailViewProps {
  campaign: Campaign;
  onBack: () => void;
  onUpdate: (campaign: Campaign) => void;
}

const CampaignDetailView: React.FC<CampaignDetailViewProps> = ({ campaign, onBack, onUpdate }) => {
  const { t, dir, currency, lang } = useTranslation();
  const [aiInsight, setAiInsight] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  
  // Edit states
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(campaign.name);
  const [editedBudget, setEditedBudget] = useState(campaign.budget.toString());
  
  // Optimization states
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optProposal, setOptProposal] = useState<{suggestedBudget: number, reasoning: string} | null>(null);

  useEffect(() => {
    const fetchInsight = async () => {
      try {
        const insight = await openaiService.getAiInsight(campaign.performance, lang);
        setAiInsight(insight);
      } catch (err) {
        setAiInsight("Unable to generate analysis at this time.");
      } finally {
        setIsAnalyzing(false);
      }
    };
    fetchInsight();
  }, [campaign, lang]);

  const formatValue = (val: number) => {
    if (lang === 'he') {
      return Math.round(val * EXCHANGE_RATE).toLocaleString();
    }
    return val.toLocaleString();
  };

  const handleSaveEdit = () => {
    onUpdate({
      ...campaign,
      name: editedName,
      budget: Number(editedBudget)
    });
    setIsEditing(false);
  };

  const toggleStatus = () => {
    const newStatus = campaign.status === CampaignStatus.ACTIVE ? CampaignStatus.PAUSED : CampaignStatus.ACTIVE;
    onUpdate({
      ...campaign,
      status: newStatus
    });
  };

  const handleOptimizeRequest = async () => {
    setIsOptimizing(true);
    try {
      const result = await openaiService.optimizeCampaign(campaign, lang);
      setOptProposal(result);
    } catch (err) {
      console.error(err);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleApplyOptimization = () => {
    if (!optProposal) return;
    onUpdate({
      ...campaign,
      budget: optProposal.suggestedBudget,
      performance: {
        ...campaign.performance,
        optimizations: campaign.performance.optimizations + 1
      }
    });
    setOptProposal(null);
  };

  const isActive = campaign.status === CampaignStatus.ACTIVE;

  const performanceData = campaign.history && campaign.history.length > 0
    ? campaign.history.map(day => ({
        name: new Date(day.date).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { weekday: 'short' }),
        leads: day.leads,
        spend: day.spend
      }))
    : [
        { name: 'Mon', leads: 0, spend: 0 },
        { name: 'Tue', leads: 0, spend: 0 },
        { name: 'Wed', leads: 0, spend: 0 },
        { name: 'Thu', leads: 0, spend: 0 },
        { name: 'Fri', leads: 0, spend: 0 },
        { name: 'Sat', leads: 0, spend: 0 },
        { name: 'Sun', leads: 0, spend: 0 },
      ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-4 flex-1">
          <button 
            onClick={onBack}
            className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
          >
            {dir === 'rtl' ? <Icons.ArrowRight /> : <Icons.ArrowLeft />}
          </button>
          
          <div className="flex-1">
            <div className="flex items-center gap-3">
              {isEditing ? (
                <input 
                  value={editedName} 
                  onChange={e => setEditedName(e.target.value)}
                  className="text-2xl font-black text-slate-800 bg-slate-50 border-b-2 border-blue-600 focus:outline-none w-full max-w-md rounded-lg px-2"
                />
              ) : (
                <h2 className={`text-2xl font-black text-slate-800 ${!isActive ? 'opacity-50' : ''}`}>{campaign.name}</h2>
              )}
              <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${isActive ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-500'}`}>
                {isActive ? t('active') : (lang === 'he' ? 'מושהה' : 'Paused')}
              </span>
            </div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">{t('campaignDetails')}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Status Toggle Button */}
          <button 
            onClick={toggleStatus}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-md ${
              isActive 
                ? 'bg-orange-50 text-orange-600 hover:bg-orange-100' 
                : 'bg-green-600 text-white hover:bg-green-700 shadow-green-100'
            }`}
          >
            {isActive ? <><Icons.Pause className="w-4 h-4" /> {t('pause')}</> : <><Icons.Play className="w-4 h-4" /> {t('resume')}</>}
          </button>

          {isEditing ? (
            <>
               <button onClick={handleSaveEdit} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-blue-100 hover:scale-[1.02] active:scale-95 transition-all">{t('save')}</button>
               <button onClick={() => setIsEditing(false)} className="px-6 py-2.5 bg-slate-100 text-slate-500 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all">{t('cancel')}</button>
            </>
          ) : (
            <>
              <button 
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-2 px-6 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-600 font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm"
              >
                <Icons.Edit className="text-blue-600 w-4 h-4" /> {t('edit')}
              </button>
              <button 
                onClick={handleOptimizeRequest}
                disabled={isOptimizing || !isActive}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-blue-100 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:grayscale disabled:scale-100"
              >
                {isOptimizing ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Icons.Sparkles className="w-4 h-4" />}
                {isOptimizing ? t('optimizing') : t('optimize')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Optimization Proposal UI */}
      {optProposal && (
        <div className="bg-yellow-50 border-2 border-yellow-100 p-8 rounded-[40px] animate-in slide-in-from-top-4 duration-300 shadow-xl shadow-yellow-100/20">
          <div className="flex items-center justify-between mb-4">
             <div className="flex items-center gap-3">
               <div className="p-2 bg-yellow-400 text-white rounded-xl shadow-lg shadow-yellow-200"><Icons.Sparkles /></div>
               <h3 className="text-lg font-black text-yellow-800 uppercase tracking-tight">{t('optimizationProposed')}</h3>
             </div>
             <button onClick={() => setOptProposal(null)} className="p-2 text-yellow-600 hover:bg-yellow-100 rounded-full transition-colors"><Icons.X /></button>
          </div>
          <div className="space-y-4">
            <p className="text-yellow-900 font-medium leading-relaxed">{optProposal.reasoning}</p>
            <div className="flex items-center gap-6 flex-wrap">
               <div className="bg-white p-5 rounded-[24px] shadow-sm border border-yellow-200">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.1em]">{t('dailyBudget')}</p>
                  <p className="text-2xl font-black text-slate-800">{currency}{optProposal.suggestedBudget} <span className="text-xs text-green-600 ml-2">↑ {((optProposal.suggestedBudget / campaign.budget - 1) * 100).toFixed(0)}%</span></p>
               </div>
               <button onClick={handleApplyOptimization} className="px-10 py-5 bg-yellow-500 text-white rounded-[24px] font-black uppercase tracking-widest shadow-xl shadow-yellow-200 hover:scale-[1.05] active:scale-95 transition-all">
                  {t('apply')}
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className={`bg-white p-7 rounded-[40px] border border-slate-200 shadow-sm transition-opacity ${!isActive ? 'opacity-70' : ''}`}>
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{t('totalSpend')}</p>
           <p className="text-3xl font-black text-slate-900">{currency}{formatValue(campaign.performance.spend)}</p>
           
           <div className="mt-4 pt-4 border-t border-slate-50">
             <div className="flex items-center justify-between">
                <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest">{t('dailyBudget')}</p>
                {!isEditing && (
                   <button onClick={() => setIsEditing(true)} className="text-[8px] font-black text-slate-300 hover:text-blue-500 uppercase underline decoration-dotted">Change</button>
                )}
             </div>
             {isEditing ? (
               <div className="relative mt-1">
                 <span className="absolute left-2 top-1/2 -translate-y-1/2 text-blue-400 font-black text-xs">{currency}</span>
                 <input 
                   type="number"
                   value={editedBudget}
                   onChange={e => setEditedBudget(e.target.value)}
                   className="w-full bg-blue-50 text-blue-900 font-black pl-6 pr-2 py-2 rounded-xl focus:outline-none text-sm border border-blue-100"
                 />
               </div>
             ) : (
               <p className="text-lg font-black text-slate-800 mt-1">{currency}{campaign.budget}</p>
             )}
           </div>
        </div>
        <StatItem label={t('totalLeads')} value={campaign.performance.leads.toString()} subValue="Total conversions" active={isActive} />
        <StatItem label={t('avgCpl')} value={`${currency}${formatValue(campaign.performance.cpl)}`} subValue="Cost per lead" active={isActive} />
        <StatItem label="CTR" value={`${campaign.performance.ctr}%`} subValue="Click rate" active={isActive} />
      </div>

      {/* Chart & Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className={`lg:col-span-2 bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm flex flex-col transition-opacity ${!isActive ? 'opacity-70' : ''}`}>
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-black text-slate-800 uppercase tracking-[0.2em] text-[10px]">{t('performance')}</h3>
            <div className="flex items-center gap-4">
               <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-blue-600"></div>
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Leads</span>
               </div>
            </div>
          </div>
          <div className="w-full relative" style={{ height: '400px', minHeight: '400px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={performanceData}>
                <defs>
                  <linearGradient id="colorLeadsDetail" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontStyle: 'bold', fill: '#94a3b8'}} reversed={dir === 'rtl'} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontStyle: 'bold', fill: '#94a3b8'}} orientation={dir === 'rtl' ? 'right' : 'left'} />
                <Tooltip 
                  contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 20px 50px rgba(0,0,0,0.1)', padding: '16px' }} 
                  itemStyle={{ fontWeight: '900', textTransform: 'uppercase', fontSize: '10px' }}
                />
                <Area type="monotone" dataKey="leads" stroke="#2563eb" strokeWidth={5} fillOpacity={1} fill="url(#colorLeadsDetail)" animationDuration={1500} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-900 p-8 rounded-[40px] text-white shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-5 scale-[1.5] group-hover:scale-[1.7] transition-transform duration-700">
               <Icons.Robot />
            </div>
            <h3 className="font-black text-[10px] uppercase tracking-[0.2em] text-blue-400 mb-6 flex items-center gap-2">
              <Icons.Sparkles className="w-3 h-3" />
              {t('aiAnalysis')}
            </h3>
            {isAnalyzing ? (
              <div className="animate-pulse space-y-3">
                <div className="h-4 bg-white/10 rounded-full w-full"></div>
                <div className="h-4 bg-white/10 rounded-full w-11/12"></div>
                <div className="h-4 bg-white/10 rounded-full w-4/5"></div>
              </div>
            ) : (
              <p className="text-sm font-medium leading-relaxed opacity-90 italic">"{aiInsight}"</p>
            )}
            
            <div className="mt-8 pt-8 border-t border-white/5">
               <button className="text-[10px] font-black text-blue-400 uppercase tracking-[0.1em] hover:text-blue-300 transition-colors">Generate full PDF report →</button>
            </div>
          </div>
          
          <div className="bg-white p-7 rounded-[40px] border border-slate-200 shadow-sm">
             <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('aiOptimizations')}</p>
                <div className="px-3 py-1 bg-green-500 text-white rounded-full text-[8px] font-black uppercase tracking-widest shadow-lg shadow-green-100 animate-pulse">AUTONOMOUS</div>
             </div>
             <div className="flex items-baseline gap-2">
               <p className="text-4xl font-black text-slate-800">{campaign.performance.optimizations}</p>
               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Steps executed</p>
             </div>
             <p className="text-[10px] text-slate-500 font-medium mt-4 italic flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-slate-300"></div>
                Last optimization: Just now
             </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatItem = ({ label, value, subValue, active = true }: any) => (
  <div className={`bg-white p-7 rounded-[40px] border border-slate-200 shadow-sm transition-opacity ${!active ? 'opacity-70' : ''}`}>
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
    <p className="text-3xl font-black text-slate-900">{value}</p>
    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter mt-1">{subValue}</p>
  </div>
);

export default CampaignDetailView;
