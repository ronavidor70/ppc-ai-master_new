
import React, { useState } from 'react';
import { useTranslation } from '../App';
import { Campaign, AdCreative } from '../types';
import { Icons } from '../constants';
import { openaiService } from '../services/openaiService';

interface CreativeStudioProps {
  campaigns: Campaign[];
  onAddCreative: (campaignId: string, creative: AdCreative) => void;
}

const CreativeStudio: React.FC<CreativeStudioProps> = ({ campaigns, onAddCreative }) => {
  const { t, lang, dir } = useTranslation();
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [prompt, setPrompt] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('modern');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const styles = [
    { id: 'modern', label: t('styles.modern') },
    { id: 'realistic', label: t('styles.realistic') },
    { id: 'minimal', label: t('styles.minimal') },
    { id: 'bold', label: t('styles.bold') },
    { id: 'd3', label: t('styles.d3') },
  ];

  const handleGenerate = async () => {
    if (!prompt || isGenerating) return;
    setError(null);
    
    setIsGenerating(true);
    try {
      const imageUrl = await openaiService.generateAdImage(prompt, selectedStyle, lang);
      setGeneratedImageUrl(imageUrl);
    } catch (err: any) {
      console.error("Image Generation Error:", err);
      const errorStr = typeof err === 'string' ? err : (err.message || JSON.stringify(err));
      
      if (errorStr.includes("API key") || errorStr.includes("OPENAI_API_KEY")) {
        setError(lang === 'he' 
          ? "מפתח API לא נמצא. אנא צור קובץ .env עם OPENAI_API_KEY=sk-..." 
          : "API key not found. Please create a .env file with OPENAI_API_KEY=sk-...");
      } else {
        setError(lang === 'he' 
          ? `שגיאה ביצירת התמונה: ${errorStr}` 
          : `Error generating image: ${errorStr}`);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddToCampaign = () => {
    if (!generatedImageUrl || !selectedCampaignId) return;
    
    const newCreative: AdCreative = {
      headline: prompt.substring(0, 30) + '...',
      description: prompt,
      cta: 'LEARN MORE',
      imageUrl: generatedImageUrl
    };
    
    onAddCreative(selectedCampaignId, newCreative);
    setGeneratedImageUrl(null);
    setPrompt('');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">{t('studioTitle')}</h2>
          <p className="text-slate-500 text-sm">{t('studioSub')}</p>
        </div>
        <div className="flex items-center gap-3">
          <a 
            href="https://platform.openai.com/docs/guides/images" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-[9px] font-black text-slate-400 hover:text-blue-500 uppercase tracking-widest transition-colors"
          >
            DALL-E 3 Info
          </a>
          <div className="px-4 py-2 bg-blue-50 border border-blue-100 rounded-2xl flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
            <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">ChatGPT GPT-4o + DALL-E 3</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6 bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm h-fit">
          <div className="space-y-4">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">{t('selectCampaign')}</label>
            <select 
              value={selectedCampaignId}
              onChange={(e) => setSelectedCampaignId(e.target.value)}
              className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="">{t('selectCampaign')}</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-4">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">{t('imageStyle')}</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {styles.map(style => (
                <button
                  key={style.id}
                  onClick={() => setSelectedStyle(style.id)}
                  className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl border-2 transition-all ${
                    selectedStyle === style.id 
                      ? 'border-blue-600 bg-blue-50 text-blue-600 shadow-md' 
                      : 'border-slate-50 bg-slate-50 text-slate-400 hover:border-slate-200'
                  }`}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">{t('describeImage')}</label>
            <textarea 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={lang === 'he' ? 'תאר את המודעה (למשל: נעלי ריצה כחולות עם הטקסט ״מבצע מטורף״)' : 'Describe ad (e.g., Blue running shoes with text "SALE")'}
              className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium min-h-[140px] focus:outline-none focus:ring-2 focus:ring-blue-100"
              dir="auto"
            />
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-[10px] font-bold text-red-600 uppercase flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Icons.AlertCircle />
                <span>Error Detected</span>
              </div>
              <p className="normal-case font-medium opacity-90">{error}</p>
            </div>
          )}

          <button 
            onClick={handleGenerate}
            disabled={!prompt || isGenerating}
            className="w-full py-5 bg-blue-600 text-white rounded-[24px] font-black shadow-2xl shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
          >
            {isGenerating ? (
              <div className="w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <Icons.Palette />
                <span className="uppercase tracking-widest">{t('generateImage')}</span>
              </>
            )}
          </button>
          
          <p className="text-[9px] text-center text-slate-400 uppercase font-black tracking-tighter leading-relaxed">
            Note: DALL-E 3 image generation powered by OpenAI.<br/>
            Requires valid OPENAI_API_KEY in .env file.
          </p>
        </div>

        <div className="bg-slate-50 rounded-[40px] border-2 border-dashed border-slate-200 overflow-hidden flex flex-col items-center justify-center min-h-[500px] relative group">
          {isGenerating ? (
            <div className="text-center space-y-6 p-12">
              <div className="relative">
                <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-[32px] flex items-center justify-center mx-auto animate-bounce shadow-xl">
                  <Icons.Robot />
                </div>
                <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-blue-600 rounded-full border-4 border-white flex items-center justify-center text-white">
                  <Icons.Sparkles className="w-4 h-4" />
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="text-xl font-black text-slate-800 uppercase tracking-tight">{t('thinking')}</h4>
                <p className="text-xs text-slate-400 font-medium italic">Rendering 1K professional graphic...</p>
              </div>
            </div>
          ) : generatedImageUrl ? (
            <div className="w-full h-full flex flex-col relative">
              <img src={generatedImageUrl} alt="Generated" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-8 text-center">
                <div className="bg-white/10 backdrop-blur-md p-6 rounded-[32px] border border-white/20 space-y-6 transform translate-y-4 group-hover:translate-y-0 transition-transform">
                  <p className="text-white font-bold text-sm">Visual optimized for conversions.</p>
                  <button 
                    onClick={handleAddToCampaign}
                    disabled={!selectedCampaignId}
                    className="w-full px-8 py-4 bg-white text-blue-600 rounded-2xl font-black shadow-2xl hover:scale-105 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                  >
                    <Icons.CheckCircle />
                    <span className="uppercase tracking-widest">{t('addToCampaign')}</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center space-y-4 p-8">
              <div className="w-20 h-20 bg-white rounded-3xl shadow-sm flex items-center justify-center mx-auto text-slate-200 group-hover:scale-110 transition-transform">
                <Icons.Palette />
              </div>
              <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Your AI masterpiece will appear here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreativeStudio;
