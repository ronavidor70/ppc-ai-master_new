import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import cors from 'cors';
import 'dotenv/config';
import OpenAI from 'openai';

const app = express();
const PORT = process.env.PORT || 5001;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// בדיקת משתני סביבה בתחילת הקובץ
const facebookAppId = process.env.FACEBOOK_APP_ID;
const facebookAppSecret = process.env.FACEBOOK_APP_SECRET;
const facebookRedirectUri = process.env.FACEBOOK_REDIRECT_URI;
const sessionSecret = process.env.SESSION_SECRET;

// לוגים לאבחון
console.log('🔍 Environment Variables Check:');
console.log('Facebook App ID:', facebookAppId ? facebookAppId.substring(0, 5) + '...' : '❌ NOT SET');
console.log('Facebook App Secret:', facebookAppSecret ? '***' + facebookAppSecret.substring(facebookAppSecret.length - 4) : '❌ NOT SET');
console.log('Facebook Redirect URI:', facebookRedirectUri || '❌ NOT SET');
console.log('Session Secret:', sessionSecret ? 'SET' : '❌ NOT SET');

// CORS - אפשר גישה מ-frontend
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true })); // הוספתי - חשוב ל-OAuth callbacks

// Session setup
app.use(session({
  secret: sessionSecret || 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // true רק ב-HTTPS
    httpOnly: true, 
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// Helper functions for date ranges
function getDateRangeSince(range: string): string {
  const now = new Date();
  const days = range === 'last_30d' ? 30 : range === 'last_90d' ? 90 : 7;
  const date = new Date(now);
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

function getDateRangeUntil(): string {
  return new Date().toISOString().split('T')[0];
}

// Passport Facebook Strategy - עם try-catch ולוגים
console.log('🔧 Setting up Facebook Strategy...');
try {
  if (!facebookAppId || !facebookAppSecret || !facebookRedirectUri) {
    throw new Error('Missing required Facebook OAuth environment variables');
  }

  passport.use(new FacebookStrategy({
      clientID: facebookAppId,
      clientSecret: facebookAppSecret,
      callbackURL: facebookRedirectUri,
      profileFields: ['id', 'emails', 'name', 'picture']
    },
    (accessToken, refreshToken, profile, done) => {
      console.log('✅ Facebook Strategy callback called for user:', profile.id);
      const user = {
        profile,
        accessToken: accessToken,
        facebookId: profile.id,
        email: profile.emails?.[0]?.value,
        name: profile.displayName,
        picture: profile.photos?.[0]?.value
      };
      return done(null, user);
    }
  ));
  console.log('✅ Facebook Strategy configured successfully');
} catch (error: any) {
  console.error('❌ Error setting up Facebook Strategy:', error.message);
  console.error('Stack:', error.stack);
}

passport.serializeUser((user: any, done) => {
  done(null, user);
});

passport.deserializeUser((obj: any, done) => {
  done(null, obj);
});

// Routes
// התחברות - הפנייה לפייסבוק
console.log('🔧 Setting up /auth/facebook route...');
app.get('/auth/facebook', 
  (req, res, next) => {
    console.log('📥 Request to /auth/facebook received');
    
    // בדיקה שהמשתנים מוגדרים
    if (!facebookAppId || !facebookAppSecret) {
      console.error('❌ Facebook OAuth not configured');
      return res.status(500).json({ 
        error: 'Facebook authentication is not configured. Please check your .env file.',
        details: {
          hasAppId: !!facebookAppId,
          hasAppSecret: !!facebookAppSecret,
          hasRedirectUri: !!facebookRedirectUri
        }
      });
    }
    
    next();
  },
  passport.authenticate('facebook', { 
    scope: [
      'public_profile',
      'email',
      'ads_management',
      'ads_read',
      'business_management',
      'pages_manage_ads',
      'pages_read_engagement',
      'pages_show_list'
    ]
  })
);

// Callback - פייסבוק מחזיר לכאן
app.get('/auth/facebook/callback',
  (req, res, next) => {
    console.log('📥 Facebook callback received');
    console.log('Query params:', req.query);
    next();
  },
  passport.authenticate('facebook', { 
    failureRedirect: 'http://localhost:3000/login',
    session: true
  }),
  (req, res) => {
    console.log('✅ Facebook authentication successful');
    console.log('👤 User:', (req.user as any)?.name);
    
    // שמירת ה-Session באופן מפורש לפני המעבר דף
    req.session.save((err) => {
      if (err) {
        console.error('❌ Error saving session:', err);
        return res.redirect('http://localhost:3000/dashboard?error=session_save');
      }
      console.log('💾 Session saved, redirecting to dashboard...');
      // הוספת פרמטר שיאותת ל-Frontend שההתחברות הצליחה
      res.redirect('http://localhost:3000/dashboard?auth_success=true');
    });
  }
);

// API: קבלת מידע המשתמש המחובר
app.get('/auth/user', (req, res) => {
  if (req.isAuthenticated()) {
    res.json(req.user);
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// API: קבלת Access Token של המשתמש המחובר
app.get('/api/facebook/token', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ 
      accessToken: (req.user as any).accessToken,
      user: {
        id: (req.user as any).facebookId,
        name: (req.user as any).name,
        email: (req.user as any).email,
        picture: (req.user as any).picture
      }
    });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// API: קבלת חשבונות מודעות
app.get('/api/facebook/adaccounts', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const accessToken = (req.user as any).accessToken;
  
  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/me/adaccounts?fields=name,account_id,currency,account_status,timezone_name&access_token=${accessToken}`
    );
    const data = await response.json();
    
    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }
    
    res.json(data.data || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// API: קבלת דפים
app.get('/api/facebook/pages', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const accessToken = (req.user as any).accessToken;
  
  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?access_token=${accessToken}`
    );
    const data = await response.json();
    
    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }
    
    res.json(data.data || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// API: קבלת כל הקמפיינים מחשבון מודעות
app.get('/api/facebook/campaigns', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const accessToken = (req.user as any).accessToken;
  let accountId = req.query.accountId as string;
  
  if (!accountId) {
    return res.status(400).json({ error: 'accountId is required' });
  }

  // הסרת קידומת act_ אם היא קיימת
  if (accountId.startsWith('act_')) {
    accountId = accountId.substring(4);
  }

  // ✅ לוג למעקב - איזה חשבון נשלף
  console.log(`🔍 Fetching campaigns for account: act_${accountId}`);

  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/act_${accountId}/campaigns?fields=id,name,status,objective,created_time,updated_time&access_token=${accessToken}`
    );
    const data = await response.json();
    
    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }
    
    // ✅ וידוא שהתוצאות שייכות לחשבון הנכון
    console.log(`✅ Fetched ${data.data?.length || 0} campaigns for account act_${accountId}`);
    res.json(data.data || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// API: קבלת לידים מכל הקמפיינים הפעילים
app.get('/api/facebook/leads', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const accessToken = (req.user as any).accessToken;
  let accountId = req.query.accountId as string;
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;
  
  if (!accountId) {
    return res.status(400).json({ error: 'accountId is required' });
  }

  // הסרת קידומת act_ אם היא קיימת
  if (accountId.startsWith('act_')) {
    accountId = accountId.substring(4);
  }

  // ✅ לוג למעקב - איזה חשבון נשלף
  console.log(`🔍 Fetching leads for account: act_${accountId} (${startDate} to ${endDate})`);

  try {
    // 1. משיכת כל הקמפיינים - רק מהחשבון הספציפי
    const campaignsResponse = await fetch(
      `https://graph.facebook.com/v19.0/act_${accountId}/campaigns?fields=id,name,status&access_token=${accessToken}`
    );
    const campaignsData = await campaignsResponse.json();
    
    if (campaignsData.error) {
      return res.status(400).json({ error: campaignsData.error.message });
    }

    const activeCampaigns = (campaignsData.data || []).filter((c: any) => c.status === 'ACTIVE');
    console.log(`📋 Found ${activeCampaigns.length} active campaigns in account act_${accountId}`);

    const allLeads: any[] = [];

    // 2. עבור כל קמפיין, מצא Lead Forms ומשוך לידים
    for (const campaign of activeCampaigns) {
      try {
        // משיכת Ad Sets של הקמפיין
        const adSetsResponse = await fetch(
          `https://graph.facebook.com/v19.0/${campaign.id}/adsets?fields=id,name&access_token=${accessToken}`
        );
        const adSetsData = await adSetsResponse.json();
        
        if (adSetsData.error) continue;
        
        const adSets = adSetsData.data || [];
        
        // עבור כל Ad Set, מצא Ads
        for (const adSet of adSets) {
          const adsResponse = await fetch(
            `https://graph.facebook.com/v19.0/${adSet.id}/ads?fields=id,name,creative&access_token=${accessToken}`
          );
          const adsData = await adsResponse.json();
          
          if (adsData.error) continue;
          
          const ads = adsData.data || [];
          
          // עבור כל Ad, בדוק אם יש Lead Form
          for (const ad of ads) {
            if (ad.creative && ad.creative.object_story_spec) {
              const leadgenId = ad.creative.object_story_spec?.link_data?.call_to_action?.value?.lead_gen_form_id;
              
              if (leadgenId) {
                // משיכת לידים מה-Lead Form
                const leadsResponse = await fetch(
                  `https://graph.facebook.com/v19.0/${leadgenId}/leads?fields=id,created_time,field_data&access_token=${accessToken}`
                );
                const leadsData = await leadsResponse.json();
                
                if (leadsData.error) {
                  console.warn(`⚠️ Error fetching leads for form ${leadgenId}:`, leadsData.error.message);
                  continue;
                }
                
                const leads = leadsData.data || [];
                
                // סינון לפי תאריכים אם צוינו
                const filteredLeads = leads.filter((lead: any) => {
                  if (!startDate || !endDate) return true;
                  const leadDate = new Date(lead.created_time).toISOString().split('T')[0];
                  return leadDate >= startDate && leadDate <= endDate;
                });
                
                // מיפוי הלידים לפורמט שלנו
                filteredLeads.forEach((lead: any) => {
                  const fieldData: any = {};
                  (lead.field_data || []).forEach((field: any) => {
                    fieldData[field.name] = field.values?.[0] || '';
                  });
                  
                  // מיפוי שדות
                  const fullName = fieldData.full_name || fieldData.FULL_NAME || 
                    (fieldData.first_name && fieldData.last_name ? `${fieldData.first_name} ${fieldData.last_name}` : '') ||
                    fieldData.first_name || fieldData.last_name || 'Unknown';
                  const phoneNumber = fieldData.phone_number || fieldData.PHONE_NUMBER || fieldData.phone || '';
                  const email = fieldData.email || fieldData.EMAIL || '';
                  
                  if (phoneNumber || email) {
                    allLeads.push({
                      id: lead.id,
                      name: fullName,
                      email: email,
                      phone: phoneNumber,
                      campaignId: campaign.id,
                      campaignName: campaign.name,
                      createdAt: lead.created_time,
                      rawData: fieldData
                    });
                  }
                });
              }
            }
          }
        }
      } catch (error: any) {
        console.error(`❌ Error processing campaign ${campaign.id}:`, error.message);
        continue;
      }
    }

    console.log(`✅ Fetched ${allLeads.length} leads from account act_${accountId}`);
    res.json(allLeads);
  } catch (error: any) {
    console.error('❌ Error fetching leads:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: קבלת ביצועים של קמפיין ספציפי
app.get('/api/facebook/campaigns/:campaignId/insights', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const accessToken = (req.user as any).accessToken;
  const campaignId = req.params.campaignId;
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;
  const accountId = req.query.accountId as string; // הוסף פרמטר זה
  
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate are required' });
  }
  
  // ✅ וידוא שיש accountId
  if (!accountId) {
    return res.status(400).json({ error: 'accountId is required for campaign insights' });
  }

  // ✅ לוג למעקב
  console.log(`🔍 Fetching insights for campaign ${campaignId} in account: ${accountId}`);
  
  try {
    // 1. משיכת Timezone ו-Currency של החשבון
    let timezone = 'America/Los_Angeles'; // ברירת מחדל
    let currency = 'USD'; // ברירת מחדל
    if (accountId) {
      let cleanAccountId = accountId;
      if (cleanAccountId.startsWith('act_')) {
        cleanAccountId = cleanAccountId.substring(4);
      }
      try {
        const accountResponse = await fetch(
          `https://graph.facebook.com/v19.0/act_${cleanAccountId}?fields=timezone_name,currency&access_token=${accessToken}`
        );
        const accountData = await accountResponse.json();
        if (accountData.timezone_name) {
          timezone = accountData.timezone_name;
          console.log(`🌍 Using account timezone: ${timezone}`);
        }
        if (accountData.currency) {
          currency = accountData.currency;
          console.log(`💰 Using account currency: ${currency}`);
        }
      } catch (tzError) {
        console.warn('⚠️ Could not fetch account timezone/currency, using default:', tzError);
      }
    }

    const fields = 'spend,impressions,clicks,ctr,cpc,cpp,cpm,actions,action_values,conversions,reach,frequency';
    const timeRange = JSON.stringify({
      since: startDate,
      until: endDate
    });
    
    // 2. הוספת כל הפרמטרים הנדרשים + action_breakdowns=action_type לקבלת וואטסאפ ולידים
    const url = `https://graph.facebook.com/v19.0/${campaignId}/insights?fields=${fields}&time_range=${encodeURIComponent(timeRange)}&action_attribution_windows=["1d_click","7d_click","1d_view","7d_view","28d_click"]&action_report_time=impression&use_unified_attribution_setting=true&action_breakdowns=action_type&time_increment=1&include_summary=true&access_token=${accessToken}`;
    
    console.log(`🔍 Fetching insights for campaign ${campaignId} from ${startDate} to ${endDate}...`);
    console.log(`🌍 Timezone: ${timezone}`);
    console.log(`💰 Currency: ${currency}`);
    console.log(`📊 URL: ${url.replace(accessToken, 'TOKEN_HIDDEN')}`);
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.error) {
      console.error('❌ Facebook API Error:', data.error.message);
      return res.status(400).json({ error: data.error.message });
    }
    
    console.log(`📊 Insights data received for campaign ${campaignId}:`, data.data?.length ? `Data found (${data.data.length} rows)` : 'Empty array');
    
    // 🔍 DEBUG: לוג של data.summary ישירות מהתשובה
    console.log('═══════════════════════════════════════════════════════');
    console.log('📈 DATA.SUMMARY (TOP LEVEL):');
    console.log('═══════════════════════════════════════════════════════');
    console.log('💰 data.summary:', JSON.stringify(data.summary || {}, null, 2));
    console.log('═══════════════════════════════════════════════════════');
    
    // ✅ תיקון: אם יש summary תקין, נשתמש רק בו - ללא סכימה ידנית (Single Source of Truth)
    const summary = data.summary || {};
    const hasValidSummary = summary && Object.keys(summary).length > 0 && summary.spend !== undefined;
    
    // פונקציה עזר לחישוב unified_metrics
    const calculateUnifiedMetrics = (actions: any[]) => {
      const unified_metrics = {
        whatsapp: 0,
        leads: 0,
        purchases: 0
      };

      const processedActionTypes = new Set<string>();

      actions.forEach((a: any) => {
        const val = parseInt(a.value || '0');
        if (val === 0) return;
        
        const actionType = a.action_type || '';
        const actionBreakdown = a.action_breakdowns || '';
        const actionKey = `${actionType}_${actionBreakdown}`;
        
        if (processedActionTypes.has(actionKey)) {
          console.warn(`⚠️ Duplicate action detected: ${actionType}, skipping...`);
          return;
        }
        processedActionTypes.add(actionKey);
        
        // WhatsApp
        if (
          actionType === 'onsite_conversion.messaging_first_reply' ||
          (actionType === 'contact' && (actionBreakdown === 'action_type' || actionBreakdown === '')) ||
          actionType === 'messaging_conversation_started_7d'
        ) {
          unified_metrics.whatsapp += val;
        }
        else if (actionType === 'contact') {
          const url = a.url || '';
          if (url.includes('wa.me') || url.includes('whatsapp.com')) {
            unified_metrics.whatsapp += val;
          } else {
            unified_metrics.leads += val;
          }
        }
        // ✅ תיקון: הוספת onsite_conversion.lead_grouped לזיהוי לידים
        else if (
          actionType === 'lead' ||
          actionType === 'onsite_conversion.lead_grouped' ||
          actionType === 'submit_application' ||
          actionType === 'complete_registration' ||
          actionType === 'offsite_conversion.fb_pixel_lead'
        ) {
          if (actionType === 'lead' && !actionType.includes('fb_pixel')) {
            const url = a.url || '';
            if (url.includes('wa.me') || url.includes('whatsapp.com')) {
              unified_metrics.whatsapp += val;
            } else {
              unified_metrics.leads += val;
            }
          } else {
            unified_metrics.leads += val;
          }
        }
        // Sales/Purchases
        else if (
          actionType === 'purchase' ||
          actionType === 'onsite_conversion.purchase' ||
          actionType === 'omni_purchase' ||
          actionType === 'offsite_conversion.fb_pixel_purchase'
        ) {
          unified_metrics.purchases += val;
        }
      });

      return unified_metrics;
    };
    
    if (hasValidSummary) {
      // ✅ שימוש רק ב-summary - Single Source of Truth (אין סכימה ידנית)
      console.log('✅ Using Facebook Summary as Single Source of Truth (no manual summing)');
      console.log('💰 Summary Spend:', summary.spend);
      
      const finalSpend = parseFloat(summary.spend || '0');
      const finalImpressions = parseInt(summary.impressions || '0');
      const finalClicks = parseInt(summary.clicks || '0');
      const finalActions = summary.actions || [];
      const finalActionValues = summary.action_values || [];
      const finalCtr = parseFloat(summary.ctr || '0');
      const finalCpc = parseFloat(summary.cpc || '0');
      const finalCpm = parseFloat(summary.cpm || '0');
      const finalReach = parseInt(summary.reach || '0');
      const finalFrequency = parseFloat(summary.frequency || '0');
      
      const unified_metrics = calculateUnifiedMetrics(finalActions);
      
      console.log('✅ FINAL VALUES TO RETURN (CAMPAIGN - FROM SUMMARY):');
      console.log(`💰 Spend: ${finalSpend} ${currency} (from summary - Single Source of Truth)`);
      console.log(`👁️ Impressions: ${finalImpressions} (from summary)`);
      console.log(`🖱️ Clicks: ${finalClicks} (from summary)`);
      console.log(`📊 Actions count: ${finalActions.length}`);
      console.log('Unified Metrics calculated (Campaign - from Summary):', JSON.stringify(unified_metrics, null, 2));
      
      // ✅ תיקון: חיפוש גם אחרי onsite_conversion.lead_grouped
      const leads = finalActions.find((a: any) => 
        a.action_type === 'lead' || 
        a.action_type === 'onsite_conversion.lead_grouped' ||
        a.action_type === 'offsite_conversion.fb_pixel_lead'
      )?.value || '0';
      const conversions = finalActions.find((a: any) => a.action_type === 'offsite_conversion')?.value || '0';

      res.json({
        spend: finalSpend,
        impressions: finalImpressions,
        clicks: finalClicks,
        ctr: finalCtr,
        cpc: finalCpc,
        cpm: finalCpm,
        leads: parseInt(leads),
        conversions: parseInt(conversions),
        unified_metrics: unified_metrics,
        actions: finalActions,
        action_values: finalActionValues,
        reach: finalReach,
        frequency: finalFrequency,
        cpl: parseFloat(leads) > 0 ? finalSpend / parseFloat(leads) : 0,
        summary: summary,
        currency: currency,
        daily: data.data
      });
    } else {
      // ✅ Fallback: רק אם אין summary, נסכם ידנית
      console.log('⚠️ No valid summary found, falling back to manual summing');
      
      const allDataRows = data.data || [];
      let totalSpend = 0;
      let totalImpressions = 0;
      let totalClicks = 0;
      const allActions: any[] = [];
      const allActionValues: any[] = [];
      
      allDataRows.forEach((row: any) => {
        totalSpend += parseFloat(row.spend || '0');
        totalImpressions += parseInt(row.impressions || '0');
        totalClicks += parseInt(row.clicks || '0');
        
        if (row.actions && Array.isArray(row.actions)) {
          row.actions.forEach((action: any) => {
            const existingIndex = allActions.findIndex(
              (a: any) => a.action_type === action.action_type && 
                          (a.action_breakdowns || '') === (action.action_breakdowns || '')
            );
            
            if (existingIndex >= 0) {
              allActions[existingIndex].value = (
                parseInt(allActions[existingIndex].value || '0') + 
                parseInt(action.value || '0')
              ).toString();
            } else {
              allActions.push({ ...action });
            }
          });
        }
        
        if (row.action_values && Array.isArray(row.action_values)) {
          row.action_values.forEach((actionValue: any) => {
            const existingIndex = allActionValues.findIndex(
              (av: any) => av.action_type === actionValue.action_type &&
                          (av.action_breakdowns || '') === (actionValue.action_breakdowns || '')
            );
            
            if (existingIndex >= 0) {
              allActionValues[existingIndex].value = (
                parseFloat(allActionValues[existingIndex].value || '0') + 
                parseFloat(actionValue.value || '0')
              ).toString();
            } else {
              allActionValues.push({ ...actionValue });
            }
          });
        }
      });
      
      const firstRow = allDataRows[0] || {};
      const finalCtr = parseFloat(summary.ctr || firstRow.ctr || '0');
      const finalCpc = parseFloat(summary.cpc || firstRow.cpc || '0');
      const finalCpm = parseFloat(summary.cpm || firstRow.cpm || '0');
      const finalReach = parseInt(summary.reach || firstRow.reach || '0');
      const finalFrequency = parseFloat(summary.frequency || firstRow.frequency || '0');
      
      const unified_metrics = calculateUnifiedMetrics(allActions);
      
      console.log('✅ FINAL VALUES TO RETURN (CAMPAIGN - SUMMED FROM DATA):');
      console.log(`💰 Spend: ${totalSpend} ${currency} (summed from data - fallback)`);
      console.log(`👁️ Impressions: ${totalImpressions} (summed from data)`);
      console.log(`🖱️ Clicks: ${totalClicks} (summed from data)`);
      console.log(`📊 Actions count: ${allActions.length}`);
      console.log('Unified Metrics calculated (Campaign - from summed data):', JSON.stringify(unified_metrics, null, 2));
      
      // ✅ תיקון: חיפוש גם אחרי onsite_conversion.lead_grouped
      const leads = allActions.find((a: any) => 
        a.action_type === 'lead' || 
        a.action_type === 'onsite_conversion.lead_grouped' ||
        a.action_type === 'offsite_conversion.fb_pixel_lead'
      )?.value || '0';
      const conversions = allActions.find((a: any) => a.action_type === 'offsite_conversion')?.value || '0';

      res.json({
        spend: totalSpend,
        impressions: totalImpressions,
        clicks: totalClicks,
        ctr: finalCtr,
        cpc: finalCpc,
        cpm: finalCpm,
        leads: parseInt(leads),
        conversions: parseInt(conversions),
        unified_metrics: unified_metrics,
        actions: allActions,
        action_values: allActionValues,
        reach: finalReach,
        frequency: finalFrequency,
        cpl: parseFloat(leads) > 0 ? totalSpend / parseFloat(leads) : 0,
        summary: summary,
        currency: currency,
        daily: data.data
      });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// API: קבלת ביצועים של חשבון מודעות
app.get('/api/facebook/adaccounts/:accountId/insights', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const accessToken = (req.user as any).accessToken;
  let accountId = req.params.accountId;
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;
  
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate are required' });
  }
  
  // הסרת קידומת act_ אם היא קיימת
  if (accountId.startsWith('act_')) {
    accountId = accountId.substring(4);
  }
  
  // ✅ לוג למעקב
  console.log(`🔍 Fetching account insights for: act_${accountId} (${startDate} to ${endDate})`);
  
  try {
    // 1. משיכת Timezone ו-Currency של החשבון
    let timezone = 'America/Los_Angeles'; // ברירת מחדל
    let currency = 'USD'; // ברירת מחדל
    try {
      const accountResponse = await fetch(
        `https://graph.facebook.com/v19.0/act_${accountId}?fields=timezone_name,currency&access_token=${accessToken}`
      );
      const accountData = await accountResponse.json();
      if (accountData.timezone_name) {
        timezone = accountData.timezone_name;
        console.log(`🌍 Using account timezone: ${timezone}`);
      }
      if (accountData.currency) {
        currency = accountData.currency;
        console.log(`💰 Using account currency: ${currency}`);
      }
    } catch (tzError) {
      console.warn('⚠️ Could not fetch account timezone/currency, using default:', tzError);
    }

    const fields = 'spend,impressions,clicks,ctr,cpc,cpp,cpm,actions,action_values,conversions,reach,frequency';
    const timeRange = JSON.stringify({
      since: startDate,
      until: endDate
    });
    
    // 2. הוספת כל הפרמטרים הנדרשים + action_breakdowns=action_type לקבלת וואטסאפ ולידים
    const url = `https://graph.facebook.com/v19.0/act_${accountId}/insights?fields=${fields}&time_range=${encodeURIComponent(timeRange)}&action_attribution_windows=["1d_click","7d_click","1d_view","7d_view","28d_click"]&action_report_time=impression&use_unified_attribution_setting=true&action_breakdowns=action_type&time_increment=1&include_summary=true&access_token=${accessToken}`;
    
    console.log(`🔍 Fetching insights for account ${accountId} from ${startDate} to ${endDate}...`);
    console.log(`🌍 Timezone: ${timezone}`);
    console.log(`💰 Currency: ${currency}`);
    console.log(`📊 URL: ${url.replace(accessToken, 'TOKEN_HIDDEN')}`);
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.error) {
      console.error('❌ Facebook API Error:', data.error.message);
      return res.status(400).json({ error: data.error.message });
    }

    console.log(`📊 Insights data received for account ${accountId}:`, data.data?.length ? `Data found (${data.data.length} rows)` : 'Empty array');
    
    // 🔍 DEBUG: לוג של data.summary ישירות מהתשובה
    console.log('═══════════════════════════════════════════════════════');
    console.log('📈 DATA.SUMMARY (TOP LEVEL - ACCOUNT):');
    console.log('═══════════════════════════════════════════════════════');
    console.log('💰 data.summary:', JSON.stringify(data.summary || {}, null, 2));
    console.log('═══════════════════════════════════════════════════════');
    
    // ✅ תיקון: אם יש summary תקין, נשתמש רק בו - ללא סכימה ידנית (Single Source of Truth)
    const summary = data.summary || {};
    const hasValidSummary = summary && Object.keys(summary).length > 0 && summary.spend !== undefined;
    
    // פונקציה עזר לחישוב unified_metrics (שימוש חוזר)
    const calculateUnifiedMetricsAccount = (actions: any[]) => {
      const unified_metrics = {
        whatsapp: 0,
        leads: 0,
        purchases: 0
      };

      const processedActionTypes = new Set<string>();

      actions.forEach((a: any) => {
        const val = parseInt(a.value || '0');
        if (val === 0) return;
        
        const actionType = a.action_type || '';
        const actionBreakdown = a.action_breakdowns || '';
        const actionKey = `${actionType}_${actionBreakdown}`;
        
        if (processedActionTypes.has(actionKey)) {
          console.warn(`⚠️ Duplicate action detected: ${actionType}, skipping...`);
          return;
        }
        processedActionTypes.add(actionKey);
        
        // WhatsApp
        if (
          actionType === 'onsite_conversion.messaging_first_reply' ||
          (actionType === 'contact' && (actionBreakdown === 'action_type' || actionBreakdown === '')) ||
          actionType === 'messaging_conversation_started_7d'
        ) {
          unified_metrics.whatsapp += val;
        }
        else if (actionType === 'contact') {
          const url = a.url || '';
          if (url.includes('wa.me') || url.includes('whatsapp.com')) {
            unified_metrics.whatsapp += val;
          } else {
            unified_metrics.leads += val;
          }
        }
        // ✅ תיקון: הוספת onsite_conversion.lead_grouped לזיהוי לידים
        else if (
          actionType === 'lead' ||
          actionType === 'onsite_conversion.lead_grouped' ||
          actionType === 'submit_application' ||
          actionType === 'complete_registration' ||
          actionType === 'offsite_conversion.fb_pixel_lead'
        ) {
          if (actionType === 'lead' && !actionType.includes('fb_pixel')) {
            const url = a.url || '';
            if (url.includes('wa.me') || url.includes('whatsapp.com')) {
              unified_metrics.whatsapp += val;
            } else {
              unified_metrics.leads += val;
            }
          } else {
            unified_metrics.leads += val;
          }
        }
        // Sales/Purchases
        else if (
          actionType === 'purchase' ||
          actionType === 'onsite_conversion.purchase' ||
          actionType === 'omni_purchase' ||
          actionType === 'offsite_conversion.fb_pixel_purchase'
        ) {
          unified_metrics.purchases += val;
        }
      });

      return unified_metrics;
    };
    
    if (hasValidSummary) {
      // ✅ שימוש רק ב-summary - Single Source of Truth (אין סכימה ידנית)
      console.log('✅ Using Facebook Summary as Single Source of Truth (Account Level - no manual summing)');
      console.log('💰 Summary Spend:', summary.spend);
      
      const finalSpend = parseFloat(summary.spend || '0');
      const finalImpressions = parseInt(summary.impressions || '0');
      const finalClicks = parseInt(summary.clicks || '0');
      const finalActions = summary.actions || [];
      const finalActionValues = summary.action_values || [];
      const finalCtr = parseFloat(summary.ctr || '0');
      const finalCpc = parseFloat(summary.cpc || '0');
      const finalCpm = parseFloat(summary.cpm || '0');
      const finalReach = parseInt(summary.reach || '0');
      const finalFrequency = parseFloat(summary.frequency || '0');
      
      const unified_metrics = calculateUnifiedMetricsAccount(finalActions);
      
      console.log('✅ FINAL VALUES TO RETURN (ACCOUNT - FROM SUMMARY):');
      console.log(`💰 Spend: ${finalSpend} ${currency} (from summary - Single Source of Truth)`);
      console.log(`👁️ Impressions: ${finalImpressions} (from summary)`);
      console.log(`🖱️ Clicks: ${finalClicks} (from summary)`);
      console.log(`📊 Actions count: ${finalActions.length}`);
      console.log('Unified Metrics calculated (Account - from Summary):', JSON.stringify(unified_metrics, null, 2));
      
      // ✅ תיקון: חיפוש גם אחרי onsite_conversion.lead_grouped
      const leads = finalActions.find((a: any) => 
        a.action_type === 'lead' || 
        a.action_type === 'onsite_conversion.lead_grouped' ||
        a.action_type === 'offsite_conversion.fb_pixel_lead'
      )?.value || '0';
      const conversions = finalActions.find((a: any) => a.action_type === 'offsite_conversion')?.value || '0';

      res.json({
        spend: finalSpend,
        impressions: finalImpressions,
        clicks: finalClicks,
        ctr: finalCtr,
        cpc: finalCpc,
        cpm: finalCpm,
        leads: parseInt(leads),
        conversions: parseInt(conversions),
        unified_metrics: unified_metrics,
        actions: finalActions,
        action_values: finalActionValues,
        reach: finalReach,
        frequency: finalFrequency,
        cpl: parseFloat(leads) > 0 ? finalSpend / parseFloat(leads) : 0,
        summary: summary,
        currency: currency,
        daily: data.data
      });
    } else {
      // ✅ Fallback: רק אם אין summary, נסכם ידנית
      console.log('⚠️ No valid summary found, falling back to manual summing');
      
      const allDataRows = data.data || [];
      let totalSpend = 0;
      let totalImpressions = 0;
      let totalClicks = 0;
      const allActions: any[] = [];
      const allActionValues: any[] = [];
      
      allDataRows.forEach((row: any) => {
        totalSpend += parseFloat(row.spend || '0');
        totalImpressions += parseInt(row.impressions || '0');
        totalClicks += parseInt(row.clicks || '0');
        
        if (row.actions && Array.isArray(row.actions)) {
          row.actions.forEach((action: any) => {
            const existingIndex = allActions.findIndex(
              (a: any) => a.action_type === action.action_type && 
                          (a.action_breakdowns || '') === (action.action_breakdowns || '')
            );
            
            if (existingIndex >= 0) {
              allActions[existingIndex].value = (
                parseInt(allActions[existingIndex].value || '0') + 
                parseInt(action.value || '0')
              ).toString();
            } else {
              allActions.push({ ...action });
            }
          });
        }
        
        if (row.action_values && Array.isArray(row.action_values)) {
          row.action_values.forEach((actionValue: any) => {
            const existingIndex = allActionValues.findIndex(
              (av: any) => av.action_type === actionValue.action_type &&
                          (av.action_breakdowns || '') === (actionValue.action_breakdowns || '')
            );
            
            if (existingIndex >= 0) {
              allActionValues[existingIndex].value = (
                parseFloat(allActionValues[existingIndex].value || '0') + 
                parseFloat(actionValue.value || '0')
              ).toString();
            } else {
              allActionValues.push({ ...actionValue });
            }
          });
        }
      });
      
      const firstRow = allDataRows[0] || {};
      const finalCtr = parseFloat(summary.ctr || firstRow.ctr || '0');
      const finalCpc = parseFloat(summary.cpc || firstRow.cpc || '0');
      const finalCpm = parseFloat(summary.cpm || firstRow.cpm || '0');
      const finalReach = parseInt(summary.reach || firstRow.reach || '0');
      const finalFrequency = parseFloat(summary.frequency || firstRow.frequency || '0');
      
      const unified_metrics = calculateUnifiedMetricsAccount(allActions);
      
      console.log('✅ FINAL VALUES TO RETURN (ACCOUNT - SUMMED FROM DATA):');
      console.log(`💰 Spend: ${totalSpend} ${currency} (summed from data - fallback)`);
      console.log(`👁️ Impressions: ${totalImpressions} (summed from data)`);
      console.log(`🖱️ Clicks: ${totalClicks} (summed from data)`);
      console.log(`📊 Actions count: ${allActions.length}`);
      console.log('Unified Metrics calculated (Account - from summed data):', JSON.stringify(unified_metrics, null, 2));
      
      // ✅ תיקון: חיפוש גם אחרי onsite_conversion.lead_grouped
      const leads = allActions.find((a: any) => 
        a.action_type === 'lead' || 
        a.action_type === 'onsite_conversion.lead_grouped' ||
        a.action_type === 'offsite_conversion.fb_pixel_lead'
      )?.value || '0';
      const conversions = allActions.find((a: any) => a.action_type === 'offsite_conversion')?.value || '0';

      res.json({
        spend: totalSpend,
        impressions: totalImpressions,
        clicks: totalClicks,
        ctr: finalCtr,
        cpc: finalCpc,
        cpm: finalCpm,
        leads: parseInt(leads),
        conversions: parseInt(conversions),
        unified_metrics: unified_metrics,
        actions: allActions,
        action_values: allActionValues,
        reach: finalReach,
        frequency: finalFrequency,
        cpl: parseFloat(leads) > 0 ? totalSpend / parseFloat(leads) : 0,
        summary: summary,
        currency: currency,
        daily: data.data
      });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Logout
app.get('/auth/logout', (req, res) => {
  req.logout(() => {
    res.json({ success: true });
  });
});

// AI Chat Endpoint
app.post('/api/ai/chat', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { messages, lang } = req.body;

    // לוג של ה-systemPrompt שנשלח
    const systemMessage = messages.find((m: any) => m.role === 'system');
    if (systemMessage) {
      console.log('═══════════════════════════════════════════════════════');
      console.log('📋 SYSTEM PROMPT (first 500 chars):');
      console.log('═══════════════════════════════════════════════════════');
      const promptPreview = systemMessage.content.length > 500 
        ? systemMessage.content.substring(0, 500) + '...'
        : systemMessage.content;
      console.log(promptPreview);
      console.log('═══════════════════════════════════════════════════════');
    }

    // הגדרת system prompt עם כלים (functions)
    const tools = [
      {
        type: 'function' as const,
        function: {
          name: 'pauseCampaign',
          description: lang === 'he' 
            ? 'עוצר קמפיין לפי ID שלו'
            : 'Pauses a campaign by its ID',
          parameters: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: lang === 'he' ? 'ID של הקמפיין' : 'Campaign ID'
              }
            },
            required: ['id']
          }
        }
      },
      {
        type: 'function' as const,
        function: {
          name: 'updateBudget',
          description: lang === 'he'
            ? 'מעדכן תקציב של קמפיין'
            : 'Updates a campaign budget',
          parameters: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: lang === 'he' ? 'ID של הקמפיין' : 'Campaign ID'
              },
              amount: {
                type: 'number',
                description: lang === 'he' ? 'התקציב החדש' : 'New budget amount'
              }
            },
            required: ['id', 'amount']
          }
        }
      },
      {
        type: 'function' as const,
        function: {
          name: 'sendWhatsAppToLead',
          description: lang === 'he'
            ? 'פותח וואטסאפ לליד לפי מספר טלפון'
            : 'Opens WhatsApp for a lead by phone number',
          parameters: {
            type: 'object',
            properties: {
              phone: {
                type: 'string',
                description: lang === 'he' ? 'מספר טלפון' : 'Phone number'
              }
            },
            required: ['phone']
          }
        }
      }
    ];

    console.log('🤖 Sending request to OpenAI...');
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messages,
      tools: tools,
      tool_choice: 'auto',
      temperature: 0.7
    });

    const assistantMessage = response.choices[0].message;
    let finalMessage = assistantMessage.content || '';
    
    // לוג של התשובה מ-OpenAI
    console.log('═══════════════════════════════════════════════════════');
    console.log('🤖 OPENAI RESPONSE:');
    console.log('═══════════════════════════════════════════════════════');
    console.log('Content:', finalMessage || '(empty)');
    console.log('Tool calls:', assistantMessage.tool_calls?.length || 0);
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      console.log('Tool calls details:', assistantMessage.tool_calls.map((tc: any) => ({
        function: tc.function?.name,
        arguments: tc.function?.arguments
      })));
    }
    console.log('═══════════════════════════════════════════════════════');
    
    const actions: any[] = [];

    // בדיקה אם יש קריאות לכלים
    if (assistantMessage.tool_calls) {
      for (const toolCall of assistantMessage.tool_calls) {
        if (toolCall.type !== 'function') continue;
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);

        actions.push({
          type: functionName,
          params: functionArgs
        });

        // הוספת הסבר על הפעולה להודעה
        if (lang === 'he') {
          if (functionName === 'pauseCampaign') {
            finalMessage += `\n\n✅ ביצעתי עצירה של קמפיין ${functionArgs.id}`;
          } else if (functionName === 'updateBudget') {
            finalMessage += `\n\n✅ עדכנתי תקציב של קמפיין ${functionArgs.id} ל-${functionArgs.amount}`;
          } else if (functionName === 'sendWhatsAppToLead') {
            finalMessage += `\n\n✅ פתחתי וואטסאפ ל-${functionArgs.phone}`;
          }
        } else {
          if (functionName === 'pauseCampaign') {
            finalMessage += `\n\n✅ I paused campaign ${functionArgs.id}`;
          } else if (functionName === 'updateBudget') {
            finalMessage += `\n\n✅ I updated campaign ${functionArgs.id} budget to ${functionArgs.amount}`;
          } else if (functionName === 'sendWhatsAppToLead') {
            finalMessage += `\n\n✅ I opened WhatsApp for ${functionArgs.phone}`;
          }
        }
      }
    }

    res.json({
      message: finalMessage,
      actions: actions
    });
  } catch (error: any) {
    console.error('AI Chat Error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to process chat message' 
    });
  }
});

