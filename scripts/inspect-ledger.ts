import { spApiClient } from '../src/sp-api/client';
import { spApiConfig } from '../src/sp-api/config';
import { getReportDocument, downloadReportDocument } from '../src/sp-api/reports';

function strip(v: string): string {
  return (v || '').trim().replace(/^"|"$/g, '');
}

async function main() {
  const qs = new URLSearchParams({
    reportTypes: 'GET_LEDGER_DETAIL_VIEW_DATA',
    marketplaceIds: spApiConfig.marketplaceId,
    pageSize: '5',
  }).toString();
  const list = await spApiClient.get<any>(`/reports/2021-06-30/reports?${qs}`);
  const done = (list?.reports || []).find((r: any) => r.processingStatus === 'DONE' && r.reportDocumentId);
  if (!done) { console.log('No DONE ledger report'); return; }
  console.log('Using report', done.reportId);
  const doc = await getReportDocument(done.reportDocumentId);
  const data = await downloadReportDocument(doc.url, doc.compressionAlgorithm);
  const lines = data.trim().split('\n');
  const headers = lines[0].split('\t').map(strip);
  const idx = (n: string) => headers.indexOf(n);
  const rows: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t').map(strip);
    rows.push({
      date: cols[idx('Date')],
      sku: cols[idx('MSKU')],
      eventType: cols[idx('Event Type')],
      disposition: cols[idx('Disposition')],
      quantity: parseFloat(cols[idx('Quantity')]) || 0,
      reason: cols[idx('Reason')],
    });
  }

  console.log('Total events:', rows.length);
  console.log('\n=== non-SELLABLE events by eventType/disposition (with qty sums) ===');
  const byKey = new Map<string, { n: number; sum: number }>();
  for (const r of rows) {
    if (r.disposition === 'SELLABLE') continue;
    const k = `${r.disposition} | ${r.eventType}`;
    const o = byKey.get(k) || { n: 0, sum: 0 };
    o.n++; o.sum += r.quantity;
    byKey.set(k, o);
  }
  for (const [k, o] of [...byKey.entries()].sort()) {
    console.log(`  ${k.padEnd(40)} n=${String(o.n).padStart(4)} sumQty=${o.sum}`);
  }

  console.log('\n=== returns (CustomerReturns/VendorReturns) by disposition ===');
  const ret = new Map<string, { n: number; sum: number }>();
  for (const r of rows) {
    if (r.eventType !== 'CustomerReturns' && r.eventType !== 'VendorReturns') continue;
    const o = ret.get(r.disposition) || { n: 0, sum: 0 };
    o.n++; o.sum += r.quantity;
    ret.set(r.disposition, o);
  }
  for (const [k, o] of [...ret.entries()].sort()) {
    console.log(`  ${k.padEnd(30)} n=${String(o.n).padStart(4)} sumQty=${o.sum}`);
  }

  console.log('\n=== sample non-sellable rows ===');
  const ns = rows.filter((r) => r.disposition !== 'SELLABLE').slice(0, 8);
  for (const r of ns) console.log(' ', r.date, r.sku, r.eventType, r.disposition, r.quantity, r.reason);
}

main().catch((e) => { console.error('Error:', e.message); process.exit(1); });
