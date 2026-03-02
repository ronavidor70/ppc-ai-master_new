# Meta Ads – השוואה ל‑Ads Manager (Debug)

## שימוש ב‑Debug Endpoint

כדי לוודא שהמספרים בדשבורד תואמים ל‑Meta Ads Manager:

1. **התחבר** לאפליקציה (Facebook OAuth).
2. **בחר חשבון מודעות** ו**טווח תאריכים** (כמו בדשבורד).
3. **ב‑Ads Manager**: פתח את אותו חשבון ובחר **אותו טווח** (למשל Last 7 days / אתמול).
4. **קרא ל‑endpoint הדיבאג** (רק בסביבת פיתוח, או כשמוגדר `DEBUG_META_INSIGHTS=true`):

   ```
   GET /api/debug/meta-insights?accountId=123456789&startDate=2025-02-01&endDate=2025-02-28
   ```

   אם ה‑accountId כולל את הקידומת `act_`, היא תוסר אוטומטית.

5. **השווה** את ה‑JSON שחוזר:
   - `total_spend` ↔ Spend ב‑Ads Manager
   - `total_impressions` ↔ Impressions
   - `total_clicks` ↔ Clicks
   - `total_conversions.leads` ↔ Leads (טפסים + אתר)
   - `total_conversions.whatsapp` ↔ שיחות וואטסאפ
   - `total_conversions.purchases` ↔ רכישות
   - `cost_per_result.*` ↔ Cost per Result לכל סוג

**הערה:** הבדלים קטנים (אגורות, או יום אחד) יכולים לנבוע מ‑timezone או מעיגול. התאריכים נבנים לפי timezone הדפדפן; ב‑Ads Manager משתמשים ב‑timezone של החשבון.

## יישור פרמטרים עם Ads Manager

- **Account-level:** קריאות ל‑`act_{id}/insights` עם `level=account`.
- **Campaign-level:** קריאות ל‑`{campaignId}/insights` עם `level=campaign`.
- **Attribution:** `["7d_click","1d_view"]`, `action_report_time=conversion`.
- **Conversions:** מקור אחד – `unified_metrics` (leads / whatsapp / purchases) בכל השכבות.