// Campaign Pause Endpoint
app.post('/api/facebook/campaigns/:campaignId/pause', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const accessToken = (req.user as any).accessToken;
  const campaignId = req.params.campaignId;

  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${campaignId}?status=PAUSED&access_token=${accessToken}`,
      { method: 'POST' }
    );
    
    const data = await response.json();
    
    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }
    
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Campaign Budget Update Endpoint
app.post('/api/facebook/campaigns/:campaignId/budget', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const accessToken = (req.user as any).accessToken;
  const campaignId = req.params.campaignId;
  const { budget } = req.body;

  try {
    // הערה: עדכון תקציב בפייסבוק דורש עדכון של Ad Set, לא הקמפיין עצמו
    // כאן זה דוגמה - ייתכן שתצטרך להתאים לפי המבנה שלך
    // ננסה לעדכן את הקמפיין עם daily_budget
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${campaignId}?daily_budget=${budget}&access_token=${accessToken}`,
      { method: 'POST' }
    );
    
    const data = await response.json();
    
    if (data.error) {
      // אם זה לא עובד, נחזיר שגיאה אבל נסמן שהפעולה נרשמה
      console.warn('Budget update may require Ad Set update:', data.error.message);
      return res.status(400).json({ 
        error: data.error.message,
        note: 'Budget updates typically require updating the Ad Set, not the campaign directly'
      });
    }
    
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📝 Facebook OAuth callback URL: ${facebookRedirectUri || 'NOT SET'}`);
  console.log(`🔗 Facebook OAuth URL: http://localhost:${PORT}/auth/facebook`);
  
  if (!facebookAppId || !facebookAppSecret || !facebookRedirectUri) {
    console.warn('⚠️  WARNING: Facebook OAuth is not fully configured!');
    console.warn('   Please check your .env file and ensure all required variables are set.');
  }
});
