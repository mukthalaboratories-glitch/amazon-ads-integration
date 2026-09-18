import { requestAndDownloadReport } from '../src/sp-api/reports';
import * as fs from 'fs';
import * as path from 'path';

const START = process.argv[2] || '2026-06-01';
const END = process.argv[3] || '2026-08-31';
const OUT = process.argv[4] || path.join(process.cwd(), 'docs', 'orders-jun-aug-raw.json');

function chunks(): { start: string; end: string }[] {
  const out: { start: string; end: string }[] = [];
  let cur = new Date(START + 'T00:00:00Z');
  const end = new Date(END + 'T00:00:00Z');
  while (cur <= end) {
    let e = new Date(cur);
    e.setUTCDate(e.getUTCDate() + 29);
    if (e > end) e = end;
    out.push({ start: cur.toISOString().slice(0, 10), end: e.toISOString().slice(0, 10) });
    cur = new Date(e);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

interface OrderRow {
  orderId: string;
  orderStatus: string;
  itemStatus: string;
  purchaseDate: string;
  lastUpdated: string;
  fulfillmentChannel: string;
  asin: string;
  sku: string;
  title: string;
  units: number;
  sales: number;
  city: string;
  state: string;
  day: string;
}

async function main() {
  const allRows: OrderRow[] = [];
  for (const c of chunks()) {
    console.log(`Pulling Amazon orders ${c.start} to ${c.end}...`);
    const data = await requestAndDownloadReport('GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL', c.start + 'T00:00:00Z', c.end + 'T23:59:59Z');
    const lines = data.trim().split('\n');
    if (lines.length < 2) { console.log('  No orders in chunk.'); continue; }

  const headers = lines[0].split('\t');
  const idx = (name: string) => headers.indexOf(name);
  const rows: OrderRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    const get = (name: string) => cols[idx(name)]?.trim() || '';
    const orderId = get('amazon-order-id');
    if (!orderId) continue;
    rows.push({
      orderId,
      orderStatus: get('order-status'),
      itemStatus: get('item-status'),
      purchaseDate: get('purchase-date'),
      lastUpdated: get('last-updated-date'),
      fulfillmentChannel: get('fulfillment-channel'),
      asin: get('asin'),
      sku: get('sku'),
      title: get('product-name'),
      units: parseInt(get('quantity') || '0', 10) || 0,
      sales: parseFloat(get('item-price') || '0') || 0,
      city: get('ship-city'),
      state: get('ship-state'),
      day: (get('purchase-date') || '').slice(0, 10),
    });
  }
    allRows.push(...rows);
    console.log(`  chunk rows: ${rows.length}, total: ${allRows.length}`);
  }

  fs.writeFileSync(OUT, JSON.stringify(allRows, null, 2));
  const statuses = new Set(allRows.map(r => r.orderStatus));
  const itemStatuses = new Set(allRows.map(r => r.itemStatus));
  const days = new Set(allRows.map(r => r.day));
  console.log(`Total rows: ${allRows.length}`);
  console.log(`Order statuses: ${[...statuses].join(', ')}`);
  console.log(`Item statuses: ${[...itemStatuses].join(', ')}`);
  console.log(`Day range: ${[...days].sort()[0]} .. ${[...days].sort().at(-1)}`);
  console.log(`Saved: ${OUT}`);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
