/**
 * ======================================================================
 *  DAILY SALES + ADS TRACKER - Google Apps Script (Web App)
 *  One Google Sheet with SEPARATE tabs:
 *    - Daily   (sales by day / product / channel, incl order status)
 *    - Summary (channel + daily + product totals, filterable)
 *    - Ads           (combined ad spend / impressions / sales per day per campaign)
 *    - Ads Amazon / Ads FirstCry / Ads Flipkart (per-channel ad sheets)
 *    - Ads Keyword   (keyword-wise ad performance for Amazon)
 *    - Ads Summary   (weekly + monthly spend / impressions / sales / ROAS, filterable)
 *    - Orders        (order-level detail incl status)
 *    - Inventory         (current FBA stock snapshot per SKU)
 *    - Inventory Daily   (FBA daily movement per SKU per day)
 *    - Config
 *
 *  Paste this ENTIRE file into: your Google Sheet > Extensions > Apps Script
 *  Then: Deploy > New deployment > Web app
 *        - Execute as: Me
 *        - Who has access: Anyone
 *  Copy the /exec URL and send it here. Done.
 * ======================================================================
 */

var PUSH_KEY = 'catche-daily-2026';   // <-- change to any secret you like

var DAILY_SHEET = 'Daily';
var SUMMARY_SHEET = 'Summary';
var CONFIG_SHEET = 'Config';
var ADS_SHEET = 'Ads';
var ADS_SUMMARY_SHEET = 'Ads Summary';
var ADS_KEYWORD_SHEET = 'Ads Keyword';
var ORDERS_SHEET = 'Orders';
var INVENTORY_SHEET = 'Inventory';
var INVENTORY_DAILY_SHEET = 'Inventory Daily';
var SKU_MASTER_SHEET = 'SKU Master';
var PL_SHEET = 'P&L';
var ADS_CHANNELS = ['Amazon', 'FirstCry', 'Flipkart'];
var ADS_CHANNEL_SHEETS = ADS_CHANNELS.map(function (c) { return ADS_SHEET + ' ' + c; });

var HEADERS = [
  'Sl No', 'Year', 'Month', 'Week', 'Date', 'Product', 'Channel', 'ASIN', 'SKU',
  'Units Sold', 'Net Sales (INR)', 'Orders', 'Status', 'Ship State', 'Ship City'
];

var ADS_HEADERS = [
  'Sl No', 'Year', 'Month', 'Week', 'Date', 'Channel', 'Campaign',
  'Impressions', 'Clicks', 'CTR', 'Spend (INR)', 'Sales (INR)', 'Orders', 'ROAS'
];

var ADS_CHANNEL_HEADERS = [
  'Sl No', 'Year', 'Month', 'Week', 'Date', 'Campaign',
  'Impressions', 'Clicks', 'CTR', 'Spend (INR)', 'Sales (INR)', 'Orders', 'ROAS'
];

var ADS_KEYWORD_HEADERS = [
  'Sl No', 'Year', 'Month', 'Week', 'Date', 'Channel', 'Campaign', 'Keyword', 'Match Type',
  'Impressions', 'Clicks', 'CTR', 'Spend (INR)', 'Sales (INR)', 'Orders', 'ROAS'
];

var ORDERS_HEADERS = [
  'Sl No', 'Date', 'Order ID', 'Status', 'Channel', 'Product', 'ASIN', 'SKU', 'Units', 'Sales (INR)',
  'Ship City', 'Ship State', 'Ship Postal Code', 'Ship Country'
];

var INV_HEADERS = [
  'Sl No', 'Date', 'ASIN', 'SKU', 'Product',
  'Available', 'Inbound Working', 'Inbound Shipped', 'Inbound Received', 'Inbound Total',
  'Reserved', 'Unfulfillable', 'Days of Supply', 'Total Qty', 'Last Updated'
];

var INV_DAILY_HEADERS = [
  'Sl No', 'Date', 'SKU', 'ASIN', 'FNSKU', 'Product',
  'Beginning', 'Received', 'Sold', 'Returns', 'Reserved', 'Unfulfillable', 'Inbound', 'Ending'
];

var SKU_MASTER_HEADERS = [
  'SKU', 'ASIN', 'Product', 'MRP', 'COGS', 'Amazon Fee %', 'Shipping (INR)', 'GST %', 'Notes'
];

var PL_HEADERS = [
  'Year', 'Month', 'Week', 'Week Range', 'Channel', 'Units', 'Sales (INR)', 'COGS Total (INR)', 'Fees (INR)', 'Ads Spend (INR)', 'GST (INR)', 'Profit (INR)', 'Margin %', 'ROAS'
];

var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

function fullDate(year, month, day) {
  var m = MONTHS.indexOf(month) + 1;
  return String(year) + '-' + pad2(m) + '-' + pad2(day);
}

function isoWeek(dateStr) {
  var p = String(dateStr).split('-');
  var d = new Date(Date.UTC(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10)));
  var dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  var weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return String(d.getUTCFullYear()) + '-W' + (weekNo < 10 ? '0' : '') + weekNo;
}

function getMonthWeek(day) {
  day = parseInt(day, 10);
  if (day <= 7) return 'W1';
  if (day <= 15) return 'W2';
  if (day <= 23) return 'W3';
  return 'W4';
}
function getWeekRange(w) {
  if (w === 'W1') return '1-7';
  if (w === 'W2') return '8-15';
  if (w === 'W3') return '16-23';
  return '24-end';
}

function enableFilter(sheet) {
  if (!sheet) return;
  var last = sheet.getLastRow();
  if (last < 1) return;
  try {
    if (sheet.getFilter()) return;
    var rng = sheet.getRange(1, 1, last, sheet.getLastColumn());
    rng.createFilter();
  } catch (e) { /* ignore */ }
}

/* ======================================================================
 *  DO GET - READ DATA  (?action=...)
 *    https://URL/exec?key=catche-daily-2026&action=all
 *    https://URL/exec?key=catche-daily-2026&action=summary
 *    https://URL/exec?key=catche-daily-2026&action=date&date=2026-07-31
 *    https://URL/exec?key=catche-daily-2026&action=health
 *    https://URL/exec?key=catche-daily-2026&action=adsAll
 *    https://URL/exec?key=catche-daily-2026&action=adsClear
 *    https://URL/exec?key=catche-daily-2026&action=adsChannelAll&channel=Amazon
 *    https://URL/exec?key=catche-daily-2026&action=adsKeywordAll
 *    https://URL/exec?key=catche-daily-2026&action=adsSummary
 *    https://URL/exec?key=catche-daily-2026&action=ordersAll
 *    https://URL/exec?key=catche-daily-2026&action=ordersClear
 * ====================================================================== */
function doGet(e) {
  try {
    var p = e.parameter || {};
    if (p.key !== PUSH_KEY) return json({ error: 'Invalid key' }, 403);

    ensureSheets();

    var action = p.action || 'health';

    if (action === 'health') {
      return json({ ok: true, app: 'Daily Sales + Ads Tracker', status: 'alive' });
    }

    if (action === 'summary') {
      return json({ ok: true, summary: buildSummaryData() });
    }

    if (action === 'date') {
      var rows = readDailyRows();
      var filtered = rows.filter(function (r) {
        return String(r.date) === String(p.date);
      });
      return json({ ok: true, date: p.date, rows: filtered, count: filtered.length });
    }

    if (action === 'all') {
      var all = readDailyRows();
      return json({ ok: true, rows: all, count: all.length });
    }

    if (action === 'clear') {
      var daily = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DAILY_SHEET);
      if (daily) {
        daily.clear();
        var cfg = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG_SHEET);
        if (cfg) cfg.getRange('B2').setValue('--');
      }
      return json({ ok: true, cleared: true });
    }

    if (action === 'adsAll') {
      var adrows = readAdsRows(ADS_SHEET, true);
      return json({ ok: true, rows: adrows, count: adrows.length });
    }

    if (action === 'adsClear') {
      var ads = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ADS_SHEET);
      if (ads) ads.clear();
      return json({ ok: true, cleared: true });
    }

    if (action === 'adsChannelAll') {
      var ch = String(p.channel || '');
      var chSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ADS_SHEET + ' ' + ch);
      var chrows = chSheet ? readAdsRows(ADS_SHEET + ' ' + ch, false) : [];
      return json({ ok: true, channel: ch, rows: chrows, count: chrows.length });
    }

    if (action === 'adsChannelClear') {
      var chc = String(p.channel || '');
      var chSheet2 = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ADS_SHEET + ' ' + chc);
      if (chSheet2) chSheet2.clear();
      return json({ ok: true, cleared: true });
    }

    if (action === 'adsKeywordAll') {
      var kwrows = readAdsKeywordRows();
      return json({ ok: true, rows: kwrows, count: kwrows.length });
    }

    if (action === 'adsKeywordClear') {
      var kw = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ADS_KEYWORD_SHEET);
      if (kw) kw.clear();
      return json({ ok: true, cleared: true });
    }

    if (action === 'adsSummary') {
      var summary = buildAdsSummaryData();
      writeAdsSummaryTab(summary);
      return json({ ok: true, summary: summary });
    }

    if (action === 'ordersAll') {
      var orows = readOrderRows();
      return json({ ok: true, rows: orows, count: orows.length });
    }

    if (action === 'ordersClear') {
      var ord = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORDERS_SHEET);
      if (ord) ord.clear();
      return json({ ok: true, cleared: true });
    }

    if (action === 'invAll') {
      var invrows = readInvRows();
      return json({ ok: true, rows: invrows, count: invrows.length });
    }

    if (action === 'invClear') {
      var inv = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INVENTORY_SHEET);
      if (inv) inv.clear();
      return json({ ok: true, cleared: true });
    }

    if (action === 'invDailyAll') {
      var invdrows = readInvDailyRows();
      return json({ ok: true, rows: invdrows, count: invdrows.length });
    }

    if (action === 'invDailyClear') {
      var invd = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INVENTORY_DAILY_SHEET);
      if (invd) invd.clear();
      return json({ ok: true, cleared: true });
    }

    if (action === 'pnl') {
      var pnl = buildPnLData();
      writePnLTab(pnl);
      return json({ ok: true, pnl: pnl, count: pnl.length });
    }

    if (action === 'skuMasterAll') {
      return json({ ok: true, rows: readSkuMaster(), count: readSkuMaster().length });
    }

    if (action === 'skuMasterClear') {
      var sm = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SKU_MASTER_SHEET);
      if (sm) sm.clear();
      return json({ ok: true, cleared: true });
    }

    return json({ error: 'Unknown action. Use: all | summary | date | health | clear | adsAll | adsClear | adsChannelAll | adsChannelClear | adsKeywordAll | adsKeywordClear | adsSummary | ordersAll | ordersClear | invAll | invClear | invDailyAll | invDailyClear | pnl | skuMasterAll | skuMasterClear' }, 400);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

