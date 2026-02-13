
import { MetaAdAccount, MetaPage } from "../types";

export interface MetaConnection {
  userToken: string;
  selectedAccountId?: string;
  selectedPageId?: string;
  user?: {
    id: string;
    name: string;
    email?: string;
    picture?: string;
  };
}

const API_BASE = 'http://localhost:5001';

// Helper function to parse Meta insights for both Lead Gen and E-commerce
export const parseMetaInsights = (insights: any) => {
  // 1. עדיפות ל-Summary אם קיים - זה העוגן האמת של פייסבוק
  const summary = insights.summary || {};
  const hasSummary = Object.keys(summary).length > 0;
  
  // אם יש summary, נשתמש בערכים שלו
  const spend = hasSummary && summary.spend 
    ? parseFloat(summary.spend) 
    : parseFloat(insights.spend || '0');
  
  const actions = hasSummary && summary.actions 
    ? summary.actions 
    : (insights.actions || []);
  
  const actionValues = hasSummary && summary.action_values 
    ? summary.action_values 
    : (insights.action_values || []);
  
  // לוג למעקב
  if (hasSummary) {
    console.log('✅ Using Facebook Summary as source of truth');
    console.log('💰 Summary Spend:', summary.spend);
  } else {
    console.warn('⚠️ No summary found, using individual insights');
  }
  
  // 2. אימות מטבע
  const currency = insights.currency || 'USD';
  console.log(`💰 Currency: ${currency}, Spend: ${spend} ${currency}`);

  // 3. Unified Conversions Mapping
  const serverMetrics = insights.unified_metrics || { whatsapp: 0, leads: 0, purchases: 0 };
  
  // אם אין נתונים מהשרת, נחשב כאן (אבל עם טיפול בכפילויות) - תואם ל-Facebook Ads Manager
  if (!insights.unified_metrics) {
    console.warn('⚠️ No unified_metrics from server, calculating locally');
    const processedActionTypes = new Set<string>();
    
    actions.forEach((a: any) => {
      const val = parseInt(a.value || '0');
      if (val === 0) return;
      
      const actionType = a.action_type || '';
      const actionBreakdown = a.action_breakdowns || '';
      const actionKey = `${actionType}_${actionBreakdown}`;
      
      if (processedActionTypes.has(actionKey)) {
        return; // דילוג על כפילויות
      }
      processedActionTypes.add(actionKey);
      
      // WhatsApp: סכום של onsite_conversion.messaging_first_reply ו-contact
      if (
        actionType === 'onsite_conversion.messaging_first_reply' ||
        (actionType === 'contact' && (actionBreakdown === 'action_type' || actionBreakdown === '')) ||
        actionType === 'messaging_conversation_started_7d'
      ) {
        serverMetrics.whatsapp += val;
      }
      // בדיקה אם זה contact שלא וואטסאפ
      else if (actionType === 'contact') {
        const url = a.url || '';
        if (url.includes('wa.me') || url.includes('whatsapp.com')) {
          serverMetrics.whatsapp += val;
        } else {
          serverMetrics.leads += val;
        }
      }
      // Leads: סכום של lead, onsite_conversion.lead_grouped, ו-submit_application
      else if (
        actionType === 'lead' ||
        actionType === 'onsite_conversion.lead_grouped' ||
        actionType === 'submit_application' ||
        actionType === 'complete_registration' ||
        actionType === 'offsite_conversion.fb_pixel_lead'
      ) {
        // בדיקה אם זה lead שלא מטופס פנימי
        if (actionType === 'lead' && !actionType.includes('fb_pixel')) {
          const url = a.url || '';
          if (url.includes('wa.me') || url.includes('whatsapp.com')) {
            serverMetrics.whatsapp += val;
          } else {
            serverMetrics.leads += val;
          }
        } else {
          serverMetrics.leads += val;
        }
      }
      // Sales/Purchases: סכום של purchase ו-onsite_conversion.purchase
      else if (
        actionType === 'purchase' ||
        actionType === 'onsite_conversion.purchase' ||
        actionType === 'omni_purchase' ||
        actionType === 'offsite_conversion.fb_pixel_purchase'
      ) {
        serverMetrics.purchases += val;
      }
    });
  }

  const conversionsMap = {
    'total': serverMetrics.leads + serverMetrics.whatsapp + serverMetrics.purchases,
    'lead': serverMetrics.leads,
    'whatsapp': serverMetrics.whatsapp,
    'purchase': serverMetrics.purchases
  };

  // 2. Revenue Logic
  const revenue = actionValues
    .filter((a: any) => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase' || a.action_type === 'omni_purchase')
    .reduce((sum: number, a: any) => sum + parseFloat(a.value), 0);

  return {
    spend,
    leads: conversionsMap.lead,
    purchases: conversionsMap.purchase,
    conversions: conversionsMap,
    revenue,
    ctr: parseFloat(insights.ctr || '0'),
    cpl: conversionsMap.lead > 0 ? spend / conversionsMap.lead : 0,
    roas: spend > 0 ? revenue / spend : 0,
    cpa: conversionsMap.purchase > 0 ? spend / conversionsMap.purchase : 0, // Cost Per Acquisition
    currency: currency // הוסף את המטבע
  };
};

export const metaService = {
  // התחברות - הפנייה ל-backend
  async loginWithFacebook(): Promise<void> {
    window.location.href = `${API_BASE}/auth/facebook`;
  },

  // בדיקה אם המשתמש מחובר
  async checkAuth(): Promise<{ accessToken: string; user: any } | null> {
    try {
      const response = await fetch(`${API_BASE}/api/facebook/token`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // עדכון ה-LocalStorage עם הטוקן העדכני
        const currentConn = this.getConnection() || {};
        this.saveConnection({
          ...currentConn,
          userToken: data.accessToken,
          user: data.user
        });
        
        return data;
      }
      return null;
    } catch (error) {
      console.error('Auth check failed:', error);
      return null;
    }
  },

  // פונקציה חדשה לסנכרון מלא ובחירת חשבון אוטומטית
  async syncConnection(): Promise<boolean> {
    try {
      // 1. בדיקה אם יש Session בשרת
      const authData = await this.checkAuth();
      if (!authData) return false;

      // 2. בדיקה אם כבר נבחר חשבון מודעות
      const currentConn = this.getConnection();
      if (currentConn?.selectedAccountId) {
        return true;
      }

      // 3. אם אין חשבון נבחר - נמשוך את החשבונות ונבחר את הפעיל ביותר
      console.log('🔄 No account selected, fetching ad accounts...');
      const accounts = await this.fetchAdAccounts();
      
      if (accounts && accounts.length > 0) {
        // מיון: קודם חשבונות פעילים (status=1), ואז כל השאר
        const sortedAccounts = accounts.sort((a: any, b: any) => {
          if (a.account_status === 1 && b.account_status !== 1) return -1;
          if (a.account_status !== 1 && b.account_status === 1) return 1;
          return 0;
        });

        const selectedAccount = sortedAccounts[0];
        console.log(`✅ Auto-selecting account: ${selectedAccount.name} (Status: ${selectedAccount.account_status})`);
        
        this.saveConnection({
          userToken: authData.accessToken,
          user: authData.user,
          selectedAccountId: selectedAccount.account_id
        });
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Failed to sync connection:', error);
      return false;
    }
  },

  // משיכת חשבונות מודעות
  async fetchAdAccounts(): Promise<MetaAdAccount[]> {
    try {
      const response = await fetch(`${API_BASE}/api/facebook/adaccounts`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch ad accounts');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch ad accounts:', error);
      throw error;
    }
  },

  // משיכת דפים
  async fetchPages(): Promise<MetaPage[]> {
    try {
      const response = await fetch(`${API_BASE}/api/facebook/pages`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch pages');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch pages:', error);
      throw error;
    }
  },

  // התנתקות
  async logout(): Promise<void> {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        credentials: 'include'
      });
      // נקה גם את localStorage
      localStorage.removeItem('meta_connection');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  },

  saveConnection(conn: MetaConnection) {
    localStorage.setItem('meta_connection', JSON.stringify(conn));
  },

  // פונקציה חדשה לעדכון החשבון הנבחר בלבד
  setSelectedAccount(accountId: string) {
    const conn = this.getConnection();
    if (conn) {
      this.saveConnection({
        ...conn,
        selectedAccountId: accountId
      });
    }
  },

  getConnection(): MetaConnection | null {
    const saved = localStorage.getItem('meta_connection');
    return saved ? JSON.parse(saved) : null;
  },

  isConnected(): boolean {
    const conn = this.getConnection();
    return !!(conn?.userToken && conn?.selectedAccountId);
  },

  // משיכת קמפיינים מחשבון מודעות
  async fetchCampaigns(accountId: string): Promise<any[]> {
    try {
      const response = await fetch(`${API_BASE}/api/facebook/campaigns?accountId=${accountId}`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch campaigns');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch campaigns:', error);
      throw error;
    }
  },

  // משיכת ביצועים של קמפיין ספציפי
  async fetchCampaignInsights(
    campaignId: string, 
    startDate: string, 
    endDate: string,
    accountId?: string
  ): Promise<any> {
    try {
      const accountIdParam = accountId ? `&accountId=${encodeURIComponent(accountId)}` : '';
      const response = await fetch(
        `${API_BASE}/api/facebook/campaigns/${campaignId}/insights?startDate=${startDate}&endDate=${endDate}${accountIdParam}`, 
        {
          credentials: 'include'
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch campaign insights');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch campaign insights:', error);
      throw error;
    }
  },

  // משיכת ביצועים של חשבון מודעות
  async fetchAccountInsights(
    accountId: string, 
    startDate: string, 
    endDate: string
  ): Promise<any> {
    try {
      const response = await fetch(
        `${API_BASE}/api/facebook/adaccounts/${accountId}/insights?startDate=${startDate}&endDate=${endDate}`, 
        {
          credentials: 'include'
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch account insights');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch account insights:', error);
      throw error;
    }
  },

  // Example: Push a campaign to Meta Ads Manager (Simplified Graph API call)
  async createCampaign(name: string, objective: string, budget: number) {
    const conn = this.getConnection();
    if (!conn) throw new Error("Not connected");

    console.log(`Creating campaign ${name} on account ${conn.selectedAccountId}`);
    
    // כאן תוכל לקרוא ל-API של ה-backend שיוצר את הקמפיין
    await new Promise(r => setTimeout(r, 2000));
    return { success: true, id: 'mock_fb_camp_123' };
  }
};
