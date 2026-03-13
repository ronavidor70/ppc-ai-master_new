import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import OpenAI from 'openai';
import { fal } from '@fal-ai/client';
import crypto from 'crypto';

declare module 'express-session' {
  interface SessionData {
    shopifyState?: string;
    shopifyShop?: string;
    shopifyAccessToken?: string;
    shopifyStoreName?: string;
  }
}

const sessionMiddleware = session as unknown as (opts: session.SessionOptions) => express.RequestHandler;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Fal.ai (Flux image generation)
fal.config({
  credentials: process.env.FAL_KEY,
});

// בדיקת משתני סביבה בתחילת הקובץ
const facebookAppId = process.env.FACEBOOK_APP_ID;
const facebookAppSecret = process.env.FACEBOOK_APP_SECRET;
const facebookRedirectUri = process.env.FACEBOOK_REDIRECT_URI;
const sessionSecret = process.env.SESSION_SECRET;

// Facebook OAuth scopes – used by passport.authenticate('facebook', { scope: [...] })
// leads_retrieval is NOT included: it requires App Review approval. Use ADVANCED_FACEBOOK_SCOPES
// only after Facebook grants the leads_retrieval permission.
const BASE_FACEBOOK_SCOPES = [
  'public_profile',
  'email',
  'ads_management',
  'ads_read',
  'business_management',
  'pages_manage_ads',
  'pages_read_engagement',
  'pages_show_list',
] as const;
// For future use after App Review: switch passport.authenticate to use this instead.
const ADVANCED_FACEBOOK_SCOPES = [
  ...BASE_FACEBOOK_SCOPES,
  'leads_retrieval', // enable only after Facebook App Review approves leads_retrieval
] as const;

// Shopify OAuth Configuration
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SHOPIFY_REDIRECT_URI = process.env.SHOPIFY_REDIRECT_URI || 'http://localhost:5001/auth/shopify/callback';
const SHOPIFY_SCOPES = 'read_products,read_orders,read_analytics,read_customers';

// Store Shopify tokens in session (in production, use a database)
const shopifySessions = new Map<string, { accessToken: string; shop: string; storeName?: string }>();

// לוגים לאבחון
console.log('🔍 Environment Variables Check:');
console.log('Facebook App ID:', facebookAppId ? facebookAppId.substring(0, 5) + '...' : '❌ NOT SET');
console.log('Facebook App Secret:', facebookAppSecret ? '***' + facebookAppSecret.substring(facebookAppSecret.length - 4) : '❌ NOT SET');
console.log('Facebook Redirect URI:', facebookRedirectUri || '❌ NOT SET');
console.log('Session Secret:', sessionSecret ? 'SET' : '❌ NOT SET');
console.log('FAL_KEY:', process.env.FAL_KEY ? (process.env.FAL_KEY.substring(0, 8) + '...' + process.env.FAL_KEY.slice(-4)) : '❌ NOT SET');

// Frontend URL for redirects (OAuth callbacks, etc.)
const FRONTEND_URL = process.env.VITE_FRONTEND_URL || 'https://ppc-ai-master-new.onrender.com';

// CORS - אפשר גישה מ-frontend (ב-production השתמש ב-FRONTEND_URL או CORS_ORIGIN)
const corsOrigin = process.env.CORS_ORIGIN || process.env.FRONTEND_URL || process.env.VITE_FRONTEND_URL || FRONTEND_URL;
app.use(cors({
  origin: corsOrigin,
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true })); // הוספתי - חשוב ל-OAuth callbacks

// Session setup
app.use(sessionMiddleware({
  secret: sessionSecret || 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false,
    httpOnly: true, 
    maxAge: 24 * 60 * 60 * 1000
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

function formatDateInTimezone(dateStr: string, timezone: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    
    return new Intl.DateTimeFormat('en-CA', { 
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  } catch (e) {
    console.warn('Error formatting date in timezone:', e);
    return dateStr;
  }
}

// Rate Limiting and Retry Logic for Facebook API
const requestQueue: Array<{ resolve: Function; reject: Function; url: string }> = [];
let isProcessingQueue = false;
const MIN_DELAY_BETWEEN_REQUESTS = 200; // 200ms between requests (5 requests per second max)
let lastRequestTime = 0;

// Simple in-memory cache (can be replaced with Redis in production)
const apiCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute cache

async function fetchWithRateLimit(url: string, options: RequestInit = {}, useCache: boolean = true): Promise<any> {
  // Check cache first
  if (useCache) {
    const cached = apiCache.get(url);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log('📦 Using cached response for:', url.substring(0, 50) + '...');
      return cached.data;
    }
  }

  return new Promise((resolve, reject) => {
    requestQueue.push({ resolve, reject, url });
    processQueue();
  });

  async function processQueue() {
    if (isProcessingQueue || requestQueue.length === 0) return;
    
    isProcessingQueue = true;
    
    while (requestQueue.length > 0) {
      const { resolve, reject, url: queuedUrl } = requestQueue.shift()!;
      
      // Rate limiting: wait if needed
      const timeSinceLastRequest = Date.now() - lastRequestTime;
      if (timeSinceLastRequest < MIN_DELAY_BETWEEN_REQUESTS) {
        await new Promise(resolve => setTimeout(resolve, MIN_DELAY_BETWEEN_REQUESTS - timeSinceLastRequest));
      }
      
      lastRequestTime = Date.now();
      
      // Retry logic with exponential backoff
      let retries = 0;
      const maxRetries = 3;
      let lastError: any = null;
      
      while (retries <= maxRetries) {
        try {
          console.log(`📡 Facebook API Request (attempt ${retries + 1}/${maxRetries + 1}):`, queuedUrl.substring(0, 80) + '...');
          
          const response = await fetch(queuedUrl, options);
          
          // ✅ תיקון: בדיקת HTTP status code לפני parsing JSON
          if (response.status === 429) {
            // HTTP 429 = Too Many Requests (Rate Limit)
            console.error(`❌ Rate limit exceeded (HTTP 429) - stopping all retry attempts`);
            lastError = new Error('חריגה ממכסת בקשות, אנא המתן מספר דקות');
            lastError.code = 4; // Mark as rate limit error
            lastError.status = 429;
            break; // ✅ עצירה מיידית - ללא retry
          }
          
          const data = await response.json();
          
          // Check for rate limit error in response body
          if (data.error) {
            if (data.error.code === 4 || 
                data.error.message?.includes('rate limit') || 
                data.error.message?.includes('request limit') ||
                data.error.message?.includes('Application request limit reached')) {
              // ✅ תיקון: במקרה של שגיאת Rate Limit (#4), לא ננסה שוב - נחזיר שגיאה מיד
              console.error(`❌ Rate limit exceeded (error #4) - stopping all retry attempts`);
              lastError = new Error('חריגה ממכסת בקשות, אנא המתן מספר דקות');
              lastError.code = 4; // Mark as rate limit error
              lastError.error = data.error; // Preserve error details
              break; // ✅ עצירה מיידית - ללא retry
            } else {
              // Other error
              lastError = new Error(data.error.message || 'Facebook API error');
              lastError.code = data.error.code;
              lastError.error = data.error;
              break;
            }
          }
          
          // Success - cache and return
          if (useCache) {
            apiCache.set(queuedUrl, { data, timestamp: Date.now() });
          }
          
          console.log('✅ Facebook API Request successful');
          resolve(data);
          break;
          
        } catch (error: any) {
          lastError = error;
          
          // ✅ תיקון: בדיקה אם זו שגיאת Rate Limit גם ב-catch
          const errorMessage = error.message || error.toString() || '';
          if (errorMessage.includes('rate limit') || 
              errorMessage.includes('request limit') ||
              errorMessage.includes('Application request limit reached') ||
              errorMessage.includes('(#4)') ||
              error.code === 4) {
            console.error(`❌ Rate limit error detected in catch block - stopping all retry attempts`);
            lastError.code = 4;
            break; // ✅ עצירה מיידית - ללא retry
          }
          
          // If it's a network error and we have retries left, retry with exponential backoff
          if (retries < maxRetries && (error.message?.includes('fetch') || error.code === 'ECONNRESET')) {
            // Exponential backoff for network errors: 1s, 2s, 4s (capped at 10s)
            const backoffDelay = Math.min(1000 * Math.pow(2, retries), 10000);
            console.warn(`⚠️ Network error, retrying in ${backoffDelay}ms...`);
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
            retries++;
            continue;
          }
          
          // No more retries or non-retryable error
          break;
        }
      }
      
      if (lastError) {
        console.error('❌ Facebook API Request failed:', lastError.message);
        reject(lastError);
      }
      
      // Small delay between requests
      if (requestQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, MIN_DELAY_BETWEEN_REQUESTS));
      }
    }
    
    isProcessingQueue = false;
  }
}

// Clear cache function
function clearApiCache() {
  apiCache.clear();
  console.log('🧹 API cache cleared');
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
    scope: [...BASE_FACEBOOK_SCOPES],
  })
);

