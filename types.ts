
export enum Platform {
  FACEBOOK = 'Facebook',
  GOOGLE = 'Google',
  LINKEDIN = 'LinkedIn',
  INSTAGRAM = 'Instagram',
  TABOOLA = 'Taboola',
  X = 'X (Twitter)',
  TIKTOK = 'TikTok',
  WHATSAPP = 'WhatsApp'
}

export type Language = 'en' | 'he' | 'ar' | 'ru' | 'fr' | 'es';

export enum CampaignStatus {
  DRAFT = 'Draft',
  ACTIVE = 'Active',
  PAUSED = 'Paused',
  OPTIMIZING = 'Optimizing'
}

export enum LeadStatus {
  NEW = 'New',
  CONTACTED = 'Contacted',
  QUALIFIED = 'Qualified',
  WON = 'Won',
  LOST = 'Lost'
}

export interface MetaAdAccount {
  id: string;
  name: string;
  account_id: string;
  currency: string;
  account_status: number;
}

export interface MetaPage {
  id: string;
  name: string;
  access_token: string;
  category: string;
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: LeadStatus;
  campaignId: string;
  campaignName: string;
  value: number;
  createdAt: string;
  notes?: string;
  aiScore?: number;
  aiInsight?: string;
}

export type PlanId = 'free' | 'pro' | 'business';

export interface Plan {
  id: PlanId;
  name: string;
  price: number;
  features: string[];
  stripePriceId?: string;
}

export interface SubscriptionInfo {
  planId: PlanId;
  status: 'active' | 'past_due' | 'canceled';
  currentPeriodEnd: string;
}

export interface AdCreative {
  headline: string;
  description: string;
  cta: string;
  imageUrl?: string;
}

export interface Campaign {
  id: string;
  name: string;
  objective: string;
  platforms: Platform[];
  budget: number;
  status: CampaignStatus;
  creatives: AdCreative[];
  conversions?: { [key: string]: number };
  performance: {
    spend: number;
    leads: number;
    purchases?: number;
    revenue?: number;
    roas?: number;
    ctr: number;
    cpl: number;
    optimizations: number;
  };
  history?: { date: string; spend: number; leads: number; clicks: number; impressions: number }[];
  createdAt: string;
}

export interface LandingPage {
  id: string;
  campaignId?: string;
  title: string;
  slug: string;
  content: {
    hero: { title: string; subtitle: string; cta: string };
    features: { title: string; description: string }[];
    socialProof?: { quote: string; author: string }[];
    formFields: string[];
  };
  tracking: {
    utmSource: string;
    pixelEnabled: boolean;
  };
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  type?: 'text' | 'strategy' | 'creative_review' | 'status_update';
  metadata?: any;
}

export interface CampaignStrategy {
  name: string;
  platforms: Platform[];
  suggestedBudget: number;
  targetAudience: string;
  reasoning: string;
}
