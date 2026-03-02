export interface ShopifyConnection {
  shop: string;
  accessToken: string;
  storeName?: string;
  storeUrl?: string;
  connectedAt?: string;
}

import { config } from '../config';

const API_BASE = config.apiBaseUrl;

export const shopifyService = {
  // התחברות - הפנייה ל-backend
  async loginWithShopify(): Promise<void> {
    try {
      console.log('🛒 Redirecting to Shopify OAuth...');
      window.location.href = `${API_BASE}/auth/shopify`;
    } catch (error) {
      console.error('Error during Shopify login:', error);
      throw error;
    }
  },

  // בדיקה אם המשתמש מחובר
  async checkAuth(): Promise<{ accessToken: string; shop: string; storeName?: string; storeUrl?: string } | null> {
    try {
      const response = await fetch(`${API_BASE}/api/shopify/token`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        
        const currentConn = this.getConnection() || {};
        this.saveConnection({
          ...currentConn,
          accessToken: data.accessToken,
          shop: data.shop,
          storeName: data.storeName,
          storeUrl: data.storeUrl
        });
        
        return data;
      }
      return null;
    } catch (error) {
      console.error('Auth check failed:', error);
      return null;
    }
  },

  // סנכרון חנות - משיכת מוצרים, הזמנות וכו'
  async syncStore(): Promise<{
    products: any[];
    orders: any[];
    revenue: number;
    totalOrders: number;
  }> {
    try {
      const response = await fetch(`${API_BASE}/api/shopify/sync`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to sync store');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Store sync failed:', error);
      throw error;
    }
  },

  // משיכת מוצרים
  async fetchProducts(): Promise<any[]> {
    try {
      const response = await fetch(`${API_BASE}/api/shopify/products`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch products');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch products:', error);
      throw error;
    }
  },

  // משיכת הזמנות
  async fetchOrders(startDate?: string, endDate?: string): Promise<any[]> {
    try {
      let url = `${API_BASE}/api/shopify/orders`;
      if (startDate && endDate) {
        url += `?startDate=${startDate}&endDate=${endDate}`;
      }
      
      const response = await fetch(url, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch orders');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch orders:', error);
      throw error;
    }
  },

  // משיכת סטטיסטיקות
  async fetchAnalytics(startDate: string, endDate: string): Promise<{
    revenue: number;
    orders: number;
    averageOrderValue: number;
    conversionRate: number;
  }> {
    try {
      const response = await fetch(
        `${API_BASE}/api/shopify/analytics?startDate=${startDate}&endDate=${endDate}`,
        { credentials: 'include' }
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch analytics');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
      throw error;
    }
  },

  // התנתקות
  async logout(): Promise<void> {
    try {
      await fetch(`${API_BASE}/auth/shopify/logout`, {
        credentials: 'include'
      });
      localStorage.removeItem('shopify_connection');
      window.dispatchEvent(new CustomEvent('shopify-connection-changed', { 
        detail: { connection: null } 
      }));
      console.log('📡 Shopify logout completed');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  },

  saveConnection(conn: ShopifyConnection, skipEvent: boolean = false) {
    localStorage.setItem('shopify_connection', JSON.stringify(conn));
    if (!skipEvent) {
      window.dispatchEvent(new CustomEvent('shopify-connection-changed', { 
        detail: { connection: conn } 
      }));
      console.log('📡 Shopify connection saved');
    }
  },

  getConnection(): ShopifyConnection | null {
    const saved = localStorage.getItem('shopify_connection');
    return saved ? JSON.parse(saved) : null;
  },

  isConnected(): boolean {
    const conn = this.getConnection();
    return !!(conn?.accessToken && conn?.shop);
  }
};
