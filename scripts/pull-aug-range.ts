import { requestAndDownloadReport } from '../src/sp-api/reports';
import * as fs from 'fs';
import * as path from 'path';

const START = process.argv[2] || '2026-08-12';
const END = process.argv[3] || '2026-08-18';
const OUT = process.argv[4] || path.join(process.cwd(), 'amazon_aug_raw.json');

async function main() {
  const data = await requestAndDownloadReport('GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL', START + 'T00:00:00Z', END + 'T23:59:59Z');
  const lines = data.trim().split('\n');
  const headers = lines[0].split('\t');
  const idx = (name: string) => headers.indexOf(name);

  let existing: any[] = [];
  if (fs.existsSync(OUT)) {
    try { existing = JSON.parse(fs.readFileSync(OUT, 'utf-8')); } catch (e) { existing = []; }
  }
  existing = existing.filter((r: any) => !(r.day >= START && r.day <= END));

  if (lines.length >= 2) {
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split('\t');
      const get = (name: string) => cols[idx(name)]?.trim() || '';
      const qty = parseInt(get('quantity') || '0', 10) || 0;
      const price = parseFloat(get('item-price') || '0') || 0;
      const day = (get('purchase-date') || '').slice(0, 10);
      if (!day || day < START || day > END) continue;
      if (qty <= 0) continue;
      existing.push({
        asin: get('asin'),
        sku: get('sku'),
        title: get('product-name'),
        units: qty,
        sales: price,
        orderId: get('amazon-order-id'),
        day,
      });
    }
  }

  fs.writeFileSync(OUT, JSON.stringify(existing, null, 2));
  const days = [...new Set(existing.map((r: any) => r.day))].sort();
  const units = existing.reduce((a: number, r: any) => a + r.units, 0);
  const sales = existing.reduce((a: number, r: any) => a + r.sales, 0);
  console.log(`Wrote ${existing.length} rows to ${OUT} (days: ${days[0]}..${days[days.length - 1]})`);
  console.log(`Units: ${units} | Sales: Rs ${sales.toFixed(2)}`);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });