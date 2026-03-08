import React, { useState, useEffect, createContext, useContext } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import ChatInterface from './components/ChatInterface';
import Dashboard from './components/Dashboard';
import CampaignDetailView from './components/CampaignDetailView';
import Glossary from './components/Glossary';
import LandingPageBuilder from './components/LandingPageBuilder';
import CreativeStudio from './components/CreativeStudio';
import CampaignWizard from './components/CampaignWizard';
import CRM from './components/CRM';
import Settings from './components/Settings';
import AccountSetup from './components/AccountSetup';
import AIChatAssistant from './components/AIChatAssistant';
import { Campaign, CampaignStatus, Platform, Language, SubscriptionInfo, PlanId, AdCreative, Lead, LeadStatus } from './types';
import { Icons, TRANSLATIONS, LANGUAGES, PRICING_PLANS, EXCHANGE_RATE } from './constants';
import { DataProvider, useData } from './contexts/DataContext';
import { config } from './config';

interface TranslationContextType {
  lang: Language;
  t: (key: string) => string;
  setLang: (lang: Language) => void;
  dir: 'ltr' | 'rtl';
  currency: string;
}

const TranslationContext = createContext<TranslationContextType | undefined>(undefined);

export const useTranslation = () => {
  const context = useContext(TranslationContext);
  if (!context) throw new Error('useTranslation must be used within I18nProvider');
  return context;
};

