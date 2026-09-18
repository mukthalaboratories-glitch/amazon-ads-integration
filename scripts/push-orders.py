import json
import os
import sys

import requests

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbz07KglX7GGgM6JCbaYxk78S7JTV4gcSNRVR8Da5PM-e5G4w-QyscZqOvwkdx34nuZe/exec'
PUSH_KEY = 'catche-daily-2026'

CHANNEL_FILES = {
    'Amazon': ['amazon_june_raw.json', 'amazon_july_raw.json', 'amazon_aug_raw.json', 'amazon_sep_raw.json'],
}


def get_json(url, params, attempts=4, timeout=120):
    import time
    last = None
    for i in range(attempts):
        try:
            resp = requests.get(url, params=params, timeout=timeout)
            if resp.status_code == 200 and resp.text.strip():
                return resp.json()
            last = 'empty response (HTTP {})'.format(resp.status_code)
        except Exception as e:
            last = str(e)
        time.sleep(10)
    raise RuntimeError('GET failed after {} attempts: {}'.format(attempts, last))


def post_json(url, payload, attempts=12, timeout=120):
    import time
    last = None
    for i in range(attempts):
        try:
            resp = requests.post(url, data=json.dumps(payload).encode('utf-8'),
                                 headers={'Content-Type': 'application/json'}, timeout=timeout)
            if resp.status_code == 200 and resp.text.strip():
                return resp.json()
            last = 'empty response (HTTP {})'.format(resp.status_code)
        except Exception as e:
            last = str(e)
        time.sleep(20)
    raise RuntimeError('POST failed after {} attempts: {}'.format(attempts, last))


def load_orders(channel):
    rows = []
    for fname in CHANNEL_FILES.get(channel, []):
        fpath = os.path.join(PROJECT, fname)
        if not os.path.exists(fpath):
            continue
        with open(fpath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        for r in data:
            status = r.get('orderStatus') or r.get('itemStatus') or 'Shipped'
            rows.append({
                'date': r['day'],
                'orderId': r.get('orderId', ''),
                'status': status,
                'channel': channel,
                'product': r.get('title', ''),
                'asin': r.get('asin', ''),
                'sku': r.get('sku', ''),
                'units': r.get('units', 0),
                'sales': r.get('sales', 0),
                'shipCity': r.get('shipCity', ''),
                'shipState': r.get('shipState', ''),
                'shipPostalCode': r.get('shipPostalCode', ''),
                'shipCountry': r.get('shipCountry', ''),
            })
    return rows


def row_key(r):
    return '|'.join([
        str(r.get('date', '')),
        str(r.get('orderId', '')),
        str(r.get('channel', '')),
        str(r.get('asin', '')),
        str(r.get('sku', '')),
    ]).lower()


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    channels = [c for c in CHANNEL_FILES if not only or c.lower() == only.lower()]
    rows = []
    for c in channels:
        rows += load_orders(c)

    if not rows:
        print('No order rows to push.')
        return

    existing = None
    try:
        existing = get_json(WEB_APP_URL, {'key': PUSH_KEY, 'action': 'ordersAll'}, attempts=6, timeout=90)
    except Exception:
        print('Warning: GET ordersAll failed, relying on server-side dedupe')
    existing_keys = set()
    if existing:
        for r in existing.get('rows', []):
            existing_keys.add(row_key(r))

    new_rows = []
    for r in rows:
        if row_key(r) in existing_keys:
            continue
        existing_keys.add(row_key(r))
        new_rows.append(r)

    if not new_rows:
        print('Nothing to push - all order rows already in sheet (dedupe OK)')
        return

    total_sales = sum(r['sales'] for r in new_rows)
    total_units = sum(r['units'] for r in new_rows)
    print('Pushing {} new order rows ({} units, Rs {:.2f})'.format(len(new_rows), total_units, total_sales))
    resp = post_json(WEB_APP_URL, {'key': PUSH_KEY, 'type': 'orders', 'rows': new_rows})
    print(json.dumps(resp, ensure_ascii=False))


if __name__ == '__main__':
    main()

