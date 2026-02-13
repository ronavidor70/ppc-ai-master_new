
import React, { useState } from 'react';
import { useTranslation } from '../App';
import { Campaign, LandingPage } from '../types';
import { Icons } from '../constants';
import { openaiService } from '../services/openaiService';

interface LandingPageBuilderProps {
  campaigns: Campaign[];
}

const LandingPageBuilder: React.FC<LandingPageBuilderProps> = ({ campaigns }) => {
  const { t, lang, dir } = useTranslation();
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [variations, setVariations] = useState<Partial<LandingPage>[]>([]);
  const [selectedVariation, setSelectedVariation] = useState<Partial<LandingPage> | null>(null);

  const handleGenerate = async () => {
    const campaign = campaigns.find(c => c.id === selectedCampaignId);
    const topic = campaign ? campaign.objective : "Digital Marketing Services";
    
    setIsGenerating(true);
    try {
      const results = await openaiService.generateLandingPageVariations(topic, lang);
      setVariations(results);
    } catch (error) {
      console.error(error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{t('landingPages')}</h2>
          <p className="text-slate-500 text-sm">{t('lpSub')}</p>
        </div>
        <div className="flex gap-2">
          <select 
            value={selectedCampaignId}
            onChange={(e) => setSelectedCampaignId(e.target.value)}
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            <option value="">{t('selectCampaign')}</option>
            {campaigns.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button 
            onClick={handleGenerate}
            disabled={!selectedCampaignId || isGenerating}
            className={`flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all disabled:opacity-50`}
          >
            {isGenerating ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Icons.Zap />}
            {t('generateLP')}
          </button>
        </div>
      </div>

      {variations.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {variations.map((v, i) => (
            <div 
              key={i}
              onClick={() => setSelectedVariation(v)}
              className={`p-6 bg-white rounded-3xl border-2 transition-all cursor-pointer group hover:shadow-xl ${
                selectedVariation === v ? 'border-blue-600 ring-2 ring-blue-50' : 'border-slate-100'
              }`}
            >
              <div className="w-full h-32 bg-slate-50 rounded-2xl mb-4 border border-slate-100 flex items-center justify-center text-slate-300">
                <Icons.Browser />
              </div>
              <h4 className="font-bold text-slate-800 mb-2">{v.title}</h4>
              <p className="text-xs text-slate-500 line-clamp-3 mb-4">{v.content?.hero.subtitle}</p>
              <div className="flex items-center gap-2 text-[10px] font-bold text-blue-600">
                <Icons.CheckCircle />
                UTM & PIXEL AUTO-SYNCED
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedVariation && (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
          <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
              </div>
              <div className="ml-4 px-4 py-1 bg-white/10 rounded-lg text-xs font-mono opacity-60">
                https://ppc-master.ai/lp/{selectedVariation.title?.toLowerCase().replace(/\s+/g, '-')}?utm_campaign={selectedCampaignId}&pixel=active
              </div>
            </div>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all">
              {t('publish')}
            </button>
          </div>
          
          <div className="p-8 md:p-16 text-center space-y-8 min-h-[500px] flex flex-col justify-center bg-gradient-to-b from-white to-slate-50">
            <div className="space-y-4 max-w-2xl mx-auto">
              <h1 className="text-4xl md:text-5xl font-black text-slate-900 leading-tight">
                {selectedVariation.content?.hero.title}
              </h1>
              <p className="text-lg text-slate-600">
                {selectedVariation.content?.hero.subtitle}
              </p>
            </div>
            
            <div className="flex justify-center">
              <button className="px-8 py-4 bg-blue-600 text-white text-lg font-bold rounded-2xl shadow-2xl shadow-blue-200 hover:scale-105 transition-all">
                {selectedVariation.content?.hero.cta}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-16">
              {selectedVariation.content?.features.map((f, i) => (
                <div key={i} className="text-start space-y-2">
                  <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                    <Icons.CheckCircle />
                  </div>
                  <h5 className="font-bold text-slate-800">{f.title}</h5>
                  <p className="text-sm text-slate-500">{f.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!variations.length && !isGenerating && (
        <div className="py-32 text-center bg-white rounded-3xl border-2 border-dashed border-slate-100">
          <div className="inline-flex p-6 bg-slate-50 rounded-full text-slate-300 mb-4">
            <Icons.Browser />
          </div>
          <h3 className="text-lg font-bold text-slate-400">{t('createLP')}</h3>
          <p className="text-sm text-slate-300 mt-2">Select a campaign above to start generating pages.</p>
        </div>
      )}
    </div>
  );
};

export default LandingPageBuilder;