/* ======================================================================
 *  DO POST - PUSH DATA
 *  Sales body:      { "key": "...", "rows": [ {date, channel, product, asin, sku, units, sales, orders, status}, ... ] }
 *  Ads body:        { "key": "...", "type": "ads", "rows": [ {date, channel, campaign, impressions, clicks, spend, sales, orders}, ... ] }
 *  Ads keyword body: { "key": "...", "type": "adskeyword", "rows": [ {date, channel, campaign, keyword, matchType, impressions, clicks, spend, sales, orders}, ... ] }
 *  Orders body:     { "key": "...", "type": "orders", "rows": [ {date, orderId, status, channel, product, asin, sku, units, sales}, ... ] }
 * ====================================================================== */
function doPost(e) {
  try {
    var body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (err) {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    if (body.key !== PUSH_KEY) return json({ error: 'Invalid key' }, 403);

    if (body.type === 'ads') {
      var adsRows = body.rows;
      if (!adsRows || !Array.isArray(adsRows) || adsRows.length === 0) {
        return json({ error: 'Provide a "rows" array' }, 400);
      }
      ensureSheets();
      var adsAdded = appendAdsRows(adsRows);
      return json({ ok: true, added: adsAdded, skipped: adsRows.length - adsAdded });
    }

    if (body.type === 'adskeyword') {
      var kwRows = body.rows;
      if (!kwRows || !Array.isArray(kwRows) || kwRows.length === 0) {
        return json({ error: 'Provide a "rows" array' }, 400);
      }
      ensureSheets();
      var kwAdded = appendAdsKeywordRows(kwRows);
      return json({ ok: true, added: kwAdded, skipped: kwRows.length - kwAdded });
    }

    if (body.type === 'orders') {
      var ordRows = body.rows;
      if (!ordRows || !Array.isArray(ordRows) || ordRows.length === 0) {
        return json({ error: 'Provide a "rows" array' }, 400);
      }
      ensureSheets();
      var ordAdded = appendOrderRows(ordRows);
      return json({ ok: true, added: ordAdded, skipped: ordRows.length - ordAdded });
    }

    if (body.type === 'inv') {
      var invRows = body.rows;
      if (!invRows || !Array.isArray(invRows) || invRows.length === 0) {
        return json({ error: 'Provide a "rows" array' }, 400);
      }
      ensureSheets();
      var invAdded = appendInvRows(invRows);
      return json({ ok: true, added: invAdded, skipped: invRows.length - invAdded });
    }

    if (body.type === 'invDaily') {
      var invDailyRows = body.rows;
      if (!invDailyRows || !Array.isArray(invDailyRows) || invDailyRows.length === 0) {
        return json({ error: 'Provide a "rows" array' }, 400);
      }
      ensureSheets();
      var invDailyAdded = appendInvDailyRows(invDailyRows);
      return json({ ok: true, added: invDailyAdded, skipped: invDailyRows.length - invDailyAdded });
    }

    var rows = body.rows;
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return json({ error: 'Provide a "rows" array' }, 400);
    }

    ensureSheets();
    var added = appendRows(rows);
    var data = buildSummaryData();

    return json({ ok: true, added: added, skipped: rows.length - added, summary: data });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

/* ======================================================================
 *  SHEET SETUP (auto-runs on first call - no manual step needed)
 * ====================================================================== */
function ensureSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var daily = ss.getSheetByName(DAILY_SHEET);
  if (!daily) daily = ss.insertSheet(DAILY_SHEET);
  if (daily.getLastRow() === 0) {
    daily.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
      .setFontWeight('bold').setBackground('#4472C4').setFontColor('#FFFFFF');
    daily.setFrozenRows(1);
    for (var i = 1; i <= HEADERS.length; i++) daily.setColumnWidth(i, 100);
  }
  // enforce 100 on existing Daily (agents standard)
  for (var i2 = 1; i2 <= HEADERS.length; i2++) daily.setColumnWidth(i2, 100);

  var cfg = ss.getSheetByName(CONFIG_SHEET);
  if (!cfg) {
    cfg = ss.insertSheet(CONFIG_SHEET);
    cfg.getRange(1, 1, 2, 2).setValues([
      ['PUSH_KEY', PUSH_KEY],
      ['Last push', '--']
    ]).setFontWeight('bold');
  }

  if (!ss.getSheetByName(SUMMARY_SHEET)) ss.insertSheet(SUMMARY_SHEET);

  var ads = ss.getSheetByName(ADS_SHEET);
  if (!ads) ads = ss.insertSheet(ADS_SHEET);
  if (ads.getLastRow() === 0) {
    ads.getRange(1, 1, 1, ADS_HEADERS.length).setValues([ADS_HEADERS])
      .setFontWeight('bold').setBackground('#548235').setFontColor('#FFFFFF');
    ads.setFrozenRows(1);
    for (var ai = 1; ai <= ADS_HEADERS.length; ai++) ads.setColumnWidth(ai, 100);
  }
  for (var ai2 = 1; ai2 <= ADS_HEADERS.length; ai2++) ads.setColumnWidth(ai2, 100);

  for (var ac = 0; ac < ADS_CHANNEL_SHEETS.length; ac++) {
    var acSheet = ss.getSheetByName(ADS_CHANNEL_SHEETS[ac]);
    if (!acSheet) acSheet = ss.insertSheet(ADS_CHANNEL_SHEETS[ac]);
    if (acSheet.getLastRow() === 0) {
      acSheet.getRange(1, 1, 1, ADS_CHANNEL_HEADERS.length).setValues([ADS_CHANNEL_HEADERS])
        .setFontWeight('bold').setBackground('#548235').setFontColor('#FFFFFF');
      acSheet.setFrozenRows(1);
      for (var aci = 1; aci <= ADS_CHANNEL_HEADERS.length; aci++) acSheet.setColumnWidth(aci, 100);
    }
    for (var aci2 = 1; aci2 <= ADS_CHANNEL_HEADERS.length; aci2++) acSheet.setColumnWidth(aci2, 100);
  }

  var kw = ss.getSheetByName(ADS_KEYWORD_SHEET);
  if (!kw) kw = ss.insertSheet(ADS_KEYWORD_SHEET);
  if (kw.getLastRow() === 0) {
    kw.getRange(1, 1, 1, ADS_KEYWORD_HEADERS.length).setValues([ADS_KEYWORD_HEADERS])
      .setFontWeight('bold').setBackground('#548235').setFontColor('#FFFFFF');
    kw.setFrozenRows(1);
    for (var kwi = 1; kwi <= ADS_KEYWORD_HEADERS.length; kwi++) kw.setColumnWidth(kwi, 100);
  }
  for (var kwi2 = 1; kwi2 <= ADS_KEYWORD_HEADERS.length; kwi2++) kw.setColumnWidth(kwi2, 100);

  if (!ss.getSheetByName(ADS_SUMMARY_SHEET)) ss.insertSheet(ADS_SUMMARY_SHEET);

  var ord = ss.getSheetByName(ORDERS_SHEET);
  if (!ord) ord = ss.insertSheet(ORDERS_SHEET);
  if (ord.getLastRow() === 0) {
    ord.getRange(1, 1, 1, ORDERS_HEADERS.length).setValues([ORDERS_HEADERS])
      .setFontWeight('bold').setBackground('#7030A0').setFontColor('#FFFFFF');
    ord.setFrozenRows(1);
    var ow = [6, 11, 20, 30, 12, 60, 16, 35, 8, 12];
    for (var oi = 0; oi < ow.length; oi++) ord.setColumnWidth(oi + 1, ow[oi]);
  }

  var inv = ss.getSheetByName(INVENTORY_SHEET);
  if (!inv) inv = ss.insertSheet(INVENTORY_SHEET);
  if (inv.getLastRow() === 0) {
    inv.getRange(1, 1, 1, INV_HEADERS.length).setValues([INV_HEADERS])
      .setFontWeight('bold').setBackground('#C55A11').setFontColor('#FFFFFF');
    inv.setFrozenRows(1);
    for (var ii = 0; ii < INV_HEADERS.length; ii++) inv.setColumnWidth(ii + 1, 100);
  }

  var invd = ss.getSheetByName(INVENTORY_DAILY_SHEET);
  if (!invd) invd = ss.insertSheet(INVENTORY_DAILY_SHEET);
  if (invd.getLastRow() === 0) {
    invd.getRange(1, 1, 1, INV_DAILY_HEADERS.length).setValues([INV_DAILY_HEADERS])
      .setFontWeight('bold').setBackground('#C55A11').setFontColor('#FFFFFF');
    invd.setFrozenRows(1);
    for (var di = 0; di < INV_DAILY_HEADERS.length; di++) invd.setColumnWidth(di + 1, 100);
  }

  var skuMaster = ss.getSheetByName(SKU_MASTER_SHEET);
  if (!skuMaster) skuMaster = ss.insertSheet(SKU_MASTER_SHEET);
  if (skuMaster.getLastRow() === 0) {
    skuMaster.getRange(1, 1, 1, SKU_MASTER_HEADERS.length).setValues([SKU_MASTER_HEADERS])
      .setFontWeight('bold').setBackground('#0F4C75').setFontColor('#FFFFFF');
    skuMaster.setFrozenRows(1);
    for (var sm = 1; sm <= SKU_MASTER_HEADERS.length; sm++) skuMaster.setColumnWidth(sm, 100);
    // seed Amazon SKUs with placeholder COGS (update COGS column)
    var seed = [
      ['Pack of 6+device', 'B09R3SJPB5', 'Catche Herbal Mosquito Repellent Refill Combo | 6 Refills + 1 Machine', 492, 180, 18, 40, 18, 'placeholder - update COGS'],
      ['Pack of 6', 'B084BXXLSQ', 'Catche must-quit-o insta Refill 45 ML (Pack of 6)', 552, 140, 18, 40, 18, 'placeholder'],
      ['CT_TRAP_COMBO', 'B07GQWYRFZ', 'Catche Must-Quit-O Ayurvedic Mosquito Tra-Pe-Ll-Ent Combo', 450, 160, 18, 45, 18, 'placeholder'],
      ['CT_INSTA_COM_1M+2R', 'B08KXSSKSV', 'Catche Insta Mosquito Vaporizer - 1 Machine + 2 Refills', 225, 90, 18, 40, 18, 'placeholder'],
      ['Catche must-quit-o insta', 'B077ZT3C14', 'Catche Must-Quit-O Insta 45ml Refill (Pack of 4)', 368, 110, 18, 40, 18, 'placeholder'],
      ['Repellent Insta + Refill', 'B0B8SJ63RD', 'Catche Must-Quit-O Vaporizer Combo 3 Refills + 1 Machine', 317, 120, 18, 40, 18, 'placeholder'],
      ['CT_INSTA_REF_P4', '', 'Catche Insta Refill Pack of 4', 337, 100, 18, 35, 18, 'flipkart'],
      ['Catche must-quit-o Insta Repellent (Pack of 8)', '', 'Catche Insta Pack of 8', 420, 130, 18, 40, 18, 'flipkart'],
      ['GD_HAIR_OIL', '', 'Gadiva Hair Oil', 249, 80, 18, 30, 18, 'placeholder']
    ];
    skuMaster.getRange(2, 1, seed.length, SKU_MASTER_HEADERS.length).setValues(seed);
  }
  for (var sm2 = 1; sm2 <= SKU_MASTER_HEADERS.length; sm2++) skuMaster.setColumnWidth(sm2, 100);

  var pl = ss.getSheetByName(PL_SHEET);
  if (!pl) pl = ss.insertSheet(PL_SHEET);
  if (pl.getLastRow() === 0) {
    pl.getRange(1, 1, 1, PL_HEADERS.length).setValues([PL_HEADERS])
      .setFontWeight('bold').setBackground('#0F4C75').setFontColor('#FFFFFF');
    pl.setFrozenRows(1);
    for (var pi = 1; pi <= PL_HEADERS.length; pi++) pl.setColumnWidth(pi, 100);
  }
  for (var pi2 = 1; pi2 <= PL_HEADERS.length; pi2++) pl.setColumnWidth(pi2, 100);

  // enforce width 100 on Summary + Ads Summary (agents standard)
  var sumSheet = ss.getSheetByName(SUMMARY_SHEET);
  if (sumSheet) { for (var ci = 1; ci <= Math.min(20, sumSheet.getMaxColumns()); ci++) sumSheet.setColumnWidth(ci, 100); }
  var adsSumSheet = ss.getSheetByName(ADS_SUMMARY_SHEET);
  if (adsSumSheet) { for (var ci2 = 1; ci2 <= Math.min(26, adsSumSheet.getMaxColumns()); ci2++) adsSumSheet.setColumnWidth(ci2, 100); }
}

/* ======================================================================
 *  DAILY SALES - WRITE LOGIC (dedupe on date+channel+asin+product+sku+status)
 * ====================================================================== */
function fmtDate(v) {
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(v).slice(0, 10);
}

function appendRows(rows) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(DAILY_SHEET);
  var existing = {};
  var last = sheet.getLastRow();
  if (last >= 2) {
    var data = sheet.getRange(2, 2, last - 1, HEADERS.length - 1).getValues();
    for (var i = 0; i < data.length; i++) {
      var k = data[i];
      existing[keyOf(fullDate(k[0], k[1], k[3]), k[5], k[6], k[4], k[7], k[11], k[12], k[13])] = true;
    }
  }

  var toAdd = [];
  var added = 0;
  for (var j = 0; j < rows.length; j++) {
    var r = normalize(rows[j]);
    if (!r) continue;
    var key = keyOf(fullDate(r[0], r[1], r[3]), r[5], r[6], r[4], r[7], r[11], r[12], r[13]);
    if (existing[key]) continue;
    existing[key] = true;
    toAdd.push(r);
    added++;
  }

  if (toAdd.length > 0) {
    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 2, toAdd.length, HEADERS.length - 1).setValues(toAdd);
    for (var s = 0; s < toAdd.length; s++) {
      sheet.getRange(startRow + s, 1).setFormula('=ROW()-1');
    }
  }

  var cfg = ss.getSheetByName(CONFIG_SHEET);
  if (cfg) {
    var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    cfg.getRange('B2').setValue(now);
  }
  return added;
}

