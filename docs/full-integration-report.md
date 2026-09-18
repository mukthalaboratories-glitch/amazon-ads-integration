# Amazon Ads + SP-API — Full Integration Report

**Generated:** 2026-07-27
**Seller:** Muktha Laboratories Private Limited (India, INR)
**Marketplace:** Amazon.in (EU region endpoint)

---

## 1. System Status Overview

| API | Status | Notes |
|---|---|---|
| **Amazon Ads API** (Advertising API v3) | ✅ Fully Working | OAuth, profiles, campaigns, ad groups, keywords, targets, reporting all operational |
| **SP-API** (Selling Partner API) | ✅ Fully Working | Fixed authentication (was using `client_credentials`, now using `refresh_token` grant). Reports and orders data accessible |
| **MCP Server Config** | ✅ Ready | Both Dynamic and Fixed Context Mode configs available for Claude Desktop/Code integration |

### What Was Fixed
1. **SP-API Auth** — Changed from `grant_type=client_credentials` (only works for grantless ops) to `grant_type=refresh_token` with a valid refresh token
2. **SP-API Credentials** — Updated `.env.local` to use the working LWA app that was already authorized for SP-API
3. **Report Status Field** — Fixed field name from `status` to `processingStatus` and value from `COMPLETED` to `DONE`
4. **Report Date Range** — Added dataStartTime/dataEndTime to prevent cancelled reports due to unbounded date ranges

---

## 2. Amazon Ads Performance (Jun 26 — Jul 27, 2026)

### Executive Summary

| Metric | Value |
|---|---|
| **Total Ad Spend** | ₹11,108.94 |
| **Total Sales (7-day attributed)** | ₹18,557.36 |
| **ACoS** | 59.86% |
| **ROAS** | 1.67x |
| **Total Impressions** | 210,271 |
| **Total Clicks** | 716 |
| **Click-Through Rate (CTR)** | 0.34% |
| **Cost Per Click (CPC)** | ₹15.52 |
| **Total Purchases (7-day)** | 60 |
| **Total Budget Allocated** | ₹2,030.00 |
| **Budget Utilization** | 547.24% (overspending — budget limits too low) |
| **Active Campaigns** | 11 |

### Campaign Performance

| Campaign | Strategy | Spend | Sales | ROAS | ACoS | Purchases |
|---|---|---|---|---|---|---|
| Internal Product - Display Target | optimizeForSales | ₹2,258.67 | ₹6,924.98 | **3.07x** | 32.62% | 22 |
| Brand KW - Manual | legacy | ₹2,440.49 | ₹4,796.19 | **1.97x** | 50.88% | 12 |
| B09R3SJPB5 (Refill Combo) | optimizeForSales | ₹845.14 | ₹2,135.56 | **2.53x** | 39.57% | 7 |
| Agarbatti - May - manual | optimizeForSales | ₹641.02 | ₹1,342.86 | **2.09x** | 47.74% | 6 |
| B077ZT3C14 (Must-Quit-O Refill) | optimizeForSales | ₹675.85 | ₹1,128.98 | **1.67x** | 59.86% | 5 |
| **FBA PRODUCT** | optimizeForSales | **₹2,532.71** | ₹1,923.71 | **0.76x** | **131.66%** | 7 |
| **all products** | optimizeForSales | **₹1,619.06** | ₹305.08 | **0.19x** | **530.70%** | 1 |
| 3 Pack Refill - ASIN Target | manual | ₹48.73 | ₹0.00 | **0.00x** | — | 0 |
| B08KXSSKSV (Vaporizer) | optimizeForSales | ₹38.15 | ₹0.00 | **0.00x** | — | 0 |
| Campaign - 25/7/2026 17:40:20.433 | optimizeForSales | ₹9.12 | ₹0.00 | **0.00x** | — | 0 |
| B084BXXLSQ (Pack of 6) | optimizeForSales | ₹0.00 | ₹0.00 | — | — | 0 |

### Top Products by Ad Performance

| ASIN | Product | Spend | Sales | ROAS | Purchases |
|---|---|---|---|---|---|
| B09R3SJPB5 | Herbal Mosquito Refill Combo (6+Device) | ₹2,438.46 | ₹3,661.00 | 1.50x | 12 |
| B077ZT3C14 | Must-Quit-O Insta Refill Pack of 4 | ₹1,393.32 | ₹2,417.12 | 1.73x | 9 |
| B0D7MXTFB1 | Herbal Mosquito Agarbatti | ₹1,088.61 | ₹1,342.86 | 1.23x | 6 |
| B084BXXLSQ | Must-Quit-O Insta Pack of 6 | ₹422.58 | ₹3,051.48 | 7.22x | 6 |
| B0B8SJ63RD | Repellent Insta + Refill Combo | ₹709.40 | ₹968.77 | 1.37x | 4 |
| B08KXSSKSV | Insta Mosquito Vaporizer | ₹622.35 | ₹177.97 | 0.29x | 1 |
| B0GXWK4W73 | Pack of 6+device (New) | ₹284.72 | ₹1,304.71 | 4.58x | 4 |
| B07GQWYRFZ | Tra-Pe-Ll-Ent Combo | ₹579.58 | ₹0.00 | 0.00x | 0 |
| B01CVDD26C | Mosquito Trap Refill | ₹328.11 | ₹0.00 | 0.00x | 0 |
| B07V7YCJ9S | Gadiva Ayurvedic Hair Oil | ₹126.49 | ₹0.00 | 0.00x | 0 |

