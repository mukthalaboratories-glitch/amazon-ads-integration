import { requestAndDownloadReport } from '../src/sp-api/reports';
import * as fs from 'fs';
import * as path from 'path';

const START = process.argv[2] || '2026-09-15';
const END = process.argv[3] || '2026-09-18';

const FILES = [
  path.join(process.cwd(), 'amazon_june_raw.json'),
  path.join(process.cwd(), 'amazon_july_raw.json'),
  path.join(process.cwd(), 'amazon_aug_raw.json'),
  path.join(process.cwd(), 'amazon_sep_raw.json'),
];

function chunk(start: string, end: string): string[][] {
  const out: string[][] = [];
  let cur: string[] = [];
  const d = new Date(start + 'T00:00:00Z');
  const last = new Date(end + 'T00:00:00Z');
  while (d <= last) {
    cur.push(d.toISOString().slice(0, 10));
    if (cur.length === 10) { out.push(cur); cur = []; }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  if (cur.length) out.push(cur);
  return out;
}

async function main() {
  const locByKey = new Map<string, { city: string; state: string; postal: string; country: string }>();

  for (const [ci, days] of chunk(START, END).entries()) {
    const from = days[0] + 'T00:00:00Z';
    const to = days[days.length - 1] + 'T23:59:59Z';
    console.log(`[${ci + 1}/${chunk(START, END).length}] Pulling ${days[0]}..${days[days.length - 1]} ...`);
    const data = await requestAndDownloadReport('GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL', from, to);
    const lines = data.trim().split('\n');
    if (lines.length < 2) { console.log('  empty'); continue; }
    const headers = lines[0].split('\t');
    const idx = (name: string) => headers.indexOf(name);
    let n = 0;
    for (let i = 1; i < lines.length; i++) {
      const c = lines[i].split('\t');
      const get = (name: string) => (idx(name) >= 0 ? c[idx(name)]?.trim() || '' : '');
      const orderId = get('amazon-order-id');
      const sku = get('sku');
      const asin = get('asin');
      const qty = parseInt(get('quantity') || '0', 10) || 0;
      if (!orderId || qty <= 0) continue;
      const day = (get('purchase-date') || '').slice(0, 10);
      if (!day) continue;
      const key = [day, orderId, asin, sku].join('|').toLowerCase();
      locByKey.set(key, {
        city: get('ship-city'),
        state: get('ship-state'),
        postal: get('ship-postal-code'),
        country: get('ship-country'),
      });
      n++;
    }
    console.log(`  parsed ${n} rows (total keys ${locByKey.size})`);
  }

  for (const fpath of FILES) {
    if (!fs.existsSync(fpath)) { console.log('skip', fpath); continue; }
    const rows = JSON.parse(fs.readFileSync(fpath, 'utf-8'));
    let matched = 0;
    for (const r of rows) {
      const key = [String(r.day), String(r.orderId), String(r.asin), String(r.sku)].join('|').toLowerCase();
      const loc = locByKey.get(key);
      if (loc) {
        r.shipCity = loc.city;
        r.shipState = loc.state;
        r.shipPostalCode = loc.postal;
        r.shipCountry = loc.country;
        matched++;
      } else {
        r.shipCity = r.shipCity || '';
        r.shipState = r.shipState || '';
        r.shipPostalCode = r.shipPostalCode || '';
        r.shipCountry = r.shipCountry || '';
      }
    }
    fs.writeFileSync(fpath, JSON.stringify(rows, null, 2));
    const withLoc = rows.filter((r: any) => r.shipCity).length;
    console.log(`${path.basename(fpath)}: ${rows.length} rows, ${matched} location-matched, ${withLoc} with city`);
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });