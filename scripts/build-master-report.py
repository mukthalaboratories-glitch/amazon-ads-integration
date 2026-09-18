import json
import os
from collections import defaultdict
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

BASE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(BASE)

DOCS = os.path.join(PROJECT, 'docs')
OUT = os.path.join(DOCS, 'master-3month-report-jun-jul-aug.xlsx')

# ---------- style helpers ----------
HDR_FILL = PatternFill(start_color='4472C4', end_color='4472C4', fill_type='solid')
HDR_FONT = Font(color='FFFFFF', bold=True, size=10)
SEC_FILL = PatternFill(start_color='2F5597', end_color='2F5597', fill_type='solid')
SEC_FONT = Font(color='FFFFFF', bold=True, size=11)
BORDER = Border(*[Side(style='thin', color='B0B0B0')] * 4)
WRAP = Alignment(vertical='top', wrap_text=True)


def style_sheet(ws, headers, widths, freeze='A2'):
    for c, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=c, value=h)
        cell.fill = HDR_FILL
        cell.font = HDR_FONT
        cell.alignment = Alignment(vertical='center', wrap_text=True)
        cell.border = BORDER
    for c, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(c)].width = w
    ws.freeze_panes = freeze
    ws.auto_filter.ref = ws.dimensions


def add_rows(ws, rows, start=2):
    for r_i, r in enumerate(rows):
        for c_i, v in enumerate(r, 1):
            cell = ws.cell(row=start + r_i, column=c_i, value=v)
            cell.border = BORDER
            cell.alignment = WRAP


def fmt(n, d=2):
    if n is None:
        return 0
    return round(n, d)


# =====================================================================
# 1. LOAD AMAZON ORDERS (with status)
# =====================================================================
orders = json.load(open(os.path.join(DOCS, 'orders-jun-aug-raw.json'), encoding='utf-8'))
print(f'Amazon orders loaded: {len(orders)}')

# filter only shipped/valid sales for revenue sheets; keep all for status sheet
VALID_STATUS = ['Shipped', 'Shipped - Delivered to Buyer', 'Shipped - Picked Up', 'Shipped - Returned to Seller']
sold_orders = [o for o in orders if o['orderStatus'] not in ('Cancelled', 'Pending', 'Pending - Waiting for Pick Up')]
print(f'Sold (non-cancelled/pending) orders: {len(sold_orders)}')

# =====================================================================
# 2. LOAD ADS DATA
# =====================================================================
ads_raw = json.load(open(os.path.join(DOCS, 'amazon-ads-raw-3mo.json'), encoding='utf-8'))
kw_monthly = json.load(open(os.path.join(DOCS, 'ads-keywords-jun-aug.json'), encoding='utf-8'))

weekly = ads_raw.get('WEEKLY_CAMPAIGN', [])
campaign_summary = ads_raw.get('CAMPAIGN_SUMMARY', [])
adgroups = ads_raw.get('AD_GROUP', [])
products = ads_raw.get('PRODUCT', [])
placements = ads_raw.get('PLACEMENT', [])
purchased = ads_raw.get('PURCHASED_PRODUCT', [])
targeting = ads_raw.get('TARGETING', [])
keywords_all = kw_monthly.get('KEYWORD', [])
search_terms_all = kw_monthly.get('SEARCH_TERM', [])

