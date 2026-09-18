import { requestAndDownloadReport } from '../src/sp-api/reports';
import { spApiConfig } from '../src/sp-api/config';

async function main() {
  const day = process.argv[2] || '2026-07-31';
  const start = day + 'T00:00:00Z';
  const end = day + 'T23:59:59Z';

  console.log(`SP-API Sales for: ${day}`);
  console.log(`  Region: ${spApiConfig.region}`);
  console.log(`  Marketplace: ${spApiConfig.marketplaceId}`);
  console.log(`  Period: ${start} to ${end}\n`);

  console.log('Requesting report...');
  const data = await requestAndDownloadReport('GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL', start, end);
  const lines = data.trim().split('\n');

  if (lines.length < 2) {
    console.log('\nNo orders found for this day.');
    return;
  }

  const headers = lines[0].split('\t');
  const idx = (name: string) => headers.indexOf(name);

  const byProduct = new Map<string, { asin: string; sku: string; title: string; units: number; sales: number; orders: Set<string> }>();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    const get = (name: string) => cols[idx(name)]?.trim() || '';
    const asin = get('asin');
    const sku = get('sku');
    const title = get('product-name');
    const qty = parseInt(get('quantity') || '0', 10) || 0;
    const price = parseFloat(get('item-price') || '0') || 0;
    const orderId = get('amazon-order-id');

    const key = asin + '|' + sku;
    let p = byProduct.get(key);
    if (!p) {
      p = { asin, sku, title, units: 0, sales: 0, orders: new Set() };
      byProduct.set(key, p);
    }
    p.units += qty;
    p.sales += price;
    if (orderId) p.orders.add(orderId);
  }

  const rows = [...byProduct.values()].sort((a, b) => b.sales - a.sales);

  let totalSales = 0, totalUnits = 0;
  const allOrders = new Set<string>();

  console.log(`\n=== ${day} — Product Sales ===\n`);
  console.log('ASIN         | SKU                         | Units | Sales (₹) | Orders');
  console.log('-------------|-----------------------------|-------|-----------|-------');
  for (const r of rows) {
    console.log(`${r.asin.padEnd(12)} | ${r.sku.padEnd(27)} | ${String(r.units).padStart(5)} | ${r.sales.toFixed(2).padStart(9)} | ${r.orders.size}`);
    totalSales += r.sales;
    totalUnits += r.units;
    r.orders.forEach(o => allOrders.add(o));
  }

  console.log(`\n=== TOTALS ===`);
  console.log(`Unique products: ${rows.length}`);
  console.log(`Units sold:      ${totalUnits}`);
  console.log(`Total sales:     ₹${totalSales.toFixed(2)}`);
  console.log(`Total orders:    ${allOrders.size}`);
  console.log(`Avg order value: ₹${allOrders.size ? (totalSales / allOrders.size).toFixed(2) : '0'}`);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
