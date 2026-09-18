import json
import time
import importlib.util
import requests

spec = importlib.util.spec_from_file_location('push_daily', 'scripts/push-daily.py')
pd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pd)

URL = pd.WEB_APP_URL
KEY = pd.PUSH_KEY


def post(payload, attempts=8):
    last = None
    for _ in range(attempts):
        try:
            resp = requests.post(URL, data=json.dumps(payload).encode('utf-8'),
                                 headers={'Content-Type': 'application/json'}, timeout=120)
            if resp.status_code == 200 and resp.text.strip():
                return resp.json()
            last = f'HTTP {resp.status_code}'
        except Exception as e:
            last = str(e)
        time.sleep(15)
    raise RuntimeError(f'POST failed: {last}')


try:
    r = requests.get(URL, params={'key': KEY, 'action': 'clear'}, timeout=120).json()
    print('clear:', r)
except Exception as e:
    print('clear failed (already cleared or transient):', e)

grand = {'rows': 0, 'units': 0, 'sales': 0.0}
for month, ndays in ((6, 30), (7, 31), (8, 31), (9, 18)):
    for d in range(1, ndays + 1):
        day = f'2026-{month:02d}-{d:02d}'
        rows = pd.build_rows(day)
        if not rows:
            print(day, 'no rows')
            continue
        res = post({'key': KEY, 'rows': rows})
        n = res.get('added', '?') if isinstance(res, dict) else '?'
        u = sum(x['units'] for x in rows)
        s = sum(x['sales'] for x in rows)
        grand['rows'] += len(rows)
        grand['units'] += u
        grand['sales'] += s
        print(f'{day}: pushed {len(rows)} rows ({u} units, Rs {s:,.2f}) -> {n}')

print(f"DONE Aug: {grand['rows']} rows, {grand['units']} units, Rs {grand['sales']:,.2f}")
