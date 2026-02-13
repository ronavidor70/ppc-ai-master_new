
import React, { useState, useEffect } from 'react';
import { useTranslation } from '../App';
import { Icons } from '../constants';
import { metaService, MetaConnection } from '../services/metaService';
import { MetaAdAccount, MetaPage } from '../types';

const Settings: React.FC = () => {
  const { t, lang, dir } = useTranslation();
  const [connection, setConnection] = useState<MetaConnection | null>(null);
  const [adAccounts, setAdAccounts] = useState<MetaAdAccount[]>([]);
  const [pages, setPages] = useState<MetaPage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFacebookModalOpen, setIsFacebookModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState(1); // 1: Connect, 2: Select

  useEffect(() => {
    checkExistingConnection();
    
    // בדיקה אם חזרנו מ-callback
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const success = urlParams.get('success');
    const error = urlParams.get('error');
    
    if (error) {
      alert(lang === 'he' ? 'התחברות נכשלה. נסה שוב.' : 'Login failed. Please try again.');
      // נקה את ה-URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (success === 'true' && token) {
      handleAuthCallback(token);
      // נקה את ה-URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const checkExistingConnection = async () => {
    const saved = metaService.getConnection();
    if (saved) {
      setConnection(saved);
      // בדוק אם החיבור עדיין תקף
      const auth = await metaService.checkAuth();
      if (auth) {
        setConnection({
          ...saved,
          userToken: auth.accessToken,
          user: auth.user
        });
      }
    }
  };

  const handleAuthCallback = async (token: string) => {
    setIsLoading(true);
    try {
      const accounts = await metaService.fetchAdAccounts();
      const userPages = await metaService.fetchPages();
      const auth = await metaService.checkAuth();
      
      setAdAccounts(accounts);
      setPages(userPages);
      
      // שמירת החיבור עם כל הנתונים
      const newConnection = { 
        userToken: token || auth?.accessToken || '',
        user: auth?.user
      };
      setConnection(newConnection);
      setModalStep(2);
      setIsFacebookModalOpen(true);
    } catch (err: any) {
      alert(err.message || (lang === 'he' ? 'נכשל בטעינת הנתונים' : 'Failed to fetch data'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleFacebookLogin = async () => {
    setIsLoading(true);
    try {
      await metaService.loginWithFacebook();
      // המשתמש יועבר לפייסבוק, ואז יחזור ל-callback
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
      metaService.saveConnection(fullConnection);
      setIsFacebookModalOpen(false);
      alert(lang === 'he' ? "חשבון פייסבוק חובר בהצלחה!" : "Facebook connected successfully!");
      // רענון הדף כדי שהדשבורד יטען מחדש
      setTimeout(() => {
        window.location.reload();
      }, 1000);
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
          action: () => setIsFacebookModalOpen(true)
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
        { id: 'shopify', name: 'Shopify', icon: <Icons.Shopify />, status: t('notConnected'), action: () => {} },
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
                  
                  <button 
                    onClick={item.action}
                    className={`relative z-10 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] transition-all duration-300 ${
                      item.status === 'Connected' 
                        ? 'bg-slate-100 text-slate-400 cursor-default' 
                        : 'bg-blue-600 text-white shadow-lg shadow-blue-100 hover:scale-105 active:scale-95'
                    }`}
                  >
                    {item.status === 'Connected' ? t('manage') : t('connect')}
                  </button>

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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Ad Account</label>
                           <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                              {adAccounts.map(acc => (
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
                              {pages.map(page => (
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
    </div>
  );
};

export default Settings;
