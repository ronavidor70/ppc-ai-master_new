/**
 * metaMetrics.ts – Single Source of Truth for Meta Ads metric calculations.
 *
 * Why this file exists:
 *   • Action-type mappings were duplicated (with subtle differences) across server,
 *     edge-function, and client code, causing leads/purchases to show as 0 when
 *     an account uses AEM-style types like `omni_lead` or `omni_purchase`.
 *   • Spend was inflated because summing daily rows from a query that included
 *     `action_breakdowns=action_type` counts each day's spend once per action-type.
 *   • Attribution windows did not match Ads Manager defaults (7d_click + 1d_view).
 *
 * Usage:
 *   import { buildUnifiedMetrics, sumSpendSafely, LEAD_ACTION_TYPES } from './metaMetrics';
 */

// ─── Canonical Action-Type Sets ──────────────────────────────────────────────

/**
 * All action_types that count as a "Lead" conversion in Ads Manager.
 * Includes both pixel-based and form-based variants plus the AEM omni_lead type.
 * NOTE: `contact` is included here but is filtered out when it looks like WhatsApp.
 */
export const LEAD_ACTION_TYPES = new Set([
  'lead',
  'omni_lead',                            // AEM (Aggregated Event Measurement) accounts
  'onsite_conversion.lead_grouped',
  'onsite_conversion.lead',
  'offsite_conversion.fb_pixel_lead',
  'offsite_conversion.lead',
  'fb_lead_gen_form_submit',
  'lead_gen_form_submit',
  'submit_application',
  'complete_registration',
  'contact',                              // generic – filtered out when URL is WhatsApp
]);

/**
 * All action_types that count as a "Purchase" conversion.
 */
export const PURCHASE_ACTION_TYPES = new Set([
  'purchase',
  'omni_purchase',                        // AEM accounts
  'onsite_conversion.purchase',
  'offsite_conversion.fb_pixel_purchase',
  'offsite_conversion.purchase',
  'fb_mobile_purchase',
  'fb_offsite_conversion_purchase',
]);

/**
 * All action_types that count as a "WhatsApp" conversion.
 */
export const WHATSAPP_ACTION_TYPES = new Set([
  'onsite_conversion.messaging_first_reply',
  'messaging_conversation_started_7d',
  'messaging_conversation_started',
  'omni_click_to_whatsapp',
  'whatsapp_message',
]);

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface MetaAction {
  action_type: string;
  value: string | number;
  action_breakdowns?: string;
  url?: string;
}

export interface UnifiedMetrics {
  leads: number;
  purchases: number;
  whatsapp: number;
  purchaseValue: number;
  add_to_cart: number;
  initiate_checkout: number;
  view_content: number;
}

// ─── Action Classifiers ───────────────────────────────────────────────────────

/** Returns true if the action should be counted as WhatsApp. */
export function isWhatsAppAction(action: MetaAction): boolean {
  const type = action.action_type || '';
  const url  = (action.url || '').toLowerCase();
  const bd   = (action.action_breakdowns || '').toLowerCase();

  if (WHATSAPP_ACTION_TYPES.has(type)) return true;
  // contact with a WhatsApp breakdown or WhatsApp URL
  if (type === 'contact' && (bd === 'whatsapp' || url.includes('wa.me') || url.includes('whatsapp.com'))) return true;
  // lead whose destination URL is WhatsApp
  if (type === 'lead' && (url.includes('wa.me') || url.includes('whatsapp.com'))) return true;
  return false;
}

/** Returns true if the action is a lead (not WhatsApp, not purchase). */
export function isLeadAction(action: MetaAction): boolean {
  if (isWhatsAppAction(action)) return false;
  if (PURCHASE_ACTION_TYPES.has(action.action_type)) return false;
  return LEAD_ACTION_TYPES.has(action.action_type);
}

/** Returns true if the action is a purchase. */
export function isPurchaseAction(action: MetaAction): boolean {
  return PURCHASE_ACTION_TYPES.has(action.action_type || '');
}

// ─── Core Utility Functions ───────────────────────────────────────────────────

/**
 * Sum the integer count of all actions whose action_type is in typeSet.
 * Uses a loop (never relies on array index position).
 */
export function sumActions(actions: MetaAction[], typeSet: Set<string>): number {
  let total = 0;
  for (const action of actions) {
    if (typeSet.has(action.action_type)) {
      total += parseInt(String(action.value ?? '0'), 10);
    }
  }
  return total;
}

/**
 * Sum the float monetary value of all action_values whose action_type is in typeSet.
 * Uses a loop (never relies on array index position).
 */
export function sumActionValues(actionValues: MetaAction[], typeSet: Set<string>): number {
  let total = 0;
  for (const av of actionValues) {
    if (typeSet.has(av.action_type)) {
      total += parseFloat(String(av.value ?? '0'));
    }
  }
  return total;
}

