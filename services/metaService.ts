
import { MetaAdAccount, MetaPage } from "../types";
import {
  buildUnifiedMetrics,
  sumSpendSafely,
  mergeActionsFromRows,
  mergeActionValuesFromRows,
  PURCHASE_ACTION_TYPES,
  type MetaAction,
} from './metaMetrics';

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

import { config } from '../config';

const API_BASE = config.apiBaseUrl;

// Rate limit handling with exponential backoff
async function fetchWithRateLimitHandling(
  url: string, 
  options: RequestInit = {}, 
  maxRetries: number = 3
): Promise<Response> {
  let retries = 0;
  let lastError: any = null;

  while (retries <= maxRetries) {
    try {
      const response = await fetch(url, {
        ...options,
        credentials: 'include'
      });

      // ✅ תיקון: בדיקת HTTP status code לפני parsing JSON
      if (response.status === 429) {
        // HTTP 429 = Too Many Requests (Rate Limit) - לא ננסה שוב
        console.error(`❌ Rate limit exceeded (HTTP 429) - stopping all retry attempts`);
        const error: any = new Error('חריגה ממכסת בקשות, אנא המתן מספר דקות');
        error.code = 4;
        error.status = 429;
        throw error; // ✅ עצירה מיידית - ללא retry
      }

      // Check if response body contains rate limit error (also for non-200 status codes)
      const data = await response.clone().json().catch(() => null);
      if (data?.error) {
        if (data.error.code === 4 || 
            data.error.message?.includes('rate limit') || 
            data.error.message?.includes('request limit') ||
            data.error.message?.includes('Application request limit reached')) {
          // ✅ תיקון: במקרה של שגיאת Rate Limit (#4), לא ננסה שוב - נזרוק שגיאה מיד
          console.error(`❌ Rate limit exceeded (error #4) - stopping all retry attempts`);
          const error: any = new Error(data.error.message || 'חריגה ממכסת בקשות, אנא המתן מספר דקות');
          error.code = 4;
          error.error = data.error;
          throw error; // ✅ עצירה מיידית - ללא retry
        }
      }

      // For other 5xx errors, retry with backoff
      if (response.status >= 500 && response.status !== 503) {
        if (retries < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, retries), 10000);
          console.warn(`⚠️ Server error (HTTP ${response.status}), retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          retries++;
          continue;
        }
      }

      return response;
    } catch (error: any) {
      lastError = error;
      
      // ✅ תיקון: אם זה שגיאת Rate Limit (#4), לא ננסה שוב - נזרוק שגיאה מיד
      if (error.code === 4 || 
          error.message?.includes('rate limit') || 
          error.message?.includes('Rate limit') ||
          error.message?.includes('request limit')) {
        console.error(`❌ Rate limit exceeded (error #4) - stopping all retry attempts`);
        throw error; // ✅ עצירה מיידית - ללא retry
      }
      
      // For network errors, retry with shorter backoff
      if (retries < maxRetries && (error.message?.includes('fetch') || error.name === 'TypeError')) {
        const delay = Math.min(1000 * Math.pow(2, retries), 10000);
        console.warn(`⚠️ Network error, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        retries++;
        continue;
      }
      
      throw error;
    }
  }

  throw lastError || new Error('Request failed after retries');
}

/**
 * parseMetaInsights – Parse a Meta Insights API response into our standard shape.
 *
 * Handles two response structures:
 *  a) The server pre-processed the data and returns a flat object (preferred).
 *  b) Raw Meta API response that contains `data[]` + optional `summary`.
 *
 * Uses buildUnifiedMetrics from metaMetrics.ts as the single source of truth
 * for all action-type classification (omni_lead, omni_purchase, WhatsApp, etc.).
 */
export const parseMetaInsights = (insights: any) => {
  // ── Resolve the working insight object ────────────────────────────────────
  // The server may return a flat object (already processed) or a raw FB response
  // with `data[]`. In both cases we normalise to a single `actualInsights` object.
  let actualInsights = insights;
  if (insights?.data && Array.isArray(insights.data) && insights.data.length > 0) {
    actualInsights = insights.data[0];
  }

  // ── Spend – always prefer the top-level `spend` from the server-processed object ──
  // When the server pre-processes, `spend` is already the correct deduplicated value.
  // For raw responses with a summary, use summary.spend.
  const summary    = actualInsights.summary || {};
  const hasSummary = Object.keys(summary).length > 0 && summary.spend !== undefined;

  const spend = hasSummary
    ? parseFloat(summary.spend)
    : parseFloat(actualInsights.spend || '0');

  // ── Actions & action_values ───────────────────────────────────────────────
  // Prefer summary (Facebook-aggregated) over per-row data.
  // If neither has actions, fall back to daily rows and merge them.
  let actions: MetaAction[]      = [];
  let actionValues: MetaAction[] = [];

  if (hasSummary && (summary.actions || summary.action_values)) {
    actions      = summary.actions || [];
    actionValues = summary.action_values || [];
  } else if (actualInsights.actions || actualInsights.action_values) {
    actions      = actualInsights.actions || [];
    actionValues = actualInsights.action_values || [];
  } else if (Array.isArray(actualInsights.daily) && actualInsights.daily.length > 0) {
    // Fallback: aggregate from daily rows (server-side daily field)
    actions      = mergeActionsFromRows(actualInsights.daily);
    actionValues = mergeActionValuesFromRows(actualInsights.daily);
  }

  // ── Base metrics ──────────────────────────────────────────────────────────
  const impressions = hasSummary && summary.impressions
    ? parseInt(summary.impressions)
    : parseInt(actualInsights.impressions || '0');
  const clicks = hasSummary && summary.clicks
    ? parseInt(summary.clicks)
    : parseInt(actualInsights.clicks || '0');
  const reach = hasSummary && summary.reach
    ? parseInt(summary.reach)
    : parseInt(actualInsights.reach || '0');
  const frequency = hasSummary && summary.frequency
    ? parseFloat(summary.frequency)
    : parseFloat(actualInsights.frequency || '0');
  const currency = actualInsights.currency || 'USD';

  // ── Unified metrics (single authoritative calculation) ────────────────────
  // If the server already calculated unified_metrics, trust it.
  // Otherwise compute locally using buildUnifiedMetrics.
  const serverUnified = actualInsights.unified_metrics || insights.unified_metrics;
  let unifiedMetrics: ReturnType<typeof buildUnifiedMetrics>;

  if (serverUnified) {
    unifiedMetrics = {
      leads:             serverUnified.leads        ?? 0,
      purchases:         serverUnified.purchases    ?? 0,
      whatsapp:          serverUnified.whatsapp     ?? 0,
      purchaseValue:     serverUnified.purchaseValue ?? 0,
      add_to_cart:       serverUnified.add_to_cart  ?? 0,
      initiate_checkout: serverUnified.initiate_checkout ?? 0,
      view_content:      serverUnified.view_content ?? 0,
    };
  } else {
    unifiedMetrics = buildUnifiedMetrics(actions, actionValues);
  }

  console.log('📊 parseMetaInsights result:', {
    spend, impressions, clicks,
    leads: unifiedMetrics.leads,
    purchases: unifiedMetrics.purchases,
    whatsapp: unifiedMetrics.whatsapp,
    currency,
  });

  // ── Revenue (purchase value) ──────────────────────────────────────────────
  const revenue = unifiedMetrics.purchaseValue > 0
    ? unifiedMetrics.purchaseValue
    : actionValues
        .filter((av: MetaAction) => PURCHASE_ACTION_TYPES.has(av.action_type))
        .reduce((sum: number, av: MetaAction) => sum + parseFloat(String(av.value || '0')), 0);

  // ── Computed metrics ──────────────────────────────────────────────────────
  const totalConversions = unifiedMetrics.leads + unifiedMetrics.whatsapp + unifiedMetrics.purchases;
  const ctr  = impressions > 0 ? (clicks / impressions) * 100 : parseFloat(actualInsights.ctr || '0');
  const cpc  = clicks > 0 ? spend / clicks : 0;
  const cpm  = impressions > 0 ? (spend / impressions) * 1000 : 0;
  const cpl  = unifiedMetrics.leads > 0 ? spend / unifiedMetrics.leads : 0;
  const cpa  = unifiedMetrics.purchases > 0 ? spend / unifiedMetrics.purchases : 0;
  const roas = spend > 0 ? revenue / spend : 0;
  const conversionRate = impressions > 0 ? (totalConversions / impressions) * 100 : 0;

  const conversionsMap = {
    total:             totalConversions,
    lead:              unifiedMetrics.leads,
    whatsapp:          unifiedMetrics.whatsapp,
    purchase:          unifiedMetrics.purchases,
    add_to_cart:       unifiedMetrics.add_to_cart,
    initiate_checkout: unifiedMetrics.initiate_checkout,
    view_content:      unifiedMetrics.view_content,
  };

  return {
    spend, impressions, clicks, reach, frequency,
    leads:             unifiedMetrics.leads,
    purchases:         unifiedMetrics.purchases,
    conversions:       conversionsMap,
    add_to_cart:       unifiedMetrics.add_to_cart,
    initiate_checkout: unifiedMetrics.initiate_checkout,
    view_content:      unifiedMetrics.view_content,
    revenue, currency,
    ctr, cpc, cpm, cpl, roas, cpa, conversionRate,
  };
};

export const metaService = {
  // התחברות - הפנייה ל-backend
  async loginWithFacebook(): Promise<void> {
    try {
      // נקה session קודם לפני התחברות חדשה
      console.log('🧹 Cleaning previous session before new login...');
      await this.logout();
      // המתן קצת לוודא שהניקוי הסתיים
      await new Promise(resolve => setTimeout(resolve, 500));
      console.log('✅ Previous session cleaned, redirecting to Facebook...');
      // עכשיו התחבר
      window.location.href = `${API_BASE}/auth/facebook`;
    } catch (error) {
      console.error('Error during logout before login:', error);
      // גם אם הניקוי נכשל, נמשיך להתחברות
      console.log('⚠️ Logout failed, but continuing with login...');
      window.location.href = `${API_BASE}/auth/facebook`;
    }
  },

  // בדיקה אם המשתמש מחובר
  async checkAuth(): Promise<{ accessToken: string; user: any } | null> {
    try {
      const response = await fetchWithRateLimitHandling(`${API_BASE}/api/facebook/token`);
      
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
      const response = await fetchWithRateLimitHandling(`${API_BASE}/api/facebook/adaccounts`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error: any = new Error(errorData.error?.message || 'Failed to fetch ad accounts');
        error.code = errorData.error?.code;
        throw error;
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
      const response = await fetchWithRateLimitHandling(`${API_BASE}/api/facebook/pages`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error: any = new Error(errorData.error?.message || 'Failed to fetch pages');
        error.code = errorData.error?.code;
        throw error;
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
      await fetchWithRateLimitHandling(`${API_BASE}/auth/logout`);
      // נקה גם את localStorage
      localStorage.removeItem('meta_connection');
      // הפצת אירוע שהחיבור נוקה
      window.dispatchEvent(new CustomEvent('facebook-connection-changed', { 
        detail: { connection: null } 
      }));
      console.log('📡 Logout completed and event dispatched');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  },

  saveConnection(conn: MetaConnection, skipEvent: boolean = false) {
    localStorage.setItem('meta_connection', JSON.stringify(conn));
    // הפצת אירוע שהחיבור השתנה - רק אם לא ביקשנו לדלג
    if (!skipEvent) {
      window.dispatchEvent(new CustomEvent('facebook-connection-changed', { 
        detail: { connection: conn } 
      }));
      console.log('📡 Connection saved and event dispatched');
    } else {
      console.log('📡 Connection saved (event skipped)');
    }
  },

  // פונקציה חדשה לעדכון החשבון הנבחר בלבד
  setSelectedAccount(accountId: string, skipEvent: boolean = false) {
    const conn = this.getConnection();
    if (conn) {
      this.saveConnection({
        ...conn,
        selectedAccountId: accountId
      }, skipEvent);
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
      const response = await fetchWithRateLimitHandling(`${API_BASE}/api/facebook/campaigns?accountId=${accountId}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error: any = new Error(errorData.error?.message || 'Failed to fetch campaigns');
        error.code = errorData.error?.code;
        throw error;
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
      const response = await fetchWithRateLimitHandling(
        `${API_BASE}/api/facebook/campaigns/${campaignId}/insights?startDate=${startDate}&endDate=${endDate}${accountIdParam}`
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error: any = new Error(errorData.error?.message || 'Failed to fetch campaign insights');
        error.code = errorData.error?.code;
        throw error;
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch campaign insights:', error);
      throw error;
    }
  },

  // משיכת ביצועים של כל הקמפיינים בבקשה אחת (Batch) - חוסך N קריאות נפרדות
  async fetchCampaignInsightsBatch(
    accountId: string,
    campaignIds: string[],
    startDate: string,
    endDate: string
  ): Promise<Record<string, any>> {
    if (campaignIds.length === 0) return {};
    try {
      const response = await fetchWithRateLimitHandling(`${API_BASE}/api/facebook/campaigns/insights/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, startDate, endDate, campaignIds })
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error: any = new Error(errorData.error?.message || 'Failed to fetch campaign insights batch');
        error.code = errorData.error?.code;
        throw error;
      }
      const data = await response.json();
      return data.insights || {};
    } catch (error) {
      console.error('Failed to fetch campaign insights batch:', error);
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
      const response = await fetchWithRateLimitHandling(
        `${API_BASE}/api/facebook/adaccounts/${accountId}/insights?startDate=${startDate}&endDate=${endDate}`
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error: any = new Error(errorData.error?.message || 'Failed to fetch account insights');
        error.code = errorData.error?.code;
        throw error;
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
