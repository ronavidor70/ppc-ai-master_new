
import React, { useState } from 'react';
import { useTranslation } from '../App';
import { Icons } from '../constants';

interface Term {
  id: string;
  title: string;
  definition: string;
  category: 'Basics' | 'Advanced' | 'Metrics' | 'Technical';
}

const GLOSSARY_TERMS: Record<string, Term[]> = {
  he: [
    { id: 'ppc', title: 'PPC (Pay-Per-Click)', definition: 'שיטת פרסום בה המפרסם משלם רק כאשר משתמש לוחץ על המודעה שלו. נפוץ מאוד בגוגל ובפייסבוק.', category: 'Basics' },
    { id: 'sem', title: 'SEM (Search Engine Marketing)', definition: 'שיווק במנועי חיפוש. כולל פרסום ממומן (PPC) ולעיתים גם קידום אורגני (SEO).', category: 'Basics' },
    { id: 'ctr', title: 'CTR (Click-Through Rate)', definition: 'יחס הקלקה. אחוז האנשים שלחצו על המודעה מתוך כלל האנשים שנחשפו אליה. מדד לאיכות המודעה.', category: 'Metrics' },
    { id: 'cpc', title: 'CPC (Cost Per Click)', definition: 'עלות לקליק. הסכום הממוצע שאתה משלם עבור לחיצה אחת על המודעה.', category: 'Metrics' },
    { id: 'cpa', title: 'CPA (Cost Per Acquisition)', definition: 'עלות לרכישה / פעולה. כמה עלה לך בממוצע להשיג לקוח חדש או ליד.', category: 'Metrics' },
    { id: 'roas', title: 'ROAS (Return on Ad Spend)', definition: 'החזר על הוצאות פרסום. היחס בין ההכנסות מהקמפיין לעלות הפרסום שלו.', category: 'Metrics' },
    { id: 'quality-score', title: 'ציון איכות (Quality Score)', definition: 'מדד של גוגל המדרג את איכות המודעה, מילות המפתח ודף הנחיתה שלך. ציון גבוה מוריד את העלות לקליק.', category: 'Advanced' },
    { id: 'negative-keywords', title: 'מילות מפתח שליליות', definition: 'מילים שהגדרת שלא תרצה שהמודעה שלך תופיע עבורן. עוזר לחסוך תקציב על קליקים לא רלוונטיים.', category: 'Advanced' },
    { id: 'pixel', title: 'פיקסל (Pixel)', definition: 'קוד מעקב שמושתל באתר ומאפשר למערכות הפרסום לדעת מה המשתמש עשה באתר (רכישה, הרשמה וכו\').', category: 'Technical' },
    { id: 'remarketing', title: 'רימרקטינג (Remarketing)', definition: 'שיווק מחדש. הצגת מודעות לאנשים שכבר ביקרו באתר שלך בעבר.', category: 'Advanced' },
    { id: 'landing-page', title: 'דף נחיתה', definition: 'העמוד הספציפי אליו מגיע הגולש לאחר שלחץ על המודעה. עליו להיות ממוקד במטרה אחת.', category: 'Basics' },
    { id: 'conversion-rate', title: 'יחס המרה', definition: 'אחוז הגולשים שביצעו את הפעולה הרצויה (קנייה, השארת פרטים) מתוך כלל המבקרים.', category: 'Metrics' }
  ],
  en: [
    { id: 'ppc', title: 'PPC (Pay-Per-Click)', definition: 'An advertising model where advertisers pay a fee each time one of their ads is clicked.', category: 'Basics' },
    { id: 'sem', title: 'SEM (Search Engine Marketing)', definition: 'Using paid strategies to increase search visibility (often used to describe PPC on search engines).', category: 'Basics' },
    { id: 'ctr', title: 'CTR (Click-Through Rate)', definition: 'The ratio of users who click on a specific link to the number of total users who view the ad.', category: 'Metrics' },
    { id: 'cpc', title: 'CPC (Cost Per Click)', definition: 'The actual price you pay for each click in your pay-per-click marketing campaigns.', category: 'Metrics' },
    { id: 'roas', title: 'ROAS (Return on Ad Spend)', definition: 'A marketing metric that measures the amount of revenue a business earns for each dollar it spends on advertising.', category: 'Metrics' },
    { id: 'pixel', title: 'Pixel', definition: 'A small piece of code placed on a website to track user behavior and conversions.', category: 'Technical' },
    { id: 'quality-score', title: 'Quality Score', definition: 'Googles rating of the quality and relevance of both your keywords and PPC ads.', category: 'Advanced' },
    { id: 'remarketing', title: 'Remarketing', definition: 'Showing ads to people who have previously visited your website or used your mobile app.', category: 'Advanced' }
  ]
};

const Glossary: React.FC = () => {
  const { t, lang, dir } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const terms = GLOSSARY_TERMS[lang] || GLOSSARY_TERMS['en'];
  
  const filteredTerms = terms.filter(term => 
    (term.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
     term.definition.toLowerCase().includes(searchTerm.toLowerCase())) &&
    (!activeCategory || term.category === activeCategory)
  );

  const categories = Array.from(new Set(terms.map(t => t.category)));

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center space-y-4">
        <h2 className="text-3xl font-bold text-slate-800">{t('glossary')}</h2>
        <p className="text-slate-500 text-sm max-w-xl mx-auto">{t('glossarySub')}</p>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-3xl border border-slate-200 shadow-sm">
        <div className="relative w-full md:w-96">
          <div className={`absolute inset-y-0 ${dir === 'rtl' ? 'right-4' : 'left-4'} flex items-center pointer-events-none text-slate-400`}>
            <Icons.Search />
          </div>
          <input 
            type="text" 
            placeholder={t('searchGlossary')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full py-2.5 ${dir === 'rtl' ? 'pr-12 pl-4' : 'pl-12 pr-4'} bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:bg-white transition-all`}
          />
        </div>
        
        <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 w-full md:w-auto">
          <button 
            onClick={() => setActiveCategory(null)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${!activeCategory ? 'bg-blue-600 text-white shadow-md shadow-blue-100' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
          >
            All
          </button>
          {categories.map(cat => (
            <button 
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${activeCategory === cat ? 'bg-blue-600 text-white shadow-md shadow-blue-100' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Terms Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTerms.map(term => (
          <div key={term.id} className="group bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:border-blue-100 transition-all duration-300 flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <span className="px-2 py-1 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-lg uppercase tracking-wider">
                {term.category}
              </span>
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-3 group-hover:text-blue-600 transition-colors">{term.title}</h3>
            <p className="text-sm text-slate-500 leading-relaxed flex-1">{term.definition}</p>
          </div>
        ))}
      </div>

      {filteredTerms.length === 0 && (
        <div className="py-20 text-center space-y-4">
          <div className="inline-flex p-6 bg-slate-50 rounded-full text-slate-300">
            <Icons.Book />
          </div>
          <p className="text-slate-400 font-medium italic">No terms found matching your search.</p>
        </div>
      )}
    </div>
  );
};

export default Glossary;
