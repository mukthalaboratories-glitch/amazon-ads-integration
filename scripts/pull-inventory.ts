import { requestAndDownloadReport, getReportDocument, downloadReportDocument } from '../src/sp-api/reports';
import { spApiClient } from '../src/sp-api/client';
import { spApiConfig } from '../src/sp-api/config';
import * as fs from 'fs';
import * as path from 'path';

const START = process.argv[2] || '2026-07-01';
const END = process.argv[3] || '2026-08-10';

function num(v: string | undefined): number {
  const n = parseFloat((v || '').replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

function strip(v: string): string {
  return (v || '').trim().replace(/^"|"$/g, '');
}

function parseTsv(data: string): Record<string, string>[] {
  const lines = data.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split('\t').map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t').map(strip);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => { row[h] = cols[j] || ''; });
    rows.push(row);
  }
  return rows;
}

function parseDate(v: string): string {
  // ledger uses MM/DD/YYYY
  const m = String(v).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1]}-${m[2]}`;
  return String(v).slice(0, 10);
}

async function fetchPlanning(): Promise<any[]> {
  console.log('Requesting GET_FBA_INVENTORY_PLANNING_DATA...');
  const data = await requestAndDownloadReport('GET_FBA_INVENTORY_PLANNING_DATA');
  return parseTsv(data).map((r) => ({
    date: new Date().toISOString().slice(0, 10),
    sku: r['sku'] || '',
    asin: r['asin'] || '',
    product: r['product-name'] || r['Product Name'] || '',
    available: num(r['available']),
    inboundWorking: num(r['inbound-working']),
    inboundShipped: num(r['inbound-shipped']),
    inboundReceived: num(r['inbound-received']),
    inboundTotal: num(r['inbound-quantity']),
    reserved: num(r['Total Reserved Quantity']),
    unfulfillable: num(r['unfulfillable-quantity']),
    daysOfSupply: num(r['days-of-supply']),
  }));
}

async function fetchLedgerEvents(): Promise<any[]> {
  const startIso = START + 'T00:00:00Z';
  const endIso = END + 'T23:59:59Z';
  console.log(`Requesting GET_LEDGER_DETAIL_VIEW_DATA (${START} to ${END})...`);

  // Reuse an already-DONE report within the same date window if present,
  // since this report is rate-limited (generated no more than once / 4h).
  const qs = new URLSearchParams({
    reportTypes: 'GET_LEDGER_DETAIL_VIEW_DATA',
    marketplaceIds: spApiConfig.marketplaceId,
    pageSize: '10',
  }).toString();
  const list = await spApiClient.get<any>(`/reports/2021-06-30/reports?${qs}`);
  const done = (list?.reports || []).find((r: any) => {
    if (r.processingStatus !== 'DONE' || !r.reportDocumentId) return false;
    const de = r.dataEndTime ? String(r.dataEndTime).slice(0, 10) : '';
    return de >= END;
  });

  let data: string;
  if (done) {
    console.log(`  Reusing DONE report ${done.reportId} (covers to ${String(done.dataEndTime || '').slice(0, 10)})`);
    const doc = await getReportDocument(done.reportDocumentId);
    data = await downloadReportDocument(doc.url, doc.compressionAlgorithm);
  } else {
    data = await requestAndDownloadReport(
      'GET_LEDGER_DETAIL_VIEW_DATA', startIso, endIso,
      { aggregateByLocation: 'COUNTRY', aggregatedByTimePeriod: 'DAY' },
    );
  }
  return parseTsv(data).map((r) => ({
    date: parseDate(r['Date']),
    sku: r['MSKU'] || '',
    asin: r['ASIN'] || '',
    fnsku: r['FNSKU'] || '',
    title: r['Title'] || '',
    eventType: r['Event Type'] || '',
    disposition: r['Disposition'] || '',
    quantity: num(r['Quantity']),
  }));
}

async function fetchSummaries(): Promise<any[]> {
  console.log('Fetching /fba/inventory/v1/summaries...');
  const qs = new URLSearchParams({
    marketplaceIds: spApiConfig.marketplaceId,
    granularityType: 'Marketplace',
    granularityId: spApiConfig.marketplaceId,
  }).toString();
  const out: any[] = [];
  let nextToken: string | undefined;
  do {
    const url = `/fba/inventory/v1/summaries?${qs}` + (nextToken ? `&nextToken=${encodeURIComponent(nextToken)}` : '');
    const res = await spApiClient.get<any>(url);
    const summaries = res?.payload?.inventorySummaries || [];
    for (const s of summaries) {
      out.push({
        sku: s.sellerSku || '',
        totalQty: s.totalQuantity ?? 0,
        lastUpdated: s.lastUpdatedTime || '',
      });
    }
    nextToken = res?.pagination?.nextToken;
  } while (nextToken);
  return out;
}

function allDays(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(start + 'T00:00:00Z');
  const last = new Date(end + 'T00:00:00Z');
  while (d <= last) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

async function main() {
  const [planning, events, summaries] = await Promise.all([fetchPlanning(), fetchLedgerEvents(), fetchSummaries()]);
  const summaryBySku = new Map(summaries.map((s) => [s.sku, s]));

  const snapshot = planning.map((p) => ({
    date: p.date,
    asin: p.asin,
    sku: p.sku,
    product: p.product,
    available: p.available,
    inboundWorking: p.inboundWorking,
    inboundShipped: p.inboundShipped,
    inboundReceived: p.inboundReceived,
    inboundTotal: p.inboundTotal,
    reserved: p.reserved,
    unfulfillable: p.unfulfillable,
    daysOfSupply: p.daysOfSupply,
    totalQty: summaryBySku.get(p.sku)?.totalQty ?? 0,
    lastUpdated: summaryBySku.get(p.sku)?.lastUpdated || '',
  }));

  // ---- Aggregate ledger events into per-SKU-per-day movement ----
  const days = allDays(START, END);
  const meta = new Map<string, { asin: string; fnsku: string; title: string }>();
  const bySkuDay = new Map<string, Map<string, { received: number; sold: number; returns: number; net: number; ufNet: number }>>();

  const addEvent = (sku: string, date: string, type: string, qty: number, disposition: string, asin: string, fnsku: string, title: string) => {
    if (!sku || !date) return;
    meta.set(sku, { asin, fnsku, title });
    if (!bySkuDay.has(sku)) bySkuDay.set(sku, new Map());
    const m = bySkuDay.get(sku)!;
    if (!m.has(date)) m.set(date, { received: 0, sold: 0, returns: 0, net: 0, ufNet: 0 });
    const d = m.get(date)!;
    const isReturn = type === 'CustomerReturns' || type === 'VendorReturns';
    if (isReturn) d.returns += -qty; // ledger stores returns as negative; flip to positive
    if (disposition === 'SELLABLE') {
      if (type === 'Receipts') { d.received += qty; d.net += qty; }
      else if (type === 'Shipments') { d.sold += -qty; d.net += qty; }
      else { d.net += qty; }
    } else {
      d.ufNet += qty;
    }
  };

  for (const e of events) {
    addEvent(e.sku, e.date, e.eventType, e.quantity, e.disposition, e.asin, e.fnsku, e.title);
  }

  // Reconstruct ending balance by walking backward from current available.
  // ending[d] = balance at end of day d. Balance is adjusted down by each day's net
  // as we walk backward, so before subtracting day d we store its ending balance.
  // Same reconstruction for unfulfillable, anchored at planning's current unfulfillable.
  const dailyRows: any[] = [];
  for (const [sku, m] of bySkuDay) {
    const plan = planning.find((p) => p.sku === sku);
    const current = plan?.available ?? 0;
    const currentUf = plan?.unfulfillable ?? 0;
    let balance = current;
    let ufBalance = currentUf;
    const endBalance = new Map<string, number>();
    const endUf = new Map<string, number>();
    for (let i = days.length - 1; i >= 0; i--) {
      const day = days[i];
      endBalance.set(day, balance);
      endUf.set(day, ufBalance);
      const d = m.get(day);
      if (d && d.net !== 0) balance -= d.net;
      if (d && d.ufNet !== 0) ufBalance -= d.ufNet;
    }
    const mi = meta.get(sku) || { asin: '', fnsku: '', title: '' };
    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      const d = m.get(day) || { received: 0, sold: 0, returns: 0, net: 0, ufNet: 0 };
      const ending = endBalance.get(day) ?? 0;
      const beginning = ending - d.net;
      dailyRows.push({
        date: day,
        sku,
        asin: mi.asin,
        fnsku: mi.fnsku,
        product: mi.title,
        beginning,
        received: d.received,
        sold: d.sold,
        returns: d.returns,
        reserved: 0,
        unfulfillable: endUf.get(day) ?? 0,
        inbound: 0,
        ending,
      });
    }
  }
  dailyRows.sort((a, b) => a.sku.localeCompare(b.sku) || a.date.localeCompare(b.date));

  const docsDir = path.join(__dirname, '..', 'docs');
  fs.mkdirSync(docsDir, { recursive: true });

  const snapPath = path.join(docsDir, 'inventory-snapshot.json');
  const dailyPath = path.join(docsDir, 'inventory-daily.json');
  fs.writeFileSync(snapPath, JSON.stringify(snapshot, null, 2));
  fs.writeFileSync(dailyPath, JSON.stringify(dailyRows, null, 2));

  console.log(`\nSnapshot rows: ${snapshot.length} -> ${snapPath}`);
  console.log(`Daily rows: ${dailyRows.length} (${bySkuDay.size} SKUs x ${days.length} days) -> ${dailyPath}`);

  const distinctSku = new Set(dailyRows.map((d) => d.sku));
  console.log('Daily SKUs:', distinctSku.size);
}

main().catch((e) => { console.error('Error:', e.message); process.exit(1); });