// Callback - פייסבוק מחזיר לכאן
app.get('/auth/facebook/callback',
  (req, res, next) => {
    console.log('📥 Facebook callback received');
    console.log('Query params:', req.query);
    
    // Check for error in query params (Facebook may return errors here)
    if (req.query.error) {
      console.error('❌ Facebook OAuth error:', req.query.error);
      const errorCode = String(req.query.error_code || '');
      const errorReason = String(req.query.error_reason || '');
      
      // Check if it's a rate limit error
      if (errorCode === '4' || errorReason.includes('rate') || errorReason.includes('limit')) {
        console.error('⚠️ Rate limit error detected in OAuth callback');
        return res.redirect(`${FRONTEND_URL}/?error=rate_limit_exceeded`);
      }
      
      // Generic OAuth error
      return res.redirect(`${FRONTEND_URL}/?error=oauth_failed`);
    }
    
    next();
  },
  // ✅ תיקון: הוספת error handler מותאם אישית ל-passport.authenticate
  (req, res, next) => {
    passport.authenticate('facebook', { 
      session: true
    }, (err: any, user: any, info: any) => {
      // ✅ טיפול בשגיאות מ-passport
      if (err) {
        console.error('❌ Passport authentication error:', err);
        
        // ✅ בדיקה אם זו שגיאת Rate Limit (#4)
        const errorMessage = err.message || err.toString() || '';
        const errorCode = err.code || err.error?.code || err.error_code;
        
        if (errorCode === 4 || 
            errorMessage.includes('Application request limit reached') ||
            errorMessage.includes('rate limit') ||
            errorMessage.includes('request limit') ||
            errorMessage.includes('(#4)')) {
          console.error('⚠️ Rate limit error (#4) detected in passport authentication');
          return res.redirect(`${FRONTEND_URL}/?error=rate_limit_exceeded`);
        }
        
        // שגיאות אחרות
        console.error('❌ Other authentication error:', errorMessage);
        return res.redirect(`${FRONTEND_URL}/?error=authentication_failed`);
      }
      
      // ✅ אם אין user, זה כנראה failure
      if (!user) {
        console.error('❌ Authentication failed - no user returned');
        const infoMessage = info?.message || '';
        
        // בדיקה אם זו שגיאת Rate Limit ב-info
        if (infoMessage.includes('rate limit') || 
            infoMessage.includes('request limit') ||
            infoMessage.includes('(#4)')) {
          console.error('⚠️ Rate limit error detected in info');
          return res.redirect(`${FRONTEND_URL}/?error=rate_limit_exceeded`);
        }
        
        return res.redirect(`${FRONTEND_URL}/?error=authentication_failed`);
      }
      
      // ✅ הצלחה - המשך ל-login
      req.logIn(user, (loginErr) => {
        if (loginErr) {
          console.error('❌ Error during login:', loginErr);
          return res.redirect(`${FRONTEND_URL}/?error=login_failed`);
        }
        
        // המשך ל-handler הבא
        next();
      });
    })(req, res, next);
  },
  async (req, res, next) => {
    try {
      console.log('✅ Facebook authentication successful');
      console.log('👤 User:', (req.user as any)?.name);
      
      // שמירת ה-Session באופן מפורש לפני המעבר דף
      req.session.save((err) => {
        if (err) {
          console.error('❌ Error saving session:', err);
          return res.redirect(`${FRONTEND_URL}/?error=session_save`);
        }
        console.log('💾 Session saved, redirecting to dashboard...');
        // הוספת פרמטר שיאותת ל-Frontend שההתחברות הצליחה
        // NOTE: We do NOT fetch any data here - only establish session and redirect
        res.redirect(`${FRONTEND_URL}/?auth_success=true`);
      });
    } catch (error: any) {
      console.error('❌ Error in OAuth callback handler:', error);
      
      // Check if it's a rate limit error
      if (error.message?.includes('rate limit') || 
          error.message?.includes('request limit') || 
          error.message?.includes('Application request limit reached') ||
          error.code === 4 ||
          error.error?.code === 4) {
        console.error('⚠️ Rate limit error detected in callback handler');
        return res.redirect(`${FRONTEND_URL}/?error=rate_limit_exceeded`);
      }
      
      // Generic error
      return res.redirect(`${FRONTEND_URL}/?error=callback_error`);
    }
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
  const businessId = req.query.businessId as string | undefined;
  
  try {
    let targetBusinessId = businessId;
    
    // אם לא צוין businessId – נביא חשבונות מכל ה-Business Managers (כדי שהמשתמש יראה את החשבון שבחר גם במסך קמפיינים וגם במסך ביצועים)
    if (!targetBusinessId) {
      const businessesData = await fetchWithRateLimit(
        `https://graph.facebook.com/v19.0/me/businesses?fields=id,name&access_token=${accessToken}`,
        {},
        true
      );

      if (businessesData.error) {
        return res.status(400).json({ error: businessesData.error.message });
      }

      const businesses = businessesData.data || [];
      const seenIds = new Set<string>();
      const allAccounts: any[] = [];

      if (businesses.length > 0) {
        for (const business of businesses) {
          const bid = business.id;
          let data = await fetchWithRateLimit(
            `https://graph.facebook.com/v19.0/${bid}/owned_ad_accounts?fields=name,account_id,currency,account_status,timezone_name&access_token=${accessToken}`,
            {},
            true
          );
          if (data.error && (data.error.code === 200 || data.error.code === 10)) {
            data = await fetchWithRateLimit(
              `https://graph.facebook.com/v19.0/${bid}/client_ad_accounts?fields=name,account_id,currency,account_status,timezone_name&access_token=${accessToken}`,
              {},
              true
            );
          }
          const list = data.data || [];
          for (const acc of list) {
            const aid = acc.account_id || acc.id;
            if (aid && !seenIds.has(aid)) {
              seenIds.add(aid);
              allAccounts.push(acc);
            }
          }
        }
      }

      if (allAccounts.length > 0) {
        return res.json(allAccounts);
      }

      // Fallback: אין Business Managers או אין חשבונות – me/adaccounts
      const fallbackData = await fetchWithRateLimit(
        `https://graph.facebook.com/v19.0/me/adaccounts?fields=name,account_id,currency,account_status,timezone_name&access_token=${accessToken}`,
        {},
        true
      );
      if (fallbackData.error) {
        return res.status(400).json({ error: fallbackData.error.message });
      }
      return res.json(fallbackData.data || []);
    }
    
    const data = await fetchWithRateLimit(
      `https://graph.facebook.com/v19.0/${targetBusinessId}/owned_ad_accounts?fields=name,account_id,currency,account_status,timezone_name&access_token=${accessToken}`,
      {},
      true
    );
    
    if (data.error) {
      if (data.error.code === 200 || data.error.code === 10) {
        const fallbackData = await fetchWithRateLimit(
          `https://graph.facebook.com/v19.0/${targetBusinessId}/client_ad_accounts?fields=name,account_id,currency,account_status,timezone_name&access_token=${accessToken}`,
          {},
          true
        );
        
        if (fallbackData.error) {
          return res.status(400).json({ error: fallbackData.error.message });
        }
        
        const accounts = fallbackData.data || [];
        return res.json(accounts);
      }
      
      return res.status(400).json({ error: data.error.message });
    }
    
    const accounts = data.data || [];
    res.json(accounts);
  } catch (error: any) {
    // Check if it's a rate limit error
    if (error.code === 4 || error.message?.includes('rate limit') || error.message?.includes('Rate limit')) {
      console.error('⚠️ Rate limit error in adaccounts endpoint:', error.message);
      return res.status(429).json({ 
        error: 'Rate limit exceeded. Please try again in a few minutes.',
        code: 4,
        retryAfter: 60
      });
    }
    
    res.status(500).json({ error: error.message || 'Failed to fetch ad accounts' });
  }
});