# =====================================================================
# 3. LOAD FIRSTCRY + FLIPKART
# =====================================================================
FC_FILES = [
    os.path.join(PROJECT, 'Firstcry sales', 'dashboardsale_2026_07_01_to_2026_07_31 (1).xlsx'),
    os.path.join(PROJECT, 'Firstcry sales', 'dashboardsale_2026_08_01_to_2026_08_31 (2).xlsx'),
    os.path.join(PROJECT, 'Firstcry sales', 'dashboardsale_2026_08_01_to_2026_08_31 (3).xlsx'),
]
FC_CATALOG = {
    '16071685': ('8908006802180', 368, 'Catche Ayurvedic Mosquito Repellent Refill (Pack of 4)'),
    '16071684': ('8908006802159', 225, 'Catche Ayurvedic Mosquito Repellent Combo (2 Refills + 1 Machine)'),
    '16071689': ('8908006802319', 360, 'Catche Herbal Mosquito Incense Sticks (120 sticks)'),
    '16071686': ('8908006802005', 450, 'Catche Ayurvedic Mosquito Trapellent Combo (Device + Refill)'),
    '16071687': ('8908006802180', 300, 'Catche Ayurvedic Mosquito Trapellent Refill (Pack of 4)'),
    '16071688': ('8908006802135', 270, 'Catche Ayurvedic Mosquito Lotion (60ml) (Pack of 3)'),
    '16071690': ('8908006802043', 295, 'Gadiva Ayurvedic Hairoil (100ml) with Neem Comb'),
}
FLIPKART_BY_DAY = {
    '2026-07-31': [{'po': 'OD338234475046705100', 'product': 'Catche Insta Ayurvedic Mosquito Repellent (Pack of 8)', 'sku': 'Catche must-quit-o Insta Repellent (Pack of 8)', 'qty': 1, 'sales': 425}],
    '2026-08-01': [{'po': 'OD438243036104837100', 'product': 'Catche Insta Ayurvedic Mosquito Repellent (Pack of 8)', 'sku': 'Catche must-quit-o Insta Repellent (Pack of 8)', 'qty': 1, 'sales': 421},
                   {'po': 'OD338245037653222100', 'product': 'Catche Insta Ayurvedic Mosquito Repellent (Pack of 8)', 'sku': 'Catche must-quit-o Insta Repellent (Pack of 8)', 'qty': 1, 'sales': 421},
                   {'po': 'OD338245851671914100', 'product': 'Catche Ayurvedic Mosquito Trapellent Combo (Device + Refill)', 'sku': 'CT_TRAP_COMBO', 'qty': 1, 'sales': 415},
                   {'po': 'OD338245441398294100', 'product': 'Catche Must-Quit-O Insta Combo Mosquito Vaporizer (1 Machine + 2 Refills)', 'sku': 'CT_INSTA_COM_1M+2R', 'qty': 1, 'sales': 184}],
    '2026-08-02': [{'po': 'OD338248251862289100', 'product': 'Catche Herbal Mosquito Incense Sticks (120 sticks)', 'sku': '8908006802319', 'qty': 1, 'sales': 179},
                   {'po': 'OD438251258242377100', 'product': 'Catche Insta Ayurvedic Mosquito Repellent (Pack of 6)', 'sku': 'Catche Insta Ayurvedic Mosquito Repellent-6pack', 'qty': 1, 'sales': 345},
                   {'po': 'OD438253557867941100', 'product': 'Catche Must-Quit-O Insta Combo Mosquito Vaporizer (1 Machine + 2 Refills)', 'sku': 'CT_INSTA_COM_1M+2R', 'qty': 1, 'sales': 184}],
    '2026-08-03': [{'po': 'OD438258052393795400', 'product': 'Catche Herbal Mosquito Incense Sticks (120 sticks)', 'sku': '8908006802319', 'qty': 3, 'sales': 599},
                   {'po': 'OD338262381891458100', 'product': 'Catche Herbal Mosquito Incense Sticks (120 sticks)', 'sku': '8908006802319', 'qty': 1, 'sales': 179},
                   {'po': 'OD438257341037844100', 'product': 'Catche Must-Quit-O Insta Combo Mosquito Vaporizer (1 Machine + 2 Refills)', 'sku': 'CT_INSTA_COM_1M+2R', 'qty': 1, 'sales': 176},
                   {'po': 'OD438262082069101100', 'product': 'Catche Must-Quit-O Insta Combo Mosquito Vaporizer (1 Machine + 2 Refills)', 'sku': 'CT_INSTA_COM_1M+2R', 'qty': 1, 'sales': 192},
                   {'po': 'OD438262544710897100', 'product': 'Catche Insta Ayurvedic Mosquito Repellent (Pack of 6)', 'sku': 'Catche Insta Ayurvedic Mosquito Repellent-6pack', 'qty': 1, 'sales': 345},
                   {'po': 'OD338261909861569100', 'product': 'Catche Insta Ayurvedic Mosquito Repellent (Pack of 8)', 'sku': 'Catche must-quit-o Insta Repellent (Pack of 8)', 'qty': 1, 'sales': 411},
                   {'po': 'OD438262851813781100', 'product': 'Catche Must-Quit-O Insta Combo Mosquito Vaporizer (1 Machine + 2 Refills)', 'sku': 'CT_INSTA_COM_1M+2R', 'qty': 1, 'sales': 184}],
    '2026-08-05': [{'po': 'OD338279662655574100', 'product': 'Catche Insta Ayurvedic Mosquito Repellent (Pack of 8)', 'sku': 'Catche must-quit-o Insta Repellent (Pack of 8)', 'qty': 1, 'sales': 421},
                   {'po': 'OD438279579357578100', 'product': 'Catche Insta Ayurvedic Mosquito Repellent (Pack of 8)', 'sku': 'Catche must-quit-o Insta Repellent (Pack of 8)', 'qty': 1, 'sales': 421}],
}

