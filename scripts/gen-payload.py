import importlib.util
import json
import sys

spec = importlib.util.spec_from_file_location('push_daily', 'scripts/push-daily.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

rows = m.build_rows('2026-07-31')
with open('payload.json', 'w') as f:
    json.dump({'key': m.PUSH_KEY, 'rows': rows}, f)
print(f'{len(rows)} rows written to payload.json')
