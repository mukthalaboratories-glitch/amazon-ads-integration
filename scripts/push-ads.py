import json
import os
import sys

import requests

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbz07KglX7GGgM6JCbaYxk78S7JTV4gcSNRVR8Da5PM-e5G4w-QyscZqOvwkdx34nuZe/exec'
PUSH_KEY = 'catche-daily-2026'

FLIPKART_ADS_FILE = os.path.join(PROJECT, 'flipkart ads', 'flipkart_ads.json')
FIRSTCRY_ADS_FILE = os.path.join(PROJECT, 'Firstcry ads', 'firstcry_ads.json')


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


def load_amazon_keywords():
    path = os.path.join(PROJECT, 'docs', 'amazon-ads-raw-3mo.json')
    if not os.path.exists(path):
        print('Missing {}'.format(path))
        return []
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    rows = []
    for source, key in [('KEYWORD_DAILY', 'keyword'), ('SEARCH_TERM_DAILY', 'searchTerm'),
                        ('SEARCH_TERM', 'searchTerm'), ('KEYWORD', 'keyword'), ('TARGETING', 'keyword')]:
        for r in data.get(source, []):
            if not r.get('date') and not r.get('campaignName'):
                continue
            keyword = r.get(key)
            if not keyword:
                continue
            date = r.get('date')
            if not date:
                date = r.get('startDate', '')
            if not date:
                continue
            rows.append({
                'date': date,
                'channel': 'Amazon',
                'campaign': r['campaignName'],
                'keyword': keyword,
                'matchType': r.get('matchType', r.get('keywordType', '')),
                'impressions': r.get('impressions', 0) or 0,
                'clicks': r.get('clicks', 0) or 0,
                'spend': r.get('cost', 0) or 0,
                'sales': r.get('sales7d', 0) or 0,
                'orders': r.get('purchases7d', 0) or 0,
            })
    return rows


def load_amazon():
    path = os.path.join(PROJECT, 'docs', 'amazon-ads-raw-3mo.json')
    if not os.path.exists(path):
        print('Missing {}'.format(path))
        return []
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    rows = []
    for r in data.get('WEEKLY_CAMPAIGN', []):
        if not r.get('date') or not r.get('campaignName'):
            continue
        rows.append({
            'date': r['date'],
            'channel': 'Amazon',
            'campaign': r['campaignName'],
            'impressions': r.get('impressions', 0) or 0,
            'clicks': r.get('clicks', 0) or 0,
            'spend': r.get('cost', 0) or 0,
            'sales': r.get('sales7d', 0) or 0,
            'orders': r.get('purchases7d', 0) or 0,
        })
    return rows


def load_flipkart():
    if not os.path.exists(FLIPKART_ADS_FILE):
        return []
    with open(FLIPKART_ADS_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
    rows = []
    for r in data:
        rows.append({
            'date': r['date'],
            'channel': 'Flipkart',
            'campaign': r.get('campaign', 'Flipkart Ads'),
            'impressions': r.get('impressions', 0) or 0,
            'clicks': r.get('clicks', 0) or 0,
            'spend': r.get('spend', 0) or 0,
            'sales': r.get('sales', 0) or 0,
            'orders': r.get('orders', 0) or 0,
        })
    return rows


def load_firstcry():
    if not os.path.exists(FIRSTCRY_ADS_FILE):
        return []
    with open(FIRSTCRY_ADS_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
    rows = []
    for r in data:
        rows.append({
            'date': r['date'],
            'channel': 'FirstCry',
            'campaign': r.get('campaign', 'FirstCry Ads'),
            'impressions': r.get('impressions', 0) or 0,
            'clicks': r.get('clicks', 0) or 0,
            'spend': r.get('spend', 0) or 0,
            'sales': r.get('sales', 0) or 0,
            'orders': r.get('orders', 0) or 0,
        })
    return rows


def row_key(r):
    return '|'.join([
        str(r.get('date', '')),
        str(r.get('channel', '')),
        str(r.get('campaign', '')),
    ]).lower()


def row_key_kw(r):
    return '|'.join([
        str(r.get('date', '')),
        str(r.get('channel', '')),
        str(r.get('campaign', '')),
        str(r.get('keyword', '')),
        str(r.get('matchType', '')),
    ]).lower()


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    rows = []
    if not only or only == 'amazon':
        rows += load_amazon()
    if not only or only == 'flipkart':
        rows += load_flipkart()
    if not only or only == 'firstcry':
        rows += load_firstcry()

    if not rows:
        print('No rows to push. Provide a file or pull more data.')
        return

    existing = None
    try:
        existing = get_json(WEB_APP_URL, {'key': PUSH_KEY, 'action': 'adsAll'}, attempts=6, timeout=90)
    except Exception:
        print('Warning: GET adsAll failed, relying on server-side dedupe')
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

    if new_rows:
        total_spend = sum(r['spend'] for r in new_rows)
        print('Pushing {} new ads rows (spend Rs {:.2f})'.format(len(new_rows), total_spend))
        resp = post_json(WEB_APP_URL, {'key': PUSH_KEY, 'type': 'ads', 'rows': new_rows})
        print(json.dumps(resp, ensure_ascii=False))
    else:
        print('No new ads rows to push (dedupe OK)')

    if not only or only == 'amazon':
        kw_rows = load_amazon_keywords()
        if kw_rows:
            existing_kw = None
            try:
                existing_kw = get_json(WEB_APP_URL, {'key': PUSH_KEY, 'action': 'adsKeywordAll'}, attempts=6, timeout=90)
            except Exception:
                print('Warning: GET adsKeywordAll failed, relying on server-side dedupe')
            existing_kw_keys = set()
            if existing_kw:
                for r in existing_kw.get('rows', []):
                    existing_kw_keys.add(row_key_kw(r))
            new_kw = []
            for r in kw_rows:
                if row_key_kw(r) in existing_kw_keys:
                    continue
                existing_kw_keys.add(row_key_kw(r))
                new_kw.append(r)
            if new_kw:
                kw_spend = sum(r['spend'] for r in new_kw)
                print('Pushing {} new keyword rows (spend Rs {:.2f})'.format(len(new_kw), kw_spend))
                resp_kw = post_json(WEB_APP_URL, {'key': PUSH_KEY, 'type': 'adskeyword', 'rows': new_kw})
                print(json.dumps(resp_kw, ensure_ascii=False))
            else:
                print('No new keyword rows to push (dedupe OK)')


if __name__ == '__main__':
    main()