fc_rows = []
try:
    from openpyxl import load_workbook
    for fpath in FC_FILES:
        if not os.path.exists(fpath):
            continue
        wb = load_workbook(fpath, data_only=True)
        ws = wb['Sales Data']
        for r in ws.iter_rows(min_row=2, values_only=True):
            poid, dt, pid, brand, btype, qty, mrp, sales, subcat, cat, stock, sku = r
            fc_rows.append({'po': poid, 'day': str(dt)[:10], 'product_id': str(pid),
                            'qty': qty, 'sales': sales, 'sku': sku})
except Exception as e:
    print('FirstCry load failed:', e)
print(f'FirstCry rows: {len(fc_rows)}')

# =====================================================================
# BUILD WORKBOOK
# =====================================================================
wb = Workbook()

# ---- Sheet 0: README ----
ws = wb.active
ws.title = 'README'
ws['A1'] = 'Catche Master Report - June/July/August 2026'
ws['A1'].font = Font(bold=True, size=14)
readme_rows = [
    ['Generated', '2026-08-14'],
    ['Data sources', 'Amazon SP-API orders (with status), Amazon Ads API (campaign/keyword/search-term), FirstCry dashboard exports, Flipkart order exports'],
    [''],
    ['Sheet', 'Contents'],
    ['Daily Sales', 'Every order line: date, channel, product, asin, sku, units, sales, order status. Use filters on any column.'],
    ['Channel Summary', 'Totals by channel (Amazon / FirstCry / Flipkart) and by month.'],
    ['Amazon Order Status', 'All Amazon orders with status breakdown (Shipped / Cancelled / Pending / Returned).'],
    ['Ads Campaign Daily', 'Daily campaign metrics: impressions, clicks, CTR, spend, sales, purchases, ROAS, ACoS.'],
    ['Ads Keyword CTR', 'Keyword-level: impressions, clicks, CTR, cost, sales, purchases, units - per month (Jun/Jul/Aug).'],
    ['Ads Search Term', 'Search-term-level data per month with CTR and sales.'],
    ['Ads Ad Group', 'Ad group summary (3 months).'],
    ['Ads Product', 'Advertised product / ASIN-level data (3 months).'],
    ['Ads Placement', 'Placement breakdown (top of search, rest of search, product pages).'],
    ['Ads Targeting', 'Targeting expression level (3 months).'],
    [''],
    ['Notes', 'CTR = clicks / impressions. ACoS = spend / sales. ROAS = sales / spend.'],
]
for r_i, r in enumerate(readme_rows, 2):
    for c_i, v in enumerate(r, 1):
        ws.cell(row=r_i, column=c_i, value=v)
ws.column_dimensions['A'].width = 26
ws.column_dimensions['B'].width = 110

# ---- Sheet 1: Daily Sales ----
ws = wb.create_sheet('Daily Sales')
headers = ['Date', 'Channel', 'Product', 'ASIN', 'SKU', 'Units', 'Sales (INR)', 'Orders', 'Order Status']
widths = [12, 10, 60, 14, 34, 8, 12, 8, 28]
style_sheet(ws, headers, widths)

