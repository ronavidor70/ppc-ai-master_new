import React, { useState, useRef, useEffect } from 'react';
import { useData } from '../contexts/DataContext';
import { useTranslation } from '../App';
import { Campaign, Lead } from '../types';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isLoading?: boolean;
}

const AIChatAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { t, lang, dir } = useTranslation();
  
  const {
    campaigns,
    accountInsights,
    leads,
    selectedAccountId,
    dateRange,
    isConnected
  } = useData();

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      // הודעת ברוכים הבאים
      const welcomeMessage: Message = {
        id: 'welcome',
        role: 'assistant',
        content: lang === 'he' 
          ? 'שלום! אני העוזר החכם שלך לניהול קמפיינים. איך אוכל לעזור לך היום?'
          : 'Hello! I\'m your smart campaign assistant. How can I help you today?',
        timestamp: new Date()
      };
      setMessages([welcomeMessage]);
    }
  }, [isOpen, lang]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const buildSystemPrompt = (): string => {
    const activeCampaigns = campaigns.filter(c => c.status === 'ACTIVE');
    const pausedCampaigns = campaigns.filter(c => c.status === 'PAUSED');
    const totalSpend = accountInsights?.spend || 0;
    
    // חישוב מפורט של סוגי המרות - תואם ל-Facebook Ads Manager
    const totalLeads = accountInsights?.unified_metrics?.leads || 0;
    const totalWhatsApp = accountInsights?.unified_metrics?.whatsapp || 0;
    const totalPurchases = accountInsights?.unified_metrics?.purchases || 0;
    const totalConversions = totalLeads + totalWhatsApp + totalPurchases;
    
    const campaignsList = campaigns.map(c => ({
      id: c.id,
      name: c.name,
      status: c.status,
      spend: c.performance.spend,
      leads: c.performance.leads,
      whatsapp: c.conversions?.whatsapp || 0,
      purchases: c.conversions?.purchase || 0,
      cpl: c.performance.cpl
    }));

    const prompt = lang === 'he' 
      ? `אתה עוזר AI חכם לניהול קמפיינים. הנה תמונת המצב הנוכחית:

**חשבון מודעות:**
- חשבון נבחר: ${selectedAccountId || 'לא נבחר'}
- סך הוצאות: ${totalSpend.toFixed(2)}
- סך המרות: ${totalConversions}
  * לידים (טפסים+אתר): ${totalLeads}
  * הודעות וואטסאפ: ${totalWhatsApp}
  * מכירות: ${totalPurchases}
- קמפיינים פעילים: ${activeCampaigns.length}
- קמפיינים מושהה: ${pausedCampaigns.length}

**קמפיינים:**
${JSON.stringify(campaignsList, null, 2)}

**לידים:**
${leads.length} לידים זמינים

**תאריכים:**
מ-${dateRange.startDate} עד ${dateRange.endDate}

**סוגי המרות (תואם ל-Facebook Ads Manager):**
- לידים (טפסים+אתר): כולל lead, onsite_conversion.lead_grouped, submit_application
- וואטסאפ: כולל onsite_conversion.messaging_first_reply ו-contact
- מכירות: כולל purchase ו-onsite_conversion.purchase

אתה יכול לבצע פעולות:
1. pauseCampaign(id) - לעצור קמפיין
2. updateBudget(id, amount) - לעדכן תקציב
3. sendWhatsAppToLead(phone) - לפתוח וואטסאפ לליד

ענה בעברית, תהיה מקצועי ומועיל. כשאתה מדבר על המרות, ציין את הפירוט המלא (למשל: "יש לך ${totalLeads} לידים מטפסים ו-${totalWhatsApp} מהודעות וואטסאפ").`
      : `You are a smart AI assistant for campaign management. Here's the current status:

**Ad Account:**
- Selected Account: ${selectedAccountId || 'Not selected'}
- Total Spend: ${totalSpend.toFixed(2)}
- Total Conversions: ${totalConversions}
  * Leads (Forms+Site): ${totalLeads}
  * WhatsApp Messages: ${totalWhatsApp}
  * Sales: ${totalPurchases}
- Active Campaigns: ${activeCampaigns.length}
- Paused Campaigns: ${pausedCampaigns.length}

**Campaigns:**
${JSON.stringify(campaignsList, null, 2)}

**Leads:**
${leads.length} leads available

**Date Range:**
From ${dateRange.startDate} to ${dateRange.endDate}

**Conversion Types (aligned with Facebook Ads Manager):**
- Leads (Forms+Site): includes lead, onsite_conversion.lead_grouped, submit_application
- WhatsApp: includes onsite_conversion.messaging_first_reply and contact
- Sales: includes purchase and onsite_conversion.purchase

You can perform actions:
1. pauseCampaign(id) - Pause a campaign
2. updateBudget(id, amount) - Update budget
3. sendWhatsAppToLead(phone) - Open WhatsApp for a lead

Respond in English, be professional and helpful. When discussing conversions, provide full breakdown (e.g., "You have ${totalLeads} leads from forms and ${totalWhatsApp} WhatsApp messages").`;

    return prompt;
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setIsLoading(true);

    // הוספת הודעת טעינה
    const loadingMessage: Message = {
      id: `loading-${Date.now()}`,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isLoading: true
    };
    setMessages(prev => [...prev, loadingMessage]);

    try {
      const systemPrompt = buildSystemPrompt();
      
      const response = await fetch('http://localhost:5001/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: currentInput }
          ],
          lang
        })
      });

      if (!response.ok) {
        throw new Error('Failed to get AI response');
      }

      const data = await response.json();
      
      // הסרת הודעת הטעינה והוספת התשובה
      setMessages(prev => {
        const withoutLoading = prev.filter(m => !m.isLoading);
        return [...withoutLoading, {
          id: Date.now().toString(),
          role: 'assistant',
          content: data.message,
          timestamp: new Date()
        }];
      });

      // ביצוע פעולות אם יש
      if (data.actions && Array.isArray(data.actions)) {
        for (const action of data.actions) {
          await executeAction(action);
        }
      }
    } catch (error: any) {
      console.error('Error sending message:', error);
      setMessages(prev => {
        const withoutLoading = prev.filter(m => !m.isLoading);
        return [...withoutLoading, {
          id: Date.now().toString(),
          role: 'assistant',
          content: lang === 'he' 
            ? 'מצטער, אירעה שגיאה. נסה שוב מאוחר יותר.'
            : 'Sorry, an error occurred. Please try again later.',
          timestamp: new Date()
        }];
      });
    } finally {
      setIsLoading(false);
    }
  };

  const executeAction = async (action: { type: string; params: any }) => {
    try {
      switch (action.type) {
        case 'pauseCampaign':
          await fetch(`http://localhost:5001/api/facebook/campaigns/${action.params.id}/pause`, {
            method: 'POST',
            credentials: 'include'
          });
          break;
        case 'updateBudget':
          await fetch(`http://localhost:5001/api/facebook/campaigns/${action.params.id}/budget`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ budget: action.params.amount })
          });
          break;
        case 'sendWhatsAppToLead':
          const phone = action.params.phone.replace(/\D/g, '');
          window.open(`https://wa.me/${phone}`, '_blank');
          break;
      }
    } catch (error) {
      console.error('Error executing action:', error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 ${dir === 'rtl' ? 'left-6' : 'right-6'} z-50 w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-all duration-300 group`}
        aria-label={lang === 'he' ? 'פתח עוזר AI' : 'Open AI Assistant'}
      >
        <svg 
          className="w-8 h-8 text-white group-hover:rotate-12 transition-transform" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        {!isOpen && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white animate-pulse"></span>
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className={`fixed ${dir === 'rtl' ? 'left-6' : 'right-6'} bottom-24 z-50 w-96 h-[600px] bg-white rounded-[32px] shadow-2xl flex flex-col overflow-hidden border border-slate-200`}>
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-black text-sm uppercase tracking-wider">
                  {lang === 'he' ? 'עוזר AI' : 'AI Assistant'}
                </h3>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'} ${isConnected ? 'animate-pulse' : ''}`}></div>
                  <p className="text-white/80 text-xs">
                    {isConnected 
                      ? (lang === 'he' ? 'מחובר לנתוני אמת' : 'Connected to Real Data')
                      : (lang === 'he' ? 'לא מחובר - נתונים גנריים' : 'Not Connected - Generic Data')
                    }
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-colors"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl p-3 ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-slate-800 shadow-sm border border-slate-200'
                  }`}
                >
                  {message.isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 bg-white border-t border-slate-200">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={lang === 'he' ? 'כתוב הודעה...' : 'Type a message...'}
                className="flex-1 px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                disabled={isLoading}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="px-6 py-3 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-wider hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {lang === 'he' ? 'שלח' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AIChatAssistant;
