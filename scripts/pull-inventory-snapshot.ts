import { spApiClient } from '../src/sp-api/client';
import { spApiConfig } from '../src/sp-api/config';
import { requestAndDownloadReport } from '../src/sp-api/reports';
import * as fs from 'fs';
import * as path from 'path';

interface Inv {
  date: string;
  asin: string;
  sku: string;
  product: string;
  available: number;
  reserved: number;
  unfulfillable: number;
  inboundWorking: number;
  inboundShipped: number;
  inboundReceived: number;
  inboundTotal: number;
  totalQty: number;
  lastUpdated: string;
}

function num(v: string | undefined): number {
  const n = parseFloat((v || '').replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

async function fetchPlanningDetails(): Promise<Map<string, Partial<Inv>>> {
  const data = await requestAndDownloadReport('GET_FBA_INVENTORY_PLANNING_DATA');
  const lines = data.trim().split('\n');
  const map = new Map<string, Partial<Inv>>();
  if (lines.length < 2) return map;
  const headers = lines[0].split('\t');
  const idx = (name: string) => headers.indexOf(name);
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    const get = (name: string) => cols[idx(name)]?.trim() || '';
    const sku = get('sku');
    if (!sku) continue;
    map.set(sku, {
      asin: get('asin'),
      product: get('product-name'),
      available: num(get('available')),
      reserved: num(get('Total Reserved Quantity')),
      unfulfillable: num(get('unfulfillable-quantity')),
      inboundWorking: num(get('inbound-working')),
      inboundShipped: num(get('inbound-shipped')),
      inboundReceived: num(get('inbound-received')),
      inboundTotal: num(get('inbound-quantity')),
    });
  }
  return map;
}

async function main() {
  const date = process.argv[2] || new Date().toISOString().slice(0, 10);
  const qs = new URLSearchParams({
    marketplaceIds: spApiConfig.marketplaceId,
    granularityType: 'Marketplace',
    granularityId: spApiConfig.marketplaceId,
  }).toString();

  console.log('Fetching FBA planning details...');
  const [details, summariesRes] = await Promise.all([
    fetchPlanningDetails(),
    spApiClient.get<any>(`/fba/inventory/v1/summaries?${qs}`),
  ]);
  console.log('Planning detail SKUs:', details.size);

  const map = new Map<string, Inv>();
  const summaries = summariesRes?.payload?.inventorySummaries || [];
  for (const s of summaries) {
    const sku = s.sellerSku || '';
    const d = details.get(sku) || {};
    map.set(sku, {
      date,
      asin: s.asin || d.asin || '',
      sku,
      product: s.productName || d.product || '',
      available: d.available ?? 0,
      reserved: d.reserved ?? 0,
      unfulfillable: d.unfulfillable ?? 0,
      inboundWorking: d.inboundWorking ?? 0,
      inboundShipped: d.inboundShipped ?? 0,
      inboundReceived: d.inboundReceived ?? 0,
      inboundTotal: d.inboundTotal ?? 0,
      totalQty: s.totalQuantity ?? 0,
      lastUpdated: s.lastUpdatedTime || '',
    });
  }

  const rows = [...map.values()];
  const out = path.join(process.cwd(), 'docs', `inventory-snapshot-${date}.json`);
  fs.writeFileSync(out, JSON.stringify(rows, null, 2));
  console.log(`\nInventory snapshot @ ${date}: ${rows.length} SKUs`);
  for (const r of rows.sort((a, b) => b.totalQty - a.totalQty)) {
    console.log(`  ${r.sku.padEnd(32)} avail=${r.available} reserved=${r.reserved} unfulfillable=${r.unfulfillable} inbound=${r.inboundTotal} total=${r.totalQty}`);
  }
  console.log('Saved:', out);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });