import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from '../_shared/cors.ts'

// ─── Unified Metrics helpers (duplicated from services/metaMetrics.ts) ─────
// Deno edge functions cannot import from the frontend module graph, so these
// are inlined here but kept identical to the canonical definitions.

const LEAD_TYPES = new Set([
  'lead', 'omni_lead', 'onsite_conversion.lead_grouped', 'onsite_conversion.lead',
  'offsite_conversion.fb_pixel_lead', 'offsite_conversion.lead',
  'fb_lead_gen_form_submit', 'lead_gen_form_submit',
  'submit_application', 'complete_registration', 'contact',
])
const PURCHASE_TYPES = new Set([
  'purchase', 'omni_purchase', 'onsite_conversion.purchase',
  'offsite_conversion.fb_pixel_purchase', 'offsite_conversion.purchase',
  'fb_mobile_purchase', 'fb_offsite_conversion_purchase',
])
const WHATSAPP_TYPES = new Set([
  'onsite_conversion.messaging_first_reply', 'onsite_conversion.messaging_conversation_started_7d',
  'messaging_conversation_started_7d', 'messaging_conversation_started', 'omni_click_to_whatsapp', 'whatsapp_message',
])

function isWhatsAppEdge(a: any): boolean {
  const type = a.action_type || ''
  const url  = (a.url || '').toLowerCase()
  const bd   = (a.action_breakdowns || '').toLowerCase()
  if (WHATSAPP_TYPES.has(type)) return true
  if (type === 'contact' && (bd === 'whatsapp' || url.includes('wa.me') || url.includes('whatsapp.com'))) return true
  if (type === 'lead' && (url.includes('wa.me') || url.includes('whatsapp.com'))) return true
  return false
}

function buildUnifiedMetricsEdge(actions: any[]): { whatsapp: number; leads: number; purchases: number } {
  const result = { whatsapp: 0, leads: 0, purchases: 0 }
  for (const a of (actions || [])) {
    const val = parseInt(a.value || '0')
    if (val === 0) continue
    const type = a.action_type || ''
    if (isWhatsAppEdge(a)) {
      result.whatsapp += val
    } else if (PURCHASE_TYPES.has(type)) {
      result.purchases += val
    } else if (LEAD_TYPES.has(type)) {
      result.leads += val
    }
  }
  return result
}

function countLeadsEdge(actions: any[]): number {
  const LEAD_COUNT_TYPES = new Set([
    'lead', 'omni_lead', 'onsite_conversion.lead_grouped', 'onsite_conversion.lead',
    'offsite_conversion.fb_pixel_lead', 'offsite_conversion.lead',
    'fb_lead_gen_form_submit', 'lead_gen_form_submit',
    'submit_application', 'complete_registration',
  ])
  let total = 0
  for (const a of (actions || [])) {
    if (LEAD_COUNT_TYPES.has(a.action_type || '')) total += parseInt(a.value || '0')
  }
  return total
}

/** Deduplicate by date_start to prevent spend inflation from legacy action_breakdowns queries. */
function sumSpendSafelyEdge(rows: any[]): number {
  const byDate = new Map<string, number>()
  for (const row of (rows || [])) {
    const date  = row.date_start ?? row.date_stop ?? 'unknown'
    const spend = parseFloat(row.spend || '0')
    byDate.set(date, Math.max(byDate.get(date) ?? 0, spend))
  }
  let total = 0
  byDate.forEach(v => { total += v })
  return total
}

function mergeActionsEdge(rows: any[]): any[] {
  const map = new Map<string, number>()
  for (const row of (rows || [])) {
    for (const a of (row.actions || [])) {
      const t = a.action_type || ''
      map.set(t, (map.get(t) ?? 0) + parseInt(a.value || '0'))
    }
  }
  return Array.from(map.entries()).map(([action_type, value]) => ({ action_type, value: String(value) }))
}

