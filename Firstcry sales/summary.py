import openpyxl
from collections import defaultdict

wb = openpyxl.load_workbook(r'dashboardsale_2026_07_01_to_2026_07_31 (1).xlsx', data_only=True)
ws = wb['Sales Data']
rows = list(ws.iter_rows(min_row=2, values_only=True))

by_sku = defaultdict(lambda: {'qty': 0, 'sales': 0, 'orders': 0})
by_day = defaultdict(lambda: {'qty': 0, 'sales': 0, 'orders': 0})
orders = set()

for r in rows:
    poid, dt, pid, brand, btype, qty, mrp, sales, subcat, cat, stock, sku = r
    by_sku[sku]['qty'] += qty
    by_sku[sku]['sales'] += sales
    if poid:
        by_sku[sku]['orders'] += 1
    day = dt[:10]
    by_day[day]['qty'] += qty
    by_day[day]['sales'] += sales
    by_day[day]['orders'] += 1
    if poid:
        orders.add(poid)

total_orders = len(orders)
total_qty = sum(d['qty'] for d in by_sku.values())
total_sales = sum(d['sales'] for d in by_sku.values())

print('=== TOTAL JULY 2026 ===')
print(f'Orders: {total_orders} | Units: {total_qty} | Sales: Rs{total_sales:.2f}')
print()

print('=== BY SKU ===')
for sku, d in sorted(by_sku.items(), key=lambda x: -x[1]['sales']):
    print(f'{sku}: {d["orders"]} orders, {d["qty"]} units, Rs{d["sales"]}')
print()

print('=== JULY 31 ===')
if '2026-07-31' in by_day:
    d = by_day['2026-07-31']
    print(f'2026-07-31: {d["orders"]} orders, {d["qty"]} units, Rs{d["sales"]}')
print()

print('=== BY DAY ===')
for day in sorted(by_day):
    d = by_day[day]
    print(f'{day}: {d["orders"]} orders, {d["qty"]} units, Rs{d["sales"]}')
