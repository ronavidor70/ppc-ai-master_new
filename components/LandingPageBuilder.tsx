
import React, { useState } from 'react';
import { SandpackProvider, SandpackLayout, SandpackPreview } from '@codesandbox/sandpack-react';
import { useTranslation } from '../App';
import { Campaign } from '../types';
import { Icons } from '../constants';
import { openaiService } from '../services/openaiService';
import { Loader2 } from 'lucide-react';

interface LandingPageBuilderProps {
  campaigns: Campaign[];
}

const DEFAULT_APP_CODE = `import React from 'react';

export default function App() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      <p className="text-slate-400">תבנה דף פרימיום עם התיאור שלך</p>
    </div>
  );
}
`;

const LandingPageBuilder: React.FC<LandingPageBuilderProps> = ({ campaigns }) => {
  const { t, lang } = useTranslation();
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string>(DEFAULT_APP_CODE);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;
    setError(null);
    setIsGenerating(true);
    try {
      const code = await openaiService.generateLandingPageCode(prompt);
      setGeneratedCode(code);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex-none mb-4">
        <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">{t('landingPages')}</h2>
        <p className="text-slate-500 text-sm">{t('lpSub')}</p>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
        {/* Left: Sandpack Live Preview */}
        <div className="lg:col-span-2 rounded-3xl border border-slate-200 overflow-hidden bg-slate-50 shadow-sm min-h-[400px] lg:min-h-0 flex flex-col order-2 lg:order-1">
          <SandpackProvider
            template="react"
            theme="light"
            options={{
              externalResources: ['https://cdn.tailwindcss.com'],
            }}
            customSetup={{
              dependencies: { 'lucide-react': 'latest' },
            }}
            files={{
              '/App.js': generatedCode,
            }}
          >
            <SandpackLayout>
              <SandpackPreview
                showNavigator={false}
                showRefreshButton
                className="min-h-[400px] !rounded-none"
              />
            </SandpackLayout>
          </SandpackProvider>
        </div>

        {/* Right: Settings / Chat */}
        <div className="lg:col-span-1 flex flex-col gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm h-fit lg:h-full order-1 lg:order-2">
          <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
            {lang === 'he' ? 'תאר את העסק או הדף שברצונך' : 'Describe your business or page'}
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={lang === 'he' ? 'לדוגמה: תבנה דף לקליניקה לטיפולים משלימים, עם Hero, Features ו-CTA' : 'e.g. Build a page for a holistic clinic with Hero, Features and CTA'}
            className="w-full flex-1 min-h-[160px] px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-100 resize-none"
            dir="auto"
          />
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs font-bold text-red-600">
              {error}
            </div>
          )}
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || isGenerating}
            className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black shadow-2xl shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:hover:scale-100"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="uppercase tracking-widest">
                  {lang === 'he' ? 'מייצר...' : 'Generating...'}
                </span>
              </>
            ) : (
              <>
                <Icons.Sparkles className="w-5 h-5" />
                <span className="uppercase tracking-widest">
                  {lang === 'he' ? 'צור דף פרימיום' : 'Create Premium Page'}
                </span>
              </>
            )}
          </button>
          <p className="text-[9px] text-center text-slate-400 uppercase font-black tracking-tighter">
            Claude 3.5 Sonnet · React + Tailwind · Live Preview
          </p>
        </div>
      </div>
    </div>
  );
};

export default LandingPageBuilder;