function mergeActionValuesEdge(rows: any[]): any[] {
  const map = new Map<string, number>()
  for (const row of (rows || [])) {
    for (const av of (row.action_values || [])) {
      const t = av.action_type || ''
      map.set(t, (map.get(t) ?? 0) + parseFloat(av.value || '0'))
    }
  }
  return Array.from(map.entries()).map(([action_type, value]) => ({ action_type, value: String(value) }))
}

// Meta Insights API constants (edge function copy)
// action_breakdowns=action_type EXCLUDED – prevents spend inflation.
// Attribution windows match Ads Manager default (7d_click + 1d_view).
const EDGE_META_FIELDS   = 'spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions,action_values'
const EDGE_META_ATTR_WIN = encodeURIComponent('["7d_click","1d_view"]')

// Rate limiting helper
const requestQueue: Array<{ resolve: Function; reject: Function; url: string }> = []
let isProcessingQueue = false
const MIN_DELAY_BETWEEN_REQUESTS = 200
let lastRequestTime = 0

async function fetchWithRateLimit(url: string, options: RequestInit = {}, useCache: boolean = true): Promise<any> {
  return new Promise((resolve, reject) => {
    requestQueue.push({ resolve, reject, url })
    processQueue()
  })

  async function processQueue() {
    if (isProcessingQueue || requestQueue.length === 0) return
    
    isProcessingQueue = true
    
    while (requestQueue.length > 0) {
      const { resolve, reject, url: queuedUrl } = requestQueue.shift()!
      
      const timeSinceLastRequest = Date.now() - lastRequestTime
      if (timeSinceLastRequest < MIN_DELAY_BETWEEN_REQUESTS) {
        await new Promise(resolve => setTimeout(resolve, MIN_DELAY_BETWEEN_REQUESTS - timeSinceLastRequest))
      }
      
      lastRequestTime = Date.now()
      
      let retries = 0
      const maxRetries = 3
      let lastError: any = null
      
      while (retries <= maxRetries) {
        try {
          const response = await fetch(queuedUrl, options)
          
          if (response.status === 429) {
            lastError = new Error('חריגה ממכסת בקשות, אנא המתן מספר דקות')
            lastError.code = 4
            lastError.status = 429
            break
          }
          
          const data = await response.json()
          
          if (data.error) {
            if (data.error.code === 4 || 
                data.error.message?.includes('rate limit') || 
                data.error.message?.includes('request limit')) {
              lastError = new Error('חריגה ממכסת בקשות, אנא המתן מספר דקות')
              lastError.code = 4
              break
            } else {
              lastError = new Error(data.error.message || 'Facebook API error')
              lastError.code = data.error.code
              break
            }
          }
          
          resolve(data)
          break
          
        } catch (error: any) {
          lastError = error
          
          if (error.code === 4 || 
              error.message?.includes('rate limit') || 
              error.message?.includes('request limit')) {
            lastError.code = 4
            break
          }
          
          if (retries < maxRetries && (error.message?.includes('fetch') || error.code === 'ECONNRESET')) {
            const backoffDelay = Math.min(1000 * Math.pow(2, retries), 10000)
            await new Promise(resolve => setTimeout(resolve, backoffDelay))
            retries++
            continue
          }
          
          break
        }
      }
      
      if (lastError) {
        reject(lastError)
      }
      
      if (requestQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, MIN_DELAY_BETWEEN_REQUESTS))
      }
    }
    
    isProcessingQueue = false
  }
}