### Keyword Performance

| Keyword | Match Type | Spend | Sales | ROAS | Purchases |
|---|---|---|---|---|---|
| catche mosquito repellent | EXACT | ₹225.36 | ₹3,135.19 | **13.91x** | 6 |
| mosquito repellent | BROAD | ₹1,654.90 | ₹1,135.58 | **0.69x** | 4 |
| mosquito repellent | PHRASE | ₹436.75 | ₹525.42 | **1.20x** | 2 |
| mosquito repellent agarbatti | BROAD | ₹270.74 | ₹671.43 | **2.48x** | 3 |
| allout refill | PHRASE | ₹142.45 | ₹563.20 | **3.95x** | 2 |
| mosquito refill | BROAD | ₹142.03 | ₹220.34 | **1.55x** | 1 |
| catche mosquito repellent | BROAD | ₹70.73 | ₹966.10 | **13.66x** | 4 |
| mosquito repellent | EXACT | ₹112.10 | ₹0.00 | **0.00x** | 0 |

### Top Wasted Spend (Clicks with Zero Sales)

| Search Term | Campaign | Spend | Clicks |
|---|---|---|---|
| mosquito repellent machine | Brand KW - Manual | ₹178.85 | 25 |
| mosquito repellent machine | all products | ₹172.60 | 5 |
| mosquito repellent for car | Brand KW - Manual | ₹171.89 | 8 |
| catche mosquito repellent (BROAD) | Brand KW - Manual | ₹141.30 | 8 |
| camphor mosquito repellent refill | Brand KW - Manual | ₹115.63 | 6 |
| mosquito killer | Brand KW - Manual | ₹115.26 | 6 |
| mosquito repellent (EXACT) | Brand KW - Manual | ₹112.10 | 9 |
| steel scrubber for kitchen | all products | ₹76.46 | 2 |
| hicare mosquito repellent machine | Brand KW - Manual | ₹70.92 | 3 |
| good night refill pack | all products | ₹63.29 | 2 |

---

## 3. SP-API Sales Data (Orders & Products)

### April 2026 — Product Sales Summary

| Brand | Products | Units Sold | Total Sales |
|---|---|---|---|
| **Catche** (Mosquito Repellents) | 12 SKUs | 138 | ₹38,795 |
| **Gadiva** (Ayurvedic Hair Oil) | 1 SKU | 4 | ₹1,000 |
| **Muktha** (Handwash) | 1 SKU | 1 | ₹200 |

**Total: 15 SKUs, 148 units, ₹40,243.25 sales**

### April 2026 — Top Selling Products