function normalize(r) {
  var date = r.date || r.Date || '';
  var channel = r.channel || r.Channel || '';
  var product = r.product || r.Product || '';
  var asin = r.asin || r.ASIN || '';
  var sku = r.sku || r.SKU || '';
  var units = Number(r.units || 0) || 0;
  var sales = Number(r.sales || 0) || 0;
  var orders = Number(r.orders || 0) || 0;
  var status = r.status || r.Status || '';
  var shipState = r.shipState || r.ShipState || '';
  var shipCity = r.shipCity || r.ShipCity || '';
  if (!date || !channel || !product) return null;
  var parts = String(date).split('-');
  if (parts.length < 3) return null;
  var year = parseInt(parts[0], 10);
  var month = MONTHS[parseInt(parts[1], 10) - 1];
  var day = parseInt(parts[2], 10);
  if (!month) return null;
  var week = getMonthWeek(day);
  return [String(year), month, week, String(day), String(product), String(channel), String(asin), String(sku), units, sales, orders, String(status), String(shipState), String(shipCity)];
}

function keyOf(date, channel, asin, product, sku, status, shipState, shipCity) {
  return [date, channel, asin || product, product, sku, status, shipState || '', shipCity || ''].join('|').toLowerCase();
}

/* ======================================================================
 *  ADS - WRITE LOGIC (dedupe on date+channel+campaign)
 *  Writes to the combined 'Ads' tab AND the per-channel tab.
 * ====================================================================== */
function ctrOf(impressions, clicks) {
  var i = Number(impressions || 0);
  var c = Number(clicks || 0);
  if (i <= 0) return 0;
  return Math.round(c / i * 10000) / 100;
}

function normalizeAds(r) {
  var date = r.date || r.Date || '';
  var channel = r.channel || r.Channel || '';
  var campaign = r.campaign || r.Campaign || '';
  var impressions = Number(r.impressions || 0) || 0;
  var clicks = Number(r.clicks || 0) || 0;
  var spend = Number(r.spend || 0) || 0;
  var sales = Number(r.sales || 0) || 0;
  var orders = Number(r.orders || 0) || 0;
  if (!date || !channel || !campaign) return null;
  var parts = String(date).split('-');
  if (parts.length < 3) return null;
  var year = parseInt(parts[0], 10);
  var month = MONTHS[parseInt(parts[1], 10) - 1];
  var day = parseInt(parts[2], 10);
  if (!month) return null;
  var week = getMonthWeek(day);
  var roas = spend > 0 ? round2(sales / spend) : 0;
  return [String(year), month, week, String(day), String(channel), String(campaign),
          impressions, clicks, ctrOf(impressions, clicks), spend, sales, orders, roas];
}

function normalizeAdsChannel(r) {
  var n = normalizeAds(r);
  if (!n) return null;
  return [n[0], n[1], n[2], n[3], n[5], n[6], n[7], n[8], n[9], n[10], n[11], n[12]];
}

function keyOfAds(fullDate, channel, campaign) {
  return [fullDate, channel, campaign].join('|').toLowerCase();
}

function keyOfAdsChannel(fullDate, campaign) {
  return [fullDate, campaign].join('|').toLowerCase();
}

function appendAdsRows(rows) {
  var combined = appendAdsRowsToSheet(ADS_SHEET, rows, true);
  var byChannel = {};
  for (var i = 0; i < rows.length; i++) {
    var ch = String(rows[i].channel || rows[i].Channel || '').trim();
    if (!ch) continue;
    if (!byChannel[ch]) byChannel[ch] = [];
    byChannel[ch].push(rows[i]);
  }
  var channelAdded = 0;
  for (var chKey in byChannel) {
    var sheetName = ADS_SHEET + ' ' + chKey;
    channelAdded += appendAdsRowsToSheet(sheetName, byChannel[chKey], false);
  }
  return combined + channelAdded;
}

function appendAdsRowsToSheet(sheetName, rows, hasChannel) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return 0;
  var existing = {};
  var last = sheet.getLastRow();
  var dataCols = hasChannel ? ADS_HEADERS.length - 1 : ADS_CHANNEL_HEADERS.length - 1;
  if (last >= 2) {
    var data = sheet.getRange(2, 2, last - 1, dataCols).getValues();
    for (var i = 0; i < data.length; i++) {
      var k = data[i];
      if (hasChannel) {
        existing[keyOfAds(fullDate(k[0], k[1], k[3]), k[4], k[5])] = true;
      } else {
        existing[keyOfAdsChannel(fullDate(k[0], k[1], k[3]), k[4])] = true;
      }
    }
  }

  var toAdd = [];
  var added = 0;
  for (var j = 0; j < rows.length; j++) {
    var r = hasChannel ? normalizeAds(rows[j]) : normalizeAdsChannel(rows[j]);
    if (!r) continue;
    var key;
    if (hasChannel) {
      key = keyOfAds(fullDate(r[0], r[1], r[3]), r[4], r[5]);
    } else {
      key = keyOfAdsChannel(fullDate(r[0], r[1], r[3]), r[4]);
    }
    if (existing[key]) continue;
    existing[key] = true;
    toAdd.push(r);
    added++;
  }

  if (toAdd.length > 0) {
    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 2, toAdd.length, dataCols).setValues(toAdd);
    for (var s = 0; s < toAdd.length; s++) {
      sheet.getRange(startRow + s, 1).setFormula('=ROW()-1');
    }
  }
  return added;
}

/* ======================================================================
 *  ADS KEYWORD - WRITE LOGIC (dedupe on date+channel+campaign+keyword+matchType)
 * ====================================================================== */
function normalizeAdsKeyword(r) {
  var date = r.date || r.Date || '';
  var channel = r.channel || r.Channel || '';
  var campaign = r.campaign || r.Campaign || '';
  var keyword = r.keyword || r.Keyword || '';
  var matchType = r.matchType || r.matchType || r.MatchType || '';
  var impressions = Number(r.impressions || 0) || 0;
  var clicks = Number(r.clicks || 0) || 0;
  var spend = Number(r.spend || 0) || 0;
  var sales = Number(r.sales || 0) || 0;
  var orders = Number(r.orders || 0) || 0;
  if (!date || !channel || !campaign) return null;
  var parts = String(date).split('-');
  if (parts.length < 3) return null;
  var year = parseInt(parts[0], 10);
  var month = MONTHS[parseInt(parts[1], 10) - 1];
  var day = parseInt(parts[2], 10);
  if (!month) return null;
  var week = getMonthWeek(day);
  var roas = spend > 0 ? round2(sales / spend) : 0;
  return [String(year), month, week, String(day), String(channel), String(campaign), String(keyword), String(matchType),
          impressions, clicks, ctrOf(impressions, clicks), spend, sales, orders, roas];
}

function keyOfAdsKeyword(fullDate, channel, campaign, keyword, matchType) {
  return [fullDate, channel, campaign, keyword, matchType].join('|').toLowerCase();
}

function appendAdsKeywordRows(rows) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(ADS_KEYWORD_SHEET);
  var existing = {};
  var last = sheet.getLastRow();
  var dataCols = ADS_KEYWORD_HEADERS.length - 1;
  if (last >= 2) {
    var data = sheet.getRange(2, 2, last - 1, dataCols).getValues();
    for (var i = 0; i < data.length; i++) {
      var k = data[i];
      existing[keyOfAdsKeyword(fullDate(k[0], k[1], k[3]), k[4], k[5], k[6], k[7])] = true;
    }
  }

  var toAdd = [];
  var added = 0;
  for (var j = 0; j < rows.length; j++) {
    var r = normalizeAdsKeyword(rows[j]);
    if (!r) continue;
    var key = keyOfAdsKeyword(fullDate(r[0], r[1], r[3]), r[4], r[5], r[6], r[7]);
    if (existing[key]) continue;
    existing[key] = true;
    toAdd.push(r);
    added++;
  }

  if (toAdd.length > 0) {
    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 2, toAdd.length, dataCols).setValues(toAdd);
    for (var s = 0; s < toAdd.length; s++) {
      sheet.getRange(startRow + s, 1).setFormula('=ROW()-1');
    }
  }
  return added;
}

/* ======================================================================
 *  ORDERS - WRITE LOGIC (dedupe on date+orderId+channel+asin+sku)
 * ====================================================================== */
function normalizeOrder(r) {
  var date = r.date || r.Date || '';
  var orderId = r.orderId || r.orderid || '';
  var status = r.status || r.Status || '';
  var channel = r.channel || r.Channel || '';
  var product = r.product || r.Product || '';
  var asin = r.asin || r.ASIN || '';
  var sku = r.sku || r.SKU || '';
  var units = Number(r.units || 0) || 0;
  var sales = Number(r.sales || 0) || 0;
  if (!date || !orderId || !channel) return null;
  return [String(date).slice(0, 10), String(orderId), String(status), String(channel), String(product),
          String(asin), String(sku), units, sales,
          String(r.shipCity || ''), String(r.shipState || ''), String(r.shipPostalCode || ''), String(r.shipCountry || '')];
}

function keyOfOrder(date, orderId, channel, asin, sku) {
  return [String(date), String(orderId), String(channel), String(asin), String(sku)].join('|').toLowerCase();
}

function appendOrderRows(rows) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(ORDERS_SHEET);
  var existing = {};
  var last = sheet.getLastRow();
  var dataCols = ORDERS_HEADERS.length - 1;
  if (last >= 2) {
    var data = sheet.getRange(2, 2, last - 1, dataCols).getValues();
    for (var i = 0; i < data.length; i++) {
      var k = data[i];
      existing[keyOfOrder(fmtDate(k[0]), k[1], k[3], k[5], k[6])] = true;
    }
  }

  var toAdd = [];
  var added = 0;
  for (var j = 0; j < rows.length; j++) {
    var r = normalizeOrder(rows[j]);
    if (!r) continue;
    var key = keyOfOrder(r[0], r[1], r[3], r[5], r[6]);
    if (existing[key]) continue;
    existing[key] = true;
    toAdd.push(r);
    added++;
  }

  if (toAdd.length > 0) {
    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 2, toAdd.length, dataCols).setValues(toAdd);
    for (var s = 0; s < toAdd.length; s++) {
      sheet.getRange(startRow + s, 1).setFormula('=ROW()-1');
    }
  }
  return added;
}

/* ======================================================================
 *  INVENTORY - SNAPSHOT WRITE/READ (dedupe on date+sku)
 * ====================================================================== */
function normalizeInv(r) {
  var date = r.date || r.Date || '';
  var asin = r.asin || r.ASIN || '';
  var sku = r.sku || r.SKU || '';
  var product = r.product || r.Product || '';
  if (!date || !sku) return null;
  var n = function (v) { return Number(v || 0) || 0; };
  return [
    String(date).slice(0, 10), String(asin), String(sku), String(product),
    n(r.available), n(r.inboundWorking), n(r.inboundShipped), n(r.inboundReceived), n(r.inboundTotal),
    n(r.reserved), n(r.unfulfillable), n(r.daysOfSupply), n(r.totalQty),
    r.lastUpdated ? String(r.lastUpdated) : ''
  ];
}

function keyOfInv(date, sku) {
  return String(date) + '|' + String(sku).toLowerCase();
}

function appendInvRows(rows) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(INVENTORY_SHEET);
  var existing = {};
  var last = sheet.getLastRow();
  if (last >= 2) {
    var data = sheet.getRange(2, 1, last - 1, INV_HEADERS.length).getValues();
    for (var i = 0; i < data.length; i++) {
      existing[keyOfInv(fmtDate(data[i][1]), data[i][3])] = true;
    }
  }

  var toAdd = [];
  var added = 0;
  for (var j = 0; j < rows.length; j++) {
    var r = normalizeInv(rows[j]);
    if (!r) continue;
    var key = keyOfInv(r[0], r[2]);
    if (existing[key]) continue;
    existing[key] = true;
    toAdd.push(r);
    added++;
  }

  if (toAdd.length > 0) {
    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 2, toAdd.length, INV_HEADERS.length - 1).setValues(toAdd);
    for (var s = 0; s < toAdd.length; s++) {
      sheet.getRange(startRow + s, 1).setFormula('=ROW()-1');
    }
  }
  return added;
}

function readInvRows() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(INVENTORY_SHEET);
  var last = sheet.getLastRow();
  var out = [];
  if (last < 2) return out;
  var data = sheet.getRange(2, 2, last - 1, INV_HEADERS.length - 1).getValues();
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    out.push({
      date: fmtDate(r[0]), asin: String(r[1]), sku: String(r[2]), product: String(r[3]),
      available: Number(r[4]) || 0, inboundWorking: Number(r[5]) || 0, inboundShipped: Number(r[6]) || 0,
      inboundReceived: Number(r[7]) || 0, inboundTotal: Number(r[8]) || 0,
      reserved: Number(r[9]) || 0, unfulfillable: Number(r[10]) || 0,
      daysOfSupply: Number(r[11]) || 0, totalQty: Number(r[12]) || 0, lastUpdated: String(r[13])
    });
  }
  return out;
}

/* ======================================================================
 *  INVENTORY DAILY - MOVEMENT WRITE/READ (dedupe on date+sku)
 * ====================================================================== */
function normalizeInvDaily(r) {
  var date = r.date || r.Date || '';
  var sku = r.sku || r.SKU || '';
  if (!date || !sku) return null;
  var n = function (v) { return Number(v || 0) || 0; };
  return [
    String(date).slice(0, 10), String(sku), String(r.asin || r.ASIN || ''), String(r.fnsku || r.FNSKU || ''),
    String(r.product || r.Product || ''),
    n(r.beginning), n(r.received), n(r.sold), n(r.returns), n(r.reserved), n(r.unfulfillable), n(r.inbound), n(r.ending)
  ];
}

function keyOfInvDaily(date, sku) {
  return String(date) + '|' + String(sku).toLowerCase();
}

function appendInvDailyRows(rows) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(INVENTORY_DAILY_SHEET);
  var existing = {};
  var last = sheet.getLastRow();
  if (last >= 2) {
    var data = sheet.getRange(2, 1, last - 1, INV_DAILY_HEADERS.length).getValues();
    for (var i = 0; i < data.length; i++) {
      existing[keyOfInvDaily(fmtDate(data[i][1]), data[i][2])] = true;
    }
  }

  var toAdd = [];
  var added = 0;
  for (var j = 0; j < rows.length; j++) {
    var r = normalizeInvDaily(rows[j]);
    if (!r) continue;
    var key = keyOfInvDaily(r[0], r[1]);
    if (existing[key]) continue;
    existing[key] = true;
    toAdd.push(r);
    added++;
  }

  if (toAdd.length > 0) {
    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 2, toAdd.length, INV_DAILY_HEADERS.length - 1).setValues(toAdd);
    for (var s = 0; s < toAdd.length; s++) {
      sheet.getRange(startRow + s, 1).setFormula('=ROW()-1');
    }
  }
  return added;
}

function readInvDailyRows() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(INVENTORY_DAILY_SHEET);
  var last = sheet.getLastRow();
  var out = [];
  if (last < 2) return out;
  var data = sheet.getRange(2, 2, last - 1, INV_DAILY_HEADERS.length - 1).getValues();
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    out.push({
      date: fmtDate(r[0]), sku: String(r[1]), asin: String(r[2]), fnsku: String(r[3]), product: String(r[4]),
      beginning: Number(r[5]) || 0, received: Number(r[6]) || 0, sold: Number(r[7]) || 0, returns: Number(r[8]) || 0,
      reserved: Number(r[9]) || 0, unfulfillable: Number(r[10]) || 0, inbound: Number(r[11]) || 0, ending: Number(r[12]) || 0
    });
  }
  return out;
}

function readAdsRows(sheetName, hasChannel) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  var last = sheet.getLastRow();
  var out = [];
  if (last < 2) return out;
  var dataCols = hasChannel ? ADS_HEADERS.length - 1 : ADS_CHANNEL_HEADERS.length - 1;
  var data = sheet.getRange(2, 2, last - 1, dataCols).getValues();
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    var y = r[0];
    var dd = r[3];
    if (Object.prototype.toString.call(y) === '[object Date]' && !isNaN(y.getTime())) y = y.getFullYear();
    else y = parseInt(String(y), 10);
    if (Object.prototype.toString.call(dd) === '[object Date]' && !isNaN(dd.getTime())) dd = dd.getDate();
    else dd = parseInt(String(dd), 10);
    var row = {
      date: fullDate(y, r[1], dd),
      year: y, month: String(r[1]), week: String(r[2]), day: dd,
      campaign: String(r[4]),
      impressions: Number(r[5]) || 0, clicks: Number(r[6]) || 0, ctr: Number(r[7]) || 0,
      spend: Number(r[8]) || 0, sales: Number(r[9]) || 0, orders: Number(r[10]) || 0,
      roas: Number(r[11]) || 0
    };
    if (hasChannel) {
      row.channel = String(r[4]);
      row.campaign = String(r[5]);
      row.impressions = Number(r[6]) || 0; row.clicks = Number(r[7]) || 0; row.ctr = Number(r[8]) || 0;
      row.spend = Number(r[9]) || 0; row.sales = Number(r[10]) || 0; row.orders = Number(r[11]) || 0;
      row.roas = Number(r[12]) || (row.spend > 0 ? round2(row.sales / row.spend) : 0);
    } else {
      row.roas = Number(r[11]) || (row.spend > 0 ? round2(row.sales / row.spend) : 0);
    }
    out.push(row);
  }
  return out;
}

function readAdsKeywordRows() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(ADS_KEYWORD_SHEET);
  var last = sheet.getLastRow();
  var out = [];
  if (last < 2) return out;
  var data = sheet.getRange(2, 2, last - 1, ADS_KEYWORD_HEADERS.length - 1).getValues();
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    var y = r[0];
    var dd = r[3];
    if (Object.prototype.toString.call(y) === '[object Date]' && !isNaN(y.getTime())) y = y.getFullYear();
    else y = parseInt(String(y), 10);
    if (Object.prototype.toString.call(dd) === '[object Date]' && !isNaN(dd.getTime())) dd = dd.getDate();
    else dd = parseInt(String(dd), 10);
    out.push({
      date: fullDate(y, r[1], dd),
      year: y, month: String(r[1]), week: String(r[2]), day: dd,
      channel: String(r[4]), campaign: String(r[5]), keyword: String(r[6]), matchType: String(r[7]),
      impressions: Number(r[8]) || 0, clicks: Number(r[9]) || 0, ctr: Number(r[10]) || 0,
      spend: Number(r[11]) || 0, sales: Number(r[12]) || 0, orders: Number(r[13]) || 0,
      roas: Number(r[14]) || (Number(r[11]) > 0 ? round2(Number(r[12]) / Number(r[11])) : 0)
    });
  }
  return out;
}

function readOrderRows() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(ORDERS_SHEET);
  var last = sheet.getLastRow();
  var out = [];
  if (last < 2) return out;
  var data = sheet.getRange(2, 2, last - 1, ORDERS_HEADERS.length - 1).getValues();
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    out.push({
      date: fmtDate(r[0]), orderId: String(r[1]), status: String(r[2]), channel: String(r[3]),
      product: String(r[4]), asin: String(r[5]), sku: String(r[6]),
      units: Number(r[7]) || 0, sales: Number(r[8]) || 0,
      shipCity: String(r[9] || ''), shipState: String(r[10] || ''),
      shipPostalCode: String(r[11] || ''), shipCountry: String(r[12] || '')
    });
  }
  return out;
}

function round2(v) { return Math.round(v * 100) / 100; }

/* ======================================================================
 *  ADS SUMMARY (weekly + monthly + overall ROAS)
 * ====================================================================== */
function buildAdsSummaryData() {
  var rows = readAdsRows(ADS_SHEET, true);
  var weekly = {}, monthly = {}, wTot = {}, mTot = {};
  var dayTotals = { spend: 0, impressions: 0, sales: 0, clicks: 0, orders: 0 };

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    dayTotals.spend += r.spend;
    dayTotals.impressions += r.impressions;
    dayTotals.sales += r.sales;
    dayTotals.clicks += r.clicks;
    dayTotals.orders += r.orders;

    var wk = r.year + '|' + r.month + '|' + r.week;
    var mk = r.year + '|' + r.month;
    var wck = wk + '|' + r.channel;
    var mck = mk + '|' + r.channel;
    if (!weekly[wck]) weekly[wck] = { year: r.year, month: r.month, week: r.week, weekRange: getWeekRange(r.week), channel: r.channel, impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0 };
    if (!monthly[mck]) monthly[mck] = { year: r.year, month: r.month, channel: r.channel, impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0 };
    weekly[wck].impressions += r.impressions; weekly[wck].clicks += r.clicks;
    weekly[wck].spend += r.spend; weekly[wck].sales += r.sales; weekly[wck].orders += r.orders;
    monthly[mck].impressions += r.impressions; monthly[mck].clicks += r.clicks;
    monthly[mck].spend += r.spend; monthly[mck].sales += r.sales; monthly[mck].orders += r.orders;
    if (!wTot[wk]) wTot[wk] = { year: r.year, month: r.month, week: r.week, weekRange: getWeekRange(r.week), impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0 };
    if (!mTot[mk]) mTot[mk] = { year: r.year, month: r.month, impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0 };
    wTot[wk].impressions += r.impressions; wTot[wk].clicks += r.clicks;
    wTot[wk].spend += r.spend; wTot[wk].sales += r.sales; wTot[wk].orders += r.orders;
    mTot[mk].impressions += r.impressions; mTot[mk].clicks += r.clicks;
    mTot[mk].spend += r.spend; mTot[mk].sales += r.sales; mTot[mk].orders += r.orders;
  }

  function wLine(x) { x.roas = x.spend > 0 ? round2(x.sales / x.spend) : 0; return x; }
  var weeklyOut = Object.keys(weekly).map(function (k) { return wLine(weekly[k]); })
    .sort(function (a, b) { return a.year - b.year || MONTHS.indexOf(a.month) - MONTHS.indexOf(b.month) || a.week.localeCompare(b.week) || a.channel.localeCompare(b.channel); });
  var monthlyOut = Object.keys(monthly).map(function (k) { return wLine(monthly[k]); })
    .sort(function (a, b) { return a.year - b.year || MONTHS.indexOf(a.month) - MONTHS.indexOf(b.month) || a.channel.localeCompare(b.channel); });
  var weeklyTotals = Object.keys(wTot).map(function (k) { return wLine(wTot[k]); })
    .sort(function (a, b) { return a.year - b.year || MONTHS.indexOf(a.month) - MONTHS.indexOf(b.month) || a.week.localeCompare(b.week); });
  var monthlyTotals = Object.keys(mTot).map(function (k) { return wLine(mTot[k]); })
    .sort(function (a, b) { return a.year - b.year || MONTHS.indexOf(a.month) - MONTHS.indexOf(b.month); });

  return {
    daily: { spend: round2(dayTotals.spend), impressions: dayTotals.impressions, sales: round2(dayTotals.sales), clicks: dayTotals.clicks, orders: dayTotals.orders,
             roas: dayTotals.spend > 0 ? round2(dayTotals.sales / dayTotals.spend) : 0 },
    weekly: weeklyOut, monthly: monthlyOut, weeklyTotals: weeklyTotals, monthlyTotals: monthlyTotals
  };
}