// Helper to get access token from request
function getAccessToken(req: Request): string | null {
  const url = new URL(req.url)
  const token = url.searchParams.get('token') || 
                req.headers.get('authorization')?.replace('Bearer ', '') ||
                null
  return token
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const path = url.pathname
  const accessToken = getAccessToken(req)

  if (!accessToken && !path.includes('/auth/')) {
    return new Response(
      JSON.stringify({ error: 'Not authenticated' }),
      { 
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }

  try {
    // Get ad accounts
    if (path.includes('/api/facebook/adaccounts')) {
      const businessId = url.searchParams.get('businessId')
      
      let targetBusinessId = businessId
      
      if (!targetBusinessId) {
        const businessesData = await fetchWithRateLimit(
          `https://graph.facebook.com/v19.0/me/businesses?fields=id,name&access_token=${accessToken}`,
          {},
          true
        )
        
        if (businessesData.error) {
          return new Response(
            JSON.stringify({ error: businessesData.error.message }),
            { 
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }
        
        const businesses = businessesData.data || []
        if (businesses.length > 0) {
          targetBusinessId = businesses[0].id
        } else {
          const fallbackData = await fetchWithRateLimit(
            `https://graph.facebook.com/v19.0/me/adaccounts?fields=name,account_id,currency,account_status,timezone_name&access_token=${accessToken}`,
            {},
            true
          )
          
          if (fallbackData.error) {
            return new Response(
              JSON.stringify({ error: fallbackData.error.message }),
              { 
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }
          
          return new Response(
            JSON.stringify(fallbackData.data || []),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }
      }
      
      const data = await fetchWithRateLimit(
        `https://graph.facebook.com/v19.0/${targetBusinessId}/owned_ad_accounts?fields=name,account_id,currency,account_status,timezone_name&access_token=${accessToken}`,
        {},
        true
      )
      
      if (data.error) {
        if (data.error.code === 200 || data.error.code === 10) {
          const fallbackData = await fetchWithRateLimit(
            `https://graph.facebook.com/v19.0/${targetBusinessId}/client_ad_accounts?fields=name,account_id,currency,account_status,timezone_name&access_token=${accessToken}`,
            {},
            true
          )
          
          if (fallbackData.error) {
            return new Response(
              JSON.stringify({ error: fallbackData.error.message }),
              { 
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }
          
          return new Response(
            JSON.stringify(fallbackData.data || []),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }
        
        return new Response(
          JSON.stringify({ error: data.error.message }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
      
      return new Response(
        JSON.stringify(data.data || []),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get businesses
    if (path.includes('/api/facebook/businesses')) {
      const data = await fetchWithRateLimit(
        `https://graph.facebook.com/v19.0/me/businesses?fields=id,name&access_token=${accessToken}`,
        {},
        true
      )
      
      if (data.error) {
        return new Response(
          JSON.stringify({ error: data.error.message }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
      
      return new Response(
        JSON.stringify(data.data || []),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get pages
    if (path.includes('/api/facebook/pages')) {
      const data = await fetchWithRateLimit(
        `https://graph.facebook.com/v19.0/me/accounts?access_token=${accessToken}`,
        {},
        true
      )
      
      if (data.error) {
        if (data.error.code === 4) {
          return new Response(
            JSON.stringify({ 
              error: 'Rate limit exceeded. Please try again in a few minutes.',
              code: 4,
              retryAfter: 60
            }),
            { 
              status: 429,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }
        return new Response(
          JSON.stringify({ error: data.error.message }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
      
      return new Response(
        JSON.stringify(data.data || []),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get campaigns
    if (path.includes('/api/facebook/campaigns') && !path.includes('/insights') && !path.includes('/pause') && !path.includes('/budget')) {
      const accountId = url.searchParams.get('accountId')
      
      if (!accountId) {
        return new Response(
          JSON.stringify({ error: 'accountId is required' }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      let cleanAccountId = accountId
      if (cleanAccountId.startsWith('act_')) {
        cleanAccountId = cleanAccountId.substring(4)
      }

      const data = await fetchWithRateLimit(
        `https://graph.facebook.com/v19.0/act_${cleanAccountId}/campaigns?fields=id,name,status,objective,created_time,updated_time&access_token=${accessToken}`,
        {},
        false
      )
      
      if (data.error) {
        return new Response(
          JSON.stringify({ error: data.error.message }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
      
      return new Response(
        JSON.stringify(data.data || []),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get account insights
    if (path.includes('/api/facebook/adaccounts/') && path.includes('/insights')) {
      const pathParts = path.split('/')
      const accountIdIndex = pathParts.findIndex(p => p === 'adaccounts')
      const accountId = accountIdIndex >= 0 ? pathParts[accountIdIndex + 1] : null
      const startDate = url.searchParams.get('startDate')
      const endDate = url.searchParams.get('endDate')
      
      if (!accountId || !startDate || !endDate) {
        return new Response(
          JSON.stringify({ error: 'accountId, startDate and endDate are required' }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      let cleanAccountId = accountId
      if (cleanAccountId.startsWith('act_')) {
        cleanAccountId = cleanAccountId.substring(4)
      }

      // Get account timezone and currency
      let timezone = 'America/Los_Angeles'
      let currency = 'USD'
      try {
        const accountData = await fetchWithRateLimit(
          `https://graph.facebook.com/v19.0/act_${cleanAccountId}?fields=timezone_name,currency&access_token=${accessToken}`,
          {},
          true
        )
        if (accountData.timezone_name) timezone = accountData.timezone_name
        if (accountData.currency) currency = accountData.currency
      } catch (tzError) {
        console.warn('Could not fetch account timezone/currency:', tzError)
      }

      const timeRange = JSON.stringify({ since: startDate, until: endDate })

      // action_breakdowns=action_type excluded (see EDGE_META_FIELDS).
      const insightsUrl = `https://graph.facebook.com/v19.0/act_${cleanAccountId}/insights?level=account&fields=${EDGE_META_FIELDS}&time_range=${encodeURIComponent(timeRange)}&action_attribution_windows=${EDGE_META_ATTR_WIN}&action_report_time=conversion&use_unified_attribution_setting=true&time_increment=1&include_summary=true&access_token=${accessToken}`
      
      const data = await fetchWithRateLimit(insightsUrl, {}, false)
      
      if (data.error) {
        if (data.error.code === 4) {
          return new Response(
            JSON.stringify({ 
              error: 'חריגה ממכסת בקשות, אנא המתן מספר דקות',
              code: 4,
              retryAfter: 60
            }),
            { 
              status: 429,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }
        return new Response(
          JSON.stringify({ error: data.error.message }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      // ── Path A: use summary (single source of truth, no deduplication needed) ──
      const summary = data.summary || {}
      const hasValidSummary = Object.keys(summary).length > 0 && summary.spend !== undefined

      let finalActions: any[]
      let finalActionValues: any[]
      let finalSpend: number
      let finalImpressions: number
      let finalClicks: number
      let finalCtr: number
      let finalCpc: number
      let finalCpm: number
      let finalReach: number
      let finalFrequency: number
      let summaryOut: any

      if (hasValidSummary) {
        finalSpend        = parseFloat(summary.spend || '0')
        finalImpressions  = parseInt(summary.impressions || '0')
        finalClicks       = parseInt(summary.clicks || '0')
        finalActions      = summary.actions || []
        finalActionValues = summary.action_values || []
        finalCtr          = parseFloat(summary.ctr || '0')
        finalCpc          = parseFloat(summary.cpc || '0')
        finalCpm          = parseFloat(summary.cpm || '0')
        finalReach        = parseInt(summary.reach || '0')
        finalFrequency    = parseFloat(summary.frequency || '0')
        summaryOut        = summary
      } else {
        // ── Path B: aggregate from daily rows using safe helpers ──────────────
        const allDataRows = data.data || []
        finalSpend        = sumSpendSafelyEdge(allDataRows)
        finalImpressions  = allDataRows.reduce((s: number, r: any) => s + parseInt(r.impressions || '0'), 0)
        finalClicks       = allDataRows.reduce((s: number, r: any) => s + parseInt(r.clicks || '0'), 0)
        finalActions      = mergeActionsEdge(allDataRows)
        finalActionValues = mergeActionValuesEdge(allDataRows)
        finalCtr          = finalImpressions > 0 ? (finalClicks / finalImpressions) * 100 : 0
        finalCpc          = finalClicks > 0 ? finalSpend / finalClicks : 0
        finalCpm          = finalImpressions > 0 ? (finalSpend / finalImpressions) * 1000 : 0
        finalReach        = Math.max(0, ...allDataRows.map((r: any) => parseInt(r.reach || '0')))
        finalFrequency    = 0
        summaryOut        = {}
      }

      const unified_metrics = buildUnifiedMetricsEdge(finalActions)
      const conversions     = unified_metrics.leads + unified_metrics.whatsapp + unified_metrics.purchases

      return new Response(
        JSON.stringify({
          spend: finalSpend,
          impressions: finalImpressions,
          clicks: finalClicks,
          ctr: finalCtr,
          cpc: finalCpc,
          cpm: finalCpm,
          leads: unified_metrics.leads,
          conversions,
          unified_metrics,
          actions: finalActions,
          action_values: finalActionValues,
          reach: finalReach,
          frequency: finalFrequency,
          cpl: unified_metrics.leads > 0 ? finalSpend / unified_metrics.leads : 0,
          summary: summaryOut,
          currency,
          daily: data.data,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get campaign insights
    if (path.includes('/api/facebook/campaigns/') && path.includes('/insights')) {
      const pathParts = path.split('/')
      const campaignIdIndex = pathParts.findIndex(p => p === 'campaigns')
      const campaignId = campaignIdIndex >= 0 ? pathParts[campaignIdIndex + 1] : null
      const startDate = url.searchParams.get('startDate')
      const endDate = url.searchParams.get('endDate')
      const accountId = url.searchParams.get('accountId')
      
      if (!campaignId || !startDate || !endDate) {
        return new Response(
          JSON.stringify({ error: 'campaignId, startDate and endDate are required' }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      let timezone = 'America/Los_Angeles'
      let currency = 'USD'
      if (accountId) {
        let cleanAccountId = accountId
        if (cleanAccountId.startsWith('act_')) {
          cleanAccountId = cleanAccountId.substring(4)
        }
        try {
          const accountData = await fetchWithRateLimit(
            `https://graph.facebook.com/v19.0/act_${cleanAccountId}?fields=timezone_name,currency&access_token=${accessToken}`,
            {},
            true
          )
          if (accountData.timezone_name) timezone = accountData.timezone_name
          if (accountData.currency) currency = accountData.currency
        } catch (tzError) {
          console.warn('Could not fetch account timezone/currency:', tzError)
        }
      }

      const timeRange = JSON.stringify({ since: startDate, until: endDate })

      // action_breakdowns=action_type excluded. Attribution = Ads Manager default.
      const insightsUrl = `https://graph.facebook.com/v19.0/${campaignId}/insights?level=campaign&fields=${EDGE_META_FIELDS}&time_range=${encodeURIComponent(timeRange)}&action_attribution_windows=${EDGE_META_ATTR_WIN}&action_report_time=conversion&use_unified_attribution_setting=true&time_increment=1&include_summary=true&access_token=${accessToken}`

      const data = await fetchWithRateLimit(insightsUrl, {}, false)

      if (data.error) {
        return new Response(
          JSON.stringify({ error: data.error.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Use same summary→fallback pattern for campaigns
      const campSummary         = data.summary || {}
      const campHasValidSummary = Object.keys(campSummary).length > 0 && campSummary.spend !== undefined

      let campActions: any[]
      let campActionValues: any[]
      let campSpend: number, campImpressions: number, campClicks: number
      let campCtr: number, campCpc: number, campCpm: number
      let campReach: number, campFrequency: number, campSummaryOut: any

      if (campHasValidSummary) {
        campSpend        = parseFloat(campSummary.spend || '0')
        campImpressions  = parseInt(campSummary.impressions || '0')
        campClicks       = parseInt(campSummary.clicks || '0')
        campActions      = campSummary.actions || []
        campActionValues = campSummary.action_values || []
        campCtr          = parseFloat(campSummary.ctr || '0')
        campCpc          = parseFloat(campSummary.cpc || '0')
        campCpm          = parseFloat(campSummary.cpm || '0')
        campReach        = parseInt(campSummary.reach || '0')
        campFrequency    = parseFloat(campSummary.frequency || '0')
        campSummaryOut   = campSummary
      } else {
        const rows       = data.data || []
        campSpend        = sumSpendSafelyEdge(rows)
        campImpressions  = rows.reduce((s: number, r: any) => s + parseInt(r.impressions || '0'), 0)
        campClicks       = rows.reduce((s: number, r: any) => s + parseInt(r.clicks || '0'), 0)
        campActions      = mergeActionsEdge(rows)
        campActionValues = mergeActionValuesEdge(rows)
        campCtr          = campImpressions > 0 ? (campClicks / campImpressions) * 100 : 0
        campCpc          = campClicks > 0 ? campSpend / campClicks : 0
        campCpm          = campImpressions > 0 ? (campSpend / campImpressions) * 1000 : 0
        campReach        = Math.max(0, ...rows.map((r: any) => parseInt(r.reach || '0')))
        campFrequency    = 0
        campSummaryOut   = {}
      }

      const campUnified = buildUnifiedMetricsEdge(campActions)
      const campConversions = campUnified.leads + campUnified.whatsapp + campUnified.purchases

      return new Response(
        JSON.stringify({
          spend: campSpend, impressions: campImpressions, clicks: campClicks,
          ctr: campCtr, cpc: campCpc, cpm: campCpm,
          leads: campUnified.leads, conversions: campConversions,
          unified_metrics: campUnified,
          actions: campActions, action_values: campActionValues,
          reach: campReach, frequency: campFrequency,
          cpl: campUnified.leads > 0 ? campSpend / campUnified.leads : 0,
          summary: campSummaryOut, currency, daily: data.data,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get leads
    if (path.includes('/api/facebook/leads')) {
      const accountId = url.searchParams.get('accountId')
      const startDate = url.searchParams.get('startDate')
      const endDate = url.searchParams.get('endDate')
      
      if (!accountId) {
        return new Response(
          JSON.stringify({ error: 'accountId is required' }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      let cleanAccountId = accountId
      if (cleanAccountId.startsWith('act_')) {
        cleanAccountId = cleanAccountId.substring(4)
      }

      // Fetch campaigns
      const campaignsData = await fetchWithRateLimit(
        `https://graph.facebook.com/v19.0/act_${cleanAccountId}/campaigns?fields=id,name,status&access_token=${accessToken}`,
        {},
        false
      )
      
      if (campaignsData.error) {
        return new Response(
          JSON.stringify({ error: campaignsData.error.message }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      const activeCampaigns = (campaignsData.data || []).filter((c: any) => c.status === 'ACTIVE')
      const allLeads: any[] = []

      // Simplified leads fetching - in production, you'd want to fetch from lead forms
      // This is a simplified version
      for (const campaign of activeCampaigns.slice(0, 5)) { // Limit to 5 campaigns for performance
        try {
          const adSetsData = await fetchWithRateLimit(
            `https://graph.facebook.com/v19.0/${campaign.id}/adsets?fields=id,name&access_token=${accessToken}`,
            {},
            false
          )
          
          if (adSetsData.error) continue
          
          const adSets = adSetsData.data || []
          
          for (const adSet of adSets.slice(0, 3)) {
            const adsData = await fetchWithRateLimit(
              `https://graph.facebook.com/v19.0/${adSet.id}/ads?fields=id,name,creative&access_token=${accessToken}`,
              {},
              false
            )
            
            if (adsData.error) continue
            
            const ads = adsData.data || []
            
            for (const ad of ads) {
              if (ad.creative && ad.creative.object_story_spec) {
                const leadgenId = ad.creative.object_story_spec?.link_data?.call_to_action?.value?.lead_gen_form_id
                
                if (leadgenId) {
                  const leadsData = await fetchWithRateLimit(
                    `https://graph.facebook.com/v19.0/${leadgenId}/leads?fields=id,created_time,field_data&access_token=${accessToken}`,
                    {},
                    false
                  )
                  
                  if (leadsData.error) continue
                  
                  const leads = leadsData.data || []
                  
                  const filteredLeads = leads.filter((lead: any) => {
                    if (!startDate || !endDate) return true
                    const leadDate = new Date(lead.created_time).toISOString().split('T')[0]
                    return leadDate >= startDate && leadDate <= endDate
                  })
                  
                  filteredLeads.forEach((lead: any) => {
                    const fieldData: any = {}
                    ;(lead.field_data || []).forEach((field: any) => {
                      fieldData[field.name] = field.values?.[0] || ''
                    })
                    
                    const fullName = fieldData.full_name || fieldData.FULL_NAME || 
                      (fieldData.first_name && fieldData.last_name ? `${fieldData.first_name} ${fieldData.last_name}` : '') ||
                      fieldData.first_name || fieldData.last_name || 'Unknown'
                    const phoneNumber = fieldData.phone_number || fieldData.PHONE_NUMBER || fieldData.phone || ''
                    const email = fieldData.email || fieldData.EMAIL || ''
                    
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
                      })
                    }
                  })
                }
              }
            }
          }
        } catch (error: any) {
          console.error(`Error processing campaign ${campaign.id}:`, error.message)
          continue
        }
      }

      return new Response(
        JSON.stringify(allLeads),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Pause campaign
    if (path.includes('/api/facebook/campaigns/') && path.includes('/pause')) {
      const pathParts = path.split('/')
      const campaignIdIndex = pathParts.findIndex(p => p === 'campaigns')
      const campaignId = campaignIdIndex >= 0 ? pathParts[campaignIdIndex + 1] : null
      
      if (!campaignId) {
        return new Response(
          JSON.stringify({ error: 'campaignId is required' }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      const data = await fetchWithRateLimit(
        `https://graph.facebook.com/v19.0/${campaignId}?status=PAUSED&access_token=${accessToken}`,
        { method: 'POST' },
        false
      )
      
      if (data.error) {
        return new Response(
          JSON.stringify({ error: data.error.message }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
      
      return new Response(
        JSON.stringify({ success: true }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Update budget
    if (path.includes('/api/facebook/campaigns/') && path.includes('/budget')) {
      const pathParts = path.split('/')
      const campaignIdIndex = pathParts.findIndex(p => p === 'campaigns')
      const campaignId = campaignIdIndex >= 0 ? pathParts[campaignIdIndex + 1] : null
      const body = await req.json().catch(() => ({}))
      const budget = body.budget
      
      if (!campaignId || !budget) {
        return new Response(
          JSON.stringify({ error: 'campaignId and budget are required' }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      const data = await fetchWithRateLimit(
        `https://graph.facebook.com/v19.0/${campaignId}?daily_budget=${budget}&access_token=${accessToken}`,
        { method: 'POST' },
        false
      )
      
      if (data.error) {
        return new Response(
          JSON.stringify({ 
            error: data.error.message,
            note: 'Budget updates typically require updating the Ad Set, not the campaign directly'
          }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
      
      return new Response(
        JSON.stringify({ success: true }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { 
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error: any) {
    console.error('Error in facebook-api:', error)
    
    if (error.code === 4 || 
        error.message?.includes('rate limit') || 
        error.message?.includes('Rate limit')) {
      return new Response(
        JSON.stringify({ 
          error: 'חריגה ממכסת בקשות, אנא המתן מספר דקות',
          code: 4,
          retryAfter: 60
        }),
        { 
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }
    
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
