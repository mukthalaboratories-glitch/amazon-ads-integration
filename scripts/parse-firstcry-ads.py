import openpyxl
import json
import os

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(PROJECT, 'Firstcry ads', 'Campaigns_Product_Ads_Performance__R(20260803-20260901)__E(20260902)__ID(6a97bb6b735429678b5c367b).xlsx')
OLD = os.path.join(PROJECT, 'Firstcry ads', 'firstcry_ads.json')
OUT = os.path.join(PROJECT, 'Firstcry ads', 'firstcry_ads.json')

CUTOFF = '2026-08-03'


def main():
    wb = openpyxl.load_workbook(SRC, data_only=True)
    ws = wb['Campaign Peformance Report SPA']

    rows = list(ws.iter_rows(values_only=True))
    header = rows[0]
    idx = {h: i for i, h in enumerate(header)}

    by_day = {}
    for r in rows[1:]:
        if not r or not any(r):
            continue
        day = str(r[idx['Date']])[:10]
        d = by_day.setdefault(day, {'impressions': 0, 'clicks': 0, 'spend': 0.0,
                                    'sales': 0.0, 'orders': 0})
        d['impressions'] += int(float(r[idx['Ad Impressions']] or 0))
        d['clicks'] += int(float(r[idx['Ad Clicks']] or 0))
        d['spend'] += float(r[idx['Ad Spend']] or 0)
        d['sales'] += float(r[idx['Ad MRP Sales']] or 0)
        d['orders'] += int(float(r[idx['Orders (SKU)']] or 0))

    with open(OLD, 'r', encoding='utf-8') as f:
        old_rows = json.load(f)
    kept_old = [r for r in old_rows if r['date'] < CUTOFF]

    out_rows = kept_old + [{
        'date': day,
        'channel': 'FirstCry',
        'campaign': 'FirstCry Ads',
        'impressions': d['impressions'],
        'clicks': d['clicks'],
        'spend': round(d['spend'], 2),
        'sales': round(d['sales'], 2),
        'orders': d['orders'],
    } for day, d in sorted(by_day.items())]

    out_rows.sort(key=lambda x: x['date'])

    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out_rows, f, ensure_ascii=False, indent=1)

    days = [r['date'] for r in out_rows]
    tot = {k: sum(r[k] for r in out_rows) for k in ('impressions', 'clicks', 'spend', 'sales', 'orders')}
    print('rows:', len(out_rows), '| days:', days[0], '..', days[-1])
    print('TOTAL: spend {:.2f} sales {:.2f} impressions {} clicks {} orders {}'.format(
        tot['spend'], tot['sales'], tot['impressions'], tot['clicks'], tot['orders']))
    print('rows written ->', OUT)


if __name__ == '__main__':
    main()