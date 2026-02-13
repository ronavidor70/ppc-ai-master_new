
import React, { useState, useRef, useEffect } from 'react';
import { Icons } from '../constants';
import { Message, CampaignStrategy, AdCreative, Campaign, CampaignStatus, Platform } from '../types';
import { openaiService } from '../services/openaiService';
import { useTranslation } from '../App';

interface ChatInterfaceProps {
  onCampaignCreated: (campaign: Campaign) => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ onCampaignCreated }) => {
  const { t, lang, currency, dir } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: t('welcome'),
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Update welcome message if language changes and no chat has started
  useEffect(() => {
    if (messages.length === 1 && messages[0].role === 'assistant') {
      setMessages([{
        ...messages[0],
        content: t('welcome')
      }]);
    }
  }, [lang]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const strategy = await openaiService.generateStrategy(input, lang);
      
      const strategyMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `${t('strategyAnalyzed')} "${strategy.name}":\n\n- **Target Audience:** ${strategy.targetAudience}\n- **Suggested Budget:** ${currency}${strategy.suggestedBudget}\n- **Platforms:** ${strategy.platforms.join(', ')}\n\n${strategy.reasoning}`,
        timestamp: new Date(),
        type: 'strategy',
        metadata: strategy
      };
      setMessages(prev => [...prev, strategyMsg]);

      const creatives = await openaiService.generateAdCreatives(strategy, lang);
      
      // Generate sample image using DALL-E 3
      try {
        const sampleImage = await openaiService.generateAdImage(creatives[0].headline, 'modern', lang);
        creatives[0].imageUrl = sampleImage;
      } catch (imageError: any) {
        console.warn('Image generation failed, continuing without image:', imageError);
        // Continue without image if generation fails
      }

      const creativeMsg: Message = {
        id: (Date.now() + 2).toString(),
        role: 'assistant',
        content: lang === 'he' ? `ייצרתי עבורך את הקריאייטיבים הבאים:` : `I've generated these ad creatives for you in ${lang}:`,
        timestamp: new Date(),
        type: 'creative_review',
        metadata: { strategy, creatives }
      };
      setMessages(prev => [...prev, creativeMsg]);

      const newCampaign: Campaign = {
        id: Math.random().toString(36).substr(2, 9),
        name: strategy.name,
        objective: input,
        platforms: strategy.platforms as Platform[],
        budget: strategy.suggestedBudget,
        status: CampaignStatus.ACTIVE,
        creatives: creatives,
        performance: {
          spend: 0,
          leads: 0,
          ctr: 0,
          cpl: 0,
          optimizations: 0
        },
        createdAt: new Date().toISOString()
      };

      onCampaignCreated(newCampaign);

    } catch (error: any) {
      console.error(error);
      const errorStr = typeof error === 'string' ? error : (error.message || JSON.stringify(error));
      
      const errorMsg: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: t('errorMsg'),
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-white rounded-t-3xl border border-slate-200 overflow-hidden shadow-2xl">
      <div className="flex-1 overflow-y-auto p-6 space-y-6" ref={scrollRef}>
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div 
              dir="auto"
              className={`max-w-[85%] p-4 rounded-2xl text-start ${
                msg.role === 'user' 
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' 
                  : 'bg-slate-50 text-slate-800 border border-slate-100'
              }`}
            >
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</div>
              
              {msg.type === 'creative_review' && msg.metadata?.creatives?.[0] && (
                <div className="mt-4 bg-white p-3 rounded-xl border border-slate-200 shadow-sm overflow-hidden text-slate-800 text-start">
                  {msg.metadata.creatives[0].imageUrl && (
                    <img 
                      src={msg.metadata.creatives[0].imageUrl} 
                      alt="Ad Preview" 
                      className="w-full h-48 object-cover rounded-lg mb-3" 
                    />
                  )}
                  <h4 className="font-bold text-blue-600 text-base">{msg.metadata.creatives[0].headline}</h4>
                  <p className="text-xs text-slate-600 mt-1 line-clamp-2">{msg.metadata.creatives[0].description}</p>
                  <button className="mt-3 w-full py-2 bg-blue-600 text-white rounded-lg font-bold text-xs uppercase tracking-wide">
                    {msg.metadata.creatives[0].cta}
                  </button>
                </div>
              )}

              <div className={`text-[10px] mt-2 opacity-60 ${msg.role === 'user' ? 'text-blue-50' : 'text-slate-400'}`}>
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center gap-2">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '200ms' }}></div>
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '400ms' }}></div>
              </div>
              <span className="text-xs text-slate-500 font-medium italic">{t('thinking')}</span>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 bg-white border-t border-slate-100">
        <div className="flex items-center gap-3 max-w-4xl mx-auto bg-slate-50 p-2 rounded-2xl border border-slate-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all duration-200">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder={t('placeholder')}
            className="flex-1 bg-transparent border-none focus:ring-0 text-sm px-4 py-2"
            dir="auto"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className={`p-3 rounded-xl flex items-center justify-center transition-all ${
              input.trim() && !isLoading ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-200 text-slate-400'
            }`}
          >
            <Icons.Send />
          </button>
        </div>
        <p className="text-center text-[10px] text-slate-400 mt-2 italic">
          AI autonomous management enabled. Powered by ChatGPT GPT-4o.
        </p>
      </div>
    </div>
  );
};

export default ChatInterface;