daily_rows = []
for o in sold_orders:
    daily_rows.append([o['day'], 'Amazon', o['title'], o['asin'], o['sku'], o['units'], fmt(o['sales']), 1, o['orderStatus']])
for r in fc_rows:
    pid = r['product_id']
    cat = FC_CATALOG.get(pid, ('', 0, f'Catche Must-quit-o (PID {pid})'))
    daily_rows.append([r['day'], 'FirstCry', cat[2], '', f'PID {pid}', r['qty'], fmt(r['sales']), 1, 'Shipped'])
for day, items in FLIPKART_BY_DAY.items():
    for it in items:
        daily_rows.append([day, 'Flipkart', it['product'], '', it['sku'], it['qty'], fmt(it['sales']), 1, 'Shipped'])
daily_rows.sort(key=lambda r: r[0])
add_rows(ws, daily_rows)

# ---- Sheet 2: Channel Summary ----
ws = wb.create_sheet('Channel Summary')
headers = ['Channel', 'Month', 'Units', 'Sales (INR)', 'Orders']
style_sheet(ws, headers, [12, 10, 10, 14, 10])
chan_sum = defaultdict(lambda: {'units': 0, 'sales': 0, 'orders': 0})
for r in daily_rows:
    month = r[0][:7]
    key = (r[1], month)
    chan_sum[key]['units'] += r[5]
    chan_sum[key]['sales'] += r[6]
    chan_sum[key]['orders'] += r[7]
summary_rows = []
for (ch, m), v in sorted(chan_sum.items()):
    summary_rows.append([ch, m, v['units'], fmt(v['sales']), v['orders']])
add_rows(ws, summary_rows)

# ---- Sheet 3: Amazon Order Status ----
ws = wb.create_sheet('Amazon Order Status')
headers = ['Date', 'Order ID', 'Order Status', 'Item Status', 'Product', 'ASIN', 'SKU', 'Units', 'Sales (INR)', 'Fulfillment', 'City', 'State']
style_sheet(ws, headers, [12, 18, 26, 12, 55, 14, 30, 8, 12, 14, 14, 10])
status_rows = []
for o in orders:
    status_rows.append([o['day'], o['orderId'], o['orderStatus'], o['itemStatus'], o['title'],
                        o['asin'], o['sku'], o['units'], fmt(o['sales']), o['fulfillmentChannel'], o['city'], o['state']])
status_rows.sort(key=lambda r: r[0])
add_rows(ws, status_rows)

# ---- Sheet 4: Ads Campaign Daily ----
ws = wb.create_sheet('Ads Campaign Daily')
headers = ['Date', 'Campaign', 'Bidding Strategy', 'Impressions', 'Clicks', 'CTR', 'Spend (INR)', 'Sales (INR)', 'Purchases', 'ROAS', 'ACoS']
style_sheet(ws, headers, [12, 34, 16, 12, 8, 8, 12, 12, 10, 8, 8])
campaign_daily = []
for r in weekly:
    if not r.get('date'):
        continue
    imp = r.get('impressions', 0) or 0
    clk = r.get('clicks', 0) or 0
    cost = r.get('cost', 0) or 0
    sales = r.get('sales7d', 0) or 0
    pur = r.get('purchases7d', 0) or 0
    campaign_daily.append([r['date'], r.get('campaignName', ''), r.get('campaignBiddingStrategy', ''),
                           imp, clk, fmt(clk / imp * 100, 2) if imp else 0,
                           fmt(cost), fmt(sales), pur,
                           fmt(sales / cost, 2) if cost else 0,
                           fmt(cost / sales * 100, 2) if sales else 0])
campaign_daily.sort(key=lambda r: r[0])
add_rows(ws, campaign_daily)

