import json
import os
import sys

import requests

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbz07KglX7GGgM6JCbaYxk78S7JTV4gcSNRVR8Da5PM-e5G4w-QyscZqOvwkdx34nuZe/exec'
PUSH_KEY = 'catche-daily-2026'

SNAPSHOT_FILE = os.path.join(PROJECT, 'docs', 'inventory-snapshot.json')
DAILY_FILE = os.path.join(PROJECT, 'docs', 'inventory-daily.json')


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


def load_json(path):
    if not os.path.exists(path):
        print('Missing {}'.format(path))
        return []
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def main():
    clear_daily = '--clear-daily' in sys.argv

    if clear_daily:
        print('Clearing Inventory Daily tab...')
        resp = get_json(WEB_APP_URL, {'key': PUSH_KEY, 'action': 'invDailyClear'})
        print(json.dumps(resp, ensure_ascii=False))

    snapshot = load_json(SNAPSHOT_FILE)
    daily = load_json(DAILY_FILE)

    if not snapshot:
        print('No snapshot rows. Run the TS pull first.')
        return

    # Push snapshot
    snap_rows = [{
        'date': r.get('date', ''),
        'asin': r.get('asin', ''),
        'sku': r.get('sku', ''),
        'product': r.get('product', ''),
        'available': r.get('available', 0),
        'inboundWorking': r.get('inboundWorking', 0),
        'inboundShipped': r.get('inboundShipped', 0),
        'inboundReceived': r.get('inboundReceived', 0),
        'inboundTotal': r.get('inboundTotal', 0),
        'reserved': r.get('reserved', 0),
        'unfulfillable': r.get('unfulfillable', 0),
        'daysOfSupply': r.get('daysOfSupply', 0),
        'totalQty': r.get('totalQty', 0),
        'lastUpdated': r.get('lastUpdated', ''),
} for r in snapshot]

    existing = None
    try:
        existing = get_json(WEB_APP_URL, {'key': PUSH_KEY, 'action': 'invAll'}, attempts=6, timeout=90)
    except Exception:
        print('Warning: GET invAll failed, relying on server-side dedupe')
    existing_keys = set()
    if existing:
        for r in existing.get('rows', []):
            existing_keys.add('{}|{}'.format(str(r.get('date', '')), str(r.get('sku', '')).lower()))

    new_snap = []
    for r in snap_rows:
        k = '{}|{}'.format(str(r['date']), r['sku'].lower())
        if k in existing_keys:
            continue
        existing_keys.add(k)
        new_snap.append(r)

    if new_snap:
        print('Pushing {} inventory snapshot rows'.format(len(new_snap)))
        resp = post_json(WEB_APP_URL, {'key': PUSH_KEY, 'type': 'inv', 'rows': new_snap})
        print(json.dumps(resp, ensure_ascii=False))
    else:
        print('No new snapshot rows to push')

    if daily:
        daily_rows = [{
            'date': r.get('date', ''),
            'sku': r.get('sku', ''),
            'asin': r.get('asin', ''),
            'fnsku': r.get('fnsku', ''),
            'product': r.get('product', ''),
            'beginning': r.get('beginning', 0),
            'received': r.get('received', 0),
            'sold': r.get('sold', 0),
            'returns': r.get('returns', 0),
            'reserved': r.get('reserved', 0),
            'unfulfillable': r.get('unfulfillable', 0),
            'inbound': r.get('inbound', 0),
            'ending': r.get('ending', 0),
} for r in daily]

        existing = None
        try:
            existing = get_json(WEB_APP_URL, {'key': PUSH_KEY, 'action': 'invDailyAll'}, attempts=6, timeout=90)
        except Exception:
            print('Warning: GET invDailyAll failed, relying on server-side dedupe')
        existing_keys = set()
        if existing:
            for r in existing.get('rows', []):
                existing_keys.add('{}|{}'.format(str(r.get('date', '')), str(r.get('sku', '')).lower()))

        new_daily = []
        for r in daily_rows:
            k = '{}|{}'.format(str(r['date']), r['sku'].lower())
            if k in existing_keys:
                continue
            existing_keys.add(k)
            new_daily.append(r)

        if new_daily:
            print('Pushing {} inventory daily rows'.format(len(new_daily)))
            resp = post_json(WEB_APP_URL, {'key': PUSH_KEY, 'type': 'invDaily', 'rows': new_daily})
            print(json.dumps(resp, ensure_ascii=False))
        else:
            print('No new daily rows to push')


if __name__ == '__main__':
    main()



