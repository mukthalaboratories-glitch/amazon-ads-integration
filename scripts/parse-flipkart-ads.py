import csv
import json
import os
import sys

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_LIST = [
    (os.path.join(PROJECT, 'flipkart ads', 'kjcv7pk9f8e.csv'), '2026-08-01', 27),
    (os.path.join(PROJECT, 'flipkart ads', 'n1f8mmil1ar.csv'), '2026-08-23', 11),
]
OUT = os.path.join(PROJECT, 'flipkart ads', 'flipkart_ads.json')


def parse_one(src, start, days):
    with open(src, 'r', encoding='utf-8-sig') as f:
        lines = f.readlines()
    data_start = None
    for i, ln in enumerate(lines):
        if ln.lower().startswith('campaign id'):
            data_start = i
            break
    if data_start is None:
        raise SystemExit(f'No header in {src}')
    reader = csv.DictReader(lines[data_start:])
    camps = {}
    for r in reader:
        name = (r.get('Campaign Name') or '').strip()
        views = int(float(r.get('Views') or 0))
        clicks = int(float(r.get('Clicks') or 0))
        units = int(float(r.get('Direct Units Sold') or 0)) + int(float(r.get('Indirect Units Sold') or 0))
        revenue = float(r.get('Total Revenue (Rs.)') or 0)
        spend = float(r.get('Ad Spend') or 0)
        if not name:
            continue
        c = camps.setdefault(name, {'views': 0, 'clicks': 0, 'units': 0, 'revenue': 0.0, 'spend': 0.0})
        c['views'] += views; c['clicks'] += clicks; c['units'] += units; c['revenue'] += revenue; c['spend'] += spend
    rows = {}
    for name, c in camps.items():
        for d in range(days):
            # handle month rollover correctly
            from datetime import datetime, timedelta
            dt = datetime.strptime(start, '%Y-%m-%d') + timedelta(days=d)
            date = dt.strftime('%Y-%m-%d')
            rows[(date, name)] = {
                'date': date, 'channel': 'Flipkart', 'campaign': name,
                'impressions': round(c['views'] / days), 'clicks': round(c['clicks'] / days),
                'spend': round(c['spend'] / days, 2), 'sales': round(c['revenue'] / days, 2),
                'orders': round(c['units'] / days),
            }
    return rows

def main():
    merged = {}
    for src, start, days in SRC_LIST:
        part = parse_one(src, start, days)
        merged.update(part)  # later files overwrite overlapping dates
    rows = sorted(merged.values(), key=lambda x: (x['date'], x['campaign']))

    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)

    tot_spend = sum(r['spend'] for r in rows)
    tot_sales = sum(r['sales'] for r in rows)
    tot_imp = sum(r['impressions'] for r in rows)
    tot_click = sum(r['clicks'] for r in rows)
    tot_units = sum(r['orders'] for r in rows)
    camps_distinct = len(set(r['campaign'] for r in rows))
    print('campaigns:', camps_distinct, 'dates', len(set(r['date'] for r in rows)))
    print('TOTAL: spend {:.2f} sales {:.2f} imp {} clicks {} units {}'.format(tot_spend, tot_sales, tot_imp, tot_click, tot_units))
    print('rows written:', len(rows), '->', OUT)


if __name__ == '__main__':
    main()