function writeAdsSummaryTab(summary) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName(ADS_SUMMARY_SHEET);
  if (!s) s = ss.insertSheet(ADS_SUMMARY_SHEET);
  s.clear();

  var rows = readAdsRows(ADS_SHEET, true);
  var channels = [];
  var byDate = {};
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (channels.indexOf(r.channel) === -1) channels.push(r.channel);
    if (!byDate[r.date]) byDate[r.date] = {};
    if (!byDate[r.date][r.channel]) byDate[r.date][r.channel] = { impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0 };
    var a = byDate[r.date][r.channel];
    a.impressions += r.impressions; a.clicks += r.clicks;
    a.spend += r.spend; a.sales += r.sales; a.orders += r.orders;
  }
  channels.sort();

  var hdr = ['Date'];
  channels.forEach(function (c) {
    hdr.push(c + ' Impressions', c + ' Clicks', c + ' CTR %', c + ' Spend (INR)', c + ' Sales (INR)', c + ' Orders', c + ' ROAS');
  });
  hdr.push('Total Impressions', 'Total Clicks', 'Total CTR %', 'Total Spend (INR)', 'Total Sales (INR)', 'Total Orders', 'Total ROAS');
  s.getRange(1, 1, 1, hdr.length).setValues([hdr])
    .setFontWeight('bold').setBackground('#548235').setFontColor('#FFFFFF');

  var dates = Object.keys(byDate).sort();
  var out = [];
  var tImp = 0, tClk = 0, tSpd = 0, tSal = 0, tOrd = 0;
  for (var d = 0; d < dates.length; d++) {
    var row = [dates[d]];
    var dImp = 0, dClk = 0, dSpd = 0, dSal = 0, dOrd = 0;
    channels.forEach(function (c) {
      var a = byDate[dates[d]][c] || { impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0 };
      var ctr = a.impressions > 0 ? round2(a.clicks / a.impressions * 100) : 0;
      var roas = a.spend > 0 ? round2(a.sales / a.spend) : 0;
      row.push(a.impressions, a.clicks, ctr, round2(a.spend), round2(a.sales), a.orders, roas);
      dImp += a.impressions; dClk += a.clicks; dSpd += a.spend; dSal += a.sales; dOrd += a.orders;
    });
    var dCtr = dImp > 0 ? round2(dClk / dImp * 100) : 0;
    var dRoas = dSpd > 0 ? round2(dSal / dSpd) : 0;
    row.push(dImp, dClk, dCtr, round2(dSpd), round2(dSal), dOrd, dRoas);
    tImp += dImp; tClk += dClk; tSpd += dSpd; tSal += dSal; tOrd += dOrd;
    out.push(row);
  }
  if (out.length > 0) {
    s.getRange(2, 1, out.length, hdr.length).setValues(out);
    s.getRange(2, 1, 1, hdr.length).setFontWeight('bold');
  }
  var totalRow = ['TOTAL'];
  var byChannelTot = {};
  for (var t = 0; t < rows.length; t++) {
    var rr = rows[t];
    if (!byChannelTot[rr.channel]) byChannelTot[rr.channel] = { impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0 };
    var aa = byChannelTot[rr.channel];
    aa.impressions += rr.impressions; aa.clicks += rr.clicks;
    aa.spend += rr.spend; aa.sales += rr.sales; aa.orders += rr.orders;
  }
  channels.forEach(function (c) {
    var a = byChannelTot[c] || { impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0 };
    var ctr = a.impressions > 0 ? round2(a.clicks / a.impressions * 100) : 0;
    var roas = a.spend > 0 ? round2(a.sales / a.spend) : 0;
    totalRow.push(a.impressions, a.clicks, ctr, round2(a.spend), round2(a.sales), a.orders, roas);
  });
  var tCtr = tImp > 0 ? round2(tClk / tImp * 100) : 0;
  var tRoas = tSpd > 0 ? round2(tSal / tSpd) : 0;
  totalRow.push(tImp, tClk, tCtr, round2(tSpd), round2(tSal), tOrd, tRoas);
  var last = 2 + out.length;
  s.getRange(last, 1, 1, hdr.length).setValues([totalRow]).setFontWeight('bold').setBackground('#D9E1F2');

  // === WEEKLY BUCKETS W1(1-7) W2(8-15) W3(16-23) W4(24-end) per channel ===
  var secRow = last + 3;
  s.getRange(secRow, 1, 1, 11).setValues([['Weekly Buckets — W1(1-7) W2(8-15) W3(16-23) W4(24-end) — per channel', '', '', '', '', '', '', '', '', '', '']]).setFontWeight('bold').setBackground('#70AD47').setFontColor('#FFFFFF');
  s.getRange(secRow + 1, 1, 1, 11).setValues([['Year', 'Month', 'Week', 'Week Range', 'Channel', 'Impressions', 'Clicks', 'Spend (INR)', 'Sales (INR)', 'Orders', 'ROAS']]).setFontWeight('bold').setBackground('#E2EFDA');
  // build weekly map from rows
  var wMap = {};
  for (var wi = 0; wi < rows.length; wi++) {
    var wr = rows[wi];
    var wkKey = wr.year + '|' + wr.month + '|' + wr.week + '|' + wr.channel;
    if (!wMap[wkKey]) wMap[wkKey] = { year: wr.year, month: wr.month, week: wr.week, weekRange: getWeekRange(wr.week), channel: wr.channel, impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0 };
    wMap[wkKey].impressions += wr.impressions; wMap[wkKey].clicks += wr.clicks; wMap[wkKey].spend += wr.spend; wMap[wkKey].sales += wr.sales; wMap[wkKey].orders += wr.orders;
  }
  var wKeys = Object.keys(wMap).sort(function (a, b) {
    var pa = a.split('|'), pb = b.split('|');
    return parseInt(pa[0]) - parseInt(pb[0]) || MONTHS.indexOf(pa[1]) - MONTHS.indexOf(pb[1]) || pa[2].localeCompare(pb[2]) || pa[3].localeCompare(pb[3]);
  });
  var wOut = wKeys.map(function (k) {
    var x = wMap[k];
    var ctr = x.impressions > 0 ? round2(x.clicks / x.impressions * 100) : 0;
    var roas = x.spend > 0 ? round2(x.sales / x.spend) : 0;
    return [x.year, x.month, x.week, x.weekRange, x.channel, x.impressions, x.clicks, round2(x.spend), round2(x.sales), x.orders, roas];
  });
  if (wOut.length > 0) s.getRange(secRow + 2, 1, wOut.length, 11).setValues(wOut);

  enableFilter(s);
}

function readSkuMaster() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SKU_MASTER_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, SKU_MASTER_HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i];
    if (!r[0] && !r[1]) continue;
    out.push({ sku: String(r[0]), asin: String(r[1]), product: String(r[2]), mrp: Number(r[3])||0, cogs: Number(r[4])||0, feePct: Number(r[5])||0, shipping: Number(r[6])||0, gstPct: Number(r[7])||0 });
  }
  return out;
}

