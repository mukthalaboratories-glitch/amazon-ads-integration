import { amazonConfig } from '../src/amazon/config';
import { getAccessToken } from '../src/amazon/auth/tokenManager';
import { createGunzip } from 'zlib';

const BASE = amazonConfig.endpoints.advertisingApiHost;
const SCOPE = amazonConfig.profileId ?? '';
const CT_REQ = 'application/vnd.createasyncreportrequest.v3+json';
const CT_RESP = 'application/vnd.createasyncreportresponse.v3+json';

async function headers() {
  const token = await getAccessToken();
  return {
    Authorization: 'Bearer ' + token,
    'Amazon-Advertising-API-ClientId': amazonConfig.clientId,
    'Amazon-Advertising-API-Scope': SCOPE,
    'Content-Type': CT_REQ,
    Accept: CT_RESP,
  };
}

async function createReport(body: unknown): Promise<string> {
  const res = await fetch(BASE + '/reporting/reports', {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data.reportId;
}

async function pollOne(reportId: string): Promise<any> {
  const hdrs = { ...(await headers()), 'Content-Type': undefined as any };
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 10000));
    const res = await fetch(BASE + '/reporting/reports/' + reportId, { headers: hdrs });
    const data = await res.json();
    if (data.status === 'COMPLETED') return data;
    if (data.status === 'FAILED') throw new Error('Report ' + reportId + ' failed: ' + (data.failureReason || 'unknown'));
  }
  throw new Error('Report ' + reportId + ' timed out');
}

async function downloadReport(url: string): Promise<any[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Download failed: ' + res.status);
  const buffer = Buffer.from(await res.arrayBuffer());
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const gunzip = createGunzip();
    gunzip.on('data', (c: Buffer) => chunks.push(c));
    gunzip.on('end', () => {
      const raw = Buffer.concat(chunks).toString().trim();
      try { resolve(JSON.parse(raw)); }
      catch { resolve(raw.split('\n').filter(Boolean).map((l: string) => JSON.parse(l))); }
    });
    gunzip.on('error', reject);
    gunzip.end(buffer);
  });
}

function fmt(n: number | string | undefined, decimals = 2): string {
  if (n === undefined || n === null || n === '') return '-';
  const num = typeof n === 'string' ? parseFloat(n) : n;
  return isNaN(num) ? String(n) : num.toFixed(decimals);
}