| ASIN | SKU | Product Name | Units | Sales | Orders |
|---|---|---|---|---|---|
| B09R3SJPB5 | Pack of 6+device | Catche Herbal Mosquito Repellent Refill Combo (6 Refills + 1 Machine) | 35 | ₹14,657.16 | 39 |
| B077ZT3C14 | Catche must-quit-o-insta- FBA | Must-Quit-O Insta Ayurvedic Mosquito Repellent 45ml Refill (Pack of 4) | 45 | ₹11,700.00 | 44 |
| B08KXSSKSV | catche insta mosquito vapouriser | Catche Insta Mosquito Vaporizer (1 Machine + 2 Refills) | 21 | ₹4,392.00 | 20 |
| B077ZT3C14 | Catche must-quit-o insta | Must-Quit-O Insta Refill (Pack of 4) — non-FBA listing | 3 | ₹2,018.10 | 6 |
| B0B8SJ63RD | Repellent Insta + Refill | Must-Quit-O Vaporizer Combo (3 Refills + 1 Machine) | 4 | ₹1,714.30 | 7 |
| B07GQWYRFZ | Catche-MosquitoTrappellent-Comb0-FBM | Tra-Pe-Ll-Ent Combo (Machine + Refill) | 4 | ₹1,181.69 | 4 |
| B084BXXLSQ | Pack of 6-FBA | Must-Quit-O Insta 45ml (Pack of 6) — FBA | 19 | ₹1,440.00 | 4 |
| B07V7YCJ9S | Gadiva Ayurvedic Cool oil | Gadiva Ayurvedic Hair Oil 100ml | 4 | ₹1,000.00 | 5 |
| B0D7MXTFB1 | 8908006802319 | Herbal Mosquito Repellent Agarbatti (240 Sticks) | 4 | ₹960.00 | 4 |
| B01CVDD26C | Catch-e Mosquito Trapper Liquid (35 ml | Ayurvedic Mosquito Trap Refill (35ml, Pack of 4) | 3 | ₹780.00 | 3 |
| B084BXXLSQ | Pack of 6 | Must-Quit-O Insta 45ml (Pack of 6) — non-FBA | 1 | ₹360.00 | 1 |
| B092M1723Z | 73-3GX1-NZ10 | Muktha Ayurvedic Liquid Handwash (Pack of 2) | 1 | ₹200.00 | 1 |
| B08NJGSBWM | Catche mosquito repellent lotion | Ayurvedic Mosquito Repellent Lotion 60ml (Pack of 3) | 1 | ₹200.00 | 1 |

### Historical Monthly Trends (Jul 2025 — Apr 2026)

| Month | Top Product | Est. Sales |
|---|---|---|
| Apr 2026 | Refill Combo + Must-Quit-O Refill | ~₹40,243 |
| Mar 2026 | Must-Quit-O Refill (102 units) | ~₹26,257 |
| Feb 2026 | Must-Quit-O Refill (130 units) | ~₹33,791 |
| Jan 2026 | Must-Quit-O Refill (86 units) | ~₹22,351 |
| Dec 2025 | Must-Quit-O Refill (121 units) | ~₹31,448 |
| Nov 2025 | Must-Quit-O Refill (60 units) | ~₹15,597 |
| Oct 2025 | Must-Quit-O Refill (27 units) | ~₹7,020 |
| Sep 2025 | Must-Quit-O Refill (130 units) | ~₹33,791 |
| Aug 2025 | Must-Quit-O Refill (102 units) | ~₹26,257 |
| Jul 2025 | Must-Quit-O Refill (81 units) | ~₹21,057 |

**Note:** Must-Quit-O Insta Refill (B077ZT3C14) is consistently the top seller month over month.

---

## 4. Actionable Recommendations

### Campaign Optimization

1. **PAUSE IMMEDIATELY: "all products" campaign**
   - Spend: ₹1,619 | Sales: ₹305 | ROAS: 0.19x
   - 530% ACoS — losing ₹1,314/month
   - Wasting money on irrelevant searches like "steel scrubber", "herbal oils", "utensil cleaner"

2. **IMPROVE or PAUSE: "FBA PRODUCT" campaign**
   - Highest spend at ₹2,532 but only 0.76x ROAS
   - 131% ACoS — campaign is bleeding money
   - Detail page placements are underperforming (0.12% CTR)

3. **Add negative keywords:**
   - `mosquito repellent machine` — ₹351 wasted
   - `mosquito repellent for car` — ₹171 wasted
   - `mosquito killer` — ₹115 wasted
   - `camphor mosquito repellent refill` — ₹115 wasted
   - `steel scrubber` — ₹76 wasted (not even a mosquito product)

4. **DOUBBLE DOWN: "Internal Product - Display Target" campaign**
   - Best performer at ₹6,924 sales (3.07x ROAS)
   - ASIN targets (B08KXSSKSV, B084BXXLSQ) driving strong ROAS
   - Increase budget allocation

5. **Capitalize on brand search:**
   - "catche mosquito repellent" EXACT — 13.91x ROAS with ₹3,135 sales
   - Very high converting — should increase bids

### Product Strategy

6. **B09R3SJPB5 (Refill Combo)** is your best product — #1 in ad sales and #1 in organic sales. Defend this ASIN with aggressive bids.

7. **B084BXXLSQ (Pack of 6-FBA)** has 7.22x ROAS on ads but 19 units sold. This SKU is highly profitable — increase ad spend.

8. **Gadiva Ayurvedic Hair Oil and Muktha Handwash** have almost zero ad traction. Consider pausing ad campaigns for these and focusing on mosquito repellent products.

9. **Wasted spend on unrelated products**: "all products" campaign is showing your mosquito repellent ads for steel scrubber and kitchen cleaner searches — tighten targeting.

### Budget & Bidding

10. **Increase daily budgets** — overall budget utilization is 547%, meaning you're consistently spending 5x your set budget. Either raise budgets or reduce spend on losing campaigns.

11. **Shift budget from "FBA PRODUCT" to "Internal Product - Display Target"** — reallocating just ₹1,000/month could yield ~₹3,000+ in additional sales.

---

## 5. Files Modified

| File | Change |
|---|---|
| `src/sp-api/auth/tokenManager.ts` | Changed from `client_credentials` to `refresh_token` grant type |
| `src/sp-api/config.ts` | Added `refreshToken` to config interface |
| `src/sp-api/reports.ts` | Fixed field name `status` → `processingStatus`, values `COMPLETED` → `DONE`, increased poll limit to 120 |
| `scripts/sp-api-check-sales.ts` | Added configurable date range (default 400 days) |
| `.env.local` | Updated SP-API credentials with working LWA app + refresh token |
| `.env.local.example` | Added `SP_API_REFRESH_TOKEN` documentation |
| `docs/amazon-ads-complete-report.md` | Generated — full 9-report Amazon Ads performance breakdown |
