import importlib.util, json
spec = importlib.util.spec_from_file_location('pd', 'scripts/push-daily.py')
pd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pd)
rows=[]
for m,nd in ((6,30),(7,31),(8,31),(9,15)):
    for d in range(1, nd+1):
        day=f'2026-{m:02d}-{d:02d}'
        rows.extend(pd.build_rows(day))
print(f'built {len(rows)} total rows for Jun1-Sep15')
# dedupe via GET
import time, requests
URL=pd.WEB_APP_URL
KEY=pd.PUSH_KEY
existing=None
for i in range(5):
    try:
        existing=requests.get(URL, params={'key':KEY,'action':'all'}, timeout=180).json()
        break
    except Exception as e:
        print('GET try',i,e)
        time.sleep(5)
keys=set()
if existing:
    for r in existing.get('rows',[]):
        keys.add(pd.row_key(r))
print('existing keys',len(keys))
new=[r for r in rows if pd.row_key(r) not in keys]
print(f'new rows {len(new)} units {sum(x["units"] for x in new)} sales {sum(x["sales"] for x in new):.2f}')
if new:
    # chunk into 200 rows per post to avoid payload too large
    for i in range(0,len(new),200):
        chunk=new[i:i+200]
        res=pd.post_json(URL, {'key':KEY,'rows':chunk})
        print(f'chunk {i//200} -> {res}')
        time.sleep(3)
    # final summary rebuild
    print(requests.get(URL, params={'key':KEY,'action':'summary'}, timeout=180).json().get('ok'))
    print(requests.get(URL, params={'key':KEY,'action':'adsSummary'}, timeout=180).json().get('ok'))
