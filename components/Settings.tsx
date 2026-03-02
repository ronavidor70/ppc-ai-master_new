
import React, { useState, useEffect } from 'react';
import { useTranslation } from '../App';
import { Icons } from '../constants';
import { metaService, MetaConnection } from '../services/metaService';
import { shopifyService, ShopifyConnection } from '../services/shopifyService';
import { MetaAdAccount, MetaPage } from '../types';

const Settings: React.FC = () => {
  const { t, lang, dir } = useTranslation();
  const [connection, setConnection] = useState<MetaConnection | null>(null);
  const [adAccounts, setAdAccounts] = useState<MetaAdAccount[]>([]);
  const [pages, setPages] = useState<MetaPage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFacebookModalOpen, setIsFacebookModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState(1); // 1: Connect, 2: Select
  const [shopifyConnection, setShopifyConnection] = useState<ShopifyConnection | null>(null);
  const [isShopifyModalOpen, setIsShopifyModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    checkExistingConnection();
    checkExistingShopifyConnection();
    
    // בדיקה אם חזרנו מ-callback
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const success = urlParams.get('success');
    const authSuccess = urlParams.get('auth_success');
    const shopifySuccess = urlParams.get('shopify_success');
    const error = urlParams.get('error');
    
    if (error) {
      let errorMessage = lang === 'he' ? 'התחברות נכשלה. נסה שוב.' : 'Login failed. Please try again.';
      if (error === 'rate_limit_exceeded') {
        errorMessage = lang === 'he' 
          ? 'הגעת למגבלת הבקשות של פייסבוק. אנא נסה שוב בעוד כמה דקות.' 
          : 'Facebook API rate limit reached. Please try again in a few minutes.';
      } else if (error === 'oauth_failed') {
        errorMessage = lang === 'he' ? 'התחברות OAuth נכשלה. נסה שוב.' : 'OAuth authentication failed. Please try again.';
      } else if (error === 'authentication_failed') {
        errorMessage = lang === 'he' ? 'אימות נכשל. נסה שוב.' : 'Authentication failed. Please try again.';
      } else if (error.includes('shopify')) {
        errorMessage = lang === 'he' ? 'התחברות ל-Shopify נכשלה. נסה שוב.' : 'Shopify connection failed. Please try again.';
      }
      alert(errorMessage);
      // נקה את ה-URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (success === 'true' && token) {
      handleAuthCallback(token);
      // נקה את ה-URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (authSuccess === 'true') {
      // New callback format - just verify auth, don't fetch data yet
      handleAuthCallback('');
      // נקה את ה-URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (shopifySuccess === 'true') {
      handleShopifyCallback();
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Load accounts and pages when modal opens to step 2 (lazy loading)
  useEffect(() => {
    if (isFacebookModalOpen && modalStep === 2 && adAccounts.length === 0 && pages.length === 0) {
      console.log('📊 Modal opened to step 2, loading accounts and pages lazily...');
      loadAccountsAndPages();
    }
  }, [isFacebookModalOpen, modalStep]);

  const checkExistingConnection = async () => {
    const saved = metaService.getConnection();
    if (saved) {
      console.log('🔍 Found saved connection, verifying validity...');
      // בדוק אם החיבור עדיין תקף
      const auth = await metaService.checkAuth();
      if (auth) {
        console.log('✅ Connection is valid, updating with fresh data');
        setConnection({
          ...saved,
          userToken: auth.accessToken,
          user: auth.user
        });
      } else {
        // אם החיבור לא תקף, נקה הכל
        console.log('❌ Connection is invalid, clearing saved data');
        await metaService.logout();
        setConnection(null);
      }
    } else {
      console.log('ℹ️ No saved connection found');
    }
  };

  const handleAuthCallback = async (token: string) => {
    setIsLoading(true);
    try {
      // Only verify authentication - DO NOT fetch data here
      // Data will be fetched lazily when the user opens the account selection modal
      const auth = await metaService.checkAuth();
      
      // הצגת מידע על המשתמש המחובר
      if (auth?.user) {
        console.log(`✅ Successfully connected to Facebook as: ${auth.user.name} (${auth.user.email || 'No email'})`);
        const confirmMessage = lang === 'he' 
          ? `התחברת בהצלחה כ: ${auth.user.name}\nהאם זה החשבון הנכון?`
          : `Successfully connected as: ${auth.user.name}\nIs this the correct account?`;
        
        if (!confirm(confirmMessage)) {
          // אם המשתמש אומר שזה לא החשבון הנכון
          await metaService.logout();
          alert(lang === 'he' ? 'התחברות בוטלה. נסה שוב עם החשבון הנכון.' : 'Login cancelled. Please try again with the correct account.');
          setIsLoading(false);
          return;
        }
      }
      
      // Save connection with token and user info only
      // Data fetching will happen lazily when modal opens
      const newConnection = { 
        userToken: token || auth?.accessToken || '',
        user: auth?.user
      };
      setConnection(newConnection);
      metaService.saveConnection(newConnection);
      
      // Open modal - data will be fetched when modal opens (lazy loading)
      setModalStep(2);
      setIsFacebookModalOpen(true);
      
      // Fetch data only when modal is opened (lazy loading)
      // This prevents rate limits during authentication
      loadAccountsAndPages();
    } catch (err: any) {
      console.error('Auth callback error:', err);
      // Check if it's a rate limit error
      if (err.message?.includes('rate limit') || err.message?.includes('Rate limit') || err.code === 4) {
        alert(lang === 'he' 
          ? 'הגעת למגבלת הבקשות של פייסבוק. אנא נסה שוב בעוד כמה דקות.' 
          : 'Facebook API rate limit reached. Please try again in a few minutes.');
      } else {
        alert(err.message || (lang === 'he' ? 'נכשל באימות' : 'Authentication failed'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Separate function to load accounts and pages (called lazily)
  const loadAccountsAndPages = async () => {
    try {
      setIsLoading(true);
      const accounts = await metaService.fetchAdAccounts();
      const userPages = await metaService.fetchPages();
      
      console.log(`📊 Fetched ${accounts.length} ad accounts:`, accounts.map(a => ({ name: a.name, id: a.account_id })));
      console.log(`📄 Fetched ${userPages.length} pages:`, userPages.map(p => ({ name: p.name, id: p.id })));
      
      setAdAccounts(accounts);
      setPages(userPages);
    } catch (err: any) {
      console.error('Failed to load accounts and pages:', err);
      // Check if it's a rate limit error
      if (err.message?.includes('rate limit') || err.message?.includes('Rate limit') || err.code === 4) {
        alert(lang === 'he' 
          ? 'הגעת למגבלת הבקשות של פייסבוק. אנא נסה שוב בעוד כמה דקות.' 
          : 'Facebook API rate limit reached. Please try again in a few minutes.');
      } else {
        alert(err.message || (lang === 'he' ? 'נכשל בטעינת הנתונים' : 'Failed to fetch data'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleFacebookLogin = async () => {
    setIsLoading(true);
    try {
      // הודעה למשתמש
      const message = lang === 'he' 
        ? 'אתה עומד להתחבר לפייסבוק. וודא שאתה מחובר לחשבון הנכון בפייסבוק לפני המשך.'
        : 'You are about to connect to Facebook. Make sure you are logged into the correct Facebook account before proceeding.';
      
      if (confirm(message)) {
        await metaService.loginWithFacebook();
        // המשתמש יועבר לפייסבוק, ואז יחזור ל-callback
      } else {
        setIsLoading(false);
      }
    } catch (err: any) {
      alert(err.message || (lang === 'he' ? 'התחברות נכשלה' : 'Login failed'));
      setIsLoading(false);
    }
  };

  const finalizeFacebookConnection = () => {
    if (connection && connection.selectedAccountId && connection.selectedPageId) {
      // שמירה עם כל הנתונים
      const fullConnection = {
        ...connection,
        userToken: connection.userToken || '',
        selectedAccountId: connection.selectedAccountId,
        selectedPageId: connection.selectedPageId,
        user: connection.user
      };
      
      console.log('💾 Saving Facebook connection:', fullConnection.user?.name, fullConnection.selectedAccountId);
      metaService.saveConnection(fullConnection);
      setIsFacebookModalOpen(false);
      alert(lang === 'he' ? "חשבון פייסבוק חובר בהצלחה!" : "Facebook connected successfully!");
      
      // לא צריך לרענן את הדף - DataContext יתעדכן אוטומטית
      console.log('✅ Connection finalized, DataContext will refresh automatically');
    }
  };

  const handleFacebookDisconnect = async () => {
    const confirmMessage = lang === 'he' 
      ? 'האם אתה בטוח שברצונך להתנתק מפייסבוק?' 
      : 'Are you sure you want to disconnect from Facebook?';
    
    if (confirm(confirmMessage)) {
      setIsLoading(true);
      try {
        console.log('🔌 Disconnecting from Facebook...');
        await metaService.logout();
        setConnection(null);
        alert(lang === 'he' ? 'התנתקת בהצלחה מפייסבוק' : 'Successfully disconnected from Facebook');
        
        // לא צריך לרענן את הדף - DataContext יתעדכן אוטומטית
        console.log('✅ Disconnect completed, DataContext will refresh automatically');
      } catch (error: any) {
        console.error('Disconnect error:', error);
        alert(error.message || (lang === 'he' ? 'שגיאה בהתנתקות' : 'Disconnect failed'));
      } finally {
        setIsLoading(false);
      }
    }
  };

  const refreshAccounts = async () => {
    setIsLoading(true);
    try {
      console.log('🔄 Refreshing ad accounts and pages...');
      const accounts = await metaService.fetchAdAccounts();
      const userPages = await metaService.fetchPages();
      
      setAdAccounts(accounts);
      setPages(userPages);
      
      console.log(`✅ Refreshed: ${accounts.length} accounts, ${userPages.length} pages`);
      alert(lang === 'he' ? 'רשימת החשבונות עודכנה' : 'Account list refreshed');
    } catch (error: any) {
      console.error('Refresh error:', error);
      alert(error.message || (lang === 'he' ? 'שגיאה ברענון' : 'Refresh failed'));
    } finally {
      setIsLoading(false);
    }
  };

  // Shopify Functions
  const checkExistingShopifyConnection = async () => {
    const saved = shopifyService.getConnection();
    if (saved) {
      console.log('🔍 Found saved Shopify connection, verifying validity...');
      const auth = await shopifyService.checkAuth();
      if (auth) {
        console.log('✅ Shopify connection is valid');
        setShopifyConnection({
          ...saved,
          accessToken: auth.accessToken,
          shop: auth.shop,
          storeName: auth.storeName,
          storeUrl: auth.storeUrl
        });
      } else {
        console.log('❌ Shopify connection is invalid, clearing saved data');
        await shopifyService.logout();
        setShopifyConnection(null);
      }
    } else {
      console.log('ℹ️ No saved Shopify connection found');
    }
  };

  const handleShopifyCallback = async () => {
    setIsLoading(true);
    try {
      const auth = await shopifyService.checkAuth();
      if (auth) {
        const newConnection: ShopifyConnection = {
          shop: auth.shop,
          accessToken: auth.accessToken,
          storeName: auth.storeName,
          storeUrl: auth.storeUrl || `https://${auth.shop}`,
          connectedAt: new Date().toISOString()
        };
        setShopifyConnection(newConnection);
        shopifyService.saveConnection(newConnection);
        
        // Auto-sync store
        await syncShopifyStore();
        
        alert(lang === 'he' ? 'חנות Shopify חוברה בהצלחה!' : 'Shopify store connected successfully!');
      }
    } catch (err: any) {
      alert(err.message || (lang === 'he' ? 'נכשל בחיבור' : 'Connection failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleShopifyLogin = async () => {
    setIsLoading(true);
    try {
      await shopifyService.loginWithShopify();
    } catch (err: any) {
      alert(err.message || (lang === 'he' ? 'התחברות נכשלה' : 'Login failed'));
      setIsLoading(false);
    }
  };

  const syncShopifyStore = async () => {
    setIsSyncing(true);
    try {
      const syncData = await shopifyService.syncStore();
      console.log('✅ Store synced:', syncData);
      alert(lang === 'he' 
        ? `סנכרון הושלם: ${syncData.totalOrders} הזמנות, ${syncData.products.length} מוצרים`
        : `Sync completed: ${syncData.totalOrders} orders, ${syncData.products.length} products`
      );
    } catch (err: any) {
      alert(err.message || (lang === 'he' ? 'סנכרון נכשל' : 'Sync failed'));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleShopifyDisconnect = async () => {
    const confirmMessage = lang === 'he' 
      ? 'האם אתה בטוח שברצונך להתנתק מ-Shopify?' 
      : 'Are you sure you want to disconnect from Shopify?';
    
    if (confirm(confirmMessage)) {
      setIsLoading(true);
      try {
        await shopifyService.logout();
        setShopifyConnection(null);
        alert(lang === 'he' ? 'התנתקת בהצלחה מ-Shopify' : 'Successfully disconnected from Shopify');
      } catch (error: any) {
        alert(error.message || (lang === 'he' ? 'שגיאה בהתנתקות' : 'Disconnect failed'));
      } finally {
        setIsLoading(false);
      }
    }
  };

  const categories = [
    {
      id: 'ads',
      title: t('adPlatforms'),
      items: [
        { 
          id: 'facebook', 
          name: 'Meta (Facebook/IG)', 
          icon: <Icons.Facebook />, 
          status: connection?.selectedAccountId ? 'Connected' : t('notConnected'),
          action: () => setIsFacebookModalOpen(true),
          isConnected: !!connection?.selectedAccountId,
          disconnectAction: handleFacebookDisconnect
        },
        { id: 'google', name: 'Google Ads', icon: <Icons.Google />, status: t('notConnected'), action: () => {} },
        { id: 'tiktok', name: 'TikTok Ads', icon: <Icons.TikTok />, status: t('notConnected'), action: () => {} },
        { id: 'linkedin', name: 'LinkedIn Ads', icon: <Icons.LinkedIn />, status: t('notConnected'), action: () => {} },
        { id: 'taboola', name: 'Taboola', icon: <Icons.Taboola />, status: t('notConnected'), action: () => {} },
      ]
    },
    {
      id: 'ecommerce',
      title: t('ecommerce'),
      items: [
        { 
          id: 'shopify', 
          name: 'Shopify', 
          icon: <Icons.Shopify />, 
          status: shopifyConnection?.shop ? 'Connected' : t('notConnected'), 
          action: () => {
            if (shopifyConnection) {
              setIsShopifyModalOpen(true);
            } else {
              handleShopifyLogin();
            }
          },
          isConnected: !!shopifyConnection?.shop,
          disconnectAction: handleShopifyDisconnect
        },
        { id: 'wordpress', name: 'WordPress / WC', icon: <Icons.WordPress />, status: t('notConnected'), action: () => {} },
      ]
    },
    {
      id: 'crm',
      title: t('crm_cat'),
      items: [
        { id: 'whatsapp', name: 'WhatsApp Business', icon: <Icons.WhatsApp />, status: t('notConnected'), action: () => {} },
        { id: 'hubspot', name: 'HubSpot', icon: <Icons.HubSpot />, status: t('notConnected'), action: () => {} },
        { id: 'sheets', name: 'Google Sheets', icon: <Icons.Sheets />, status: t('notConnected'), action: () => {} },
        { id: 'zapier', name: 'Zapier', icon: <Icons.Zapier />, status: t('notConnected'), action: () => {} },
      ]
    },
    {
      id: 'dev',
      title: t('developerApi'),
      items: [
        { id: 'api', name: t('generalApi'), icon: <Icons.Code />, status: t('notConnected'), action: () => {} },
        { id: 'pixel', name: t('masterPixel'), icon: <Icons.Zap />, status: t('notConnected'), action: () => {} },
      ]
    }
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="text-center space-y-3">
        <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tight">{t('connectedAccounts')}</h2>
        <p className="text-slate-500 text-sm font-medium max-w-2xl mx-auto">{t('ecosystemSub')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-16">
        {categories.map(cat => (
          <div key={cat.id} className="space-y-8">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="w-1.5 h-6 bg-blue-600 rounded-full"></div>
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">
                {cat.title}
              </h3>
            </div>
            
            <div className="grid grid-cols-1 gap-5">
              {cat.items.map(item => (
                <div 
                  key={item.id} 
                  className="group bg-white p-7 rounded-[32px] border border-slate-200 shadow-sm flex items-center justify-between transition-all duration-300 hover:shadow-xl hover:border-blue-200 relative overflow-hidden"
                >
                  <div className="flex items-center gap-5 relative z-10">
                    <div className="p-4 bg-slate-50 rounded-2xl group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors duration-300">
                      {item.icon}
                    </div>
                    <div>
                      <p className="font-black text-slate-800 text-base mb-1">{item.name}</p>
                      <p className={`text-[10px] font-black uppercase tracking-widest ${item.status === 'Connected' ? 'text-green-500' : 'text-slate-300'}`}>
                        {item.status}
                      </p>
                    </div>
                  </div>
                  
                  <div className="relative z-10 flex gap-2">
                    <button 
                      onClick={item.action}
                      className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] transition-all duration-300 ${
                        item.status === 'Connected' 
                          ? 'bg-slate-100 text-slate-400' 
                          : 'bg-blue-600 text-white shadow-lg shadow-blue-100 hover:scale-105 active:scale-95'
                      }`}
                    >
                      {item.status === 'Connected' ? t('manage') : t('connect')}
                    </button>
                    
                    {/* כפתור התנתקות עבור פייסבוק כשמחובר */}
                    {(item as any).isConnected && (item as any).disconnectAction && (
                      <button 
                        onClick={(item as any).disconnectAction}
                        className="px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] transition-all duration-300 bg-red-100 text-red-600 hover:bg-red-200 hover:scale-105 active:scale-95"
                        disabled={isLoading}
                      >
                        {lang === 'he' ? 'התנתק' : 'Disconnect'}
                      </button>
                    )}
                  </div>

                  {/* Subtle background decoration for each card */}
                  <div className="absolute top-0 right-0 w-24 h-24 bg-slate-50 rounded-full -mr-12 -mt-12 transition-colors duration-500 group-hover:bg-blue-50/50"></div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Facebook OAuth Modal */}
      {isFacebookModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setIsFacebookModalOpen(false)} />
          <div className="relative bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 md:p-12">
               <div className="flex items-center justify-between mb-10">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-[#1877F2] text-white rounded-2xl">
                       <Icons.Facebook />
                    </div>
                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Meta Ads Connection</h3>
                  </div>
                  <button onClick={() => setIsFacebookModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                    <Icons.X />
                  </button>
               </div>

               {modalStep === 1 ? (
                 <div className="text-center space-y-8 py-6">
                    <div className="max-w-xs mx-auto space-y-4">
                       <h4 className="text-lg font-bold text-slate-800">Ready to Sync with Meta?</h4>
                       <p className="text-sm text-slate-500 leading-relaxed">
                          We will pull your Ad Accounts and Pages to enable full AI campaign creation and tracking.
                       </p>
                    </div>
                    <button 
                      onClick={handleFacebookLogin}
                      disabled={isLoading}
                      className="inline-flex items-center gap-4 px-10 py-5 bg-[#1877F2] text-white rounded-[24px] font-black shadow-2xl hover:scale-105 transition-all disabled:opacity-50"
                    >
                      {isLoading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Icons.Facebook />}
                      <span className="uppercase tracking-widest">Login with Facebook</span>
                    </button>
                 </div>
               ) : (
                 <div className="space-y-8 animate-in fade-in duration-500">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-sm text-slate-600">
                        {lang === 'he' ? 'בחר את החשבון והדף שברצונך לחבר' : 'Select the account and page you want to connect'}
                      </p>
                      <button
                        onClick={refreshAccounts}
                        disabled={isLoading}
                        className="px-3 py-2 text-xs bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        <Icons.TrendingUp className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                        {lang === 'he' ? 'רענן' : 'Refresh'}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Ad Account</label>
                           <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                              {adAccounts.length === 0 ? (
                                <div className="p-4 text-center text-slate-500 text-sm">
                                  {lang === 'he' ? 'לא נמצאו חשבונות מודעות' : 'No ad accounts found'}
                                  <br />
                                  <button onClick={refreshAccounts} className="text-blue-600 underline mt-1">
                                    {lang === 'he' ? 'נסה לרענן' : 'Try refreshing'}
                                  </button>
                                </div>
                              ) : adAccounts.map(acc => (
                                <button
                                  key={acc.id}
                                  onClick={() => setConnection({ ...connection!, selectedAccountId: acc.account_id })}
                                  className={`w-full p-4 rounded-2xl border-2 text-start transition-all flex items-center justify-between ${
                                    connection?.selectedAccountId === acc.account_id ? 'border-blue-600 bg-blue-50' : 'border-slate-50 bg-slate-50 hover:border-slate-100'
                                  }`}
                                >
                                  <div>
                                    <p className="font-bold text-xs text-slate-800">{acc.name}</p>
                                    <p className="text-[8px] text-slate-400 font-mono">{acc.account_id}</p>
                                  </div>
                                  {connection?.selectedAccountId === acc.account_id && <Icons.CheckCircle />}
                                </button>
                              ))}
                           </div>
                        </div>

                        <div className="space-y-3">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Page</label>
                           <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                              {pages.length === 0 ? (
                                <div className="p-4 text-center text-slate-500 text-sm">
                                  {lang === 'he' ? 'לא נמצאו דפים' : 'No pages found'}
                                  <br />
                                  <button onClick={refreshAccounts} className="text-blue-600 underline mt-1">
                                    {lang === 'he' ? 'נסה לרענן' : 'Try refreshing'}
                                  </button>
                                </div>
                              ) : pages.map(page => (
                                <button
                                  key={page.id}
                                  onClick={() => setConnection({ ...connection!, selectedPageId: page.id })}
                                  className={`w-full p-4 rounded-2xl border-2 text-start transition-all flex items-center justify-between ${
                                    connection?.selectedPageId === page.id ? 'border-blue-600 bg-blue-50' : 'border-slate-50 bg-slate-50 hover:border-slate-100'
                                  }`}
                                >
                                  <div>
                                    <p className="font-bold text-xs text-slate-800">{page.name}</p>
                                    <p className="text-[8px] text-slate-400">{page.category}</p>
                                  </div>
                                  {connection?.selectedPageId === page.id && <Icons.CheckCircle />}
                                </button>
                              ))}
                           </div>
                        </div>
                    </div>

                    <div className="pt-6 border-t border-slate-50 flex justify-end">
                       <button 
                         onClick={finalizeFacebookConnection}
                         disabled={!connection?.selectedAccountId || !connection?.selectedPageId}
                         className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl hover:bg-slate-800 transition-all disabled:opacity-50"
                       >
                         Finish Connection
                       </button>
                    </div>
                 </div>
               )}
            </div>
          </div>
        </div>
      )}

      {/* Shopify Connection Modal */}
      {isShopifyModalOpen && shopifyConnection && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setIsShopifyModalOpen(false)} />
          <div className="relative bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 md:p-12">
              <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-[#5e8e3e] text-white rounded-2xl">
                    <Icons.Shopify />
                  </div>
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">
                    {lang === 'he' ? 'חיבור Shopify' : 'Shopify Connection'}
                  </h3>
                </div>
                <button onClick={() => setIsShopifyModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <Icons.X />
                </button>
              </div>

              <div className="space-y-6">
                <div className="bg-slate-50 rounded-2xl p-6">
                  <p className="text-sm font-bold text-slate-800 mb-2">
                    {lang === 'he' ? 'חנות מחוברת:' : 'Connected Store:'}
                  </p>
                  <p className="text-lg font-black text-slate-900">{shopifyConnection.storeName || shopifyConnection.shop}</p>
                  <p className="text-xs text-slate-500 mt-1">{shopifyConnection.storeUrl}</p>
                </div>

                <button
                  onClick={syncShopifyStore}
                  disabled={isSyncing}
                  className="w-full px-6 py-4 bg-[#5e8e3e] text-white rounded-2xl font-black uppercase tracking-widest shadow-xl hover:bg-[#4a7c2f] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                >
                  {isSyncing ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>{lang === 'he' ? 'מסנכרן...' : 'Syncing...'}</span>
                    </>
                  ) : (
                    <>
                      <Icons.TrendingUp />
                      <span>{lang === 'he' ? 'סנכרן חנות' : 'Sync Store'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