// API: קבלת Business Managers
app.get('/api/facebook/businesses', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const accessToken = (req.user as any).accessToken;
  
  try {
    const data = await fetchWithRateLimit(
      `https://graph.facebook.com/v19.0/me/businesses?fields=id,name&access_token=${accessToken}`,
      {},
      true
    );
    
    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }
    const businesses = data.data || [];
    res.json(businesses);
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
    const data = await fetchWithRateLimit(
      `https://graph.facebook.com/v19.0/me/accounts?access_token=${accessToken}`,
      {},
      true
    );
    
    if (data.error) {
      // Check if it's a rate limit error
      if (data.error.code === 4 || data.error.message?.includes('rate limit') || data.error.message?.includes('request limit')) {
        console.error('⚠️ Rate limit error in pages endpoint:', data.error.message);
        return res.status(429).json({ 
          error: 'Rate limit exceeded. Please try again in a few minutes.',
          code: 4,
          retryAfter: 60
        });
      }
      return res.status(400).json({ error: data.error.message });
    }
    
    res.json(data.data || []);
  } catch (error: any) {
    // Check if it's a rate limit error
    if (error.code === 4 || error.message?.includes('rate limit') || error.message?.includes('Rate limit')) {
      console.error('⚠️ Rate limit error in pages endpoint:', error.message);
      return res.status(429).json({ 
        error: 'Rate limit exceeded. Please try again in a few minutes.',
        code: 4,
        retryAfter: 60
      });
    }
    res.status(500).json({ error: error.message || 'Failed to fetch pages' });
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
    const data = await fetchWithRateLimit(
      `https://graph.facebook.com/v19.0/act_${accountId}/campaigns?fields=id,name,status,objective,created_time,updated_time&access_token=${accessToken}`,
      {},
      false // Don't cache campaigns - they change frequently
    );
    
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
    const campaignsData = await fetchWithRateLimit(
      `https://graph.facebook.com/v19.0/act_${accountId}/campaigns?fields=id,name,status&access_token=${accessToken}`,
      {},
      false
    );
    
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
        const adSetsData = await fetchWithRateLimit(
          `https://graph.facebook.com/v19.0/${campaign.id}/adsets?fields=id,name&access_token=${accessToken}`,
          {},
          false
        );
        
        if (adSetsData.error) continue;
        
        const adSets = adSetsData.data || [];
        
        // עבור כל Ad Set, מצא Ads
        for (const adSet of adSets) {
          const adsData = await fetchWithRateLimit(
            `https://graph.facebook.com/v19.0/${adSet.id}/ads?fields=id,name,creative&access_token=${accessToken}`,
            {},
            false
          );
          
          if (adsData.error) continue;
          
          const ads = adsData.data || [];
          
          // עבור כל Ad, בדוק אם יש Lead Form
          for (const ad of ads) {
            if (ad.creative && ad.creative.object_story_spec) {
              const leadgenId = ad.creative.object_story_spec?.link_data?.call_to_action?.value?.lead_gen_form_id;
              
              if (leadgenId) {
                // משיכת לידים מה-Lead Form
                const leadsData = await fetchWithRateLimit(
                  `https://graph.facebook.com/v19.0/${leadgenId}/leads?fields=id,created_time,field_data&access_token=${accessToken}`,
                  {},
                  false
                );
                
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

// ─── Unified Metrics Helpers (server-side) ───────────────────────────────────
// These mirror services/metaMetrics.ts; kept inline here because server/index.ts
// is a Node process that does not share the Vite/frontend module graph.

// Aligned with metaMetrics.ts – single source of truth for action types
const LEAD_TYPES_SERVER = new Set([
  'lead', 'omni_lead', 'onsite_conversion.lead_grouped', 'onsite_conversion.lead',
  'offsite_conversion.fb_pixel_lead', 'offsite_conversion.lead',
  'fb_lead_gen_form_submit', 'lead_gen_form_submit', 'submit_application',
  'complete_registration', 'contact'
]);

const PURCHASE_TYPES_SERVER = new Set([
  'purchase', 'omni_purchase', 'onsite_conversion.purchase',
  'offsite_conversion.fb_pixel_purchase', 'offsite_conversion.purchase',
  'fb_mobile_purchase', 'fb_offsite_conversion_purchase'
]);

const WHATSAPP_TYPES_SERVER = new Set([
  'onsite_conversion.messaging_first_reply', 'onsite_conversion.messaging_conversation_started_7d',
  'messaging_conversation_started_7d', 'messaging_conversation_started', 'omni_click_to_whatsapp', 'whatsapp_message',
]);

function isWhatsAppServer(a: any): boolean {
  const type = a.action_type || '';
  const url  = (a.url || '').toLowerCase();
  const bd   = (a.action_breakdowns || '').toLowerCase();
  if (WHATSAPP_TYPES_SERVER.has(type)) return true;
  if (type === 'contact' && (bd === 'whatsapp' || url.includes('wa.me') || url.includes('whatsapp.com'))) return true;
  if (type === 'lead' && (url.includes('wa.me') || url.includes('whatsapp.com'))) return true;
  return false;
}

/**
 * Build unified metrics from a flat actions array.
 * Handles omni_lead, omni_purchase, and all known conversion variants.
 */
function calculateUnifiedMetrics(actions: any[]): { whatsapp: number; leads: number; purchases: number } {
  const result = { whatsapp: 0, leads: 0, purchases: 0 };
  for (const a of (actions || [])) {
    const val = parseInt(a.value || '0');
    if (val === 0) continue;
    const type = a.action_type || '';
    if (isWhatsAppServer(a)) {
      result.whatsapp += val;
    } else if (PURCHASE_TYPES_SERVER.has(type)) {
      result.purchases += val;
    } else if (LEAD_TYPES_SERVER.has(type)) {
      result.leads += val;
    }
  }
  return result;
}

/**
 * Safely sum spend from daily rows.
 * Deduplicates by date_start to guard against legacy responses that included
 * action_breakdowns=action_type (which creates N rows per day, all with the
 * same spend value, inflating totals by the number of action types).
 */
function sumSpendSafelyServer(rows: any[]): number {
  const byDate = new Map<string, number>();
  for (const row of (rows || [])) {
    const date  = row.date_start ?? row.date_stop ?? 'unknown';
    const spend = parseFloat(row.spend || '0');
    byDate.set(date, Math.max(byDate.get(date) ?? 0, spend));
  }
  let total = 0;
  byDate.forEach(v => { total += v; });
  return total;
}

/**
 * Merge per-row actions arrays into a single deduplicated list (sum per type).
 * Safe to call after removing action_breakdowns from the query.
 */
function mergeActionsServer(rows: any[]): any[] {
  const map = new Map<string, number>();
  for (const row of (rows || [])) {
    for (const a of (row.actions || [])) {
      const type = a.action_type || '';
      map.set(type, (map.get(type) ?? 0) + parseInt(a.value || '0'));
    }
  }
  return Array.from(map.entries()).map(([action_type, value]) => ({ action_type, value: String(value) }));
}

function mergeActionValuesServer(rows: any[]): any[] {
  const map = new Map<string, number>();
  for (const row of (rows || [])) {
    for (const av of (row.action_values || [])) {
      const type = av.action_type || '';
      map.set(type, (map.get(type) ?? 0) + parseFloat(av.value || '0'));
    }
  }
  return Array.from(map.entries()).map(([action_type, value]) => ({ action_type, value: String(value) }));
}

/** Count total leads from a flat actions array (all lead variants). */
function countLeads(actions: any[]): number {
  const LEAD_TYPES_FOR_COUNT = new Set([
    'lead', 'omni_lead', 'onsite_conversion.lead_grouped', 'onsite_conversion.lead',
    'offsite_conversion.fb_pixel_lead', 'offsite_conversion.lead',
    'fb_lead_gen_form_submit', 'lead_gen_form_submit',
    'submit_application', 'complete_registration',
  ]);
  let total = 0;
  for (const a of (actions || [])) {
    if (LEAD_TYPES_FOR_COUNT.has(a.action_type || '')) {
      total += parseInt(a.value || '0');
    }
  }
  return total;
}

// Meta Insights API constants
// action_breakdowns=action_type is intentionally EXCLUDED – it creates multiple
// rows per day (one per action_type), each with the same full-day spend, causing
// the fallback sum path to inflate spend by the number of distinct action types.
const META_FIELDS   = 'spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions,action_values';
// Attribution windows match the Ads Manager default: 7-day click + 1-day view.
const META_ATTR_WIN = '["7d_click","1d_view"]';

// Helper: process raw Facebook campaign insights response into our API shape (used by single + batch)

function processOneCampaignInsights(data: any, currency: string): any {
  const summary        = data?.summary || {};
  const hasValidSummary = Object.keys(summary).length > 0 && summary.spend !== undefined;

  // ── Path A: Facebook provided a summary (preferred – no deduplication needed) ──
  if (hasValidSummary) {
    const finalSpend       = parseFloat(summary.spend || '0');
    const finalImpressions = parseInt(summary.impressions || '0');
    const finalClicks      = parseInt(summary.clicks || '0');
    const finalActions     = summary.actions || [];
    const finalActionValues = summary.action_values || [];
    const finalCtr         = parseFloat(summary.ctr || '0');
    const finalCpc         = parseFloat(summary.cpc || '0');
    const finalCpm         = parseFloat(summary.cpm || '0');
    const finalReach       = parseInt(summary.reach || '0');
    const finalFrequency   = parseFloat(summary.frequency || '0');
    const unified_metrics  = calculateUnifiedMetrics(finalActions);
    // Single source of truth: leads from unified_metrics (aligned with Ads Manager lead/contact/WhatsApp split)
    const conversions = unified_metrics.leads + unified_metrics.whatsapp + unified_metrics.purchases;
    return {
      spend: finalSpend, impressions: finalImpressions, clicks: finalClicks,
      ctr: finalCtr, cpc: finalCpc, cpm: finalCpm,
      leads: unified_metrics.leads, conversions, unified_metrics,
      actions: finalActions, action_values: finalActionValues,
      reach: finalReach, frequency: finalFrequency,
      cpl: unified_metrics.leads > 0 ? finalSpend / unified_metrics.leads : 0,
      summary, currency, daily: data.data,
    };
  }

  // ── Path B: Fallback – aggregate from daily rows ──────────────────────────
  const allDataRows    = data?.data || [];
  // sumSpendSafelyServer deduplicates by date_start to prevent inflation
  const totalSpend     = sumSpendSafelyServer(allDataRows);
  let totalImpressions = 0, totalClicks = 0;
  allDataRows.forEach((row: any) => {
    totalImpressions += parseInt(row.impressions || '0');
    totalClicks      += parseInt(row.clicks      || '0');
  });

  // Merge per-row actions into a single deduplicated list
  const allActions      = mergeActionsServer(allDataRows);
  const allActionValues = mergeActionValuesServer(allDataRows);

  const firstRow       = allDataRows[0] || {};
  const finalCtr       = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : parseFloat(firstRow.ctr || '0');
  const finalCpc       = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const finalCpm       = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
  const finalReach     = parseInt(firstRow.reach || '0');
  const finalFrequency = parseFloat(firstRow.frequency || '0');
  const unified_metrics = calculateUnifiedMetrics(allActions);
  const conversions     = unified_metrics.leads + unified_metrics.whatsapp + unified_metrics.purchases;
  return {
    spend: totalSpend, impressions: totalImpressions, clicks: totalClicks,
    ctr: finalCtr, cpc: finalCpc, cpm: finalCpm,
    leads: unified_metrics.leads, conversions, unified_metrics,
    actions: allActions, action_values: allActionValues,
    reach: finalReach, frequency: finalFrequency,
    cpl: unified_metrics.leads > 0 ? totalSpend / unified_metrics.leads : 0,
    summary: {}, currency, daily: data.data,
  };
}

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
        const accountData = await fetchWithRateLimit(
          `https://graph.facebook.com/v19.0/act_${cleanAccountId}?fields=timezone_name,currency&access_token=${accessToken}`,
          {},
          true // Cache account info
        );
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

    const timeRange = JSON.stringify({ 
      since: formatDateInTimezone(startDate, timezone), 
      until: formatDateInTimezone(endDate, timezone) 
    });

    // action_breakdowns=action_type is intentionally absent – see META_FIELDS comment above.
    // Attribution windows match Ads Manager default (7d_click + 1d_view).
    const url = `https://graph.facebook.com/v19.0/${campaignId}/insights?level=campaign&fields=${META_FIELDS}&time_range=${encodeURIComponent(timeRange)}&action_attribution_windows=${encodeURIComponent(META_ATTR_WIN)}&use_unified_attribution_setting=true&time_increment=1&include_summary=true&access_token=${accessToken}`;
    
    console.log(`🔍 Fetching insights for campaign ${campaignId} from ${startDate} to ${endDate}...`);
    console.log(`🌍 Timezone: ${timezone}`);
    console.log(`💰 Currency: ${currency}`);
    console.log(`📊 URL: ${url.replace(accessToken, 'TOKEN_HIDDEN')}`);
    
    const data = await fetchWithRateLimit(url, {}, false); // Don't cache insights
    
    if (data.error) {
      console.error('❌ Facebook API Error:', data.error.message);
      return res.status(400).json({ error: data.error.message });
    }
    
    console.log(`📊 Insights data received for campaign ${campaignId}:`, data.data?.length ? `Data found (${data.data.length} rows)` : 'Empty array');
    
    return res.json(processOneCampaignInsights(data, currency));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// API: משיכת ביצועים של מספר קמפיינים בבקשה אחת (Facebook Batch API) - מקצר טעינה
const FACEBOOK_BATCH_LIMIT = 50;
app.post('/api/facebook/campaigns/insights/batch', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const accessToken = (req.user as any).accessToken;
  const { accountId, startDate, endDate, campaignIds } = req.body as { accountId: string; startDate: string; endDate: string; campaignIds: string[] };
  if (!accountId || !startDate || !endDate || !Array.isArray(campaignIds) || campaignIds.length === 0) {
    return res.status(400).json({ error: 'accountId, startDate, endDate and campaignIds array are required' });
  }
  const ids = campaignIds.slice(0, FACEBOOK_BATCH_LIMIT);
  try {
    let timezone = 'America/Los_Angeles';
    let currency = 'USD';
    let cleanAccountId = accountId.startsWith('act_') ? accountId.slice(4) : accountId;
    try {
      const accountData = await fetchWithRateLimit(
        `https://graph.facebook.com/v19.0/act_${cleanAccountId}?fields=timezone_name,currency&access_token=${accessToken}`,
        {},
        true
      );
      if (accountData.timezone_name) timezone = accountData.timezone_name;
      if (accountData.currency) currency = accountData.currency;
    } catch (_) {}
    const timeRange = JSON.stringify({ 
      since: formatDateInTimezone(startDate, timezone), 
      until: formatDateInTimezone(endDate, timezone) 
    });
    // action_breakdowns=action_type excluded (see META_FIELDS). Attribution = Ads Manager default.
    const batch = ids.map((campaignId: string) => ({
      method: 'GET',
      relative_url: `${campaignId}/insights?level=campaign&fields=${META_FIELDS}&time_range=${encodeURIComponent(timeRange)}&action_attribution_windows=${encodeURIComponent(META_ATTR_WIN)}&use_unified_attribution_setting=true&time_increment=1&include_summary=true`
    }));
    const body = new URLSearchParams({ access_token: accessToken, batch: JSON.stringify(batch) }).toString();
    const timeSinceLast = Date.now() - lastRequestTime;
    if (timeSinceLast < MIN_DELAY_BETWEEN_REQUESTS) {
      await new Promise(r => setTimeout(r, MIN_DELAY_BETWEEN_REQUESTS - timeSinceLast));
    }
    lastRequestTime = Date.now();
    const response = await fetch(`https://graph.facebook.com/v19.0/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    const batchResponses = await response.json();
    if (batchResponses.error) {
      return res.status(400).json({ error: batchResponses.error.message });
    }
    const insights: Record<string, any> = {};
    (batchResponses as any[]).forEach((item: any, index: number) => {
      const campaignId = ids[index];
      if (item.code !== 200 || !item.body) {
        return;
      }
      try {
        const data = JSON.parse(item.body);
        if (data.error) return;
        insights[campaignId] = processOneCampaignInsights(data, currency);
      } catch (_) {}
    });
    console.log(`✅ Batch insights: ${Object.keys(insights).length}/${ids.length} campaigns for account ${accountId}`);
    res.json({ insights });
  } catch (error: any) {
    console.error('Batch insights error:', error);
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
  const originalAccountId = accountId;
  if (accountId.startsWith('act_')) {
    accountId = accountId.substring(4);
  }
  
  // ✅ לוג למעקב
  console.log(`🔍 Fetching data for Account ID: ${accountId}`);
  console.log(`🔍 Fetching account insights for: act_${accountId} (${startDate} to ${endDate})`);
  
  try {
    // 1. משיכת Timezone ו-Currency של החשבון
    let timezone = 'America/Los_Angeles'; // ברירת מחדל
    let currency = 'USD'; // ברירת מחדל
    try {
      const accountData = await fetchWithRateLimit(
        `https://graph.facebook.com/v19.0/act_${accountId}?fields=timezone_name,currency&access_token=${accessToken}`,
        {},
        true // Cache account info
      );
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

    const timeRange = JSON.stringify({ 
      since: formatDateInTimezone(startDate, timezone), 
      until: formatDateInTimezone(endDate, timezone) 
    });

    // level=account for 1:1 alignment with Ads Manager account-level totals.
    const url = `https://graph.facebook.com/v19.0/act_${accountId}/insights?level=account&fields=${META_FIELDS}&time_range=${encodeURIComponent(timeRange)}&action_attribution_windows=${encodeURIComponent(META_ATTR_WIN)}&use_unified_attribution_setting=true&time_increment=1&include_summary=true&access_token=${accessToken}`;
    
    console.log(`🔍 Fetching insights for account ${accountId} from ${startDate} to ${endDate}...`);
    console.log(`🌍 Timezone: ${timezone}`);
    console.log(`💰 Currency: ${currency}`);
    console.log(`📊 URL: ${url.replace(accessToken, 'TOKEN_HIDDEN')}`);
    
    const data = await fetchWithRateLimit(url, {}, false); // Don't cache insights
    
    if (data.error) {
      console.error('❌ Facebook API Error:', data.error.message);
      
      // ✅ תיקון: טיפול מיוחד בשגיאת Rate Limit (#4)
      if (data.error.code === 4 || 
          data.error.message?.includes('rate limit') || 
          data.error.message?.includes('request limit')) {
        console.error('⚠️ Rate limit exceeded in account insights endpoint');
        return res.status(429).json({ 
          error: 'חריגה ממכסת בקשות, אנא המתן מספר דקות',
          code: 4,
          retryAfter: 60
        });
      }
      
      return res.status(400).json({ error: data.error.message });
    }

    console.log(`📊 Account insights received for ${accountId}: ${data.data?.length ?? 0} daily rows`);

    // Use processOneCampaignInsights for consistent summary→fallback logic
    const result = processOneCampaignInsights(data, currency);

    console.log(`💰 Spend: ${result.spend} ${currency} | Leads: ${result.leads} | Purchases: ${result.unified_metrics?.purchases ?? 0} | WhatsApp: ${result.unified_metrics?.whatsapp ?? 0}`);

    res.json(result);
  } catch (error: any) {
    // ✅ תיקון: טיפול בשגיאת Rate Limit גם ב-catch
    if (error.code === 4 || 
        error.message?.includes('rate limit') || 
        error.message?.includes('Rate limit') ||
        error.message?.includes('request limit')) {
      console.error('⚠️ Rate limit error in account insights catch block');
      return res.status(429).json({ 
        error: 'חריגה ממכסת בקשות, אנא המתן מספר דקות',
        code: 4,
        retryAfter: 60
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// Debug: Meta Insights vs Ads Manager comparison (development only)
app.get('/api/debug/meta-insights', async (req, res) => {
  if (process.env.NODE_ENV === 'production' && process.env.DEBUG_META_INSIGHTS !== 'true') {
    return res.status(404).json({ error: 'Not found' });
  }
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const accessToken = (req.user as any).accessToken;
  const accountId = (req.query.accountId as string)?.replace(/^act_/, '') || req.query.accountId;
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;
  if (!accountId || !startDate || !endDate) {
    return res.status(400).json({
      error: 'accountId, startDate and endDate are required',
      example: '/api/debug/meta-insights?accountId=123&startDate=2025-02-01&endDate=2025-02-28',
    });
  }
  try {
    let timezone = 'America/Los_Angeles';
    let currency = 'USD';
    try {
      const accountData = await fetchWithRateLimit(
        `https://graph.facebook.com/v19.0/act_${accountId}?fields=timezone_name,currency&access_token=${accessToken}`,
        {},
        true
      );
      if (accountData.timezone_name) timezone = accountData.timezone_name;
      if (accountData.currency) currency = accountData.currency;
    } catch (_) {}
    const timeRange = JSON.stringify({ 
      since: formatDateInTimezone(startDate, timezone), 
      until: formatDateInTimezone(endDate, timezone) 
    });
    const url = `https://graph.facebook.com/v19.0/act_${accountId}/insights?level=account&fields=${META_FIELDS}&time_range=${encodeURIComponent(timeRange)}&action_attribution_windows=${encodeURIComponent(META_ATTR_WIN)}&use_unified_attribution_setting=true&time_increment=1&include_summary=true&access_token=${accessToken}`;
    const data = await fetchWithRateLimit(url, {}, false);
    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }
    const result = processOneCampaignInsights(data, currency);
    const um = result.unified_metrics || {};
    const totalConv = (um.leads || 0) + (um.whatsapp || 0) + (um.purchases || 0);
    res.json({
      accountId: `act_${accountId}`,
      timeRange: { startDate, endDate },
      total_spend: result.spend,
      total_impressions: result.impressions,
      total_clicks: result.clicks,
      total_conversions: {
        leads: um.leads ?? 0,
        whatsapp: um.whatsapp ?? 0,
        purchases: um.purchases ?? 0,
        total: totalConv,
      },
      cost_per_result: {
        lead: (um.leads ?? 0) > 0 ? result.spend / (um.leads ?? 0) : null,
        whatsapp: (um.whatsapp ?? 0) > 0 ? result.spend / (um.whatsapp ?? 0) : null,
        purchase: (um.purchases ?? 0) > 0 ? result.spend / (um.purchases ?? 0) : null,
        total: totalConv > 0 ? result.spend / totalConv : null,
      },
      currency,
      _rawSummary: result.summary && Object.keys(result.summary).length ? 'present' : 'aggregated from daily rows',
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Logout
app.get('/auth/logout', (req, res) => {
  req.logout(() => {
    res.json({ success: true });
  });
});

// Creative Studio: generate background image via Fal.ai (Flux)
app.post('/api/creative/image', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (!process.env.FAL_KEY) {
    return res.status(503).json({ error: 'FAL_KEY is not configured on the server' });
  }
  fal.config({ credentials: process.env.FAL_KEY });

  try {
    const { prompt, style, lang } = req.body as {
      prompt: string;
      style?: string;
      lang?: 'he' | 'en';
    };

    if (!prompt) {
      return res.status(400).json({ error: 'Missing prompt' });
    }

    const fullPrompt = [
      'Ultra-realistic commercial background image with no text at all.',
      'Absolutely NO letters, NO typography, NO logos, NO UI, NO watermarks.',
      style ? `Visual style: ${style}.` : '',
      `Scene description (from user, may be Hebrew): ${prompt}`,
    ].filter(Boolean).join(' ');

    fal.config({ credentials: process.env.FAL_KEY });
    const result = await fal.subscribe('fal-ai/flux/schnell', {
      input: {
        prompt: fullPrompt,
        image_size: 'landscape_4_3',
        guidance_scale: 3.5,
        num_inference_steps: 4,
        num_images: 1,
        output_format: 'jpeg',
      },
      logs: false,
    });

    const data = result.data as { images?: Array<{ url?: string }> };
    const imageUrl = data?.images?.[0]?.url;

    if (!imageUrl) {
      console.error('Fal response missing image URL:', data);
      return res.status(500).json({ error: 'No image URL returned from Fal' });
    }

    return res.json({ imageUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to generate image with Fal';
    console.error('Fal image generation error:', err);
    return res.status(500).json({ error: message });
  }
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
    const data = await fetchWithRateLimit(
      `https://graph.facebook.com/v19.0/${campaignId}?status=PAUSED&access_token=${accessToken}`,
      { method: 'POST' },
      false
    );
    
    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }
    
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Campaign Resume Endpoint
app.post('/api/facebook/campaigns/:campaignId/resume', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const accessToken = (req.user as any).accessToken;
  const campaignId = req.params.campaignId;

  try {
    const data = await fetchWithRateLimit(
      `https://graph.facebook.com/v19.0/${campaignId}?status=ACTIVE&access_token=${accessToken}`,
      { method: 'POST' },
      false
    );
    
    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }
    
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Campaign Budget Update Endpoint – Meta requires budget at Ad Set level (in cents)
app.post('/api/facebook/campaigns/:campaignId/budget', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const accessToken = (req.user as any).accessToken;
  const campaignId = req.params.campaignId;
  const { budget } = req.body;

  if (!budget || isNaN(Number(budget))) {
    return res.status(400).json({ error: 'Valid budget amount is required' });
  }

  const budgetCents = Math.round(Number(budget) * 100);

  try {
    const adSetsData = await fetchWithRateLimit(
      `https://graph.facebook.com/v19.0/${campaignId}/adsets?fields=id,daily_budget&access_token=${accessToken}`,
      {},
      false
    );

    if (adSetsData.error || !adSetsData.data || adSetsData.data.length === 0) {
      return res.status(400).json({
        error: adSetsData.error?.message || 'No ad sets found for this campaign',
        note: 'Budget is set per Ad Set. This campaign has no ad sets or the API returned an error.'
      });
    }

    const adSets = adSetsData.data;
    const results: { adSetId: string; success: boolean; error?: string }[] = [];

    for (const adSet of adSets) {
      const data = await fetchWithRateLimit(
        `https://graph.facebook.com/v19.0/${adSet.id}?daily_budget=${budgetCents}&access_token=${accessToken}`,
        { method: 'POST' },
        false
      );
      results.push({
        adSetId: adSet.id,
        success: !data.error,
        error: data.error?.message
      });
    }

    const allOk = results.every(r => r.success);
    if (allOk) {
      res.json({ success: true, updatedAdSets: results.length });
    } else {
      res.status(207).json({
        success: false,
        partial: true,
        results,
        message: 'Some ad sets failed to update'
      });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create Campaign Endpoint – creates a new campaign in Meta
app.post('/api/facebook/campaigns/create', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const accessToken = (req.user as any).accessToken;
  const { accountId, name, objective, status } = req.body;

  if (!accountId || !name || !objective) {
    return res.status(400).json({ error: 'accountId, name, and objective are required' });
  }

  let cleanAccountId = String(accountId).replace(/^act_/, '');

  const validObjectives = [
    'OUTCOME_AWARENESS', 'OUTCOME_ENGAGEMENT', 'OUTCOME_LEADS', 'OUTCOME_SALES', 'OUTCOME_TRAFFIC',
    'LINK_CLICKS', 'CONVERSIONS', 'MESSAGES', 'VIDEO_VIEWS', 'PAGE_LIKES'
  ];
  if (!validObjectives.includes(objective)) {
    return res.status(400).json({ error: `objective must be one of: ${validObjectives.join(', ')}` });
  }

  const campaignStatus = status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED';

  try {
    const params = new URLSearchParams({
      name,
      objective,
      status: campaignStatus,
      access_token: accessToken
    });

    const data = await fetchWithRateLimit(
      `https://graph.facebook.com/v19.0/act_${cleanAccountId}/campaigns`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      },
      false
    );

    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }

    res.json({ success: true, campaignId: data.id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// SHOPIFY OAUTH ROUTES
// ============================================

// Shopify OAuth - Step 1: Redirect to Shopify
app.get('/auth/shopify', (req, res) => {
  if (!SHOPIFY_API_KEY || !SHOPIFY_API_SECRET) {
    return res.status(500).json({ 
      error: 'Shopify OAuth is not configured. Please check your .env file.' 
    });
  }

  // Get shop domain from query or prompt user
  const shop = req.query.shop as string;
  
  if (!shop) {
    // Return HTML form to enter shop domain
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Connect Shopify Store</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 500px; margin: 100px auto; padding: 20px; }
            input { width: 100%; padding: 10px; margin: 10px 0; font-size: 16px; box-sizing: border-box; }
            button { background: #5e8e3e; color: white; padding: 12px 24px; border: none; cursor: pointer; font-size: 16px; width: 100%; }
            button:hover { background: #4a7c2f; }
            .container { background: #f5f5f5; padding: 30px; border-radius: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Connect Your Shopify Store</h2>
            <p>Enter your shop domain (e.g., your-shop.myshopify.com)</p>
            <form method="GET" action="/auth/shopify">
              <input type="text" name="shop" placeholder="your-shop.myshopify.com" required />
              <button type="submit">Connect</button>
            </form>
          </div>
        </body>
      </html>
    `);
  }

  // Clean shop domain
  const cleanShop = shop.replace(/https?:\/\//, '').replace(/\/$/, '');
  if (!cleanShop.endsWith('.myshopify.com')) {
    return res.status(400).json({ error: 'Invalid shop domain. Must end with .myshopify.com' });
  }

  // Generate state for security
  const state = crypto.randomBytes(16).toString('hex');
  req.session.shopifyState = state;
  req.session.shopifyShop = cleanShop;

  // Build OAuth URL
  const authUrl = `https://${cleanShop}/admin/oauth/authorize?` +
    `client_id=${SHOPIFY_API_KEY}&` +
    `scope=${SHOPIFY_SCOPES}&` +
    `redirect_uri=${encodeURIComponent(SHOPIFY_REDIRECT_URI)}&` +
    `state=${state}`;

  console.log(`🛒 Redirecting to Shopify OAuth: ${cleanShop}`);
  res.redirect(authUrl);
});

// Shopify OAuth - Step 2: Callback from Shopify
app.get('/auth/shopify/callback', async (req, res) => {
  try {
    const { code, state, shop } = req.query;

    // Verify state
    if (state !== req.session.shopifyState) {
      console.error('❌ Shopify state mismatch');
      return res.redirect(`${FRONTEND_URL}/?error=shopify_state_mismatch`);
    }

    if (!code || !shop) {
      console.error('❌ Missing code or shop in callback');
      return res.redirect(`${FRONTEND_URL}/?error=shopify_oauth_failed`);
    }

    const shopDomain = shop as string;

    // Exchange code for access token
    const tokenResponse = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code: code
      })
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.json().catch(() => ({ error: 'Unknown error' }));
      console.error('❌ Shopify token exchange failed:', error);
      return res.redirect(`${FRONTEND_URL}/?error=shopify_token_exchange_failed`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Fetch shop info
    let storeName = shopDomain;
    try {
      const shopInfoResponse = await fetch(`https://${shopDomain}/admin/api/2024-01/shop.json`, {
        headers: {
          'X-Shopify-Access-Token': accessToken
        }
      });

      if (shopInfoResponse.ok) {
        const shopInfo = await shopInfoResponse.json();
        storeName = shopInfo.shop?.name || shopDomain;
      }
    } catch (shopInfoError) {
      console.warn('⚠️ Could not fetch shop info, using domain as name');
    }

    // Store in session
    req.session.shopifyAccessToken = accessToken;
    req.session.shopifyShop = shopDomain;
    req.session.shopifyStoreName = storeName;

    // Also store in memory map (for quick access)
    shopifySessions.set(req.sessionID, {
      accessToken,
      shop: shopDomain,
      storeName
    });

    console.log(`✅ Shopify OAuth successful for: ${storeName} (${shopDomain})`);

    // Save session before redirect
    req.session.save((err) => {
      if (err) {
        console.error('❌ Error saving session:', err);
        return res.redirect(`${FRONTEND_URL}/?error=shopify_session_save`);
      }
      res.redirect(`${FRONTEND_URL}/?shopify_success=true`);
    });
  } catch (error: any) {
    console.error('❌ Error in Shopify callback:', error);
    res.redirect(`${FRONTEND_URL}/?error=shopify_callback_error`);
  }
});

// API: Get Shopify token
app.get('/api/shopify/token', (req, res) => {
  const accessToken = req.session.shopifyAccessToken;
  const shop = req.session.shopifyShop;
  const storeName = req.session.shopifyStoreName;

  if (!accessToken || !shop) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  res.json({
    accessToken,
    shop,
    storeName,
    storeUrl: `https://${shop}`
  });
});

// API: Sync store (products, orders, etc.)
app.get('/api/shopify/sync', async (req, res) => {
  const accessToken = req.session.shopifyAccessToken;
  const shop = req.session.shopifyShop;

  if (!accessToken || !shop) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    // Fetch products
    const productsResponse = await fetch(
      `https://${shop}/admin/api/2024-01/products.json?limit=250`,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken
        }
      }
    );

    if (!productsResponse.ok) {
      throw new Error('Failed to fetch products');
    }

    const productsData = await productsResponse.json();
    const products = productsData.products || [];

    // Fetch recent orders (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const createdAtMin = thirtyDaysAgo.toISOString();

    const ordersResponse = await fetch(
      `https://${shop}/admin/api/2024-01/orders.json?limit=250&status=any&created_at_min=${createdAtMin}`,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken
        }
      }
    );

    let orders: any[] = [];
    let revenue = 0;
    let totalOrders = 0;

    if (ordersResponse.ok) {
      const ordersData = await ordersResponse.json();
      orders = ordersData.orders || [];
      totalOrders = orders.length;
      revenue = orders.reduce((sum, order) => {
        return sum + parseFloat(order.total_price || '0');
      }, 0);
    }

    res.json({
      products,
      orders,
      revenue,
      totalOrders,
      syncedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('❌ Shopify sync error:', error);
    res.status(500).json({ error: error.message || 'Failed to sync store' });
  }
});

// API: Get products
app.get('/api/shopify/products', async (req, res) => {
  const accessToken = req.session.shopifyAccessToken;
  const shop = req.session.shopifyShop;

  if (!accessToken || !shop) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const response = await fetch(
      `https://${shop}/admin/api/2024-01/products.json?limit=250`,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken
        }
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch products');
    }

    const data = await response.json();
    res.json(data.products || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// API: Get orders
app.get('/api/shopify/orders', async (req, res) => {
  const accessToken = req.session.shopifyAccessToken;
  const shop = req.session.shopifyShop;
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;

  if (!accessToken || !shop) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    let url = `https://${shop}/admin/api/2024-01/orders.json?limit=250&status=any`;
    
    if (startDate) {
      url += `&created_at_min=${startDate}`;
    }
    if (endDate) {
      url += `&created_at_max=${endDate}`;
    }

    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': accessToken
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch orders');
    }

    const data = await response.json();
    res.json(data.orders || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// API: Get analytics
app.get('/api/shopify/analytics', async (req, res) => {
  const accessToken = req.session.shopifyAccessToken;
  const shop = req.session.shopifyShop;
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;

  if (!accessToken || !shop) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    // Fetch orders in date range
    let url = `https://${shop}/admin/api/2024-01/orders.json?limit=250&status=any`;
    if (startDate) url += `&created_at_min=${startDate}`;
    if (endDate) url += `&created_at_max=${endDate}`;

    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': accessToken
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch analytics');
    }

    const data = await response.json();
    const orders = data.orders || [];

    const revenue = orders.reduce((sum: number, order: any) => {
      return sum + parseFloat(order.total_price || '0');
    }, 0);

    const ordersCount = orders.length;
    const averageOrderValue = ordersCount > 0 ? revenue / ordersCount : 0;

    // Note: Conversion rate would require additional data (sessions, visitors)
    // For now, we'll return 0 or calculate from other sources
    const conversionRate = 0; // Placeholder

    res.json({
      revenue,
      orders: ordersCount,
      averageOrderValue,
      conversionRate
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Shopify Logout
app.get('/auth/shopify/logout', (req, res) => {
  shopifySessions.delete(req.sessionID);
  delete req.session.shopifyAccessToken;
  delete req.session.shopifyShop;
  delete req.session.shopifyStoreName;
  res.json({ success: true });
});

// Serve static files from Vite build
app.use(express.static(path.join(__dirname, '../dist')));

// Catch-all: serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist', 'index.html'));
});

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
