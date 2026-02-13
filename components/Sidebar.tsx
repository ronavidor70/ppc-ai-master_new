
import React from 'react';
import { Icons, PRICING_PLANS, CURRENCY_CONFIG, BASE_PRICE_USD } from '../constants';
import { useTranslation } from '../App';
import { PlanId } from '../types';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentPlan: PlanId;
  isOpen?: boolean;
  onClose?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, currentPlan, isOpen, onClose }) => {
  const { t, dir, lang } = useTranslation();
  
  const menuItems = [
    { id: 'chat', label: t('aiManager'), icon: <Icons.Robot /> },
    { id: 'dashboard', label: t('performance'), icon: <Icons.TrendingUp /> },
    { id: 'campaigns', label: t('campaigns'), icon: <Icons.Layout /> },
    { id: 'crm', label: t('crm'), icon: <Icons.Users /> },
    { id: 'creative-studio', label: t('creativeStudio'), icon: <Icons.Palette /> },
    { id: 'landing-pages', label: t('landingPages'), icon: <Icons.Browser /> },
    { id: 'account-setup', label: t('accountSetup'), icon: <Icons.Zap /> },
    { id: 'settings', label: t('connections'), icon: <Icons.Settings /> },
    { id: 'glossary', label: t('glossary'), icon: <Icons.Book /> },
    { id: 'billing', label: t('payment'), icon: <Icons.CreditCard /> },
  ];

  const currencyInfo = CURRENCY_CONFIG[lang] || CURRENCY_CONFIG['en'];
  const localizedPrice = Math.round(BASE_PRICE_USD * currencyInfo.rate).toLocaleString();

  const handleNavClick = (id: string) => {
    setActiveTab(id);
    if (onClose) onClose();
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white shadow-sm">
      <div className="p-8 border-b border-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-100 shrink-0">
            <Icons.Logo />
          </div>
          <div className="overflow-hidden">
            <h1 className="font-black text-slate-800 text-lg leading-tight truncate">{t('appName')}</h1>
            <span className="text-[10px] text-blue-500 font-black tracking-widest uppercase whitespace-nowrap">{t('aiAutonomous')}</span>
          </div>
        </div>
        {onClose && <button onClick={onClose} className="md:hidden p-2 text-slate-400 hover:text-slate-600"><Icons.X /></button>}
      </div>

      <nav className="flex-1 p-6 space-y-2 overflow-y-auto">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => handleNavClick(item.id)}
            className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-300 group ${
              activeTab === item.id ? 'bg-blue-600 text-white shadow-2xl shadow-blue-200' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
            }`}
          >
            <span className={`transition-transform duration-300 ${activeTab === item.id ? 'scale-110' : 'group-hover:scale-110'}`}>{item.icon}</span>
            <span className="font-black text-xs uppercase tracking-widest">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-6 border-t border-slate-50">
        <div className="p-6 bg-slate-900 rounded-[32px] text-white shadow-2xl relative overflow-hidden">
          {/* Animated background element for premium feel */}
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-600/20 blur-3xl -mr-12 -mt-12 rounded-full"></div>
          
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">PRO MASTER</p>
            <div className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse"></div>
          </div>
          <div className="mb-4">
             <h4 className="text-xl font-black">{currencyInfo.symbol}{localizedPrice}<span className="text-[10px] opacity-60 font-medium">{t('perMonth')}</span></h4>
             <p className="text-[9px] text-slate-400 uppercase font-black tracking-tighter mt-1">{t('active')}</p>
          </div>
          <button onClick={() => handleNavClick('billing')} className="w-full py-3 bg-white text-slate-900 rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-lg">
             {t('manage')}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="w-72 border-r border-slate-100 h-screen sticky top-0 flex-col bg-white hidden md:flex shrink-0 z-50">
        {sidebarContent}
      </aside>
      <div className={`fixed inset-0 z-[100] md:hidden transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
        <aside className={`absolute top-0 bottom-0 w-72 max-w-[80vw] bg-white shadow-2xl transition-transform duration-300 ease-out ${dir === 'rtl' ? (isOpen ? 'translate-x-0' : 'translate-x-full') : (isOpen ? 'translate-x-0' : '-translate-x-full')} ${dir === 'rtl' ? 'right-0' : 'left-0'}`}>
          {sidebarContent}
        </aside>
      </div>
    </>
  );
};

export default Sidebar;
