import React, { useState, useEffect } from 'react';
import { Campaign, Platform, CampaignStatus, MetaAdAccount } from '../types';
import { Icons, EXCHANGE_RATE } from '../constants';
import { useTranslation } from '../App';
import { metaService, parseMetaInsights } from '../services/metaService';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { useData } from '../contexts/DataContext';

const Dashboard: React.FC = () => {
  const { t, dir, currency, lang } = useTranslation();
  
  const { 
    accountInsights, 
    chartData, 
    isLoading, 
    loadingStage,
    loadingProgress,
    dateRange, 
    setDateRangeType, 
    setCustomDateRange,
    adAccounts,
    selectedAccountId,
    setSelectedAccountId,
    isConnected,
    filteredCampaigns,
    campaigns: totalCampaigns,
    statusFilter,
    error,
    clearError
  } = useData();

  const loadingStageLabels: Record<string, { he: string; en: string }> = {
    campaigns: { he: 'טוען קמפיינים...', en: 'Loading campaigns...' },
    insights: { he: 'טוען ביצועים...', en: 'Loading performance data...' },
    leads: { he: 'טוען לידים...', en: 'Loading leads...' },
    done: { he: 'מסיים...', en: 'Finishing...' }
  };
  const loadingLabel = loadingStageLabels[loadingStage]?.[lang === 'he' ? 'he' : 'en'] ?? (lang === 'he' ? 'טוען...' : 'Loading...');

  // Conversion Goal Selector State (UI Preference)
  const [conversionGoal, setConversionGoal] = useState<string>(() => {
    return localStorage.getItem('dashboard_conversion_goal') || 'total';
  });

  const handleGoalChange = (goal: string) => {
    setConversionGoal(goal);
    localStorage.setItem('dashboard_conversion_goal', goal);
  };
  
  // Helper for custom date range UI
  const [isCustomRange, setIsCustomRange] = useState(dateRange.type === 'custom');
  
  // Sync local custom range state with context
  useEffect(() => {
    setIsCustomRange(dateRange.type === 'custom');
  }, [dateRange.type]);

  // Handle Account Change
  const handleAccountChange = (newAccountId: string) => {
    // ✅ לוג למעקב
    console.log(`🔄 Account changed in Dashboard`);
    console.log(`📊 Displaying data for account: ${newAccountId}`);
    console.log(`🔍 Fetching data for Account ID: ${newAccountId}`);
    // ✅ עדכון Global State ב-DataContext
    setSelectedAccountId(newAccountId);
  };

  // ✅ useEffect למעקב אחרי שינוי חשבון
  useEffect(() => {
    if (selectedAccountId) {
      console.log(`📊 Dashboard: Displaying data for account: ${selectedAccountId}`);
      const selectedAccount = adAccounts.find(acc => acc.account_id === selectedAccountId);
      if (selectedAccount) {
        console.log(`📊 Account name: ${selectedAccount.name}`);
      }
    }
  }, [selectedAccountId, adAccounts]);

  const hasFacebookConnection = isConnected;
  const displayedCampaigns = filteredCampaigns;
  
  // ... rest of calculations (stats, avgCpl, etc.) ...
  const stats = totalCampaigns.reduce((acc, c) => ({
    spend: acc.spend + (c.performance?.spend || 0),
    leads: acc.leads + (c.performance?.leads || 0),
    purchases: acc.purchases + (c.performance?.purchases || 0),
    revenue: acc.revenue + (c.performance?.revenue || 0),
    optimizations: acc.optimizations + (c.performance?.optimizations || 0)
  }), { spend: 0, leads: 0, purchases: 0, revenue: 0, optimizations: 0 });

  const formatValue = (val: number) => {
    if (lang === 'he') return Math.round(val * EXCHANGE_RATE).toLocaleString();
    return val.toLocaleString();
  };

  // Logic to determine what to show - based on revenue
  const isEcommerce = stats.revenue > 0;

  // ✅ תיקון: שימוש ב-accountInsights במקום סכימה של קמפיינים (Account Level - Single Source of Truth)
  const getDynamicStats = () => {
    // אם יש accountInsights, נשתמש בו (Account Level - Single Source of Truth)
    if (accountInsights) {
      const conversions = accountInsights.conversions || {};
      const convValue = conversions[conversionGoal] || 0;
      
      // ✅ וידוא שאנחנו משתמשים רק בנתוני החשבון הספציפי
      console.log(`📊 Using accountInsights for account ${selectedAccountId}:`, {
        spend: accountInsights.spend,
        impressions: accountInsights.impressions,
        clicks: accountInsights.clicks,
        conversions: convValue,
        revenue: accountInsights.revenue,
        leads: accountInsights.leads,
        purchases: accountInsights.purchases,
        whatsapp: accountInsights.conversions?.whatsapp || 0,
        allConversions: accountInsights.conversions
      });
      
      return {
        spend: accountInsights.spend || 0,
        conversions: convValue,
        revenue: accountInsights.revenue || 0,
        impressions: accountInsights.impressions || 0,
        clicks: accountInsights.clicks || 0,
        optimizations: stats.optimizations // זה עדיין מסכימת קמפיינים (לא קיים ב-accountInsights)
      };
    }
    
    // Fallback: סכימה של קמפיינים רק אם אין accountInsights
    // ✅ וידוא: הקמפיינים האלה כבר מסוננים לפי selectedAccountId ב-refreshData
    console.log(`⚠️ No accountInsights, falling back to campaign aggregation for account ${selectedAccountId}`);
    return totalCampaigns.reduce((acc, c) => {
      const convValue = c.conversions?.[conversionGoal] || 0;
      
      // אם נבחר Total, נסכם את הכל (מתוך ה-conversions.total אם קיים, או חישוב אם לא), אחרת רק את הסוג הספציפי
      const currentConversions = conversionGoal === 'total' 
        ? (c.conversions?.total || (c.conversions?.lead || 0) + (c.conversions?.whatsapp || 0) + (c.conversions?.purchase || 0)) 
        : convValue;

      return {
        spend: acc.spend + (c.performance?.spend || 0),
        conversions: acc.conversions + currentConversions,
        revenue: acc.revenue + (c.performance?.revenue || 0),
        optimizations: acc.optimizations + (c.performance?.optimizations || 0)
      };
    }, { spend: 0, conversions: 0, revenue: 0, optimizations: 0 });
  };

  const dynamicStats = getDynamicStats();
  const dynamicCPA = dynamicStats.conversions > 0 ? (dynamicStats.spend / dynamicStats.conversions) : 0;

  // הגדרת כותרות דינמיות
  const goalLabels: Record<string, string> = {
    'total': lang === 'he' ? 'סה"כ המרות' : 'Total Conversions',
    'lead': lang === 'he' ? 'לידים' : 'Leads',
    'whatsapp': lang === 'he' ? 'הודעות וואטסאפ' : 'WhatsApp',
    'purchase': lang === 'he' ? 'רכישות' : 'Purchases'
  };

  const avgCpl = stats.leads > 0 ? (stats.spend / stats.leads) : 0;
  const avgRoas = stats.spend > 0 ? (stats.revenue / stats.spend) : 0;
  // AOV Calculation: Revenue / Purchases
  const avgAov = stats.purchases > 0 ? (stats.revenue / stats.purchases) : 0;

  const platformCampaigns = displayedCampaigns.reduce((acc, campaign) => {
    campaign.platforms.forEach(p => {
      if (!acc[p]) acc[p] = [];
      acc[p].push(campaign);
    });
    return acc;
  }, {} as Record<string, Campaign[]>);

  const platformIcons: Record<string, React.ReactNode> = {
    [Platform.GOOGLE]: <Icons.Google />,
    [Platform.FACEBOOK]: <Icons.Facebook />,
    [Platform.TIKTOK]: <Icons.TikTok />,
    [Platform.LINKEDIN]: <Icons.LinkedIn />,
    [Platform.TABOOLA]: <Icons.Taboola />,
    [Platform.X]: <Icons.XIcon />,
    [Platform.INSTAGRAM]: <Icons.Instagram />,
  };

  // New Chart Data Calculation based on Filtered Campaigns
  const filteredChartData = React.useMemo(() => {
      if (statusFilter === 'ALL') return chartData; // Use account data for ALL
      
      // Aggregate daily history from filtered campaigns
      const dailyMap: Record<string, { spend: number, leads: number, purchases: number }> = {};
      
      displayedCampaigns.forEach(c => {
          if (c.history) {
              c.history.forEach(day => {
                  if (!dailyMap[day.date]) {
                      dailyMap[day.date] = { spend: 0, leads: 0, purchases: 0 };
                  }
                  dailyMap[day.date].spend += day.spend;
                  dailyMap[day.date].leads += day.leads;
                  dailyMap[day.date].purchases += day.purchases || 0;
              });
          }
      });
      
      return Object.entries(dailyMap)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([date, data]) => ({
              name: new Date(date).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { 
                month: 'short', 
                day: 'numeric' 
              }),
              date: date,
              ...data
          }));
  }, [displayedCampaigns, chartData, statusFilter, lang]);

  // During loading (with or without account yet) show progress so user always sees connection state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 max-w-md mx-auto">
        <div className="w-full space-y-5">
          <div className="flex justify-between text-sm">
            <span className="text-slate-600 font-medium" dir={dir}>
              {loadingLabel}
            </span>
            <span className="text-slate-500 tabular-nums">
              {loadingProgress}%
            </span>
          </div>
          <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${Math.min(100, Math.max(0, loadingProgress))}%` }}
            />
          </div>
          <p className="text-slate-400 text-xs text-center" dir={dir}>
            {lang === 'he' ? 'מתחבר לפייסבוק ומביא את הנתונים האחרונים' : 'Connecting to Facebook and fetching latest data'}
          </p>
        </div>
        <div className="mt-8 w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" aria-hidden />
      </div>
    );
  }

  // Not loading and not connected → show Connect Facebook
  if (!hasFacebookConnection) {
    return (
      <div className="space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-[32px] p-8 text-center">
             <div className="flex flex-col items-center gap-4">
            <div className="p-4 bg-blue-100 rounded-full">
              <Icons.Facebook className="w-12 h-12 text-blue-600" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-800 mb-2">
                {lang === 'he' ? 'חבר את חשבון פייסבוק' : 'Connect Your Facebook Account'}
              </h3>
              <p className="text-slate-600 mb-6">
                {lang === 'he' 
                  ? 'על מנת לראות את הנתונים האמיתיים מפייסבוק, אנא חבר את חשבון המודעות שלך.'
                  : 'To view real Facebook data, please connect your ad account.'}
              </p>
              <button
                onClick={() => {
                  window.location.hash = 'settings';
                }}
                className="px-6 py-3 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all"
              >
                {lang === 'he' ? 'התחברות לחשבונות' : 'Connect to Accounts'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const timeRangeOptions = [
    { value: 'today', label: lang === 'he' ? 'היום' : 'Today' },
    { value: 'yesterday', label: lang === 'he' ? 'אתמול' : 'Yesterday' },
    { value: 'last_7d', label: lang === 'he' ? '7 ימים אחרונים' : 'Last 7 Days' },
    { value: 'last_30d', label: lang === 'he' ? '30 ימים אחרונים' : 'Last 30 Days' },
    { value: 'custom', label: lang === 'he' ? 'טווח מותאם אישית' : 'Custom Range' },
  ];

  return (
    <div className="space-y-6">
      {/* Header Controls: Account Selector + Time Range */}
      {hasFacebookConnection && (
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-4 rounded-[24px] border border-slate-200 shadow-sm">
          
          {/* Account Selector */}
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl shrink-0">
              <Icons.Facebook />
            </div>
            <div className="flex flex-col w-full">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {lang === 'he' ? 'חשבון מודעות' : 'Ad Account'}
              </span>
              <select 
                value={selectedAccountId}
                onChange={(e) => handleAccountChange(e.target.value)}
                className="bg-transparent font-bold text-slate-800 text-sm outline-none cursor-pointer min-w-[200px]"
              >
                {adAccounts.map(account => (
                  <option key={account.account_id} value={account.account_id}>
                    {account.name} ({account.account_id})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="h-px w-full md:w-px md:h-10 bg-slate-100"></div>

          {/* NEW: Conversion Goal Selector */}
          <div className="flex flex-col w-full md:w-auto min-w-[150px]">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {lang === 'he' ? 'יעד המרה' : 'Conversion Goal'}
              </span>
              <select 
                value={conversionGoal}
                onChange={(e) => handleGoalChange(e.target.value)}
                className="bg-transparent font-bold text-slate-800 text-sm outline-none cursor-pointer"
              >
                <option value="total">{lang === 'he' ? 'כל ההמרות' : 'All Conversions'}</option>
                <option value="lead">{lang === 'he' ? 'לידים (טפסים+אתר)' : 'Leads (Forms+Site)'}</option>
                <option value="whatsapp">{lang === 'he' ? 'וואטסאפ' : 'WhatsApp'}</option>
                <option value="purchase">{lang === 'he' ? 'מכירות' : 'Sales'}</option>
              </select>
          </div>

          <div className="h-px w-full md:w-px md:h-10 bg-slate-100"></div>

          {/* NEW: Date Range Picker */}
          <div className="flex flex-col gap-2 w-full md:w-auto">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {lang === 'he' ? 'טווח תאריכים' : 'Date Range'}
            </span>
            <div className="flex flex-col gap-2">
              {dateRange.startDate && dateRange.endDate && (
                <span className="text-[10px] text-slate-500" title={lang === 'he' ? 'השווה לאותו טווח ב-Ads Manager' : 'Compare to same range in Ads Manager'}>
                  {dateRange.startDate} → {dateRange.endDate}
                </span>
              )}
              <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0">
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
                    {option.label}
                  </button>
                ))}
              </div>
              
              {/* Custom Date Range Inputs */}
              {isCustomRange && (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={dateRange.startDate}
                    onChange={(e) => {
                      setCustomDateRange(e.target.value, dateRange.endDate);
                    }}
                    className="px-3 py-2 rounded-lg text-xs font-bold text-slate-800 border border-slate-200 outline-none focus:border-blue-500"
                  />
                  <span className="text-slate-400 font-bold">-</span>
                  <input
                    type="date"
                    value={dateRange.endDate}
                    onChange={(e) => {
                      setCustomDateRange(dateRange.startDate, e.target.value);
                    }}
                    max={new Date().toISOString().split('T')[0]}
                    className="px-3 py-2 rounded-lg text-xs font-bold text-slate-800 border border-slate-200 outline-none focus:border-blue-500"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error Message - Show rate limit error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-[24px] p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-xl">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-red-800 text-sm mb-1">
                  {lang === 'he' ? 'שגיאה' : 'Error'}
                </h3>
                <p className="text-red-600 text-sm">
                  {error}
                </p>
              </div>
            </div>
            <button
              onClick={clearError}
              className="text-red-400 hover:text-red-600 transition-colors"
              aria-label={lang === 'he' ? 'סגור' : 'Close'}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Rest of dashboard - loading is handled by early return above */}
      <>

      {/* ... Rest of the dashboard (StatCards, Charts, Tables) ... */}
      {/* נתונים אמיתיים מחשבון מודעות – ללא אחוזי טרנד מזויפים */}
      {hasFacebookConnection && accountInsights && (
        <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-2">
          <Icons.Facebook className="w-4 h-4 text-blue-600" />
          <span>{lang === 'he' ? 'נתונים מחשבון מודעות פייסבוק' : 'Data from Facebook Ad Account'}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title={t('totalSpend')} value={`${currency}${formatValue(dynamicStats.spend)}`} trend="" icon={<Icons.Zap />} />
        <StatCard 
            title={goalLabels[conversionGoal]} 
            value={dynamicStats.conversions.toString()} 
            trend=""
            icon={conversionGoal === 'whatsapp' ? <Icons.WhatsApp /> : <Icons.Users />} 
            color="text-green-600" 
        />
        {conversionGoal === 'purchase' ? (
           <StatCard title="ROAS" value={`${avgRoas.toFixed(2)}x`} trend="" icon={<Icons.TrendingUp />} color="text-purple-600" />
        ) : (
           <StatCard 
             title={lang === 'he' ? `עלות ל-${goalLabels[conversionGoal]}` : `Cost per ${goalLabels[conversionGoal]}`} 
             value={`${currency}${formatValue(Number(dynamicCPA))}`} 
             trend=""
             icon={<Icons.TrendingUp />} 
             color="text-blue-600" 
           />
        )}
        {conversionGoal === 'purchase' ? (
          <StatCard title="Revenue" value={`${currency}${formatValue(dynamicStats.revenue)}`} trend="" icon={<Icons.CreditCard />} color="text-emerald-600" />
        ) : (
          <StatCard title={t('aiOptimizations')} value={stats.optimizations.toString()} trend="" icon={<Icons.Robot />} color="text-pink-600" />
        )}
      </div>

      {/* פירוט מדדים מלא – הוצאה, חשיפות, קליקים, לידים, וואטסאפ, רכישות */}
      {hasFacebookConnection && accountInsights && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
          <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">
            {lang === 'he' ? 'פירוט מדדים (נתוני אמת)' : 'Metrics breakdown (real data)'}
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            <div className="bg-white rounded-xl p-3 border border-slate-100">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">{lang === 'he' ? 'הוצאה' : 'Spend'}</span>
              <span className="font-black text-slate-800">{currency}{formatValue(accountInsights.spend || 0)}</span>
            </div>
            <div className="bg-white rounded-xl p-3 border border-slate-100">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">{lang === 'he' ? 'חשיפות' : 'Impressions'}</span>
              <span className="font-black text-slate-800">{formatValue(accountInsights.impressions || 0)}</span>
            </div>
            <div className="bg-white rounded-xl p-3 border border-slate-100">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">{lang === 'he' ? 'קליקים' : 'Clicks'}</span>
              <span className="font-black text-slate-800">{formatValue(accountInsights.clicks || 0)}</span>
            </div>
            <div className="bg-white rounded-xl p-3 border border-slate-100">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">{lang === 'he' ? 'לידים (טפסים+אתר)' : 'Leads (forms+site)'}</span>
              <span className="font-black text-slate-800">{formatValue(accountInsights.conversions?.lead ?? accountInsights.leads ?? 0)}</span>
            </div>
            <div className="bg-white rounded-xl p-3 border border-slate-100">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">{lang === 'he' ? 'וואטסאפ' : 'WhatsApp'}</span>
              <span className="font-black text-slate-800">{formatValue(accountInsights.conversions?.whatsapp ?? 0)}</span>
            </div>
            <div className="bg-white rounded-xl p-3 border border-slate-100">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">{lang === 'he' ? 'רכישות' : 'Purchases'}</span>
              <span className="font-black text-slate-800">{formatValue(accountInsights.conversions?.purchase ?? accountInsights.purchases ?? 0)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-slate-800 uppercase tracking-wide text-xs">{t('performance')}</h3>
          </div>
          <div className="w-full relative" style={{ height: '350px', minHeight: '350px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredChartData.length > 0 ? filteredChartData : [{ name: 'No Data', spend: 0, leads: 0 }]} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fontSize: 10, fill: '#64748b'}} 
                  reversed={dir === 'rtl'}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fontSize: 10, fill: '#64748b'}} 
                  orientation={dir === 'rtl' ? 'right' : 'left'} 
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
                <Area type="monotone" dataKey="leads" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorLeads)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm flex flex-col">
          <h3 className="font-bold text-slate-800 mb-6 uppercase tracking-wide text-xs">{t('activityLog')}</h3>
          <div className="space-y-6 flex-1">
            <ActivityItem time="1h ago" action="Paused weak creative" description="Low CTR (0.45%)" icon={<Icons.AlertCircle />} />
            <ActivityItem time="3h ago" action="Increased budget" description="Facebook ROI > 3.0" icon={<Icons.TrendingUp />} />
            <ActivityItem time="5h ago" action="Audience expanded" description="Lookalike 1% active" icon={<Icons.Users />} />
          </div>
        </div>
      </div>

      {/* Campaigns Table */}
      <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm space-y-8">
        <div className="flex items-center gap-3 border-b border-slate-50 pb-6">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
            <Icons.Layout />
          </div>
          <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">{t('campaignsByPlatform')}</h3>
        </div>

        {Object.keys(platformCampaigns).length > 0 ? (
          <div className="space-y-10">
            {(Object.entries(platformCampaigns) as [string, Campaign[]][]).map(([pName, platformCampaignsList]) => (
              <div key={pName} className="space-y-4 animate-in fade-in duration-500">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-50 text-slate-400 rounded-xl">
                    {platformIcons[pName] || <Icons.Logo />}
                  </div>
                  <h4 className="font-black text-slate-700 uppercase tracking-widest text-xs">{pName}</h4>
                  <div className="h-px bg-slate-100 flex-1"></div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-start">
                    <thead>
                      <tr className="border-b border-slate-50 text-slate-400">
                        <th className="py-4 font-black uppercase text-[10px] tracking-widest text-start">{t('campaigns')}</th>
                        <th className="py-4 font-black uppercase text-[10px] tracking-widest text-start">{t('status')}</th>
                        <th className="py-4 font-black uppercase text-[10px] tracking-widest text-start">{t('totalSpend')}</th>
                        
                        {/* Dynamic Columns based on Client Type */}
                        {!isEcommerce ? (
                          <>
                            <th className="py-4 font-black uppercase text-[10px] tracking-widest text-start">{t('totalLeads')}</th>
                            <th className="py-4 font-black uppercase text-[10px] tracking-widest text-start">CTR</th>
                            <th className="py-4 font-black uppercase text-[10px] tracking-widest text-start">{t('avgCpl')}</th>
                          </>
                        ) : (
                          <>
                            <th className="py-4 font-black uppercase text-[10px] tracking-widest text-start">{lang === 'he' ? 'הזמנות' : 'Purchases'}</th>
                            <th className="py-4 font-black uppercase text-[10px] tracking-widest text-start">{lang === 'he' ? 'הכנסות' : 'Revenue'}</th>
                            <th className="py-4 font-black uppercase text-[10px] tracking-widest text-start">ROAS</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {platformCampaignsList.map(campaign => (
                        <tr key={campaign.id} className="group hover:bg-slate-50/50 transition-colors">
                          <td className="py-5">
                            <p className="font-bold text-slate-800 text-sm">{campaign.name}</p>
                            <p className="text-[10px] text-slate-400">{campaign.objective}</p>
                          </td>
                          <td className="py-5">
                            <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase ${campaign.status === CampaignStatus.ACTIVE ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-500'}`}>
                              {campaign.status}
                            </span>
                          </td>
                          <td className="py-5 font-bold text-sm text-slate-700">{currency}{formatValue(campaign.performance.spend)}</td>
                          
                          {/* Dynamic Rows based on Client Type */}
                          {!isEcommerce ? (
                            <>
                              <td className="py-5 font-bold text-sm text-slate-700">{campaign.performance.leads}</td>
                              <td className="py-5 font-bold text-sm text-slate-700">{campaign.performance.ctr}%</td>
                              <td className="py-5 font-bold text-sm text-slate-700">{currency}{formatValue(campaign.performance.cpl)}</td>
                            </>
                          ) : (
                            <>
                              <td className="py-5 font-bold text-sm text-slate-700">{campaign.performance.purchases || 0}</td>
                              <td className="py-5 font-bold text-sm text-slate-700">{currency}{formatValue(campaign.performance.revenue || 0)}</td>
                              <td className="py-5 font-bold text-sm text-purple-600">{(campaign.performance.roas || 0).toFixed(2)}x</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-slate-400 italic">
            <p>No active campaigns found. Start your first AI strategy to see data here!</p>
          </div>
        )}
      </div>
        </>
    </div>
  );
};

const StatCard = ({ title, value, trend, icon, color = "text-slate-800" }: any) => (
  <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm flex flex-col justify-between">
    <div className="flex items-center justify-between mb-4">
      <div className={`p-2 rounded-xl bg-slate-50 ${color}`}>{icon}</div>
      <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${trend.includes('+') ? 'bg-green-50 text-green-600' : trend === 'Active' ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'}`}>
        {trend}
      </span>
    </div>
    <div>
      <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">{title}</p>
      <h4 className="text-2xl font-black text-slate-900 mt-1">{value}</h4>
    </div>
  </div>
);

const ActivityItem = ({ time, action, description, icon }: any) => (
  <div className="flex gap-4">
    <div className="mt-1 shrink-0">{icon}</div>
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <p className="text-sm font-bold text-slate-800 truncate">{action}</p>
        <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">{time}</span>
      </div>
      <p className="text-xs text-slate-500 truncate">{description}</p>
    </div>
  </div>
);

export default Dashboard;
