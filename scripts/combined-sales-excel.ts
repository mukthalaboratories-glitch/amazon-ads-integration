import { requestAndDownloadReport } from '../src/sp-api/reports';
import { spApiConfig } from '../src/sp-api/config';
import * as fs from 'fs';

interface Row { asin: string; sku: string; title: string; units: number; sales: number; orderId: string; day: string; }

async function fetchAmazonDay(start: string, end: string): Promise<Row[]> {
  const data = await requestAndDownloadReport('GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL', start, end);
  const lines = data.trim().split('\n');
  const rows: Row[] = [];
  if (lines.length < 2) return rows;
  const headers = lines[0].split('\t');
  const idx = (name: string) => headers.indexOf(name);
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    const get = (name: string) => cols[idx(name)]?.trim() || '';
    rows.push({
      asin: get('asin'),
      sku: get('sku'),
      title: get('product-name'),
      units: parseInt(get('quantity') || '0', 10) || 0,
      sales: parseFloat(get('item-price') || '0') || 0,
      orderId: get('amazon-order-id'),
      day: (get('purchase-date') || '').slice(0, 10),
    });
  }
  return rows;
}

async function main() {
  const month = process.argv[2] || '2026-07';
  const start = month + '-01T00:00:00Z';
  const end = month + '-31T23:59:59Z';

  console.log(`Pulling Amazon SP-API data for ${month}...`);
  const amazonRows = await fetchAmazonDay(start, end);
  console.log(`  Amazon rows: ${amazonRows.length}`);

  fs.writeFileSync('amazon_july_raw.json', JSON.stringify(amazonRows));
  console.log('Saved amazon_july_raw.json');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
