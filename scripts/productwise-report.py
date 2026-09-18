import json
import os
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from collections import defaultdict

BASE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(BASE)

# FirstCry product catalog: ProductID -> (Vendor Style Code, MRP, Product Name)
FC_CATALOG = {
    '16071685': ('8908006802180', 368, 'Catche Ayurvedic Mosquito Repellent Refill (Pack of 4)'),
    '16071684': ('8908006802159', 225, 'Catche Ayurvedic Mosquito Repellent Combo (2 Refills + 1 Machine)'),
    '16071689': ('8908006802319', 360, 'Catche Herbal Mosquito Incense Sticks (120 sticks)'),
    '16071686': ('8908006802005', 450, 'Catche Ayurvedic Mosquito Trapellent Combo (Device + Refill)'),
    '16071687': ('8908006802180', 300, 'Catche Ayurvedic Mosquito Trapellent Refill (Pack of 4)'),
    '16071688': ('8908006802135', 270, 'Catche Ayurvedic Mosquito Lotion (60ml) (Pack of 3)'),
    '16071690': ('8908006802043', 295, 'Gadiva Ayurvedic Hairoil (100ml) with Neem Comb'),
}

with open(os.path.join(PROJECT, 'amazon_july_raw.json'), 'r', encoding='utf-8') as f:
    amazon = json.load(f)

wb = openpyxl.load_workbook(os.path.join(PROJECT, 'Firstcry sales', 'dashboardsale_2026_07_01_to_2026_07_31 (1).xlsx'), data_only=True)
ws_fc = wb['Sales Data']
firstcry = []
for r in ws_fc.iter_rows(min_row=2, values_only=True):
    poid, dt, pid, brand, btype, qty, mrp, sales, subcat, cat, stock, sku = r
    firstcry.append({'po': poid, 'day': dt[:10], 'sku': sku, 'product_id': str(pid),
                     'qty': qty, 'sales': sales, 'mrp': mrp})

flipkart = [
    {'po': 'OD338234475046705100', 'day': '2026-07-31', 'product': 'Catche Insta Ayurvedic Mosquito Repellent (Pack of 8)',
     'sku': 'Catche must-quit-o Insta Repellent (Pack of 8)', 'qty': 1, 'sales': 425},
]

# ---- Amazon product grouping ----
amazon_products = defaultdict(lambda: {'units': 0, 'sales': 0, 'orders': set()})
for r in amazon:
    key = (r['asin'], r['sku'], r['title'].strip())
    p = amazon_products[key]
    p['units'] += r['units']
    p['sales'] += r['sales']
    if r['orderId']:
        p['orders'].add(r['orderId'])

# ---- FirstCry product grouping with catalog names ----
fc_products = defaultdict(lambda: {'units': 0, 'sales': 0, 'orders': set(), 'product_id': '', 'name': '', 'mrp': 0})
for r in firstcry:
    pid = r['product_id']
    cat = FC_CATALOG.get(pid, ('', 0, f'Catche Must-quit-o (PID {pid})'))
    key = pid
    p = fc_products[key]
    p['units'] += r['qty']
    p['sales'] += r['sales']
    p['product_id'] = pid
    p['name'] = cat[2]
    p['mrp'] = cat[1]
    if r['po']:
        p['orders'].add(r['po'])

# ---- Flipkart ----
fk_products = defaultdict(lambda: {'units': 0, 'sales': 0, 'orders': set()})
for r in flipkart:
    key = (r['sku'], r['product'])
    p = fk_products[key]
    p['units'] += r['qty']
    p['sales'] += r['sales']
    if r['po']:
        p['orders'].add(r['po'])

# ---- Build merged product list ----
merged = []

for (asin, sku, title), p in amazon_products.items():
    merged.append({
        'channel': 'Amazon',
        'asin': asin,
        'sku': sku,
        'title': title,
        'units': p['units'],
        'sales': p['sales'],
        'orders': len(p['orders']),
    })

for pid, p in fc_products.items():
    merged.append({
        'channel': 'FirstCry',
        'asin': '',
        'sku': p['name'] and f'PID {pid}',
        'title': p['name'],
        'units': p['units'],
        'sales': p['sales'],
        'orders': len(p['orders']),
    })

for (sku, prod), p in fk_products.items():
    merged.append({
        'channel': 'Flipkart',
        'asin': '',
        'sku': sku,
        'title': prod,
        'units': p['units'],
        'sales': p['sales'],
        'orders': len(p['orders']),
    })

merged_sorted = sorted(merged, key=lambda x: -x['sales'])

print('=== PRODUCT-WISE SALES (July 2026) - ALL CHANNELS ===\n')
print(f'{"Channel":<10} {"SKU/ASIN":<40} {"Units":>6} {"Sales (Rs)":>12} {"Orders":>7}  Product')
print('-' * 150)
tot_units = 0
tot_sales = 0
for m in merged_sorted:
    print(f'{m["channel"]:<10} {(m["sku"] or m["asin"])[:39]:<40} {m["units"]:>6} {m["sales"]:>12,.2f} {m["orders"]:>7}  {m["title"][:60]}')
    tot_units += m['units']
    tot_sales += m['sales']
print('-' * 150)
print(f'{"TOTAL":<10} {"":40} {tot_units:>6} {tot_sales:>12,.2f}')

# ---- Excel build ----
out_path = os.path.join(PROJECT, 'docs', 'productwise-sales-july-2026.xlsx')

wb_out = openpyxl.Workbook()
header_fill = PatternFill(start_color='4472C4', end_color='4472C4', fill_type='solid')
header_font = Font(color='FFFFFF', bold=True)
center = Alignment(horizontal='center')

def style_header(ws, ncols):
    for c in range(1, ncols + 1):
        cell = ws.cell(row=1, column=c)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = center

ws = wb_out.active
ws.title = 'All Products'
ws.append(['Channel', 'ASIN', 'SKU', 'Product Title', 'Units', 'Sales (INR)', 'Orders'])
for m in merged_sorted:
    ws.append([m['channel'], m['asin'], m['sku'], m['title'], m['units'], round(m['sales'], 2), m['orders']])
style_header(ws, 7)
for col, w in zip('ABCDEFG', [12, 16, 40, 65, 10, 14, 10]):
    ws.column_dimensions[col].width = w

ws2 = wb_out.create_sheet('Amazon Products')
ws2.append(['ASIN', 'SKU', 'Product Title', 'Units', 'Sales (INR)', 'Orders'])
for (asin, sku, title), p in sorted(amazon_products.items(), key=lambda x: -x[1]['sales']):
    ws2.append([asin, sku, title, p['units'], round(p['sales'], 2), len(p['orders'])])
style_header(ws2, 6)
for col, w in zip('ABCDEF', [16, 40, 65, 10, 14, 10]):
    ws2.column_dimensions[col].width = w

ws3 = wb_out.create_sheet('FirstCry Products')
ws3.append(['Product ID', 'Product Name', 'Units', 'Sales (INR)', 'Orders', 'MRP'])
for pid, p in sorted(fc_products.items(), key=lambda x: -x[1]['sales']):
    ws3.append([pid, p['name'], p['units'], round(p['sales'], 2), len(p['orders']), p['mrp']])
style_header(ws3, 6)
for col, w in zip('ABCDEF', [14, 60, 10, 14, 10, 10]):
    ws3.column_dimensions[col].width = w

ws4 = wb_out.create_sheet('Flipkart Products')
ws4.append(['SKU', 'Product', 'Units', 'Sales (INR)', 'Orders'])
for (sku, prod), p in sorted(fk_products.items(), key=lambda x: -x[1]['sales']):
    ws4.append([sku, prod, p['units'], round(p['sales'], 2), len(p['orders'])])
style_header(ws4, 5)
for col, w in zip('ABCDE', [40, 60, 10, 14, 10]):
    ws4.column_dimensions[col].width = w

wb_out.save(out_path)
print(f'\nExcel saved: {out_path}')
