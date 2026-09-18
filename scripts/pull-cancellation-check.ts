import { requestAndDownloadReport } from '../src/sp-api/reports';
import * as fs from 'fs';
import * as path from 'path';

const START = process.argv[2] || '2026-08-18';
const END = process.argv[3] || '2026-09-17';
const OUT = path.join(process.cwd(), 'docs', 'orders-cancellation-check.tsv');

async function main() {
  const data = await requestAndDownloadReport('GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL', START + 'T00:00:00Z', END + 'T23:59:59Z');
  fs.writeFileSync(OUT, data);
  const lines = data.trim().split('\n');
  const headers = lines[0].split('\t');
  console.log(`Total lines: ${lines.length - 1}`);
  console.log(`Header (${headers.length} cols):`);
  headers.forEach((h, i) => console.log(`  [${i}] ${h}`));

  let canc = 0;
  const orderIdx = headers.indexOf('order-status');
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    if (orderIdx >= 0 && cols[orderIdx]?.trim() === 'Cancelled') {
      canc++;
      if (canc <= 10) {
        const out: string[] = [];
        headers.forEach((h, k) => { const v = (cols[k] ?? '').trim(); if (v) out.push(`${h}=${JSON.stringify(v)}`); });
        console.log(`CANCELLED ROW: ${out.join(' | ')}`);
      }
    }
  }
  console.log(`Cancelled rows in window: ${canc}`);
  console.log(`Saved raw: ${OUT}`);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });