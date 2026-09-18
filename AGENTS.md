# AGENTS.md — Amazon Ads Integration

## Week Definition (applies to ALL tabs)
Custom month-week buckets — **not ISO**:
- **W1**: days 1–7
- **W2**: days 8–15
- **W3**: days 16–23
- **W4**: days 24–end of month (24–28/30/31)

Stored as `W1..W4` in `Week` column. Display label: `W1 (1-7)`, `W2 (8-15)`, `W3 (16-23)`, `W4 (24-end)`. Grouping key for all summaries is `Year | Month | Week` (e.g. `2026 | Aug | W3`).

## Sheet Structure — column width **100** for all data columns (agents standard)
- **Daily**: `Year, Month, Week, Date, Product, Channel, ASIN, SKU, Units, Sales, Orders, Status, Ship State, Ship City` — Week = custom W1-4 — width 100.
- **Summary**: 5 sections (width 100)
  1. *Daily per channel* — `Date | Amazon Units/Sales/Orders/ROAS | FirstCry ... | Flipkart ... | Total ...` — ROAS = Daily Sales / Ads Spend (blended, per date per channel).
  1b. *Product-wise* — `Product | Channel | Units | Sales | Orders` — directly under Daily, sorted by sales.
  2. *Location × Product* — `Product | Channel | Ship State | Ship City | Units | Sales | Orders` — Amazon only (FirstCry/Flipkart have no location).
  3. *Monthly cumulative by week* — `Year | Month | Week | Week Range | Channel | Units | Sales | Orders | Cumulative (month-to-date) | ROAS` — weeks W1-W4 per month per channel.
  4. *Weekly Product-wise* — `Year | Month | Week | Week Range | Product | Channel | Units | Sales | Orders` — week buckets W1(1-7) W2(8-15) W3(16-23) W4(24-end) per product.
  Filters enabled on each section. Blank row separators.
- **Ads / Ads Amazon / Ads FirstCry / Ads Flipkart**: `Year, Month, Week, Date, Channel, Campaign, Impressions, Clicks, CTR, Spend, Sales, Orders, ROAS` — ROAS = Sales/Spend. Week = custom W1-4 — width 100.
- **Ads Keyword**: same + `Keyword, Match Type, ROAS` — width 100.
- **Ads Summary**: `Date | per-channel Impressions/Clicks/CTR/Spend/Sales/Orders/ROAS + Total` — daily + weekly buckets `W1(1-7) W2(8-15) W3(16-23) W4(24-end)` per channel — width 100.
- **Orders / Inventory / Inventory Daily / Config**: width 100.

## Data Sources
- Amazon SP-API: `amazon_june_raw.json`, `amazon_july_raw.json`, `amazon_aug_raw.json` (with `shipState`/`shipCity`). Pull via `scripts/pull-aug-range.ts`, backfill `scripts/backfill-order-location.ts`.
- FirstCry sales: `Firstcry sales/dashboardsale_*.xlsx` — files deduped by `POID|ProductID`, catalog `FC_CATALOG`. Live: `(6).xlsx` Aug 1-26.
- Flipkart sales: `flipkart sales/*.xlsx` Orders sheet, deduped by `order_item_id`, price map `FK_PRICE_BY_SKU`, include CANCELLED. Live: `80f896bd...xlsx` Aug 1-26.
- Flipkart ads: `flipkart ads/kjcv7pk9f8e.csv` — period totals smeared evenly over 27 days.
- FirstCry ads: `Firstcry ads/...20260801-20260826...xlsx` daily per-product, merged with old Jul data.
- Amazon ads: `docs/amazon-ads-raw-3mo.json` via `scripts/amazon-3month-report.ts` — 12 report types, custom week.

## Push Scripts
- `scripts/push-daily.py` — builds rows per day (filters `title=='-'`), groups Amazon by `(asin,sku,title,state,city)` upper-cased.
- `scripts/push-ads.py` — Ads + Keywords, dedupes by `(date,channel,campaign)` and `(date,channel,campaign,keyword,matchType)`.
- `scripts/push-orders.py`, `push-inventory.py` — incremental.
- `scripts/repush-all-daily.py` — clear + full rebuild Jun 1–Aug 26 (configurable).

## Deployment
GAS file: `scripts/daily-sales-apps-script.gs` — paste into Sheet > Extensions > Apps Script, deploy as Web App (`PUSH_KEY=catche-daily-2026`), URL in `scripts/push-*.py`.

## Daily Automation (Option A — GitHub Actions)
- Workflow `.github/workflows/daily.yml` cron `30 21 * * *` UTC (03:00 IST) + `workflow_dispatch` manual. Timeout 20 min, cached npm/pip.
- Script `scripts/daily-auto.ts` does yesterday IST (`W1-W4`): `pull-aug-range` → `backfill-order-location` → `pull-inventory` (Jul1→yesterday) → `amazon-3month-report` → `batch_push_missing` → `push-orders`/`push-inventory`/`push-ads` → `summary`/`adsSummary`/`pnl` GETs.
- Secrets to set in GitHub Settings > Secrets > Actions: `AMAZON_*`, `AMAZON_AD_*`, `WEB_APP_URL` (current `AKfycbz07...`), `PUSH_KEY=catche-daily-2026`.
- Usage ~6–8 min/run → ~200 min/month vs 2000 free minutes; npm/pip cache keeps it low. FirstCry/Flipkart CSV drops are still manual — next auto run picks them up via `batch_push_missing`.
- Manual trigger: Actions tab → Daily Amazon Sync → Run workflow.

## Tasks
When adding new marketplace files, update `FC_FILES`/`FK_SALES_FILES`/`SRC` in parse scripts and `FC_MAX_DAY`, then `python scripts/parse-*.py`, `npx tsx scripts/amazon-3month-report.ts <start> <end>`, `python scripts/repush-all-daily.py`, `python scripts/push-ads.py`, trigger `summary` + `adsSummary` GETs.