/**
 * Safely sum spend from an array of daily insight rows.
 *
 * Root problem this solves:
 *   When `action_breakdowns=action_type` was included in the insights query
 *   together with `time_increment=1`, Meta returned N rows per day (one per
 *   action_type).  Every row carried the FULL spend for that date, so a naive
 *   .reduce() inflated spend by the number of distinct action types.
 *
 * Fix: deduplicate by date_start, keeping the MAXIMUM spend per date.
 * With a clean query (no action_breakdowns) this is equivalent to a plain sum.
 */
export function sumSpendSafely(
  rows: Array<{ date_start?: string; date_stop?: string; spend?: string | number }>
): number {
  const spendByDate = new Map<string, number>();
  for (const row of rows) {
    const date    = row.date_start ?? row.date_stop ?? 'unknown';
    const spend   = parseFloat(String(row.spend ?? '0'));
    const current = spendByDate.get(date) ?? 0;
    spendByDate.set(date, Math.max(current, spend));
  }
  let total = 0;
  spendByDate.forEach(v => { total += v; });
  return total;
}

/**
 * Build the UnifiedMetrics object from the flat actions / action_values arrays.
 *
 * This is the single authoritative implementation used on both the server and
 * the client.  It correctly handles all known action_type variants including
 * AEM types (omni_lead, omni_purchase) and WhatsApp signals.
 */
export function buildUnifiedMetrics(
  actions: MetaAction[],
  actionValues: MetaAction[] = []
): UnifiedMetrics {
  let leads            = 0;
  let purchases        = 0;
  let whatsapp         = 0;
  let add_to_cart      = 0;
  let initiate_checkout = 0;
  let view_content     = 0;

  for (const action of actions) {
    const val = parseInt(String(action.value ?? '0'), 10);
    if (val === 0) continue;

    const type = action.action_type || '';

    if (isWhatsAppAction(action)) {
      whatsapp += val;
    } else if (isPurchaseAction(action)) {
      purchases += val;
    } else if (isLeadAction(action)) {
      leads += val;
    } else if (
      type === 'add_to_cart' ||
      type === 'onsite_conversion.add_to_cart' ||
      type === 'offsite_conversion.fb_pixel_add_to_cart'
    ) {
      add_to_cart += val;
    } else if (
      type === 'initiate_checkout' ||
      type === 'onsite_conversion.initiate_checkout' ||
      type === 'offsite_conversion.fb_pixel_initiate_checkout'
    ) {
      initiate_checkout += val;
    } else if (
      type === 'view_content' ||
      type === 'onsite_conversion.view_content' ||
      type === 'offsite_conversion.fb_pixel_view_content'
    ) {
      view_content += val;
    }
  }

  const purchaseValue = sumActionValues(actionValues, PURCHASE_ACTION_TYPES);

  return { leads, purchases, whatsapp, purchaseValue, add_to_cart, initiate_checkout, view_content };
}

/**
 * Collapse a daily-rows actions array into a deduplicated flat list.
 *
 * When `time_increment=1` is used (one row per day), each row has its own
 * `actions` array.  This helper merges them into a single list by summing
 * values per action_type, safe to pass into buildUnifiedMetrics.
 */
export function mergeActionsFromRows(rows: any[]): MetaAction[] {
  const merged = new Map<string, number>();
  for (const row of rows) {
    const actions: any[] = row.actions ?? [];
    for (const a of actions) {
      const type = a.action_type ?? '';
      merged.set(type, (merged.get(type) ?? 0) + parseInt(String(a.value ?? '0'), 10));
    }
  }
  return Array.from(merged.entries()).map(([action_type, value]) => ({
    action_type,
    value: String(value),
  }));
}

/**
 * Collapse a daily-rows action_values array into a deduplicated flat list.
 */
export function mergeActionValuesFromRows(rows: any[]): MetaAction[] {
  const merged = new Map<string, number>();
  for (const row of rows) {
    const avs: any[] = row.action_values ?? [];
    for (const av of avs) {
      const type = av.action_type ?? '';
      merged.set(type, (merged.get(type) ?? 0) + parseFloat(String(av.value ?? '0')));
    }
  }
  return Array.from(merged.entries()).map(([action_type, value]) => ({
    action_type,
    value: String(value),
  }));
}

// ─── Insights Query Helpers ───────────────────────────────────────────────────

/**
 * The fields to request in every Meta Insights API call.
 * action_breakdowns=action_type is intentionally excluded to prevent spend
 * inflation (duplicate rows per day × action_type).
 */
export const META_INSIGHTS_FIELDS =
  'spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions,action_values';

/**
 * Attribution windows matching the Ads Manager default: 7-day click + 1-day view.
 * Using 28d_click or 7d_view inflates numbers beyond what Ads Manager shows by default.
 */
export const META_ATTRIBUTION_WINDOWS = '["7d_click","1d_view"]';