const AppContent: React.FC = () => {
  const { filteredCampaigns, isConnected, isLoading, leads: contextLeads, dateRange, setDateRangeType, setCustomDateRange, refreshData } = useData();
  const { t, lang } = useTranslation();
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Local state for campaigns to allow optimistic updates/UI interactions, 
  // but initialized/synced with context
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  
  useEffect(() => {
    // Sync with filtered campaigns from context
    console.log(`🔄 App: Syncing campaigns from context. Count: ${filteredCampaigns.length}`);
    if (filteredCampaigns.length > 0) {
      console.log(`📊 App: First campaign sample:`, {
        name: filteredCampaigns[0].name,
        spend: filteredCampaigns[0].performance?.spend,
        leads: filteredCampaigns[0].performance?.leads
      });
    }
    setCampaigns(filteredCampaigns);
  }, [filteredCampaigns]);

  // Use leads from context instead of mock data
  const [leads, setLeads] = useState<Lead[]>([]);

  useEffect(() => {
    // Sync with leads from context
    setLeads(contextLeads);
  }, [contextLeads]);

  // Hash routing support
  useEffect(() => {
    // Check initial hash
    const hash = window.location.hash.replace('#', '');
    if (hash && ['dashboard', 'campaigns', 'crm', 'creative-studio', 'landing-pages', 'glossary', 'billing', 'settings', 'account-setup', 'chat', 'campaign-wizard'].includes(hash)) {
      setActiveTab(hash);
    }

    // Listen to hash changes
    const handleHashChange = () => {
      const newHash = window.location.hash.replace('#', '');
      if (newHash && ['dashboard', 'campaigns', 'crm', 'creative-studio', 'landing-pages', 'glossary', 'billing', 'settings', 'account-setup', 'chat', 'campaign-wizard'].includes(newHash)) {
        setActiveTab(newHash);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<string | null>(null);
  
  const [subscription, setSubscription] = useState<SubscriptionInfo>({
    planId: 'pro',
    status: 'active',
    currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
  });

  const handleCampaignCreated = (campaign: Campaign) => {
    setCampaigns(prev => [campaign, ...prev]);
    setActiveTab('campaigns');
  };

  const updateCampaign = (updatedCampaign: Campaign) => {
    setCampaigns(prev => prev.map(c => c.id === updatedCampaign.id ? updatedCampaign : c));
    if (selectedCampaign?.id === updatedCampaign.id) {
      setSelectedCampaign(updatedCampaign);
    }
  };

  const toggleCampaignStatus = async (campaign: Campaign) => {
    const isPause = campaign.status === CampaignStatus.ACTIVE;
    const actionText = isPause ? (lang === 'he' ? 'להשהות' : 'pause') : (lang === 'he' ? 'להפעיל' : 'resume');
    const msg = lang === 'he'
      ? `האם לאשר ${actionText} את הקמפיין "${campaign.name}"?`
      : `Confirm ${actionText} campaign "${campaign.name}"?`;
    if (!window.confirm(msg)) return;

    try {
      const endpoint = isPause ? 'pause' : 'resume';
      const res = await fetch(`${config.apiBaseUrl}/api/facebook/campaigns/${campaign.id}/${endpoint}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const newStatus = isPause ? CampaignStatus.PAUSED : CampaignStatus.ACTIVE;
      setCampaigns(prev => prev.map(c => c.id === campaign.id ? { ...c, status: newStatus } : c));
      if (selectedCampaign?.id === campaign.id) setSelectedCampaign({ ...campaign, status: newStatus });
      await refreshData();
    } catch (e: any) {
      alert(lang === 'he' ? `שגיאה: ${e.message}` : `Error: ${e.message}`);
    }
  };

  const confirmDeleteCampaign = () => {
    if (campaignToDelete) {
      setCampaigns(prev => prev.filter(c => c.id !== campaignToDelete));
      if (selectedCampaign?.id === campaignToDelete) {
        setSelectedCampaign(null);
      }
      setCampaignToDelete(null);
    }
  };

  const updateLead = (updatedLead: Lead) => {
    setLeads(prev => prev.map(l => l.id === updatedLead.id ? updatedLead : l));
    // שמירה ב-LocalStorage
    localStorage.setItem(`lead_status_${updatedLead.id}`, updatedLead.status);
  };

  const handleAddCreativeToCampaign = (campaignId: string, creative: AdCreative) => {
    setCampaigns(prev => prev.map(c => 
      c.id === campaignId ? { ...c, creatives: [creative, ...c.creatives] } : c
    ));
  };

  const handleViewAnalytics = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setActiveTab('campaigns');
  };

  return (
      <div className={`flex h-screen bg-slate-50 text-slate-900 overflow-hidden ${lang === 'he' ? 'rtl' : 'ltr'}`}>
        <Sidebar 
          activeTab={activeTab} 
          setActiveTab={(tab) => { setActiveTab(tab); if (tab !== 'campaigns') setSelectedCampaign(null); }} 
          currentPlan={subscription.planId} 
          isOpen={isMobileMenuOpen} 
          onClose={() => setIsMobileMenuOpen(false)} 
        />
        
        <main className="flex-1 flex flex-col min-w-0 h-screen relative">
          <Header 
            activeTab={activeTab} 
            toggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
            onNewCampaign={() => { setActiveTab('campaign-wizard'); setSelectedCampaign(null); }}
          />
          
          <div className="flex-1 overflow-y-auto p-4 md:p-8">
            {activeTab === 'dashboard' && (
              <div className="max-w-7xl mx-auto space-y-8">
                <div>
                  <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">{t('growthDashboard')}</h2>
                  <p className="text-slate-500 text-sm">{t('dashboardSub')}</p>
                </div>
                {/* Dashboard uses context directly */}
                <Dashboard />
              </div>
            )}
            {activeTab === 'crm' && (
              <div className="max-w-7xl mx-auto">
                <CRM leads={leads} onUpdateLead={updateLead} />
              </div>
            )}
            {activeTab === 'campaign-wizard' && <CampaignWizard onCampaignCreated={handleCampaignCreated} />}
            {activeTab === 'chat' && <ChatInterface onCampaignCreated={handleCampaignCreated} />}
            {activeTab === 'campaigns' && (
              <div className="max-w-7xl mx-auto space-y-6">
                {!selectedCampaign && <CampaignsDateRangePicker dateRange={dateRange} setDateRangeType={setDateRangeType} setCustomDateRange={setCustomDateRange} />}
                {selectedCampaign ? <CampaignDetailView campaign={selectedCampaign} onBack={() => setSelectedCampaign(null)} onUpdate={updateCampaign} onToggleStatus={toggleCampaignStatus} onRefreshData={refreshData} /> : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {campaigns.length === 0 && !isLoading ? (
                         <div className="col-span-full text-center py-20 text-slate-400 italic">
                             {t('noCampaignsFound') || "No campaigns found. Create your first campaign!"}
                         </div>
                    ) : (
                        (() => {
                          const isSalesAccount = campaigns.reduce((sum, x) => sum + (x.performance?.revenue || 0), 0) > 0;
                          return campaigns.map(c => (
                            <CampaignCard 
                              key={c.id} 
                              campaign={c} 
                              isSalesAccount={isSalesAccount}
                              onViewAnalytics={() => handleViewAnalytics(c)} 
                              onDelete={() => setCampaignToDelete(c.id)}
                              onToggleStatus={() => toggleCampaignStatus(c)}
                            />
                          ));
                        })()
                    )}
                  </div>
                )}
              </div>
            )}
            {activeTab === 'creative-studio' && <CreativeStudio campaigns={campaigns} onAddCreative={handleAddCreativeToCampaign} />}
            {activeTab === 'landing-pages' && <LandingPageBuilder campaigns={campaigns} />}
            {activeTab === 'glossary' && <Glossary />}
            {activeTab === 'billing' && (
               <div className="max-w-5xl mx-auto pb-12">
                 <div className="bg-white p-12 rounded-[40px] border border-slate-200 shadow-2xl text-center">
                   <h2 className="text-3xl font-black mb-4">{t('billing')}</h2>
                   <p className="text-slate-500 mb-10">{t('pricingSub')}</p>
                   <div className="max-w-md mx-auto p-8 bg-blue-600 rounded-[32px] text-white shadow-2xl">
                      <div className="flex items-center justify-between mb-4">
                        <span className="px-3 py-1 bg-white/20 rounded-lg text-[10px] font-black uppercase">{t('active')}</span>
                        <Icons.CheckCircle />
                      </div>
                      <h3 className="text-2xl font-black mb-2">PPC MASTER PRO</h3>
                      <p className="text-sm opacity-80 mb-6">Unlimited AI Access & Management</p>
                      <button className="w-full py-4 bg-white text-blue-600 rounded-2xl font-black text-sm uppercase tracking-widest">
                        MANAGE SUBSCRIPTION
                      </button>
                   </div>
                 </div>
               </div>
            )}
            {activeTab === 'settings' && <Settings />}
            {activeTab === 'account-setup' && <AccountSetup />}
          </div>
        </main>

        {/* Custom Delete Confirmation Modal */}
        {campaignToDelete && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setCampaignToDelete(null)} />
            <div className="relative bg-white w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 p-8 text-center space-y-6">
              <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <Icons.Trash className="w-10 h-10" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">
                  {lang === 'he' ? 'מחיקת קמפיין' : 'Delete Campaign'}
                </h3>
                <p className="text-slate-500 text-sm font-medium">
                  {t('deleteConfirm')}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4">
                <button 
                  onClick={() => setCampaignToDelete(null)}
                  className="px-6 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-200 transition-all"
                >
                  {t('cancel')}
                </button>
                <button 
                  onClick={confirmDeleteCampaign}
                  className="px-6 py-4 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-red-100 hover:bg-red-700 hover:scale-[1.02] active:scale-95 transition-all"
                >
                  {lang === 'he' ? 'מחק לצמיתות' : 'Delete Permanently'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* AI Chat Assistant - Floating */}
        <AIChatAssistant />
      </div>
  );
};

const App: React.FC = () => {
  const [lang, setLang] = useState<Language>('he');
  const currentLangConfig = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0];
  const currency = lang === 'he' ? '₪' : '$';

  useEffect(() => {
    document.documentElement.dir = currentLangConfig.dir;
    document.documentElement.lang = lang;
  }, [lang]);

  const t = (key: string) => {
    return TRANSLATIONS[lang][key] || key;
  };

  return (
    <TranslationContext.Provider value={{ lang, t, setLang, dir: currentLangConfig.dir, currency }}>
      <DataProvider>
        <AppContent />
      </DataProvider>
    </TranslationContext.Provider>
  );
};

const timeRangeOptions = [
  { value: 'yesterday', labelHe: 'אתמול', labelEn: 'Yesterday' },
  { value: 'today', labelHe: 'היום', labelEn: 'Today' },
  { value: 'last_7d', labelHe: '7 ימים אחרונים', labelEn: 'Last 7 Days' },
  { value: 'last_30d', labelHe: '30 יום אחרונים', labelEn: 'Last 30 Days' },
  { value: 'custom', labelHe: 'טווח תאריכים', labelEn: 'Date Range' },
];

const CampaignsDateRangePicker: React.FC<{
  dateRange: { type: string; startDate: string; endDate: string };
  setDateRangeType: (type: string) => void;
  setCustomDateRange: (start: string, end: string) => void;
}> = ({ dateRange, setDateRangeType, setCustomDateRange }) => {
  const { lang } = useTranslation();
  const [isCustomRange, setIsCustomRange] = React.useState(dateRange.type === 'custom');

  React.useEffect(() => {
    setIsCustomRange(dateRange.type === 'custom');
  }, [dateRange.type]);

  return (
    <div className="flex flex-col gap-2 bg-white p-4 rounded-[24px] border border-slate-200 shadow-sm">
      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
        {lang === 'he' ? 'טווח תאריכים' : 'Date Range'}
      </span>
      <div className="flex flex-col gap-2">
        {dateRange.startDate && dateRange.endDate && (
          <span className="text-[10px] text-slate-500">
            {dateRange.startDate} → {dateRange.endDate}
          </span>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {timeRangeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                setDateRangeType(option.value);
                setIsCustomRange(option.value === 'custom');
              }}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                dateRange.type === option.value
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-100'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {lang === 'he' ? option.labelHe : option.labelEn}
            </button>
          ))}
        </div>
        {isCustomRange && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => setCustomDateRange(e.target.value, dateRange.endDate)}
              className="px-3 py-2 rounded-lg text-xs font-bold text-slate-800 border border-slate-200 outline-none focus:border-blue-500"
            />
            <span className="text-slate-400 font-bold">-</span>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => setCustomDateRange(dateRange.startDate, e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              className="px-3 py-2 rounded-lg text-xs font-bold text-slate-800 border border-slate-200 outline-none focus:border-blue-500"
            />
          </div>
        )}
      </div>
    </div>
  );
};

const CampaignCard = ({ campaign, isSalesAccount, onViewAnalytics, onDelete, onToggleStatus }: any) => {
  const { t, currency, lang } = useTranslation();
  const isActive = campaign.status === CampaignStatus.ACTIVE;
  
  // ✅ פונקציה לעיצוב ערכים (המרת מטבע ופורמט) - כמו ב-Dashboard
  const formatValue = (val: number) => {
    if (lang === 'he') return Math.round(val * EXCHANGE_RATE).toLocaleString();
    return val.toLocaleString();
  };
  
  const platformIcons: Record<string, React.ReactNode> = {
    [Platform.GOOGLE]: <Icons.Google />,
    [Platform.FACEBOOK]: <Icons.Facebook />,
    [Platform.TIKTOK]: <Icons.TikTok />,
    [Platform.LINKEDIN]: <Icons.LinkedIn />,
    [Platform.TABOOLA]: <Icons.Taboola />,
    [Platform.X]: <Icons.XIcon />,
    [Platform.INSTAGRAM]: <Icons.Instagram />,
    [Platform.WHATSAPP]: <Icons.WhatsApp />,
  };

  const platformNames = campaign.platforms.join(' & ');
  const campaignTypeLabel = lang === 'he' 
    ? `קמפיין ${campaign.objective} ב-${platformNames}` 
    : `${campaign.objective} Campaign on ${platformNames}`;

  return (
    <div className={`bg-white rounded-[40px] border border-slate-100 p-8 shadow-sm hover:shadow-2xl transition-all h-full flex flex-col group relative overflow-hidden ${!isActive ? 'opacity-70 grayscale-[0.5]' : ''}`}>
      {/* Platform Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex -space-x-2">
          {campaign.platforms.map((p: any) => (
            <div key={p} className="w-8 h-8 p-1.5 bg-slate-50 border border-white rounded-xl shadow-sm flex items-center justify-center bg-white group-hover:scale-110 transition-transform">
              {platformIcons[p] || <Icons.Logo />}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className={`px-2 py-1 text-[9px] font-black uppercase rounded-lg tracking-widest ${isActive ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
            {isActive ? campaign.objective : (lang === 'he' ? 'מושהה' : 'Paused')}
          </span>
          <button 
            onClick={(e) => { e.stopPropagation(); onToggleStatus(); }} 
            title={isActive ? t('pause') : t('resume')}
            className={`p-2 rounded-xl transition-all ${isActive ? 'text-slate-400 hover:text-orange-500 hover:bg-orange-50' : 'text-slate-400 hover:text-green-500 hover:bg-green-50'}`}
          >
            {isActive ? <Icons.Pause /> : <Icons.Play />}
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onDelete(); }} 
            className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
          >
            <Icons.Trash />
          </button>
        </div>
      </div>

      <div className="mb-2">
        <h3 className="font-black text-slate-800 text-xl truncate">{campaign.name}</h3>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
          {campaignTypeLabel}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 my-6">
        <div>
          <p className="text-[10px] font-black text-slate-300 uppercase">{t('totalSpend')}</p>
          <p className="font-black text-slate-800 text-lg">{currency}{formatValue(campaign.performance.spend || 0)}</p>
        </div>
        <div>
          <p className="text-[10px] font-black text-slate-300 uppercase">{isSalesAccount ? t('totalSales') : t('totalLeads')}</p>
          <p className="font-black text-slate-800 text-lg">
            {isSalesAccount ? (campaign.performance.purchases ?? 0) : (campaign.performance.leads ?? 0)}
          </p>
        </div>
      </div>

      <button onClick={onViewAnalytics} className={`w-full py-4 rounded-[20px] text-xs font-black uppercase tracking-widest transition-all mt-auto shadow-sm ${isActive ? 'bg-slate-50 text-blue-600 hover:bg-blue-600 hover:text-white' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`} disabled={!isActive}>
        {t('analytics')}
      </button>
    </div>
  );
};

export default App;
