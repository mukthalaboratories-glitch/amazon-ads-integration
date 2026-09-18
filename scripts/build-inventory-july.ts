import { requestAndDownloadReport } from '../src/sp-api/reports';
import { spApiClient } from '../src/sp-api/client';
import { spApiConfig } from '../src/sp-api/config';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

const START = '2026-07-01';
const END = '2026-07-31';
const RAW_FILE = path.join(process.cwd(), 'amazon_july_raw.json');

interface OrderRow {
  asin: string;
  sku: string;
  title: string;
  units: number;
  sales: number;
  orderId: string;
  day: string;
}

interface PlanRow {
  sku: string;
  asin: string;
  available: number;
  inbound: number;
  inboundWorking: number;
  inboundShipped: number;
  inboundReceived: number;
  reserved: number;
  unfulfillable: number;
  daysOfSupply: number;
  sellThrough: number;
}

function num(v: string | undefined): number {
  const n = parseFloat((v || '').replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

function parseTsv(data: string): Record<string, string>[] {
  const lines = data.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split('\t').map(h => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    const row: Record<string, string> = {};
    headers.forEach((h, j) => { row[h] = cols[j]?.trim() || ''; });
    rows.push(row);
  }
  return rows;
}

async function fetchPlanning(): Promise<PlanRow[]> {
  console.log('Requesting GET_FBA_INVENTORY_PLANNING_DATA...');
  const data = await requestAndDownloadReport('GET_FBA_INVENTORY_PLANNING_DATA');
  return parseTsv(data).map(r => ({
    sku: r['sku'],
    asin: r['asin'],
    available: num(r['available']),
    inbound: num(r['inbound-quantity']),
    inboundWorking: num(r['inbound-working']),
    inboundShipped: num(r['inbound-shipped']),
    inboundReceived: num(r['inbound-received']),
    reserved: num(r['Total Reserved Quantity']),
    unfulfillable: num(r['unfulfillable-quantity']),
    daysOfSupply: num(r['days-of-supply']),
    sellThrough: num(r['sell-through']),
  }));
}

async function fetchSummaries(): Promise<Map<string, { total: number; lastUpdated: string }>> {
  const qs = new URLSearchParams({
    marketplaceIds: spApiConfig.marketplaceId,
    granularityType: 'Marketplace',
    granularityId: spApiConfig.marketplaceId,
  }).toString();
  const map = new Map<string, { total: number; lastUpdated: string }>();
  let nextToken: string | undefined;
  do {
    const url = `/fba/inventory/v1/summaries?${qs}` + (nextToken ? `&nextToken=${encodeURIComponent(nextToken)}` : '');
    const res = await spApiClient.get<any>(url);
    const summaries = res?.payload?.inventorySummaries || [];
    for (const s of summaries) {
      map.set(s.sellerSku, { total: s.totalQuantity ?? 0, lastUpdated: s.lastUpdatedTime || '' });
    }
    nextToken = res?.pagination?.nextToken;
  } while (nextToken);
  return map;
}

async function main() {
  const orders: OrderRow[] = JSON.parse(fs.readFileSync(RAW_FILE, 'utf-8'));

  const [planRows, summaries] = await Promise.all([fetchPlanning(), fetchSummaries()]);
  const planBySku = new Map(planRows.map(r => [r.sku, r]));

  console.log('Planning rows:', planRows.length, '| summaries:', summaries.size);

  // ---- Daily sold movement per SKU ----
  const dailyBySku = new Map<string, Map<string, { units: number; sales: number; orders: Set<string> }>>();
  for (const r of orders) {
    let bySku = dailyBySku.get(r.sku);
    if (!bySku) { bySku = new Map(); dailyBySku.set(r.sku, bySku); }
    let d = bySku.get(r.day);
    if (!d) { d = { units: 0, sales: 0, orders: new Set() }; bySku.set(r.day, d); }
    d.units += r.units;
    d.sales += r.sales;
    if (r.orderId) d.orders.add(r.orderId);
  }

  // ---- Build daily movement sheet (SKU x day) ----
  const days: string[] = [];
  for (let dt = new Date(START); dt <= new Date(END); dt.setDate(dt.getDate() + 1)) {
    days.push(dt.toISOString().slice(0, 10));
  }

  const detailRows: any[] = [];
  for (const [sku, bySku] of dailyBySku) {
    const plan = planBySku.get(sku);
    for (const day of days) {
      const d = bySku.get(day);
      detailRows.push({
        SKU: sku,
        ASIN: plan?.asin || '',
        Date: day,
        'Units Sold': d?.units || 0,
        'Sales (INR)': d?.sales || 0,
        Orders: d?.orders.size || 0,
      });
    }
  }
  detailRows.sort((a, b) => a.SKU.localeCompare(b.SKU) || a.Date.localeCompare(b.Date));

  // ---- SKU summary: July sold + current inventory ----
  const skuSummary: any[] = [];
  for (const [sku, bySku] of dailyBySku) {
    const plan = planBySku.get(sku);
    const sum = [...bySku.values()].reduce((a, d) => ({ units: a.units + d.units, sales: a.sales + d.sales, orders: a.orders + d.orders.size }), { units: 0, sales: 0, orders: 0 });
    const s = summaries.get(sku);
    skuSummary.push({
      SKU: sku,
      ASIN: plan?.asin || '',
      Product: plan ? '' : '',
      'July Units Sold': sum.units,
      'July Sales (INR)': Math.round(sum.sales * 100) / 100,
      'July Orders': sum.orders,
      'Available Now': plan?.available ?? 0,
      'Inbound Now': plan?.inbound ?? 0,
      'Reserved Now': plan?.reserved ?? 0,
      'Unfulfillable Now': plan?.unfulfillable ?? 0,
      'Total Qty (API)': s?.total ?? 0,
      'Last Updated': s?.lastUpdated || '',
    });
  }
  skuSummary.sort((a, b) => b['July Units Sold'] - a['July Units Sold']);

  // ---- Inventory snapshot from planning ----
  const snapshotRows = planRows.map(p => ({
    SKU: p.sku,
    ASIN: p.asin,
    'Available': p.available,
    'Inbound Working': p.inboundWorking,
    'Inbound Shipped': p.inboundShipped,
    'Inbound Received': p.inboundReceived,
    'Inbound Total': p.inbound,
    'Reserved': p.reserved,
    'Unfulfillable': p.unfulfillable,
    'Days of Supply': p.daysOfSupply,
    'Sell Through': p.sellThrough,
  }));

  const outPath = path.join(process.cwd(), 'docs', `fba-inventory-july-${START}-to-${END}.xlsx`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const wb = XLSX.utils.book_new();

  const ws1 = XLSX.utils.json_to_sheet(skuSummary);
  ws1['!cols'] = [
    { wch: 32 }, { wch: 14 }, { wch: 50 }, { wch: 14 }, { wch: 16 }, { wch: 12 },
    { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'SKU Summary');

  const ws2 = XLSX.utils.json_to_sheet(detailRows);
  ws2['!cols'] = [{ wch: 32 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Daily Sold');

  const ws3 = XLSX.utils.json_to_sheet(snapshotRows);
  ws3['!cols'] = [
    { wch: 32 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, ws3, 'Inventory Snapshot');

  XLSX.writeFile(wb, outPath);

  console.log(`\nExcel saved: ${outPath}`);
  console.log(`\n=== SKU Summary (July) ===`);
  for (const r of skuSummary) {
    console.log(`${r.SKU.padEnd(30)} | sold=${String(r['July Units Sold']).padStart(4)} | avail=${String(r['Available Now']).padStart(4)} | inbound=${String(r['Inbound Now']).padStart(4)}`);
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
