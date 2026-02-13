import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Campaign, MetaAdAccount, CampaignStatus, Platform, Lead, LeadStatus } from '../types';
import { metaService, parseMetaInsights } from '../services/metaService';

interface DataContextType {
  campaigns: Campaign[];
  adAccounts: MetaAdAccount[];
  selectedAccountId: string;
  isLoading: boolean;
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
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData must be used within DataProvider');
  return context;
};

// Helper for date ranges
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
        start.setDate(start.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        end.setDate(end.getDate() - 1);
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
    
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
};

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [adAccounts, setAdAccounts] = useState<MetaAdAccount[]>([]);
  const [selectedAccountId, setSelectedAccountIdState] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [accountInsights, setAccountInsights] = useState<any>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'PAUSED'>('ALL');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  
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

  const setSelectedAccountId = (id: string) => {
      // ✅ איפוס מלא של כל ה-States לפני החלפת חשבון
      console.log(`🔄 Switching account from ${selectedAccountId} to ${id}`);
      console.log(`🧹 Resetting all states for account isolation...`);
      
      // איפוס כל הנתונים
      setCampaigns([]);
      setAccountInsights(null);
      setLeads([]);
      setChartData([]);
      setIsLoading(true);
      
      // עדכון החשבון הנבחר
      setSelectedAccountIdState(id);
      metaService.setSelectedAccount(id);
      
      // ✅ לוג למעקב
      console.log(`✅ Account switched to: ${id}`);
      console.log(`📊 Displaying data for account: ${id}`);
  };

  // פונקציה למשיכת לידים
  const fetchLeads = async () => {
    if (!selectedAccountId || !startDate || !endDate) return;
    
    try {
      const response = await fetch(
        `http://localhost:5001/api/facebook/leads?accountId=${selectedAccountId}&startDate=${startDate}&endDate=${endDate}`,
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
          aiScore: Math.floor(Math.random() * 30) + 70, // דמו - ניתן להחליף ב-AI אמיתי
          aiInsight: 'High intent user based on campaign engagement.'
        };
      });
      
      setLeads(leadsWithStatus);
      console.log(`✅ Fetched ${leadsWithStatus.length} leads for account ${selectedAccountId}`);
    } catch (error) {
      console.error('Error fetching leads:', error);
      setLeads([]);
    }
  };

  const refreshData = async () => {
    if (!selectedAccountId || !startDate || !endDate) {
      setIsConnected(false);
      return;
    }
    
    // ✅ לוג למעקב - איזה חשבון נטען
    console.log(`📊 Loading data for account: ${selectedAccountId}`);
    console.log(`📅 Date range: ${startDate} to ${endDate}`);
    
    setIsLoading(true);
    setIsConnected(false);
    try {
        // Fetch Campaigns - רק מהחשבון הספציפי
        const fbCampaigns = await metaService.fetchCampaigns(selectedAccountId);
        console.log(`✅ Fetched ${fbCampaigns.length} campaigns for account ${selectedAccountId}`);
        
        // Fetch Insights for each campaign
        const campaignsWithInsights = await Promise.all(
          fbCampaigns.map(async (fbCampaign: any) => {
            try {
              const rawInsights = await metaService.fetchCampaignInsights(fbCampaign.id, startDate, endDate, selectedAccountId);
              const processed = parseMetaInsights(rawInsights);
              
              let history: any[] = [];
              if (rawInsights.daily && Array.isArray(rawInsights.daily)) {
                  history = rawInsights.daily.map((d: any) => {
                      // We can use parseMetaInsights or just parse manually since we need specific fields
                      return {
                          date: d.date_start,
                          spend: parseFloat(d.spend || '0'),
                          leads: parseInt(d.actions?.find((a: any) => a.action_type === 'lead')?.value || '0'), // Simplified lead extraction for history
                          clicks: parseInt(d.clicks || '0'),
                          impressions: parseInt(d.impressions || '0')
                      };
                  });
              }

              return {
                id: fbCampaign.id,
                name: fbCampaign.name,
                objective: fbCampaign.objective || 'Unknown',
                platforms: [Platform.FACEBOOK],
                budget: 0, 
                status: (fbCampaign.status === 'ACTIVE' ? CampaignStatus.ACTIVE : CampaignStatus.PAUSED) as any,
                creatives: [], 
                conversions: processed.conversions,
                history,
                performance: {
                  spend: processed.spend,
                  leads: processed.leads,
                  purchases: processed.purchases,
                  revenue: processed.revenue,
                  roas: processed.roas,
                  ctr: processed.ctr,
                  cpl: processed.cpl,
                  optimizations: 0
                },
                createdAt: fbCampaign.created_time || new Date().toISOString()
              } as Campaign;
            } catch (error) {
              console.error(`Failed to fetch insights for campaign ${fbCampaign.id}:`, error);
               return {
                id: fbCampaign.id,
                name: fbCampaign.name,
                objective: fbCampaign.objective || 'Unknown',
                platforms: [Platform.FACEBOOK],
                budget: 0,
                status: (fbCampaign.status === 'ACTIVE' ? CampaignStatus.ACTIVE : CampaignStatus.PAUSED) as any,
                creatives: [],
                performance: { spend: 0, leads: 0, purchases: 0, revenue: 0, roas: 0, ctr: 0, cpl: 0, optimizations: 0 },
                createdAt: fbCampaign.created_time || new Date().toISOString()
              } as Campaign;
            }
          })
        );
        setCampaigns(campaignsWithInsights);

        // Fetch Account Insights - רק מהחשבון הספציפי
        const rawAccountInsights = await metaService.fetchAccountInsights(selectedAccountId, startDate, endDate);
        console.log(`✅ Fetched account insights for account ${selectedAccountId}`);
        const processedAccountInsights = parseMetaInsights(rawAccountInsights);
        setAccountInsights(processedAccountInsights);
        
        // Process Chart Data
        if (rawAccountInsights.daily) {
             const dailyData = rawAccountInsights.daily.map((day: any) => {
                 const dayInsights = parseMetaInsights(day);
                 return {
                     name: day.date_start, // Formatting handled in component
                     date: day.date_start,
                     spend: dayInsights.spend,
                     leads: dayInsights.leads,
                     purchases: dayInsights.purchases
                 };
             });
             setChartData(dailyData);
        } else {
            // Fallback estimation
            const start = new Date(startDate);
            const end = new Date(endDate);
            const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            
            const estimatedData = Array.from({ length: Math.min(daysDiff, 30) }, (_, i) => {
                const date = new Date(start);
                date.setDate(date.getDate() + i);
                return {
                  name: date.toISOString().split('T')[0],
                  spend: Math.round((processedAccountInsights.spend || 0) / daysDiff),
                  leads: Math.round((processedAccountInsights.leads || 0) / daysDiff),
                  purchases: Math.round((processedAccountInsights.purchases || 0) / daysDiff)
                };
            });
            setChartData(estimatedData);
        }

        // משיכת לידים - רק מהחשבון הספציפי
        await fetchLeads();

        // עדכון isConnected ל-true רק אחרי שהצלחנו למשוך נתונים
        setIsConnected(true);
        console.log(`✅ Successfully loaded data for account: ${selectedAccountId}`);

    } catch (error) {
        console.error("Error fetching data:", error);
        setIsConnected(false);
    } finally {
        setIsLoading(false);
    }
  };

  // Initial Sync
  useEffect(() => {
      const init = async () => {
          const authData = await metaService.checkAuth();
          if (authData) {
              const accounts = await metaService.fetchAdAccounts();
              setAdAccounts(accounts);
              const conn = metaService.getConnection();
              if (conn?.selectedAccountId) {
                  setSelectedAccountIdState(conn.selectedAccountId);
              } else if (accounts.length > 0) {
                  setSelectedAccountIdState(accounts[0].account_id);
                  metaService.setSelectedAccount(accounts[0].account_id);
              }
          }
          setIsLoading(false);
      };
      init();
  }, []);

  // Fetch data when dependencies change
  useEffect(() => {
      refreshData();
  }, [selectedAccountId, startDate, endDate]);

  const filteredCampaigns = campaigns.filter(c => {
    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'ACTIVE') return c.status === CampaignStatus.ACTIVE;
    if (statusFilter === 'PAUSED') return c.status === CampaignStatus.PAUSED;
    return true;
  });

  return (
    <DataContext.Provider value={{
        campaigns,
        adAccounts,
        selectedAccountId,
        isLoading,
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
        fetchLeads
    }}>
      {children}
    </DataContext.Provider>
  );
};
