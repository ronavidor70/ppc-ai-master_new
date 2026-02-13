
import React, { useState } from 'react';
import { useTranslation } from '../App';
import { Campaign, CampaignStatus, Platform, CampaignStrategy } from '../types';
import { Icons } from '../constants';
import { openaiService } from '../services/openaiService';

interface CampaignWizardProps {
  onCampaignCreated: (campaign: Campaign) => void;
}

const CampaignWizard: React.FC<CampaignWizardProps> = ({ onCampaignCreated }) => {
  const { t, lang, currency, dir } = useTranslation();
  const [step, setStep] = useState(1);
  const [subStep, setSubStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    goal: '',
    budget: '50',
    budgetType: 'daily' as 'daily' | 'total',
    productDescription: '',
    // Step 2 specific fields
    campaignType: '', // e.g., Search, PMax, LeadForm, Website
    conversionLocation: '', // Meta specific
    targetAudience: '', // Manual text input
    targetKeywords: [] as any[],
    targetInterests: [] as any[],
    useLookalike: false
  });
  
  const [aiSuggestions, setAiSuggestions] = useState<any>(null);
  const [strategy, setStrategy] = useState<CampaignStrategy | null>(null);

  const platforms = [
    { id: Platform.GOOGLE, icon: <Icons.Google />, label: 'Google Ads' },
    { id: Platform.FACEBOOK, icon: <Icons.Facebook />, label: 'Meta (FB/IG)' },
    { id: Platform.TIKTOK, icon: <Icons.TikTok />, label: 'TikTok Ads' },
    { id: Platform.LINKEDIN, icon: <Icons.LinkedIn />, label: 'LinkedIn Ads' },
    { id: Platform.TABOOLA, icon: <Icons.Taboola />, label: 'Taboola' },
    { id: Platform.X, icon: <Icons.XIcon />, label: 'X (Twitter)' },
  ];

  const googleCampaignTypes = [
    { id: 'Search', label: lang === 'he' ? 'חיפוש (Search)' : 'Search', desc: lang === 'he' ? 'מודעות טקסט לאנשים שמחפשים את השירות שלך.' : 'Text ads for people searching your services.' },
    { id: 'PMax', label: lang === 'he' ? 'Performance Max' : 'Performance Max', desc: lang === 'he' ? 'אוטומציה מלאה בכל נכסי גוגל במטרה אחת: המרות.' : 'Unified automation across all Google assets.' },
    { id: 'Display', label: lang === 'he' ? 'מדיה (Display)' : 'Display', desc: lang === 'he' ? 'באנרים ויזואליים להגברת מודעות ורימרקטינג.' : 'Visual banners for awareness and remarketing.' },
    { id: 'Video', label: lang === 'he' ? 'וידאו (YouTube)' : 'Video (YouTube)', desc: lang === 'he' ? 'קמפיין וידאו ביוטיוב להגעה לקהלים רחבים.' : 'Video ads on YouTube to reach broad audiences.' },
    { id: 'Shopping', label: lang === 'he' ? 'שופינג' : 'Shopping', desc: lang === 'he' ? 'מכירת מוצרים ישירות מתוצאות החיפוש.' : 'Sell products directly from search results.' },
  ];

  const metaLeadLocations = [
    { id: 'Instant Form', label: lang === 'he' ? 'טופס לידים מובנה' : 'Instant Forms', desc: lang === 'he' ? 'איסוף לידים ללא יציאה מפייסבוק (הכי זול).' : 'Collect leads inside FB/IG (lowest friction).' },
    { id: 'Website', label: lang === 'he' ? 'אתר חיצוני' : 'Website', desc: lang === 'he' ? 'שליחת גולשים לדף נחיתה או אתר שלך.' : 'Send traffic to your landing page or site.' },
    { id: 'Messenger/WhatsApp', label: lang === 'he' ? 'הודעות (WhatsApp/Msg)' : 'Messages (WhatsApp/Msg)', desc: lang === 'he' ? 'פתיחת שיחה ישירה עם הלקוח.' : 'Start a direct chat with your customers.' },
  ];

  const startResearch = async () => {
    if (!formData.name || !formData.productDescription || !formData.goal) return;
    setIsLoading(true);
    try {
      const suggestions = await openaiService.getPlatformSuggestions(platform!, formData.productDescription, lang);
      setAiSuggestions(suggestions);
      setStep(2);
      setSubStep(1);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const generateFullStrategy = async () => {
    setIsLoading(true);
    try {
      const prompt = `
        Product: ${formData.name}. 
        Description: ${formData.productDescription}. 
        Goal: ${formData.goal}.
        Platform: ${platform}. 
        Campaign Type: ${formData.campaignType}.
        Conversion Location: ${formData.conversionLocation}.
        Budget: ${formData.budget} (${formData.budgetType}).
        Targeting: ${formData.targetAudience}.
        AI Suggestions Used: ${JSON.stringify(platform === Platform.GOOGLE ? formData.targetKeywords : formData.targetInterests)}.
        Lookalike Requested: ${formData.useLookalike}.
      `;
      const fullStrategy = await openaiService.generateStrategy(prompt, lang);
      setStrategy(fullStrategy);
      setStep(3);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePublish = async () => {
    if (!strategy) return;
    setIsLoading(true);
    try {
      const newCampaign: Campaign = {
        id: Math.random().toString(36).substr(2, 9),
        name: strategy.name || formData.name,
        objective: formData.goal,
        platforms: [platform!],
        budget: Number(formData.budget),
        status: CampaignStatus.ACTIVE,
        creatives: [],
        performance: { spend: 0, leads: 0, ctr: 0, cpl: 0, optimizations: 0 },
        createdAt: new Date().toISOString()
      };
      onCampaignCreated(newCampaign);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-20 animate-in fade-in slide-in-from-bottom-8 duration-700">
      {/* Progress Stepper */}
      <div className="flex items-center justify-between mb-12 px-4 relative">
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-100 -z-10 mx-10"></div>
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex flex-col items-center gap-2">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-500 ${
              step >= s ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 scale-110' : 'bg-white text-slate-300 border-2 border-slate-100'
            }`}>
              {s}
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-widest ${step >= s ? 'text-blue-600' : 'text-slate-300'}`}>
              {s === 1 ? t('step1') : s === 2 ? t('step2') : t('step3')}
            </span>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-[40px] p-8 md:p-12 shadow-2xl shadow-slate-200 border border-slate-100 overflow-hidden relative min-h-[650px] flex flex-col">
        {isLoading && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-4 text-center p-8">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <h3 className="text-xl font-bold text-slate-800">{t('thinking')}</h3>
            <p className="text-sm text-slate-500 max-w-xs">{lang === 'he' ? 'ה-AI מנתח את הפלטפורמה ובונה עבורך אסטרטגיה חכמה...' : 'AI is analyzing the platform and building a smart strategy...'}</p>
          </div>
        )}

        {/* STEP 1: Platform & Basic Details */}
        {step === 1 && (
          <div className="space-y-8 animate-in fade-in duration-500 flex-1 flex flex-col">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight">{t('launchTitle')}</h2>
              <p className="text-slate-500 text-sm">{t('launchSub')}</p>
            </div>

            {!platform ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {platforms.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPlatform(p.id)}
                    className="p-6 rounded-3xl border-2 transition-all flex flex-col items-center justify-center gap-4 group border-slate-50 bg-slate-50 hover:border-blue-200 hover:bg-blue-50/20"
                  >
                    <div className="p-4 rounded-2xl bg-white shadow-sm text-slate-400 group-hover:text-blue-600 transition-colors">
                      {p.icon}
                    </div>
                    <span className="font-black text-xs uppercase tracking-widest text-slate-600 group-hover:text-blue-600">{p.label}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-4 p-5 bg-blue-50 rounded-[32px] border border-blue-100">
                   <div className="p-3 bg-white rounded-2xl shadow-sm text-blue-600">{platforms.find(p => p.id === platform)?.icon}</div>
                   <div>
                     <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Selected Platform</p>
                     <p className="text-lg font-black text-blue-900">{platforms.find(p => p.id === platform)?.label}</p>
                   </div>
                   <button onClick={() => setPlatform(null)} className="mr-auto text-blue-400 hover:text-blue-600 p-2"><Icons.Edit /></button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('productName')}</label>
                    <input 
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                      placeholder="My Awesome Product"
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-100 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('campaignGoal')}</label>
                    <select 
                      value={formData.goal}
                      onChange={e => setFormData({...formData, goal: e.target.value})}
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-100 focus:outline-none"
                    >
                      <option value="">Select Goal</option>
                      <option value="Lead Gen">Leads (לידים)</option>
                      <option value="Sales">Sales (מכירות)</option>
                      <option value="Traffic">Traffic (תנועה)</option>
                      <option value="Awareness">Awareness (חשיפה)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('budgetType')}</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => setFormData({...formData, budgetType: 'daily'})}
                      className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${formData.budgetType === 'daily' ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-slate-50 bg-slate-50 text-slate-400'}`}
                    >
                      {t('dailyBudget')}
                    </button>
                    <button 
                      onClick={() => setFormData({...formData, budgetType: 'total'})}
                      className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${formData.budgetType === 'total' ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-slate-50 bg-slate-50 text-slate-400'}`}
                    >
                      {t('totalBudget')}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{formData.budgetType === 'daily' ? t('dailyBudget') : t('totalBudget')}</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-5 flex items-center text-slate-400 font-bold">{currency}</div>
                    <input 
                      type="number"
                      value={formData.budget}
                      onChange={e => setFormData({...formData, budget: e.target.value})}
                      className="w-full pl-12 pr-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-100 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Product Description</label>
                  <textarea 
                    value={formData.productDescription}
                    onChange={e => setFormData({...formData, productDescription: e.target.value})}
                    placeholder={lang === 'he' ? 'מהו המוצר? מה היתרונות שלו? מי הלקוחות?' : 'What is the product? Benefits? Target audience?'}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm h-28 focus:ring-2 focus:ring-blue-100 focus:outline-none"
                  />
                </div>

                <div className="flex justify-end pt-4">
                  <button 
                    onClick={startResearch}
                    disabled={!formData.name || !formData.productDescription || !formData.goal}
                    className="px-10 py-5 bg-blue-600 text-white rounded-[24px] font-black uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:scale-105 active:scale-95 disabled:opacity-50 transition-all"
                  >
                    {t('next')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Platform Specific Sub-wizard */}
        {step === 2 && (
          <div className="space-y-8 animate-in fade-in duration-500 flex-1 flex flex-col">
             <div className="flex items-center justify-between border-b border-slate-50 pb-6">
                <div>
                  <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">{platform} Strategy Setup</h2>
                  <p className="text-slate-500 text-xs font-medium italic mt-1">AI Recommendation: "{aiSuggestions?.proTip}"</p>
                </div>
                <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">{platforms.find(p => p.id === platform)?.icon}</div>
             </div>

             {/* Dynamic Questionnaire based on Platform */}
             <div className="flex-1 space-y-8">
                {/* 2.1: Campaign Type Selection */}
                <div className="space-y-4">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                     {lang === 'he' ? 'בחר את סוג הקמפיין הנכון עבורך' : 'Select Your Campaign Type'}
                   </label>
                   
                   {/* GOOGLE TYPES */}
                   {platform === Platform.GOOGLE && (
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {googleCampaignTypes.map(type => (
                          <button
                            key={type.id}
                            onClick={() => setFormData({...formData, campaignType: type.id})}
                            className={`p-5 rounded-3xl border-2 text-start transition-all ${formData.campaignType === type.id ? 'border-blue-600 bg-blue-50' : 'border-slate-50 bg-slate-50 hover:border-slate-100'}`}
                          >
                            <p className="font-black text-sm text-slate-800">{type.label}</p>
                            <p className="text-[10px] text-slate-400 mt-1">{type.desc}</p>
                          </button>
                        ))}
                     </div>
                   )}

                   {/* META TYPES */}
                   {platform === Platform.FACEBOOK && (
                     <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                           {metaLeadLocations.map(loc => (
                             <button
                               key={loc.id}
                               onClick={() => setFormData({...formData, campaignType: loc.id, conversionLocation: loc.id})}
                               className={`p-5 rounded-3xl border-2 text-start transition-all ${formData.campaignType === loc.id ? 'border-blue-600 bg-blue-50' : 'border-slate-50 bg-slate-50 hover:border-slate-100'}`}
                             >
                               <p className="font-black text-sm text-slate-800">{loc.label}</p>
                               <p className="text-[10px] text-slate-400 mt-1">{loc.desc}</p>
                             </button>
                           ))}
                        </div>
                     </div>
                   )}

                   {/* OTHERS */}
                   {![Platform.GOOGLE, Platform.FACEBOOK].includes(platform as Platform) && (
                     <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                        <p className="text-sm font-bold text-slate-600 italic">
                          AI will automatically optimize the best placement for {platform} based on your {formData.goal} goal.
                        </p>
                     </div>
                   )}
                </div>

                {/* 2.2: Audience & Targeting */}
                <div className="space-y-6">
                   <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('targetAudience')}</label>
                        <button 
                          onClick={() => setFormData({...formData, useLookalike: !formData.useLookalike})}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${formData.useLookalike ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}
                        >
                          <Icons.Sparkles className="w-3 h-3" />
                          AI Lookalike Strategy
                        </button>
                      </div>
                      <textarea 
                        value={formData.targetAudience}
                        onChange={e => setFormData({...formData, targetAudience: e.target.value})}
                        placeholder={lang === 'he' ? 'תאר את קהל היעד (לדוגמה: בני 30+, הורים, מתעניינים בכושר...)' : 'Describe your audience (e.g., Age 30+, Parents, Interest in Fitness...)'}
                        className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium h-24 focus:ring-2 focus:ring-blue-100 focus:outline-none"
                      />
                   </div>

                   {/* AI Generated Suggestions based on platform */}
                   {aiSuggestions && (
                     <div className="p-6 bg-blue-50/50 border border-blue-100 rounded-[32px] space-y-4">
                        <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest">
                          AI Expert Recommendations
                        </h4>
                        <div className="flex flex-wrap gap-2">
                           {aiSuggestions.suggestions.map((s: any, i: number) => (
                             <button
                               key={i}
                               onClick={() => {
                                 const exists = formData.targetKeywords.find(k => k.item === s.item);
                                 if (exists) setFormData({...formData, targetKeywords: formData.targetKeywords.filter(k => k.item !== s.item)});
                                 else setFormData({...formData, targetKeywords: [...formData.targetKeywords, s]});
                               }}
                               className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border-2 ${
                                 formData.targetKeywords.find(k => k.item === s.item) ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-white border-white text-blue-600 hover:border-blue-100'
                               }`}
                             >
                               {s.item} {s.metadata ? `(${s.metadata})` : ''}
                             </button>
                           ))}
                        </div>
                     </div>
                   )}
                </div>
             </div>

             <div className="flex items-center justify-between pt-6 border-t border-slate-50">
                <button onClick={() => setStep(1)} className="text-slate-400 font-black text-xs uppercase tracking-widest px-6 py-4 hover:text-slate-600 transition-colors">
                  {t('back')}
                </button>
                <button 
                  onClick={generateFullStrategy}
                  disabled={!formData.campaignType && platform === Platform.GOOGLE}
                  className="px-10 py-5 bg-blue-600 text-white rounded-[24px] font-black uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                >
                  Generate AI Strategy
                </button>
             </div>
          </div>
        )}

        {/* STEP 3: AI Strategy Review */}
        {step === 3 && strategy && (
          <div className="space-y-8 animate-in fade-in duration-500">
             <div className="text-center">
                <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight">Strategy Finalized</h2>
                <p className="text-slate-500 text-sm">Review your custom-built AI funnel before launch.</p>
             </div>
             
             <div className="bg-slate-900 rounded-[40px] p-10 text-white shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-12 opacity-5 scale-[2.0]"><Icons.Robot /></div>
                
                <div className="relative z-10 space-y-8">
                   <div className="flex items-center gap-5 border-b border-white/10 pb-8">
                      <div className="p-4 bg-blue-600 rounded-3xl shadow-2xl shadow-blue-500/20">
                        {platforms.find(p => p.id === platform)?.icon}
                      </div>
                      <div>
                        <h4 className="font-black text-2xl uppercase tracking-tight">{strategy.name}</h4>
                        <p className="text-[10px] text-blue-400 font-black uppercase tracking-[0.2em] mt-1">{platform} - {formData.campaignType}</p>
                      </div>
                   </div>
                   
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                      <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Investment</p>
                        <p className="text-3xl font-black">{currency}{formData.budget} <span className="text-[10px] text-slate-400 font-bold uppercase">/ {formData.budgetType}</span></p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Targeting Scope</p>
                        <p className="text-sm font-bold opacity-80 leading-relaxed">{strategy.targetAudience}</p>
                      </div>
                   </div>

                   <div className="p-6 bg-white/5 rounded-3xl border border-white/10">
                      <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Icons.Sparkles className="w-3 h-3" />
                        AI Expert Reasoning
                      </p>
                      <p className="text-sm leading-relaxed opacity-90 italic">"{strategy.reasoning}"</p>
                   </div>

                   <button 
                    onClick={handlePublish}
                    className="w-full py-6 bg-blue-600 text-white rounded-[24px] font-black text-lg shadow-2xl shadow-blue-500/30 hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-[0.2em]"
                   >
                     Launch Campaign Now
                   </button>
                </div>
             </div>
             
             <button onClick={() => setStep(2)} className="w-full text-center text-slate-400 text-[10px] font-black uppercase tracking-widest hover:text-slate-600 transition-colors">
               Back to refine targeting details
             </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CampaignWizard;
