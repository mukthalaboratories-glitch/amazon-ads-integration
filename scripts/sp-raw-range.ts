import { requestAndDownloadReport } from '../src/sp-api/reports';
import { spApiConfig } from '../src/sp-api/config';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const startArg = process.argv[2] || '2026-06-01';
  const endArg = process.argv[3] || '2026-07-31';
  const outFile = process.argv[4] || path.join(process.cwd(), 'amazon_range_raw.json');
  const start = startArg + 'T00:00:00Z';
  const end = endArg + 'T23:59:59Z';

  console.log(`Pulling Amazon orders ${startArg} to ${endArg}...`);
  const data = await requestAndDownloadReport('GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL', start, end);
  const lines = data.trim().split('\n');

  if (lines.length < 2) {
    console.log('No rows returned.');
    return;
  }

  const headers = lines[0].split('\t');
  const idx = (name: string) => headers.indexOf(name);
  console.log('Headers:', headers.join(' | ').slice(0, 600));

  const rows: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    const get = (name: string) => cols[idx(name)]?.trim() || '';
    const qty = parseInt(get('quantity') || '0', 10) || 0;
    const price = parseFloat(get('item-price') || '0') || 0;
    if (qty <= 0) continue;
    let day = String(get('purchase-date') || get('order-date') || '').slice(0, 10);
    if (!day) day = String(get('last-updated-date')).slice(0, 10);
    if (!day) {
      console.log('no date found for row', cols[0]);
      continue;
    }
    rows.push({
      asin: get('asin'),
      sku: get('sku'),
      title: get('product-name'),
      units: qty,
      sales: price,
      orderId: get('amazon-order-id'),
      day,
    });
  }

  fs.writeFileSync(outFile, JSON.stringify(rows, null, 2));
  const days = [...new Set(rows.map((r: any) => r.day))].sort();
  console.log(`Wrote ${rows.length} order lines to ${outFile}`);
  console.log(`Covered days: ${days.length} (${days[0]} -> ${days[days.length - 1]})`);
  const units = rows.reduce((a: number, r: any) => a + r.units, 0);
  const sales = rows.reduce((a: number, r: any) => a + r.sales, 0);
  console.log(`Units: ${units} | Sales: Rs ${sales.toFixed(2)}`);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });