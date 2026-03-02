import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { Campaign, MetaAdAccount, CampaignStatus, Platform, Lead, LeadStatus } from '../types';
import { metaService, parseMetaInsights } from '../services/metaService';
import { config } from '../config';

interface DataContextType {
  campaigns: Campaign[];
  adAccounts: MetaAdAccount[];
  selectedAccountId: string;
  isLoading: boolean;
  /** שלב הטעינה הנוכחי (למשל: campaigns, insights, leads) - לתצוגת התקדמות */
  loadingStage: string;
  /** אחוז התקדמות 0–100 - לתצוגת פס התקדמות */
  loadingProgress: number;
  dateRange: {
    type: string;
    startDate: string;
    endDate: string;
  };
  accountInsights: any;
  chartData: any[];
  refreshData: () => Promise<void>;
  setSelectedAccountId: (id: string) => void;
  setDateRangeType: (type: string) => void;
  setCustomDateRange: (start: string, end: string) => void;
  isConnected: boolean;
  statusFilter: 'ALL' | 'ACTIVE' | 'PAUSED';
  setStatusFilter: (status: 'ALL' | 'ACTIVE' | 'PAUSED') => void;
  filteredCampaigns: Campaign[];
  leads: Lead[];
  fetchLeads: () => Promise<void>;
  error: string | null;
  clearError: () => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData must be used within DataProvider');
  return context;
};

