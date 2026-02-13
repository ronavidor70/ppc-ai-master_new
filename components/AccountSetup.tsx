
import React, { useState } from 'react';
import { useTranslation } from '../App';
import { Icons } from '../constants';
import { Platform } from '../types';

const AccountSetup: React.FC = () => {
  const { t, lang, dir } = useTranslation();
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisioningStep, setProvisioningStep] = useState(0);
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null);

  const steps = [
    lang === 'he' ? "יוצר מכולה ופרופיל עסקי..." : "Creating container and business profile...",
    lang === 'he' ? "מגדיר אמצעי תשלום ואבטחה..." : "Configuring payment and security...",
    lang === 'he' ? "מבצע אימות מול שרתי הפלטפורמה..." : "Verifying with platform servers...",
    lang === 'he' ? "מטמיע פיקסל מעקב ומבנה קמפיינים..." : "Injecting tracking pixel and campaign structure...",
  ];

  const handleStartProvisioning = (platform: Platform) => {
    setSelectedPlatform(platform);
    setIsProvisioning(true);
    setProvisioningStep(0);

    // Simulate the AI provisioning process
    let currentStep = 0;
    const interval = setInterval(() => {
      currentStep++;
      if (currentStep < steps.length) {
        setProvisioningStep(currentStep);
      } else {
        clearInterval(interval);
        setTimeout(() => {
          setIsProvisioning(false);
          alert(lang === 'he' ? `חשבון ${platform} הוקם בהצלחה!` : `${platform} account created successfully!`);
        }, 1500);
      }
    }, 2500);
  };

  const provisionCards = [
    { id: Platform.GOOGLE, name: 'Google Ads', icon: <Icons.Google />, desc: 'Search, YouTube & Shopping.' },
    { id: Platform.FACEBOOK, name: 'Meta Business', icon: <Icons.Facebook />, desc: 'Facebook, IG & WhatsApp Ads.' },
    { id: Platform.TIKTOK, name: 'TikTok For Business', icon: <Icons.TikTok />, desc: 'Global short-video reach.' },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight">{t('provisioningTitle')}</h2>
          <p className="text-slate-500 text-sm font-medium max-w-xl leading-relaxed">{t('provisioningExplanation')}</p>
        </div>
        <div className="px-5 py-2 bg-blue-50 text-blue-600 rounded-2xl border border-blue-100 flex items-center gap-2">
          <Icons.Sparkles className="w-4 h-4" />
          <span className="text-[10px] font-black uppercase tracking-widest">AI Auto-Provisioning</span>
        </div>
      </div>

      {!isProvisioning ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {provisionCards.map((card) => (
            <div key={card.id} className="group bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm hover:shadow-2xl hover:border-blue-100 transition-all duration-500 relative overflow-hidden flex flex-col h-full">
              {/* Decorative accent */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-full -mr-16 -mt-16 group-hover:bg-blue-50/50 transition-colors"></div>
              
              <div className="relative z-10 flex-1">
                <div className="p-4 bg-slate-50 rounded-2xl w-fit mb-6 group-hover:scale-110 transition-transform duration-500">
                  {card.icon}
                </div>
                <h3 className="text-xl font-black text-slate-800 mb-2">{card.name}</h3>
                <p className="text-sm text-slate-500 leading-relaxed mb-8">{card.desc}</p>
                
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-[10px] font-black text-slate-300 uppercase">
                    <Icons.CheckCircle className="w-3 h-3" />
                    Auto-Verification
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-black text-slate-300 uppercase">
                    <Icons.CheckCircle className="w-3 h-3" />
                    Billing Setup
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-black text-slate-300 uppercase">
                    <Icons.CheckCircle className="w-3 h-3" />
                    API Handshake
                  </div>
                </div>
              </div>

              <button 
                onClick={() => handleStartProvisioning(card.id)}
                className="mt-10 w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl hover:bg-blue-600 hover:scale-[1.02] transition-all"
              >
                {t('createAccount')}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white p-12 md:p-20 rounded-[40px] border border-slate-200 shadow-2xl flex flex-col items-center text-center space-y-12 animate-in zoom-in-95 duration-500">
          <div className="relative">
            <div className="w-32 h-32 bg-blue-600 text-white rounded-[48px] flex items-center justify-center shadow-2xl animate-pulse">
               <div className="scale-150">
                {provisionCards.find(c => c.id === selectedPlatform)?.icon}
               </div>
            </div>
            <div className="absolute -bottom-4 -right-4 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center border-4 border-slate-50">
              <Icons.Robot className="text-blue-600" />
            </div>
          </div>

          <div className="space-y-4 max-w-md">
            <h3 className="text-2xl font-black text-slate-800">{lang === 'he' ? 'מקים חשבון חדש...' : 'Provisioning New Account...'}</h3>
            <p className="text-slate-400 font-medium italic text-sm">{steps[provisioningStep]}</p>
          </div>

          <div className="w-full max-w-md bg-slate-100 h-3 rounded-full overflow-hidden">
             <div 
               className="h-full bg-blue-600 transition-all duration-1000 ease-out" 
               style={{ width: `${((provisioningStep + 1) / steps.length) * 100}%` }}
             ></div>
          </div>

          <div className="grid grid-cols-4 gap-4 w-full max-w-md">
             {steps.map((_, i) => (
               <div key={i} className={`h-1 rounded-full transition-colors duration-500 ${i <= provisioningStep ? 'bg-blue-600' : 'bg-slate-200'}`}></div>
             ))}
          </div>
        </div>
      )}

      {/* Trust Section */}
      <div className="bg-slate-900 rounded-[40px] p-10 text-white flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden">
         <div className="absolute top-0 right-0 p-12 opacity-5 scale-150"><Icons.Shield className="w-32 h-32" /></div>
         <div className="space-y-4 relative z-10">
            <h4 className="text-xl font-black uppercase tracking-tight">Certified Provisioning Partner</h4>
            <p className="text-sm text-slate-400 max-w-lg leading-relaxed">
              Our AI is officially integrated with major advertising platforms to ensure secure, policy-compliant account creation and instant verification.
            </p>
         </div>
         <div className="flex gap-6 relative z-10 grayscale opacity-40">
            <Icons.Google />
            <Icons.Facebook />
            <Icons.TikTok />
         </div>
      </div>
    </div>
  );
};

export default AccountSetup;