function buildPnLData() {
  var daily = readDailyRows();
  var ads = [];
  try { ads = readAdsRows(ADS_SHEET, true); } catch (e) { ads = []; }
  var skuMap = {};
  readSkuMaster().forEach(function (s) {
    if (s.sku) skuMap[String(s.sku).toLowerCase()] = s;
    if (s.asin) skuMap[String(s.asin).toLowerCase()] = s;
  });
  var byWeek = {};
  var adsByWeek = {};
  ads.forEach(function (a) {
    var k = a.year + '|' + a.month + '|' + a.week + '|' + a.channel;
    if (!adsByWeek[k]) adsByWeek[k] = 0;
    adsByWeek[k] += a.spend;
  });
  daily.forEach(function (r) {
    var skuKey = String(r.sku || '').toLowerCase();
    var asinKey = String(r.asin || '').toLowerCase();
    var sm = skuMap[skuKey] || skuMap[asinKey] || { cogs: 0, feePct: 18, shipping: 40, gstPct: 18 };
    var k = r.year + '|' + r.month + '|' + r.week + '|' + r.channel;
    if (!byWeek[k]) byWeek[k] = { year: r.year, month: r.month, week: r.week, weekRange: getWeekRange(r.week), channel: r.channel, units: 0, sales: 0, cogs: 0, fees: 0, shipping: 0, gst: 0 };
    byWeek[k].units += r.units;
    byWeek[k].sales += r.sales;
    byWeek[k].cogs += (sm.cogs || 0) * r.units;
    byWeek[k].fees += r.sales * (sm.feePct || 0) / 100;
    byWeek[k].shipping += (sm.shipping || 0) * r.units;
    byWeek[k].gst += r.sales * (sm.gstPct || 0) / 100;
  });
  var rows = Object.keys(byWeek).map(function (k) {
    var x = byWeek[k];
    var adsSpend = adsByWeek[k] || 0;
    var profit = x.sales - x.cogs - x.fees - x.shipping - x.gst - adsSpend;
    var margin = x.sales > 0 ? round2(profit / x.sales * 100) : 0;
    var roas = adsSpend > 0 ? round2(x.sales / adsSpend) : 0;
    return { year: x.year, month: x.month, week: x.week, weekRange: x.weekRange, channel: x.channel, units: x.units, sales: round2(x.sales), cogs: round2(x.cogs), fees: round2(x.fees), shipping: round2(x.shipping), adsSpend: round2(adsSpend), gst: round2(x.gst), profit: round2(profit), margin: margin, roas: roas };
  }).sort(function (a, b) { return a.year - b.year || MONTHS.indexOf(a.month) - MONTHS.indexOf(b.month) || a.week.localeCompare(b.week) || a.channel.localeCompare(b.channel); });
  return rows;
}

function writePnLTab(rows) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PL_SHEET);
  if (!sh) sh = SpreadsheetApp.getActiveSpreadsheet().insertSheet(PL_SHEET);
  sh.clear();
  sh.getRange(1, 1, 1, PL_HEADERS.length).setValues([PL_HEADERS]).setFontWeight('bold').setBackground('#0F4C75').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  if (rows.length === 0) return;
  var out = rows.map(function (r) { return [r.year, r.month, r.week, r.weekRange, r.channel, r.units, r.sales, r.cogs, r.fees, r.adsSpend, r.gst, r.profit, r.margin, r.roas]; });
  sh.getRange(2, 1, out.length, PL_HEADERS.length).setValues(out);
  enableFilter(sh);
}

/* ======================================================================
 *  DAILY SALES - READ LOGIC
 * ====================================================================== */
function readDailyRows() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(DAILY_SHEET);
  var last = sheet.getLastRow();
  var out = [];
  if (last < 2) return out;
  var data = sheet.getRange(2, 2, last - 1, HEADERS.length - 1).getValues();
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    var y = r[0];
    var dd = r[3];
    if (Object.prototype.toString.call(y) === '[object Date]' && !isNaN(y.getTime())) y = y.getFullYear();
    else y = parseInt(String(y), 10);
    if (Object.prototype.toString.call(dd) === '[object Date]' && !isNaN(dd.getTime())) dd = dd.getDate();
    else dd = parseInt(String(dd), 10);
    out.push({
      date: fullDate(y, r[1], dd),
      year: y, month: String(r[1]), week: String(r[2]), day: dd,
      product: String(r[4]), channel: String(r[5]),
      asin: String(r[6]), sku: String(r[7]),
      units: Number(r[8]) || 0, sales: Number(r[9]) || 0, orders: Number(r[10]) || 0,
      status: String(r[11]), shipState: String(r[12] || ''), shipCity: String(r[13] || '')
    });
  }
  return out;
}

/* ======================================================================
 *  DAILY SALES - SUMMARY (returns JSON + writes to Summary tab)
 * ====================================================================== */
function buildSummaryData() {
  var rows = readDailyRows();
  var byChannel = {}, byDate = {}, byProduct = {};

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!byChannel[r.channel]) byChannel[r.channel] = { units: 0, sales: 0, orders: 0 };
    byChannel[r.channel].units += r.units;
    byChannel[r.channel].sales += r.sales;
    byChannel[r.channel].orders += r.orders;

    if (!byDate[r.date]) byDate[r.date] = { units: 0, sales: 0, orders: 0 };
    byDate[r.date].units += r.units;
    byDate[r.date].sales += r.sales;
    byDate[r.date].orders += r.orders;

    var pk = r.product + '|' + r.channel;
    if (!byProduct[pk]) byProduct[pk] = { product: r.product, channel: r.channel, units: 0, sales: 0, orders: 0 };
    byProduct[pk].units += r.units;
    byProduct[pk].sales += r.sales;
    byProduct[pk].orders += r.orders;
  }

  var channelSummary = Object.keys(byChannel).map(function (c) {
    return { channel: c, units: byChannel[c].units, sales: Math.round(byChannel[c].sales * 100) / 100, orders: byChannel[c].orders };
  }).sort(function (a, b) { return b.sales - a.sales; });

  var dateSummary = Object.keys(byDate).sort().map(function (d) {
    return { date: d, units: byDate[d].units, sales: Math.round(byDate[d].sales * 100) / 100, orders: byDate[d].orders };
  });

  var productSummary = Object.keys(byProduct).map(function (k) {
    return byProduct[k];
  }).sort(function (a, b) { return b.sales - a.sales; });

  var total = { units: 0, sales: 0, orders: 0 };
  channelSummary.forEach(function (c) {
    total.units += c.units; total.sales += c.sales; total.orders += c.orders;
  });

  writeSummaryTab(channelSummary, dateSummary, productSummary, total);

  return { totals: total, channels: channelSummary, dates: dateSummary, products: productSummary };
}