# ---- Sheet 5: Ads Keyword CTR ----
ws = wb.create_sheet('Ads Keyword CTR')
headers = ['Month', 'Campaign', 'Ad Group', 'Keyword', 'Match Type', 'Impressions', 'Clicks', 'CTR %', 'Spend (INR)', 'Sales (INR)', 'Purchases', 'Units Sold', 'ROAS', 'ACoS']
style_sheet(ws, headers, [10, 30, 26, 30, 10, 11, 8, 8, 11, 12, 10, 10, 8, 8])
kw_rows = []
for r in keywords_all:
    imp = r.get('impressions', 0) or 0
    clk = r.get('clicks', 0) or 0
    cost = r.get('cost', 0) or 0
    sales = r.get('sales7d', 0) or 0
    pur = r.get('purchases7d', 0) or 0
    units = r.get('unitsSoldClicks7d', 0) or 0
    kw_rows.append([r.get('month', ''), r.get('campaignName', ''), r.get('adGroupName', ''), r.get('keyword', ''),
                    r.get('matchType', ''), imp, clk, fmt(clk / imp * 100, 2) if imp else 0,
                    fmt(cost), fmt(sales), pur, units,
                    fmt(sales / cost, 2) if cost else 0, fmt(cost / sales * 100, 2) if sales else 0])
kw_rows.sort(key=lambda r: (r[0], -(r[11] if r[11] else 0)))
add_rows(ws, kw_rows)

# ---- Sheet 6: Ads Search Term ----
ws = wb.create_sheet('Ads Search Term')
headers = ['Month', 'Campaign', 'Ad Group', 'Keyword', 'Match Type', 'Search Term', 'Impressions', 'Clicks', 'CTR %', 'Spend (INR)', 'Sales (INR)', 'Purchases', 'Units Sold']
style_sheet(ws, headers, [10, 30, 26, 28, 10, 40, 11, 8, 8, 11, 12, 10, 10])
st_rows = []
for r in search_terms_all:
    imp = r.get('impressions', 0) or 0
    clk = r.get('clicks', 0) or 0
    cost = r.get('cost', 0) or 0
    sales = r.get('sales7d', 0) or 0
    pur = r.get('purchases7d', 0) or 0
    units = r.get('unitsSoldClicks7d', 0) or 0
    st_rows.append([r.get('month', ''), r.get('campaignName', ''), r.get('adGroupName', ''), r.get('keyword', ''),
                    r.get('matchType', ''), r.get('searchTerm', ''), imp, clk, fmt(clk / imp * 100, 2) if imp else 0,
                    fmt(cost), fmt(sales), pur, units])
st_rows.sort(key=lambda r: (r[0], -(r[9] if r[9] else 0)))
add_rows(ws, st_rows)

# ---- Sheet 7: Ads Ad Group ----
ws = wb.create_sheet('Ads Ad Group')
headers = ['Campaign', 'Ad Group', 'Impressions', 'Clicks', 'Spend (INR)', 'Sales (INR)', 'Purchases', 'ROAS', 'ACoS']
style_sheet(ws, headers, [30, 30, 12, 8, 12, 12, 10, 8, 8])
ag_rows = []
for r in adgroups:
    cost = r.get('cost', 0) or 0
    sales = r.get('sales7d', 0) or 0
    ag_rows.append([r.get('campaignName', ''), r.get('adGroupName', ''), r.get('impressions', 0) or 0,
                    r.get('clicks', 0) or 0, fmt(cost), fmt(sales), r.get('purchases7d', 0) or 0,
                    fmt(sales / cost, 2) if cost else 0, fmt(cost / sales * 100, 2) if sales else 0])
add_rows(ws, ag_rows)

# ---- Sheet 8: Ads Product ----
ws = wb.create_sheet('Ads Product')
headers = ['Campaign', 'Ad Group', 'Advertised ASIN', 'Advertised SKU', 'Impressions', 'Clicks', 'Spend (INR)', 'Sales (INR)', 'Purchases', 'Units Sold']
style_sheet(ws, headers, [30, 26, 14, 24, 12, 8, 12, 12, 10, 10])
prod_rows = []
for r in products:
    prod_rows.append([r.get('campaignName', ''), r.get('adGroupName', ''), r.get('advertisedAsin', ''),
                      r.get('advertisedSku', ''), r.get('impressions', 0) or 0, r.get('clicks', 0) or 0,
                      fmt(r.get('cost', 0) or 0), fmt(r.get('sales7d', 0) or 0),
                      r.get('purchases7d', 0) or 0, r.get('unitsSoldClicks7d', 0) or 0])
