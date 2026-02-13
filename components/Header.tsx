
import React, { useState } from 'react';
import { Icons, LANGUAGES } from '../constants';
import { useTranslation } from '../App';
import { useData } from '../contexts/DataContext';

interface HeaderProps {
  activeTab: string;
  toggleMobileMenu: () => void;
  onNewCampaign: () => void;
}

const Header: React.FC<HeaderProps> = ({ activeTab, toggleMobileMenu, onNewCampaign }) => {
  const { t, lang, setLang } = useTranslation();
  const { statusFilter, setStatusFilter } = useData();
  const [showLangMenu, setShowLangMenu] = useState(false);

  const currentLang = LANGUAGES.find(l => l.code === lang);

  return (
    <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-4 md:px-8 z-20 shrink-0">
      <div className="flex items-center gap-2">
        {/* Mobile Menu Toggle */}
        <button 
          onClick={toggleMobileMenu}
          className="md:hidden p-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
        >
          <Icons.Menu />
        </button>
        
        {/* Status Filter Buttons */}
        <div className="hidden md:flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
           <button 
             onClick={() => setStatusFilter('ALL')}
             className={`px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${statusFilter === 'ALL' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
           >
             {t('all') || 'All'}
           </button>
           <button 
             onClick={() => setStatusFilter('ACTIVE')}
             className={`px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${statusFilter === 'ACTIVE' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-400 hover:text-green-600'}`}
           >
             {t('active') || 'Active'}
           </button>
           <button 
             onClick={() => setStatusFilter('PAUSED')}
             className={`px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${statusFilter === 'PAUSED' ? 'bg-white text-orange-500 shadow-sm' : 'text-slate-400 hover:text-orange-500'}`}
           >
             {t('paused') || 'Paused'}
           </button>
        </div>
      </div>
      
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Global Create Campaign Button */}
        <button 
          onClick={onNewCampaign}
          className="flex items-center gap-2 px-4 sm:px-6 py-2 bg-blue-600 text-white rounded-full font-black shadow-lg shadow-blue-100 hover:scale-105 transition-all uppercase tracking-widest text-[10px] sm:text-xs"
        >
          <Icons.Zap />
          <span className="hidden sm:inline">{t('newCampaign')}</span>
        </button>

        {/* Language Switcher */}
        <div className="relative">
          <button 
            onClick={() => setShowLangMenu(!showLangMenu)}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all"
          >
            <Icons.Globe />
            <span className="hidden sm:inline">{currentLang?.flag} {currentLang?.label}</span>
            <span className="sm:hidden">{currentLang?.flag}</span>
          </button>
          
          {showLangMenu && (
            <div className="absolute top-full mt-2 right-0 w-48 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 z-50">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => {
                    setLang(l.code);
                    setShowLangMenu(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-sm rounded-xl transition-colors ${
                    lang === l.code ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span>{l.flag}</span>
                  <span className="font-semibold">{l.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3 pl-3 sm:pl-6 border-l border-slate-200">
          <div className="text-right hidden lg:block">
            <p className="text-xs font-bold text-slate-800">Owner</p>
            <p className="text-[10px] text-blue-600 font-black uppercase tracking-tighter">Pro Plan</p>
          </div>
          <div className="w-8 h-8 sm:w-9 sm:h-9 bg-slate-100 rounded-full border-2 border-slate-200 overflow-hidden shrink-0">
            <img src="https://picsum.photos/100/100?seed=avatar" alt="User" />
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
