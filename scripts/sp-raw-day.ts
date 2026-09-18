import { requestAndDownloadReport } from '../src/sp-api/reports';
import { spApiConfig } from '../src/sp-api/config';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const day = process.argv[2] || '2026-08-01';
  const outFile = process.argv[3] || path.join(process.cwd(), 'amazon_aug_raw.json');
  const start = day + 'T00:00:00Z';
  const end = day + 'T23:59:59Z';

  console.log(`Pulling raw orders for ${day}...`);
  const data = await requestAndDownloadReport('GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL', start, end);
  const lines = data.trim().split('\n');

  let existing: any[] = [];
  if (fs.existsSync(outFile)) {
    try {
      existing = JSON.parse(fs.readFileSync(outFile, 'utf-8'));
    } catch (e) { existing = []; }
  }
  existing = existing.filter((r: any) => r.day !== day);

  if (lines.length >= 2) {
    const headers = lines[0].split('\t');
    const idx = (name: string) => headers.indexOf(name);

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split('\t');
      const get = (name: string) => cols[idx(name)]?.trim() || '';
      const qty = parseInt(get('quantity') || '0', 10) || 0;
      const price = parseFloat(get('item-price') || '0') || 0;
      if (qty <= 0) continue;
      existing.push({
        asin: get('asin'),
        sku: get('sku'),
        title: get('product-name'),
        units: qty,
        sales: price,
        orderId: get('amazon-order-id'),
        orderStatus: get('order-status'),
        itemStatus: get('item-status'),
        fulfillmentChannel: get('fulfillment-channel'),
        day,
      });
    }
  }

  fs.writeFileSync(outFile, JSON.stringify(existing, null, 2));
  const days = [...new Set(existing.map((r: any) => r.day))].sort();
  console.log(`Wrote ${existing.length} order lines to ${outFile} (days: ${days.join(', ')})`);
  const units = existing.reduce((a: number, r: any) => a + r.units, 0);
  const sales = existing.reduce((a: number, r: any) => a + r.sales, 0);
  console.log(`Units: ${units} | Sales: Rs ${sales.toFixed(2)}`);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
