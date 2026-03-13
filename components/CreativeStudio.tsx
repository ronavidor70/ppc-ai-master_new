import React, { useState, useRef } from 'react';
import { useTranslation } from '../App';
import { Campaign, AdCreative } from '../types';
import { Icons } from '../constants';
import { openaiService } from '../services/openaiService';
import html2canvas from 'html2canvas';

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
  const [overlayText, setOverlayText] = useState('');
  const adRef = useRef<HTMLDivElement | null>(null);

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
      
      if (errorStr.includes("API key") || errorStr.includes("FAL_KEY") || errorStr.includes("Creative image API")) {
        setError(lang === 'he' 
          ? "שגיאה ב-API של יצירת תמונות. ודא ש-FAL_KEY מוגדר בשרת." 
          : "Image API error. Ensure FAL_KEY is set on the server.");
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
      headline: overlayText || prompt.substring(0, 30) + '...',
      description: prompt,
      cta: 'LEARN MORE',
      imageUrl: generatedImageUrl
    };

    onAddCreative(selectedCampaignId, newCreative);
    setGeneratedImageUrl(null);
    setPrompt('');
    setOverlayText('');
  };

  const handleDownloadAd = async () => {
    if (!adRef.current || !generatedImageUrl) return;
    try {
      const canvas = await html2canvas(adRef.current, {
        useCORS: true,
        backgroundColor: null,
        scale: window.devicePixelRatio > 1 ? 2 : 1.5,
      });
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = lang === 'he' ? 'מודעה-ppc-ai.png' : 'ppc-ai-ad.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Failed to download ad image:', err);
      alert(lang === 'he' ? 'אירעה שגיאה בהורדת המודעה. נסה שוב.' : 'Failed to download ad. Please try again.');
    }
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
            href="https://fal.ai/models/fal-ai/flux/schnell"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[9px] font-black text-slate-400 hover:text-blue-500 uppercase tracking-widest transition-colors"
          >
            FLUX Info
          </a>
          <div className="px-4 py-2 bg-blue-50 border border-blue-100 rounded-2xl flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
            <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">FLUX.1 via fal.ai</span>
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
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
              {lang === 'he' ? 'תיאור תמונת רקע (בלי טקסט)' : 'Background description (no text)'}
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={lang === 'he' ? 'תאר את הרקע בלבד: סצנה, אווירה, צבעים (ללא טקסט בכלל)' : 'Describe only the background: scene, mood, colors (no text at all)'}
              className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium min-h-[140px] focus:outline-none focus:ring-2 focus:ring-blue-100"
              dir="auto"
            />
          </div>
          <div className="space-y-4">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
              {lang === 'he' ? 'טקסט המודעה שיופיע על התמונה' : 'Ad text overlay'}
            </label>
            <textarea
              value={overlayText}
              onChange={(e) => setOverlayText(e.target.value)}
              placeholder={lang === 'he' ? 'לדוגמה: מבצע מטורף! עד 50% הנחה' : 'e.g. Crazy Sale! Up to 50% off'}
              className="w-full px-5 py-4 bg-white border border-slate-100 rounded-2xl text-sm font-bold min-h-[80px] focus:outline-none focus:ring-2 focus:ring-blue-100"
              dir={dir}
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
            Image generation powered by FLUX.1 via fal.ai.<br/>
            Server requires valid FAL_KEY in environment variables.
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
            <div className="w-full h-full flex flex-col gap-4 p-4">
              <div
                ref={adRef}
                className="relative w-full flex-1 min-h-[320px] rounded-3xl overflow-hidden shadow-xl bg-black"
              >
                <img
                  src={generatedImageUrl}
                  alt="Generated"
                  className="w-full h-full object-cover"
                  crossOrigin="anonymous"
                />
                <div className="absolute inset-0 flex items-center justify-center p-6">
                  <div
                    className="max-w-[80%] px-6 py-3 bg-black/65 text-white rounded-2xl shadow-2xl text-center"
                    style={{
                      fontWeight: 900,
                      letterSpacing: lang === 'he' ? '0.05em' : '0.08em',
                      fontSize: 'clamp(18px, 2.5vw, 36px)',
                      direction: dir,
                    }}
                  >
                    {overlayText || (lang === 'he' ? 'מבצע מטורף!' : 'Big Sale!')}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 justify-between items-center">
                <button
                  onClick={handleAddToCampaign}
                  disabled={!selectedCampaignId}
                  className="flex-1 min-w-[160px] px-6 py-4 bg-white text-blue-600 rounded-2xl font-black shadow-2xl hover:scale-105 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  <Icons.CheckCircle />
                  <span className="uppercase tracking-widest">{t('addToCampaign')}</span>
                </button>
                <button
                  onClick={handleDownloadAd}
                  className="flex-1 min-w-[160px] px-6 py-4 bg-blue-600 text-white rounded-2xl font-black shadow-2xl hover:scale-105 transition-all flex items-center justify-center gap-3"
                >
                  <Icons.Download />
                  <span className="uppercase tracking-widest">
                    {lang === 'he' ? 'הורד מודעה' : 'Download Ad'}
                  </span>
                </button>
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