async function main() {
  // We'll fetch DAILY data from June 28 to July 8 to compare Prime Day vs before
  const startDate = '2026-06-28';
  const endDate = '2026-07-08';

  console.log('=== Prime Day Sales Comparison ===\n');
  console.log('Fetching daily breakdown: ' + startDate + ' to ' + endDate + '\n');

  const reportId = 'cc476a9c-08b0-4820-9f28-7a7e8c88b666';
  console.log('[1/3] Using existing report: ' + reportId);

  console.log('\n[2/3] Polling for completion...');
  const status = await pollOne(reportId);
  console.log('  COMPLETED');

  console.log('\n[3/3] Downloading...');
  const data = await downloadReport(status.url);
  const rows = Array.isArray(data) ? data : [data];

  // Debug: show first row to see field names
  if (rows.length > 0) {
    console.log('  Sample row fields: ' + Object.keys(rows[0]).join(', '));
    console.log('  Sample row: ' + JSON.stringify(rows[0], null, 2));
  }

  // Group by date - try different possible date field names
  const byDate: Record<string, { impressions: number; clicks: number; cost: number; sales: number; purchases: number }> = {};

  for (const r of rows) {
    const date = r.date || r.day || r.Date || 'unknown';
    if (!byDate[date]) byDate[date] = { impressions: 0, clicks: 0, cost: 0, sales: 0, purchases: 0 };
    byDate[date].impressions += parseInt(r.impressions || 0);
    byDate[date].clicks += parseInt(r.clicks || 0);
    byDate[date].cost += parseFloat(r.cost || 0);
    byDate[date].sales += parseFloat(r.sales7d || 0);
    byDate[date].purchases += parseInt(r.purchases7d || 0);
  }

  const sortedDates = Object.keys(byDate).sort();

  console.log('\n=== Daily Performance Breakdown ===\n');
  console.log('Date       | Impressions | Clicks | Spend (₹) | Sales (₹) | Purchases | ROAS');
  console.log('-----------|-------------|--------|-----------|-----------|----------|------');
  for (const date of sortedDates) {
    const d = byDate[date];
    const roas = d.cost > 0 ? (d.sales / d.cost) : 0;
    console.log(date + ' | ' + String(d.impressions).padStart(11) + ' | ' + String(d.clicks).padStart(6) + ' | ₹' + fmt(d.cost).padStart(8) + ' | ₹' + fmt(d.sales).padStart(8) + ' | ' + String(d.purchases).padStart(7) + ' | ' + fmt(roas) + 'x');
  }

  // Summary: Prime Day (July 4-6) vs Non-Prime (June 28 - July 3 + July 7-8)
  const primeDayDates = ['2026-07-04', '2026-07-05', '2026-07-06'];
  let primeImpressions = 0, primeClicks = 0, primeCost = 0, primeSales = 0, primePurchases = 0;
  let nonPrimeImpressions = 0, nonPrimeClicks = 0, nonPrimeCost = 0, nonPrimeSales = 0, nonPrimePurchases = 0;

  for (const date of sortedDates) {
    const d = byDate[date];
    if (primeDayDates.includes(date)) {
      primeImpressions += d.impressions; primeClicks += d.clicks; primeCost += d.cost; primeSales += d.sales; primePurchases += d.purchases;
    } else {
      nonPrimeImpressions += d.impressions; nonPrimeClicks += d.clicks; nonPrimeCost += d.cost; nonPrimeSales += d.sales; nonPrimePurchases += d.purchases;
    }
  }

  const primeDays = primeDayDates.filter(d => sortedDates.includes(d)).length;
  const nonPrimeDays = sortedDates.length - primeDays;

  console.log('\n\n=== Comparison: Prime Day (July 4-6) vs Non-Prime Days ===\n');
  console.log('Metric         | Prime Day (Jul 4-6) [' + primeDays + ' days] | Non-Prime [' + nonPrimeDays + ' days] | Change');
  console.log('---------------|---------------------------|---------------------------|--------');
  const pSalesDay = primeDays > 0 ? primeSales / primeDays : 0;
  const npSalesDay = nonPrimeDays > 0 ? nonPrimeSales / nonPrimeDays : 0;
  const salesChange = npSalesDay > 0 ? ((pSalesDay - npSalesDay) / npSalesDay * 100) : 0;
  console.log('Avg Daily Sales | ₹' + fmt(pSalesDay).padStart(8) + '                 | ₹' + fmt(npSalesDay).padStart(8) + '                 | ' + (salesChange >= 0 ? '+' : '') + fmt(salesChange, 1) + '%');

  const pSpendDay = primeDays > 0 ? primeCost / primeDays : 0;
  const npSpendDay = nonPrimeDays > 0 ? nonPrimeCost / nonPrimeDays : 0;
  const spendChange = npSpendDay > 0 ? ((pSpendDay - npSpendDay) / npSpendDay * 100) : 0;
  console.log('Avg Daily Spend | ₹' + fmt(pSpendDay).padStart(8) + '                 | ₹' + fmt(npSpendDay).padStart(8) + '                 | ' + (spendChange >= 0 ? '+' : '') + fmt(spendChange, 1) + '%');

  const pPurchDay = primeDays > 0 ? primePurchases / primeDays : 0;
  const npPurchDay = nonPrimeDays > 0 ? nonPrimePurchases / nonPrimeDays : 0;
  const purchChange = npPurchDay > 0 ? ((pPurchDay - npPurchDay) / npPurchDay * 100) : 0;
  console.log('Avg Daily Purch | ' + fmt(pPurchDay, 1).padStart(8) + '                 | ' + fmt(npPurchDay, 1).padStart(8) + '                 | ' + (purchChange >= 0 ? '+' : '') + fmt(purchChange, 1) + '%');

  const pRoas = primeCost > 0 ? primeSales / primeCost : 0;
  const npRoas = nonPrimeCost > 0 ? nonPrimeSales / nonPrimeCost : 0;
  console.log('ROAS           | ' + fmt(pRoas).padStart(8) + 'x                | ' + fmt(npRoas).padStart(8) + 'x                | -');

  console.log('\n--- Totals ---');
  console.log('Prime Day Total Sales:  ₹' + fmt(primeSales) + '  |  Spend: ₹' + fmt(primeCost) + '  |  Purchases: ' + primePurchases);
  console.log('Non-Prime Total Sales: ₹' + fmt(nonPrimeSales) + '  |  Spend: ₹' + fmt(nonPrimeCost) + '  |  Purchases: ' + nonPrimePurchases);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