// Helper for date ranges.
// Note: dates are built in the browser's local timezone. For 1:1 match with Meta Ads Manager
// (which uses the ad account's timezone), consider building start/end on the server using the account's timezone_name.
const getDateRange = (rangeType: string, customStart?: string, customEnd?: string) => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    let end = new Date(today);
    let start = new Date(today);

    switch (rangeType) {
      case 'today':
        start.setHours(0, 0, 0, 0);
        break;
      case 'yesterday':
        // ✅ תיקון: אתמול = אותו יום (start ו-end זהים)
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        start = new Date(yesterday);
        start.setHours(0, 0, 0, 0);
        end = new Date(yesterday);
        end.setHours(23, 59, 59, 999);
        break;
      case 'last_7d':
        start.setDate(start.getDate() - 7);
        start.setHours(0, 0, 0, 0);
        break;
      case 'last_30d':
        start.setDate(start.getDate() - 30);
        start.setHours(0, 0, 0, 0);
        break;
      case 'custom':
        if (customStart) start = new Date(customStart);
        if (customEnd) end = new Date(customEnd);
        break;
      default:
        start.setDate(start.getDate() - 7);
        start.setHours(0, 0, 0, 0);
    }
    
    const formatDate = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    return {
      start: formatDate(start),
      end: formatDate(end)
    };
};

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [adAccounts, setAdAccounts] = useState<MetaAdAccount[]>([]);
  const [selectedAccountId, setSelectedAccountIdState] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState('');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [accountInsights, setAccountInsights] = useState<any>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'PAUSED'>('ALL');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Date State
  const [dateRangeType, setDateRangeTypeState] = useState('last_7d');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Initialize dates
  useEffect(() => {
    const { start, end } = getDateRange('last_7d');
    setStartDate(start);
    setEndDate(end);
  }, []);

  const setDateRangeType = (type: string) => {
    setDateRangeTypeState(type);
    if (type !== 'custom') {
        const { start, end } = getDateRange(type);
        setStartDate(start);
        setEndDate(end);
    }
  };

  const setCustomDateRange = (start: string, end: string) => {
      setDateRangeTypeState('custom');
      setStartDate(start);
      setEndDate(end);
  };

  const setSelectedAccountId = useCallback((id: string) => {
      // ✅ איפוס מלא של כל ה-States לפני החלפת חשבון - בידוד מלא בין חשבונות
      console.log(`🔄 Switching account to ${id}`);
      console.log(`🧹 Resetting all states for account isolation...`);
      
      // ✅ עצירת כל טעינה פעילה
      isRefreshingRef.current = false;
      isFetchingRef.current = false;
      lastRefreshParamsRef.current = null;
      
      // ✅ איפוס מיידי של כל הנתונים - מניעת הצגת נתונים מחשבון קודם
      setCampaigns([]);
      setAccountInsights(null);
      setLeads([]);
      setChartData([]);
      setIsLoading(true);
      setIsConnected(false);
      dataCacheRef.current.clear();
      
      // עדכון החשבון הנבחר
      setSelectedAccountIdState(id);
      // ✅ תיקון: עדכון החשבון בלי לגרום ל-initializeConnection להיקרא שוב
      metaService.setSelectedAccount(id, true); // skipEvent = true למניעת לולאה
      lastInitializedAccountRef.current = id;
      
      // ✅ לוג למעקב
      console.log(`✅ Account switched to: ${id}`);
      console.log(`📊 All previous account data cleared - ready for new account data`);
  }, []); // ✅ תיקון: הסרת selectedAccountId מה-dependencies - נשתמש ב-id מהפרמטר

  // ✅ תיקון: פונקציה למשיכת לידים עם useCallback למניעת יצירה מחדש
  const fetchLeads = useCallback(async () => {
    if (!selectedAccountId || !startDate || !endDate) return;
    
    try {
      const response = await fetch(
        `${config.apiBaseUrl}/api/facebook/leads?accountId=${selectedAccountId}&startDate=${startDate}&endDate=${endDate}`,
        {
          credentials: 'include'
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch leads');
      }
      
      const rawLeads = await response.json();
      
      // מיפוי ללידים עם סטטוס מ-LocalStorage
      const leadsWithStatus: Lead[] = rawLeads.map((rawLead: any) => {
        const savedStatus = localStorage.getItem(`lead_status_${rawLead.id}`);
        const status = savedStatus ? (savedStatus as LeadStatus) : LeadStatus.NEW;
        
        return {
          id: rawLead.id,
          name: rawLead.name,
          email: rawLead.email || '',
          phone: rawLead.phone || '',
          status: status,
          campaignId: rawLead.campaignId,
          campaignName: rawLead.campaignName,
          value: 0, // ניתן לחשב לפי קמפיין או להוסיף שדה נוסף
          createdAt: rawLead.createdAt,
          aiScore: 0, // נתון אמיתי יוגדר בעתיד (AI)
          aiInsight: 'High intent user based on campaign engagement.'
        };
      });
      
      setLeads(leadsWithStatus);
      console.log(`✅ Fetched ${leadsWithStatus.length} leads for account ${selectedAccountId}`);
    } catch (error) {
      console.error('Error fetching leads:', error);
      setLeads([]);
    }
  }, [selectedAccountId, startDate, endDate]);

  // ✅ תיקון: שימוש ב-useRef למניעת לולאות אינסופיות - מעקב אחרי טעינה פעילה
  const isRefreshingRef = useRef(false);
  const lastRefreshParamsRef = useRef<{ accountId: string; startDate: string; endDate: string } | null>(null);
  const isFetchingRef = useRef(false); // ✅ תיקון: משתנה נוסף למניעת קריאות כפולות
  const isInitializingRef = useRef(false); // ✅ תיקון: מניעת קריאות כפולות ל-initializeConnection
  const lastInitializedAccountRef = useRef<string | null>(null); // ✅ תיקון: מעקב אחרי החשבון האחרון שאותחל
  const DATA_CACHE_TTL_MS = 2 * 60 * 1000; // 2 דקות cache - שינוי תאריך לטרוף שכבר טענו מרגיש מיידי
  const dataCacheRef = useRef<Map<string, { campaigns: Campaign[]; accountInsights: any; chartData: any[]; leads: Lead[]; timestamp: number }>>(new Map());

  // ✅ תיקון: שימוש ב-useCallback כדי למנוע יצירה מחדש של הפונקציה
  const refreshData = useCallback(async () => {
    // ✅ תיקון: מניעת קריאות כפולות - אם כבר בטעינה, לא נקרא שוב
    if (isRefreshingRef.current || isFetchingRef.current) {
      console.log('⏸️ refreshData already in progress, skipping duplicate call');
      return;
    }

    // ✅ כל הנתונים (קמפיינים, ביצועים, לידים) תמיד לפי החשבון שנבחר – גם במסך קמפיינים וגם במסך ביצועים
    const currentAccountId = selectedAccountId;
    
    if (!currentAccountId || !startDate || !endDate) {
      console.log('⏸️ refreshData skipped - missing required values');
      setIsConnected(false);
      setIsLoading(false);
      return;
    }

    // ✅ תיקון: בדיקה אם הפרמטרים השתנו - אם לא, לא נטען שוב
    const currentParams = { accountId: currentAccountId, startDate, endDate };
    if (lastRefreshParamsRef.current && 
        lastRefreshParamsRef.current.accountId === currentParams.accountId &&
        lastRefreshParamsRef.current.startDate === currentParams.startDate &&
        lastRefreshParamsRef.current.endDate === currentParams.endDate) {
      console.log('⏸️ refreshData skipped - parameters unchanged');
      return;
    }
    
    // ✅ סימון שהטעינה החלה
    isRefreshingRef.current = true;
    isFetchingRef.current = true;
    lastRefreshParamsRef.current = currentParams;
    
    // ✅ לוג למעקב - איזה חשבון נטען
    console.log(`🔍 Fetching data for Account ID: ${currentAccountId}`);
    console.log(`📅 Date range: ${startDate} to ${endDate}`);
    
    setIsLoading(true);
    setIsConnected(false);
    setLoadingStage('campaigns');
    setLoadingProgress(10);
    try {
        const cacheKey = `${currentAccountId}|${startDate}|${endDate}`;
        const cached = dataCacheRef.current.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < DATA_CACHE_TTL_MS) {
          setCampaigns(cached.campaigns);
          setAccountInsights(cached.accountInsights);
          setChartData(cached.chartData);
          setLeads(cached.leads);
          setLoadingProgress(100);
          setLoadingStage('done');
          setIsConnected(true);
          setIsLoading(false);
          isRefreshingRef.current = false;
          isFetchingRef.current = false;
          console.log(`✅ Loaded from cache for ${cacheKey}`);
          return;
        }

        setLoadingStage('campaigns');
        setLoadingProgress(20);
        // ✅ ביצועים: משיכת קמפיינים ללא insights (רק מטא-דאטה) - רק מהחשבון הנוכחי
        const fbCampaigns = await metaService.fetchCampaigns(currentAccountId);
        console.log(`✅ Fetched ${fbCampaigns.length} campaigns for account ${currentAccountId}`);
        
        if (selectedAccountId !== currentAccountId) {
          console.warn(`⚠️ Account changed during fetch (${currentAccountId} -> ${selectedAccountId}), aborting update`);
          isRefreshingRef.current = false;
          isFetchingRef.current = false;
          return;
        }
        
        const campaignsBasicData = fbCampaigns.map((fbCampaign: any) => ({
          id: fbCampaign.id,
          name: fbCampaign.name,
          objective: fbCampaign.objective || 'Unknown',
          platforms: [Platform.FACEBOOK],
          budget: 0, 
          status: (fbCampaign.status === 'ACTIVE' ? CampaignStatus.ACTIVE : CampaignStatus.PAUSED) as any,
          creatives: [], 
          conversions: {},
          history: [],
          performance: {
            spend: 0,
            leads: 0,
            purchases: 0,
            revenue: 0,
            roas: 0,
            ctr: 0,
            cpl: 0,
            optimizations: 0
          },
          createdAt: fbCampaign.created_time || new Date().toISOString()
        })) as Campaign[];
        
        if (selectedAccountId !== currentAccountId) {
          console.warn(`⚠️ Account changed before setting campaigns, aborting`);
          isRefreshingRef.current = false;
          isFetchingRef.current = false;
          return;
        }
        
        setCampaigns(campaignsBasicData);
        setLoadingStage('insights');
        setLoadingProgress(40);
        console.log(`✅ Set ${campaignsBasicData.length} campaigns (basic). Fetching insights in parallel (batch + account)...`);

        // ✅ טעינה מקבילית: Account Insights + Batch Campaign Insights בבקשה אחת במקום N בקשות
        const campaignIds = campaignsBasicData.map(c => c.id);
        const [rawAccountInsights, insightsBatch] = await Promise.all([
          metaService.fetchAccountInsights(currentAccountId, startDate, endDate),
          campaignIds.length > 0 ? metaService.fetchCampaignInsightsBatch(currentAccountId, campaignIds, startDate, endDate) : Promise.resolve({})
        ]);

        if (selectedAccountId !== currentAccountId) {
          console.warn(`⚠️ Account changed before setting insights, aborting`);
          isRefreshingRef.current = false;
          isFetchingRef.current = false;
          return;
        }

        const finalCampaigns = campaignsBasicData.map((campaign) => {
          const campaignInsights = insightsBatch[campaign.id];
          if (!campaignInsights) return campaign;
          const processedInsights = parseMetaInsights(campaignInsights);
          return {
            ...campaign,
            performance: {
              spend: processedInsights.spend || 0,
              impressions: processedInsights.impressions ?? 0,
              clicks: processedInsights.clicks ?? 0,
              leads: processedInsights.leads || 0,
              purchases: processedInsights.purchases || 0,
              revenue: processedInsights.revenue || 0,
              roas: processedInsights.roas || 0,
              ctr: processedInsights.ctr || 0,
              cpl: processedInsights.cpl || 0,
              optimizations: campaign.performance?.optimizations || 0
            },
            conversions: processedInsights.conversions || {}
          };
        });
        setCampaigns(finalCampaigns);
        setLoadingProgress(70);
        console.log(`✅ Updated ${finalCampaigns.length} campaigns with batch insights`);

        // ✅ Account insights כבר נמשכו במקביל
        console.log(`✅ Fetched account insights for account ${currentAccountId}`);
        console.log(`📊 Raw insights data:`, {
          hasSummary: !!rawAccountInsights.summary,
          hasActions: !!rawAccountInsights.actions,
          hasDaily: !!rawAccountInsights.daily,
          actionsCount: rawAccountInsights.actions?.length || 0,
          dailyCount: rawAccountInsights.daily?.length || 0
        });
        
        // ✅ וידוא נוסף: אם החשבון השתנה, לא נעדכן
        if (selectedAccountId !== currentAccountId) {
          console.warn(`⚠️ Account changed before setting insights, aborting`);
          isRefreshingRef.current = false;
          isFetchingRef.current = false;
          return;
        }
        
        const processedAccountInsights = parseMetaInsights(rawAccountInsights);
        console.log(`📊 Processed insights:`, {
          spend: processedAccountInsights.spend,
          impressions: processedAccountInsights.impressions,
          clicks: processedAccountInsights.clicks,
          leads: processedAccountInsights.leads,
          purchases: processedAccountInsights.purchases,
          revenue: processedAccountInsights.revenue,
          conversions: processedAccountInsights.conversions
        });
        setAccountInsights(processedAccountInsights);
        
        let chartDataToCache: any[] = [];
        if (rawAccountInsights.daily) {
             const dailyData = rawAccountInsights.daily.map((day: any) => {
                 const dayInsights = parseMetaInsights(day);
                 return {
                     name: day.date_start,
                     date: day.date_start,
                     spend: dayInsights.spend,
                     leads: dayInsights.leads,
                     purchases: dayInsights.purchases,
                     impressions: dayInsights.impressions,
                     clicks: dayInsights.clicks,
                     revenue: dayInsights.revenue,
                     conversions: dayInsights.conversions.total
                 };
             });
             setChartData(dailyData);
             chartDataToCache = dailyData;
        } else {
            // אין נתוני daily מפייסבוק – מציגים נקודת סיכום אחת (נתוני אמת) בלי להמציא פילוח לימים
            const summaryPoint = [{
              name: `${startDate} – ${endDate}`,
              date: endDate,
              spend: processedAccountInsights.spend || 0,
              leads: processedAccountInsights.leads || 0,
              purchases: processedAccountInsights.purchases || 0,
              impressions: processedAccountInsights.impressions || 0,
              clicks: processedAccountInsights.clicks || 0,
              revenue: processedAccountInsights.revenue || 0,
              conversions: processedAccountInsights.conversions?.total || 0
            }];
            setChartData(summaryPoint);
            chartDataToCache = summaryPoint;
        }

        // ✅ וידוא נוסף: אם החשבון השתנה, לא נעדכן
        if (selectedAccountId !== currentAccountId) {
          console.warn(`⚠️ Account changed before fetching leads, aborting`);
          isRefreshingRef.current = false;
          isFetchingRef.current = false;
          return;
        }
        
        setLoadingStage('leads');
        setLoadingProgress(85);
        let cachedLeads: Lead[] = [];
        try {
          const leadsResponse = await fetch(
            `${config.apiBaseUrl}/api/facebook/leads?accountId=${currentAccountId}&startDate=${startDate}&endDate=${endDate}`,
            {
              credentials: 'include'
            }
          );
          
          if (leadsResponse.ok) {
            const rawLeads = await leadsResponse.json();
            const leadsWithStatus: Lead[] = rawLeads.map((rawLead: any) => {
              const savedStatus = localStorage.getItem(`lead_status_${rawLead.id}`);
              const status = savedStatus ? (savedStatus as LeadStatus) : LeadStatus.NEW;
              return {
                id: rawLead.id,
                name: rawLead.name,
                email: rawLead.email || '',
                phone: rawLead.phone || '',
                status: status,
                campaignId: rawLead.campaignId,
                campaignName: rawLead.campaignName,
                value: 0,
                createdAt: rawLead.createdAt,
                aiScore: 0,
                aiInsight: 'High intent user based on campaign engagement.'
              };
            });
            cachedLeads = leadsWithStatus;
            if (selectedAccountId === currentAccountId) {
              setLeads(leadsWithStatus);
              console.log(`✅ Fetched ${leadsWithStatus.length} leads for account ${currentAccountId}`);
            }
          }
        } catch (leadsError) {
          console.error('Error fetching leads:', leadsError);
        }

        if (selectedAccountId !== currentAccountId) {
          console.warn(`⚠️ Account changed before finalizing, aborting`);
          isRefreshingRef.current = false;
          isFetchingRef.current = false;
          return;
        }

        dataCacheRef.current.set(cacheKey, {
          campaigns: finalCampaigns,
          accountInsights: processedAccountInsights,
          chartData: chartDataToCache,
          leads: cachedLeads,
          timestamp: Date.now()
        });
        setLoadingProgress(100);
        setLoadingStage('done');
        setIsConnected(true);
        console.log(`✅ Successfully loaded data for account: ${currentAccountId}`);

    } catch (error: any) {
        console.error("Error fetching data:", error);
        setIsConnected(false);
        
        // ✅ תיקון: טיפול בשגיאת Rate Limit (#4) - הצגת הודעה למשתמש
        if (error.code === 4 || 
            error.message?.includes('rate limit') || 
            error.message?.includes('Rate limit') ||
            error.message?.includes('request limit')) {
          console.error('⚠️ Rate limit exceeded - stopping refresh attempts');
          setError('חריגה ממכסת בקשות, אנא המתן מספר דקות');
          // ✅ עצירת כל ניסיונות ריענון נוספים
          isRefreshingRef.current = false;
          isFetchingRef.current = false;
          return; // לא ננסה שוב
        } else {
          // שגיאות אחרות - ניקוי שגיאת rate limit אם הייתה
          if (error.message && !error.message.includes('rate limit')) {
            setError(null);
          }
        }
    } finally {
        setLoadingProgress(prev => (prev < 100 ? 100 : prev));
        setLoadingStage('done');
        setIsLoading(false);
        isRefreshingRef.current = false;
        isFetchingRef.current = false;
    }
  }, [selectedAccountId, startDate, endDate]); // ✅ תיקון: הסרת fetchLeads מה-dependencies למניעת לולאות אינסופיות

  // Initial Sync and Connection Monitoring
  const initializeConnection = async () => {
      // ✅ תיקון: מניעת קריאות כפולות
      if (isInitializingRef.current) {
          console.log('⏸️ initializeConnection already in progress, skipping');
          return;
      }
      
      isInitializingRef.current = true;
      console.log('🔄 Initializing connection...');
      
      try {
          const authData = await metaService.checkAuth();
          if (authData) {
              console.log(`✅ Authenticated as: ${authData.user?.name}`);
              const accounts = await metaService.fetchAdAccounts();
              console.log(`📊 Found ${accounts.length} ad accounts`);
              
              setAdAccounts(accounts);
              const conn = metaService.getConnection();
              
              // ✅ תיקון: בדיקה אם החשבון כבר אותחל - אם כן, לא נעדכן
              const accountToUse = conn?.selectedAccountId || (accounts.length > 0 ? accounts[0].account_id : null);
              
              if (accountToUse && accountToUse === lastInitializedAccountRef.current) {
                  console.log(`⏸️ Account ${accountToUse} already initialized, skipping update`);
                  isInitializingRef.current = false;
                  return;
              }
              
              if (conn?.selectedAccountId) {
                  console.log(`🎯 Using saved account: ${conn.selectedAccountId}`);
                  lastInitializedAccountRef.current = conn.selectedAccountId;
                  // ✅ תיקון: עדכון רק אם החשבון השתנה
                  if (selectedAccountId !== conn.selectedAccountId) {
                      setSelectedAccountIdState(conn.selectedAccountId);
                  }
              } else if (accounts.length > 0) {
                  console.log(`🎯 Auto-selecting first account: ${accounts[0].account_id}`);
                  lastInitializedAccountRef.current = accounts[0].account_id;
                  // ✅ תיקון: עדכון רק אם החשבון השתנה
                  if (selectedAccountId !== accounts[0].account_id) {
                      setSelectedAccountIdState(accounts[0].account_id);
                      metaService.setSelectedAccount(accounts[0].account_id, true); // skipEvent = true למניעת לולאה
                  }
              }
          } else {
              console.log('❌ Not authenticated, clearing data');
              lastInitializedAccountRef.current = null;
              setAdAccounts([]);
              if (selectedAccountId) {
                  setSelectedAccountIdState('');
              }
              setCampaigns([]);
              setAccountInsights(null);
              setLeads([]);
              setChartData([]);
              setIsConnected(false);
          }
      } catch (error) {
          console.error('Error initializing connection:', error);
      } finally {
          setIsLoading(false);
          isInitializingRef.current = false;
      }
  };

  useEffect(() => {
      initializeConnection();
  }, []);

  // Monitor connection changes
  useEffect(() => {
      const handleConnectionChange = (event?: Event) => {
          // ✅ תיקון: בדיקה אם זה אירוע מ-setSelectedAccount - אם כן, לא נאתחל מחדש
          const customEvent = event as CustomEvent;
          if (customEvent?.detail?.skipReinit) {
              console.log('⏸️ Skipping reinit - internal account change');
              return;
          }
          
          // ✅ תיקון: מניעת קריאות כפולות
          if (isInitializingRef.current) {
              console.log('⏸️ Already initializing, skipping connection change handler');
              return;
          }
          
          console.log('🔄 Connection change detected, reinitializing...');
          initializeConnection();
      };

      // Listen for localStorage changes (when connection is updated)
      window.addEventListener('storage', handleConnectionChange);
      
      // Also listen for custom events when connection changes
      window.addEventListener('facebook-connection-changed', handleConnectionChange);
      
      return () => {
          window.removeEventListener('storage', handleConnectionChange);
          window.removeEventListener('facebook-connection-changed', handleConnectionChange);
      };
  }, []);

  // ✅ תיקון: Fetch data when dependencies change - עם תלות מדויקת למניעת לולאות אינסופיות
  useEffect(() => {
      // ✅ תיקון: וידוא שיש ערכים תקינים לפני קריאה
      if (!selectedAccountId || !startDate || !endDate) {
          console.log('⏸️ Skipping refreshData - missing required values:', { selectedAccountId, startDate, endDate });
          return;
      }
      
      // ✅ תיקון: בדיקה נוספת - אם כבר בטעינה, לא נקרא שוב
      if (isRefreshingRef.current || isFetchingRef.current) {
          console.log('⏸️ Skipping refreshData - already refreshing');
          return;
      }
      
      // ✅ תיקון: בדיקה אם הפרמטרים השתנו - אם לא, לא נטען שוב
      const currentParams = { accountId: selectedAccountId, startDate, endDate };
      if (lastRefreshParamsRef.current && 
          lastRefreshParamsRef.current.accountId === currentParams.accountId &&
          lastRefreshParamsRef.current.startDate === currentParams.startDate &&
          lastRefreshParamsRef.current.endDate === currentParams.endDate) {
        console.log('⏸️ Skipping refreshData - parameters unchanged in useEffect');
        return;
      }
      
      // ✅ תיקון: Debounce - המתן קצת לפני הקריאה למניעת קריאות מיותרות
      const timeoutId = setTimeout(() => {
          // ✅ בדיקה נוספת לפני הקריאה - אולי הפרמטרים השתנו בזמן ההמתנה
          if (isRefreshingRef.current || isFetchingRef.current) {
              console.log('⏸️ Skipping refreshData - already refreshing (after debounce)');
              return;
          }
          
          const latestParams = { accountId: selectedAccountId, startDate, endDate };
          if (lastRefreshParamsRef.current && 
              lastRefreshParamsRef.current.accountId === latestParams.accountId &&
              lastRefreshParamsRef.current.startDate === latestParams.startDate &&
              lastRefreshParamsRef.current.endDate === latestParams.endDate) {
            console.log('⏸️ Skipping refreshData - parameters unchanged (after debounce)');
            return;
          }
          
          console.log('🔄 Triggering refreshData due to dependency change:', { selectedAccountId, startDate, endDate });
          refreshData();
      }, 300); // ✅ Debounce של 300ms
      
      // ✅ ניקוי timeout אם הפרמטרים השתנו לפני שהזמן עבר
      return () => {
          clearTimeout(timeoutId);
      };
      // ✅ תיקון: refreshData לא צריך להיות ב-dependency array כי זה יוצר לולאה אינסופית
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccountId, startDate, endDate]); // ✅ תלויות מדויקות בלבד - ללא refreshData

  const filteredCampaigns = campaigns.filter(c => {
    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'ACTIVE') return c.status === CampaignStatus.ACTIVE;
    if (statusFilter === 'PAUSED') return c.status === CampaignStatus.PAUSED;
    return true;
  });

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return (
    <DataContext.Provider value={{
        campaigns,
        adAccounts,
        selectedAccountId,
        isLoading,
        loadingStage,
        loadingProgress,
        dateRange: { type: dateRangeType, startDate, endDate },
        accountInsights,
        chartData,
        refreshData,
        setSelectedAccountId,
        setDateRangeType,
        setCustomDateRange,
        isConnected,
        statusFilter,
        setStatusFilter,
        filteredCampaigns,
        leads,
        fetchLeads,
        error,
        clearError
    }}>
      {children}
    </DataContext.Provider>
  );
};