add_rows(ws, prod_rows)

# ---- Sheet 9: Ads Placement ----
ws = wb.create_sheet('Ads Placement')
headers = ['Campaign', 'Placement', 'Impressions', 'Clicks', 'CTR %', 'Spend (INR)', 'Sales (INR)', 'Purchases', 'ROAS', 'ACoS']
style_sheet(ws, headers, [30, 20, 12, 8, 8, 12, 12, 10, 8, 8])
pl_rows = []
for r in placements:
    imp = r.get('impressions', 0) or 0
    clk = r.get('clicks', 0) or 0
    cost = r.get('cost', 0) or 0
    sales = r.get('sales7d', 0) or 0
    pl_rows.append([r.get('campaignName', ''), r.get('placementClassification', ''), imp, clk,
                    fmt(clk / imp * 100, 2) if imp else 0, fmt(cost), fmt(sales),
                    r.get('purchases7d', 0) or 0, fmt(sales / cost, 2) if cost else 0,
                    fmt(cost / sales * 100, 2) if sales else 0])
add_rows(ws, pl_rows)

# ---- Sheet 10.5: Inventory Snapshot ----
inv_file = None
for f in sorted(os.listdir(DOCS)):
    if f.startswith('inventory-snapshot-') and f.endswith('.json'):
        inv_file = os.path.join(DOCS, f)
if inv_file:
    inv_rows = json.load(open(inv_file, encoding='utf-8'))
    ws = wb.create_sheet('Inventory Snapshot')
    headers = ['As Of', 'SKU', 'ASIN', 'Product', 'Available', 'Reserved', 'Unfulfillable',
               'Inbound Working', 'Inbound Shipped', 'Inbound Received', 'Inbound Total', 'Total Qty', 'Last Updated']
    style_sheet(ws, headers, [10, 32, 14, 60, 10, 10, 14, 14, 14, 14, 12, 10, 22])
    inv_sheet_rows = []
    for r in sorted(inv_rows, key=lambda x: -(x.get('totalQty') or 0)):
        inv_sheet_rows.append([r.get('date', ''), r.get('sku', ''), r.get('asin', ''), r.get('product', ''),
                               r.get('available', 0), r.get('reserved', 0), r.get('unfulfillable', 0),
                               r.get('inboundWorking', 0), r.get('inboundShipped', 0), r.get('inboundReceived', 0),
                               r.get('inboundTotal', 0), r.get('totalQty', 0), r.get('lastUpdated', '')])
    add_rows(ws, inv_sheet_rows)
    print(f'Inventory snapshot rows: {len(inv_sheet_rows)} ({inv_file})')
else:
    print('No inventory snapshot found')

# ---- Sheet 10: Ads Targeting ----
ws = wb.create_sheet('Ads Targeting')
headers = ['Campaign', 'Ad Group', 'Keyword', 'Keyword Type', 'Impressions', 'Clicks', 'Spend (INR)', 'Sales (INR)', 'Purchases', 'ROAS']
style_sheet(ws, headers, [30, 26, 32, 12, 12, 8, 12, 12, 10, 8])
tg_rows = []
for r in targeting:
    cost = r.get('cost', 0) or 0
    sales = r.get('sales7d', 0) or 0
    tg_rows.append([r.get('campaignName', ''), r.get('adGroupName', ''), r.get('keyword', ''),
                    r.get('keywordType', ''), r.get('impressions', 0) or 0, r.get('clicks', 0) or 0,
                    fmt(cost), fmt(sales), r.get('purchases7d', 0) or 0,
                    fmt(sales / cost, 2) if cost else 0])
add_rows(ws, tg_rows)

wb.save(OUT)
print(f'\nMaster report saved: {OUT}')
print('Sheets:', wb.sheetnames)
print(f'Daily rows: {len(daily_rows)} | Keyword rows: {len(kw_rows)} | Search term rows: {len(st_rows)}')