function writeSummaryTab(channelSummary, dateSummary, productSummary, total) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName(SUMMARY_SHEET);
  if (!s) s = ss.insertSheet(SUMMARY_SHEET);
  s.clear();

  var channels = channelSummary.map(function (c) { return c.channel; });
  channels.sort();
  var dailyRows = readDailyRows();
  var adsRows = [];
  try { adsRows = readAdsRows(ADS_SHEET, true); } catch (e) { adsRows = []; }
  var adsSpendByDate = {};
  for (var ai = 0; ai < adsRows.length; ai++) {
    var ar = adsRows[ai];
    if (!adsSpendByDate[ar.date]) adsSpendByDate[ar.date] = {};
    if (!adsSpendByDate[ar.date][ar.channel]) adsSpendByDate[ar.date][ar.channel] = 0;
    adsSpendByDate[ar.date][ar.channel] += ar.spend;
  }

  // === SECTION 1: Daily per channel + blended ROAS ===
  var byDate = {};
  for (var i = 0; i < dateSummary.length; i++) byDate[dateSummary[i].date] = {};
  for (var ch = 0; ch < channels.length; ch++) {
    for (var di = 0; di < dateSummary.length; di++) {
      if (!byDate[dateSummary[di].date][channels[ch]]) byDate[dateSummary[di].date][channels[ch]] = { units: 0, sales: 0, orders: 0 };
    }
  }
  for (var r = 0; r < dailyRows.length; r++) {
    var rr = dailyRows[r];
    if (!byDate[rr.date]) byDate[rr.date] = {};
    if (!byDate[rr.date][rr.channel]) byDate[rr.date][rr.channel] = { units: 0, sales: 0, orders: 0 };
    var agg = byDate[rr.date][rr.channel];
    agg.units += rr.units; agg.sales += rr.sales; agg.orders += rr.orders;
  }
  var hdr = ['Date'];
  channels.forEach(function (c) { hdr.push(c + ' Units', c + ' Sales (INR)', c + ' Orders', c + ' ROAS'); });
  hdr.push('Total Units', 'Total Sales (INR)', 'Total Orders', 'Total ROAS');
  s.getRange(1, 1, 1, hdr.length).setValues([hdr]).setFontWeight('bold').setBackground('#4472C4').setFontColor('#FFFFFF');

  var dates = Object.keys(byDate).sort();
  var out = [];
  var tUnits = 0, tSales = 0, tOrders = 0, tAdsSpend = 0;
  for (var d = 0; d < dates.length; d++) {
    var row = [dates[d]];
    var dayUnits = 0, daySales = 0, dayOrders = 0, dayAdsSpend = 0;
    channels.forEach(function (c) {
      var a = byDate[dates[d]][c] || { units: 0, sales: 0, orders: 0 };
      var spend = (adsSpendByDate[dates[d]] && adsSpendByDate[dates[d]][c]) ? adsSpendByDate[dates[d]][c] : 0;
      var roas = spend > 0 ? round2(a.sales / spend) : 0;
      row.push(a.units, round2(a.sales), a.orders, roas);
      dayUnits += a.units; daySales += a.sales; dayOrders += a.orders; dayAdsSpend += spend;
    });
    var dayRoas = dayAdsSpend > 0 ? round2(daySales / dayAdsSpend) : 0;
    row.push(dayUnits, round2(daySales), dayOrders, dayRoas);
    tUnits += dayUnits; tSales += daySales; tOrders += dayOrders; tAdsSpend += dayAdsSpend;
    out.push(row);
  }
  if (out.length > 0) s.getRange(2, 1, out.length, hdr.length).setValues(out);
  var totalRow = ['TOTAL'];
  channels.forEach(function (c) {
    var ch = null;
    for (var ci = 0; ci < channelSummary.length; ci++) if (channelSummary[ci].channel === c) ch = channelSummary[ci];
    var spendTot = 0;
    for (var dk in adsSpendByDate) if (adsSpendByDate[dk][c]) spendTot += adsSpendByDate[dk][c];
    var roasTot = spendTot > 0 ? round2((ch ? ch.sales : 0) / spendTot) : 0;
    totalRow.push(ch ? ch.units : 0, ch ? round2(ch.sales) : 0, ch ? ch.orders : 0, roasTot);
  });
  var totalRoas = tAdsSpend > 0 ? round2(tSales / tAdsSpend) : 0;
  totalRow.push(tUnits, round2(tSales), tOrders, totalRoas);
  var last = 2 + out.length;
  s.getRange(last, 1, 1, hdr.length).setValues([totalRow]).setFontWeight('bold').setBackground('#D9E1F2');
  enableFilter(s);

  // === SECTION 1b: Product-wise (near Daily) ===
  var secProdRow = last + 3;
  s.getRange(secProdRow, 1, 1, 5).setValues([['Product-wise Sales — Units / Sales / Orders (all time)', '', '', '', '']]).setFontWeight('bold').setBackground('#9E6F21').setFontColor('#FFFFFF');
  s.getRange(secProdRow + 1, 1, 1, 5).setValues([['Product', 'Channel', 'Units', 'Sales (INR)', 'Orders']]).setFontWeight('bold').setBackground('#FCE6CC');
  var prodOut = productSummary.map(function (p) { return [p.product, p.channel, p.units, round2(p.sales), p.orders]; });
  if (prodOut.length > 0) s.getRange(secProdRow + 2, 1, prodOut.length, 5).setValues(prodOut);

  // === SECTION 2: Location x Product ===
  var sec2Row = secProdRow + 2 + prodOut.length + 2;
  s.getRange(sec2Row, 1, 1, 7).setValues([['Location x Product — Units / Sales / Orders (all time)', '', '', '', '', '', '']]).setFontWeight('bold').setBackground('#ED7D31').setFontColor('#FFFFFF');
  s.getRange(sec2Row + 1, 1, 1, 7).setValues([['Product', 'Channel', 'Ship State', 'Ship City', 'Units', 'Sales (INR)', 'Orders']]).setFontWeight('bold').setBackground('#FCE4CC');
  var locMap = {};
  for (var i = 0; i < dailyRows.length; i++) {
    var dr = dailyRows[i];
    var lk = dr.product + '|' + dr.channel + '|' + (dr.shipState || '-') + '|' + (dr.shipCity || '-');
    if (!locMap[lk]) locMap[lk] = { product: dr.product, channel: dr.channel, state: dr.shipState || '-', city: dr.shipCity || '-', units: 0, sales: 0, orders: 0 };
    locMap[lk].units += dr.units; locMap[lk].sales += dr.sales; locMap[lk].orders += dr.orders;
  }
  var locRows = Object.keys(locMap).map(function (k) { return locMap[k]; }).sort(function (a, b) { return b.sales - a.sales; });
  var locOut = locRows.map(function (x) { return [x.product, x.channel, x.state, x.city, x.units, round2(x.sales), x.orders]; });
  if (locOut.length > 0) s.getRange(sec2Row + 2, 1, locOut.length, 7).setValues(locOut);

  // === SECTION 3: Monthly cumulative — Week 1(1-7) 2(8-15) 3(16-23) 4(24-end) ===
  var sec3Row = sec2Row + 2 + locOut.length + 2;
  s.getRange(sec3Row, 1, 1, 10).setValues([['Monthly Cumulative — Week buckets W1(1-7) W2(8-15) W3(16-23) W4(24-end) — per channel', '', '', '', '', '', '', '', '', '']]).setFontWeight('bold').setBackground('#70AD47').setFontColor('#FFFFFF');
  s.getRange(sec3Row + 1, 1, 1, 10).setValues([['Year', 'Month', 'Week', 'Week Range', 'Channel', 'Units', 'Sales (INR)', 'Orders', 'Cumulative Sales (Month)', 'ROAS']]).setFontWeight('bold').setBackground('#E2EFDA');
  var weekMap = {};
  for (var i = 0; i < dailyRows.length; i++) {
    var drw = dailyRows[i];
    var p = drw.date.split('-');
    var dayNum = parseInt(p[2], 10);
    var w = getMonthWeek(dayNum);
    var key = drw.year + '|' + drw.month + '|' + w + '|' + drw.channel;
    if (!weekMap[key]) weekMap[key] = { year: drw.year, month: drw.month, week: w, weekRange: getWeekRange(w), channel: drw.channel, units: 0, sales: 0, orders: 0 };
    weekMap[key].units += drw.units; weekMap[key].sales += drw.sales; weekMap[key].orders += drw.orders;
  }
  // ads spend per week per channel for weekly ROAS
  var adsWeekSpend = {};
  for (var ai2 = 0; ai2 < adsRows.length; ai2++) {
    var aw = adsRows[ai2];
    var wk = aw.year + '|' + aw.month + '|' + aw.week + '|' + aw.channel;
    if (!adsWeekSpend[wk]) adsWeekSpend[wk] = 0;
    adsWeekSpend[wk] += aw.spend;
  }
  var weekKeys = Object.keys(weekMap).sort(function (a, b) {
    var pa = a.split('|'), pb = b.split('|');
    return parseInt(pa[0]) - parseInt(pb[0]) || MONTHS.indexOf(pa[1]) - MONTHS.indexOf(pb[1]) || pa[2].localeCompare(pb[2]) || pa[3].localeCompare(pb[3]);
  });
  var cumByMonthChannel = {};
  var weekOut = [];
  for (var wi = 0; wi < weekKeys.length; wi++) {
    var wkObj = weekMap[weekKeys[wi]];
    var cumKey = wkObj.year + '|' + wkObj.month + '|' + wkObj.channel;
    if (!cumByMonthChannel[cumKey]) cumByMonthChannel[cumKey] = 0;
    cumByMonthChannel[cumKey] += wkObj.sales;
    var wkSpend = adsWeekSpend[weekKeys[wi]] || 0;
    var wkRoas = wkSpend > 0 ? round2(wkObj.sales / wkSpend) : 0;
    weekOut.push([wkObj.year, wkObj.month, wkObj.week, wkObj.weekRange, wkObj.channel, wkObj.units, round2(wkObj.sales), wkObj.orders, round2(cumByMonthChannel[cumKey]), wkRoas]);
  }
  if (weekOut.length > 0) s.getRange(sec3Row + 2, 1, weekOut.length, 10).setValues(weekOut);

  // === SECTION 4: Weekly Product-wise (W1-4 per product) ===
  var sec4Row = sec3Row + 2 + weekOut.length + 2;
  s.getRange(sec4Row, 1, 1, 9).setValues([['Weekly Product-wise — Sales by Product per Week W1(1-7) W2(8-15) W3(16-23) W4(24-end)', '', '', '', '', '', '', '', '']]).setFontWeight('bold').setBackground('#8E44AD').setFontColor('#FFFFFF');
  s.getRange(sec4Row + 1, 1, 1, 9).setValues([['Year', 'Month', 'Week', 'Week Range', 'Product', 'Channel', 'Units', 'Sales (INR)', 'Orders']]).setFontWeight('bold').setBackground('#E8DAEF');
  var weekProdMap = {};
  for (var i = 0; i < dailyRows.length; i++) {
    var dpr = dailyRows[i];
    var pp = dpr.date.split('-');
    var dnum = parseInt(pp[2], 10);
    var ww = getMonthWeek(dnum);
    var k = dpr.year + '|' + dpr.month + '|' + ww + '|' + dpr.product + '|' + dpr.channel;
    if (!weekProdMap[k]) weekProdMap[k] = { year: dpr.year, month: dpr.month, week: ww, weekRange: getWeekRange(ww), product: dpr.product, channel: dpr.channel, units: 0, sales: 0, orders: 0 };
    weekProdMap[k].units += dpr.units; weekProdMap[k].sales += dpr.sales; weekProdMap[k].orders += dpr.orders;
  }
  var wpKeys = Object.keys(weekProdMap).sort(function (a, b) {
    var pa = a.split('|'), pb = b.split('|');
    return parseInt(pa[0]) - parseInt(pb[0]) || MONTHS.indexOf(pa[1]) - MONTHS.indexOf(pb[1]) || pa[2].localeCompare(pb[2]) || pa[4].localeCompare(pb[4]);
  });
  var wpOut = wpKeys.map(function (k) {
    var x = weekProdMap[k];
    return [x.year, x.month, x.week, x.weekRange, x.product, x.channel, x.units, round2(x.sales), x.orders];
  });
  if (wpOut.length > 0) s.getRange(sec4Row + 2, 1, wpOut.length, 9).setValues(wpOut);
}

/* ======================================================================
 *  HELPER - JSON response
 * ====================================================================== */
function json(obj, code) {
  var out = ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
  return out;
}

/* ======================================================================
 *  TEST (run this in the editor to verify setup works)
 * ====================================================================== */
function testPush() {
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var body = {
    key: PUSH_KEY,
    rows: [
      { date: today, channel: 'Amazon', product: 'Catche Refill Combo (6+Device)', asin: 'B09R3SJPB5', sku: 'Pack of 6+device-FBA', units: 3, sales: 1080, orders: 3, status: 'Shipped' },
      { date: today, channel: 'FirstCry', product: 'Catche Incense Sticks (120)', asin: '', sku: 'PID 16071689', units: 1, sales: 360, orders: 1, status: '' },
      { date: today, channel: 'Flipkart', product: 'Catche Insta Repellent (Pack of 8)', asin: '', sku: 'Catche must-quit-o Insta Repellent (Pack of 8)', units: 1, sales: 425, orders: 1, status: '' }
    ]
  };
  var res = doPost({ postData: { contents: JSON.stringify(body) } });
  Logger.log(res.getContent());
}