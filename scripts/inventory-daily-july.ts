import { requestAndDownloadReport } from '../src/sp-api/reports';
import { spApiConfig } from '../src/sp-api/config';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

const START = process.argv[2] || '2026-07-01';
const END = process.argv[3] || '2026-07-31';

interface DailyRow {
  sku: string;
  asin: string;
  product: string;
  fnsku: string;
  date: string;
  sold: number;
  received: number;
  beginning: number;
  ending: number;
  reserved: number;
  unfulfillable: number;
  inbound: number;
}

function num(v: string | undefined): number {
  const n = parseFloat((v || '').replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

async function main() {
  const startIso = START + 'T00:00:00Z';
  const endIso = END + 'T23:59:59Z';

  console.log(`SP-API FBA Daily Inventory (${START} to ${END})`);
  console.log(`  Region: ${spApiConfig.region}${spApiConfig.sandbox ? ' (sandbox)' : ''}`);
  console.log(`  Marketplace: ${spApiConfig.marketplaceId}`);
  console.log('  Requesting GET_FBA_INVENTORY_DAILY_DATA report...\n');

  const data = await requestAndDownloadReport('GET_FBA_INVENTORY_DAILY_DATA', startIso, endIso);
  const lines = data.trim().split('\n');

  if (lines.length < 2) {
    console.log('No data returned.');
    return;
  }

  const headers = lines[0].split('\t');
  const idx = (name: string) => headers.indexOf(name);
  const get = (cols: string[], name: string) => (idx(name) >= 0 ? cols[idx(name)]?.trim() || '' : '');

  const rows: DailyRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    rows.push({
      sku: get(cols, 'sku'),
      asin: get(cols, 'asin'),
      product: get(cols, 'product-name'),
      fnsku: get(cols, 'fnsku'),
      date: get(cols, 'date'),
      sold: num(get(cols, 'sold-units')),
      received: num(get(cols, 'received-units')),
      beginning: num(get(cols, 'beginning-inventory')),
      ending: num(get(cols, 'ending-inventory')),
      reserved: num(get(cols, 'reserved-units')),
      unfulfillable: num(get(cols, 'unfulfillable-units')),
      inbound: num(get(cols, 'inbound-units')),
    });
  }

  rows.sort((a, b) => (a.date + a.sku).localeCompare(b.date + b.sku));

  const bySku = new Map<string, { received: number; sold: number; beginning: number; ending: number }>();
  for (const r of rows) {
    const b = bySku.get(r.sku) || { received: 0, sold: 0, beginning: 0, ending: 0 };
    b.received += r.received;
    b.sold += r.sold;
    if (r.beginning) b.beginning = r.beginning;
    if (r.ending) b.ending = r.ending;
    bySku.set(r.sku, b);
  }

  const outPath = path.join(process.cwd(), 'docs', `fba-inventory-daily-${START}-to-${END}.xlsx`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const wb = XLSX.utils.book_new();

  const detail = XLSX.utils.json_to_sheet(
    rows.map(r => ({
      Date: r.date,
      SKU: r.sku,
      ASIN: r.asin,
      FNSKU: r.fnsku,
      Product: r.product,
      'Beginning Inventory': r.beginning,
      'Received Units': r.received,
      'Sold Units': r.sold,
      'Reserved Units': r.reserved,
      'Unfulfillable Units': r.unfulfillable,
      'Inbound Units': r.inbound,
      'Ending Inventory': r.ending,
    }))
  );
  detail['!cols'] = [
    { wch: 12 }, { wch: 32 }, { wch: 14 }, { wch: 14 }, { wch: 60 },
    { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 16 },
    { wch: 14 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, detail, 'Daily Movement');

  const summaryRows = [...bySku.entries()]
    .sort((a, b) => b[1].sold - a[1].sold)
    .map(([sku, b]) => ({
      SKU,
      'Beginning Inventory': b.beginning,
      'Received Units': b.received,
      'Sold Units': b.sold,
      'Net Change': b.received - b.sold,
      'Ending Inventory': b.ending,
    }));
  const summary = XLSX.utils.json_to_sheet(summaryRows);
  summary['!cols'] = [{ wch: 32 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, summary, 'Summary by SKU');

  XLSX.writeFile(wb, outPath);

  console.log(`Report rows: ${rows.length}`);
  console.log(`Unique SKUs: ${bySku.size}`);
  console.log(`Excel saved: ${outPath}`);
  console.log('\n=== Summary by SKU ===');
  console.log('SKU | Received | Sold | Net');
  for (const [sku, b] of bySku.entries()) {
    console.log(`${sku.padEnd(30)} | ${String(b.received).padStart(8)} | ${String(b.sold).padStart(4)} | ${b.received - b.sold}`);
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
