import fs from 'fs';
import { createGunzip } from 'zlib';
import { amazonConfig } from '../src/amazon/config';
import { getAccessToken } from '../src/amazon/auth/tokenManager';

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

const endDate = new Date().toISOString().slice(0, 10);
const startDate = new Date(Date.now() - 31 * 86400000).toISOString().slice(0, 10);

const reports = [
  { label: '1. Campaign Report', reportTypeId: 'spCampaigns', groupBy: ['campaign'], columns: ['campaignId', 'campaignName', 'campaignBiddingStrategy', 'impressions', 'clicks', 'cost', 'sales7d', 'roasClicks14d', 'purchases7d', 'costPerClick', 'clickThroughRate'] },
  { label: '2. Ad Group Report', reportTypeId: 'spCampaigns', groupBy: ['campaign', 'adGroup'], columns: ['campaignId', 'campaignName', 'adGroupId', 'adGroupName', 'impressions', 'clicks', 'cost', 'sales7d'] },
  { label: '3. Search Term Report', reportTypeId: 'spSearchTerm', groupBy: ['searchTerm'], columns: ['campaignId', 'campaignName', 'adGroupId', 'adGroupName', 'keywordId', 'keyword', 'matchType', 'searchTerm', 'impressions', 'clicks', 'cost', 'sales7d', 'purchases7d'] },
  { label: '4. Keyword Report', reportTypeId: 'spKeywords', groupBy: ['adGroup'], columns: ['campaignId', 'campaignName', 'adGroupId', 'adGroupName', 'keywordId', 'keyword', 'matchType', 'impressions', 'clicks', 'cost', 'sales7d', 'purchases7d', 'unitsSoldClicks7d'] },
  { label: '5. Targeting Report', reportTypeId: 'spTargeting', groupBy: ['targeting'], columns: ['campaignId', 'campaignName', 'adGroupId', 'adGroupName', 'keywordId', 'keyword', 'keywordType', 'impressions', 'clicks', 'cost', 'sales7d', 'purchases7d'] },
  { label: '6. Product Report', reportTypeId: 'spAdvertisedProduct', groupBy: ['advertiser'], columns: ['campaignId', 'campaignName', 'adGroupId', 'adGroupName', 'advertisedAsin', 'advertisedSku', 'impressions', 'clicks', 'cost', 'sales7d', 'purchases7d', 'unitsSoldClicks7d'] },
  { label: '7. Placement Report', reportTypeId: 'spCampaigns', groupBy: ['campaign', 'campaignPlacement'], columns: ['campaignId', 'campaignName', 'placementClassification', 'impressions', 'clicks', 'cost', 'sales7d', 'costPerClick', 'clickThroughRate', 'purchases7d'] },
  { label: '8. Purchased Product Report', reportTypeId: 'spPurchasedProduct', groupBy: ['asin'], columns: ['campaignId', 'campaignName', 'adGroupId', 'adGroupName', 'purchasedAsin', 'sales7d', 'purchases7d', 'unitsSoldClicks7d'] },
  { label: '9. Budget Report', reportTypeId: 'spCampaigns', groupBy: ['campaign'], columns: ['campaignId', 'campaignName', 'campaignBudgetAmount', 'campaignBudgetType', 'campaignBiddingStrategy', 'impressions', 'clicks', 'cost', 'sales7d'] },
];

async function main() {
  console.log('Starting reporting period:', startDate, 'to', endDate);
  console.log('Creating ' + reports.length + ' reports in parallel...\n');

  const ts = Date.now();
  // Step 1: Create all reports (one at a time to handle per-report failures)
  const created: any[] = [];
  for (const r of reports) {
    try {
      const id = await createReport({
        name: r.label + ' ' + ts,
        startDate, endDate,
        configuration: {
          adProduct: 'SPONSORED_PRODUCTS',
          groupBy: r.groupBy,
          columns: r.columns,
          reportTypeId: r.reportTypeId,
          timeUnit: 'SUMMARY',
          format: 'GZIP_JSON',
        },
      });
      console.log('  Created ' + r.label + ': ' + id);
      created.push({ ...r, reportId: id });
    } catch (e: any) {
      console.log('  FAILED to create ' + r.label + ': ' + e.message.slice(0, 200));
    }
  }

  // Step 2: Poll all in parallel
  console.log('\nPolling all reports (this takes ~10 min)...\n');
  const polled = await Promise.all(created.map(async r => {
    try {
      const status = await pollOne(r.reportId);
      console.log('  ' + r.label + ' COMPLETED');
      return { ...r, status };
    } catch (e: any) {
      console.log('  ' + r.label + ' FAILED: ' + e.message);
      return { ...r, status: null, error: e.message };
    }
  }));

  // Step 3: Download all completed reports
  console.log('\nDownloading reports...\n');
  const results: Record<string, any[]> = {};
  for (const r of polled) {
    if (r.status?.url) {
      try {
        const data = await downloadReport(r.status.url);
        results[r.label] = data;
        console.log('  ' + r.label + ': ' + data.length + ' rows');
      } catch (e: any) {
        console.log('  ' + r.label + ' download failed: ' + e.message);
        results[r.label] = [];
      }
    } else {
      results[r.label] = [];
    }
  }

  // === BUILD MARKDOWN REPORT ===
  const c = results['1. Campaign Report'] || [];
  const ag = results['2. Ad Group Report'] || [];
  const st = results['3. Search Term Report'] || [];
  const kw = results['4. Keyword Report'] || [];
  const tg = results['5. Targeting Report'] || [];
  const pr = results['6. Product Report'] || [];
  const pl = results['7. Placement Report'] || [];
  const pp = results['8. Purchased Product Report'] || [];
  const bg = results['9. Budget Report'] || [];

  const totalCost = c.reduce((s: number, r: any) => s + parseFloat(r.cost || 0), 0);
  const totalSales = c.reduce((s: number, r: any) => s + parseFloat(r.sales7d || 0), 0);
  const totalImpressions = c.reduce((s: number, r: any) => s + parseInt(r.impressions || 0), 0);
  const totalClicks = c.reduce((s: number, r: any) => s + parseInt(r.clicks || 0), 0);
  const totalPurchases = c.reduce((s: number, r: any) => s + parseInt(r.purchases7d || 0), 0);
  const acos = totalCost > 0 && totalSales > 0 ? (totalCost / totalSales * 100) : 0;
  const roas = totalCost > 0 ? totalSales / totalCost : 0;
  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0;
  const cpc = totalClicks > 0 ? totalCost / totalClicks : 0;
  const totalBudget = bg.reduce((s: number, r: any) => s + parseFloat(r.campaignBudgetAmount || 0), 0);
  const budgetUtil = totalBudget > 0 ? (totalCost / totalBudget * 100) : 0;

  let md = '# Amazon Ads — Complete Performance Report\n\n';
  md += '**Generated:** ' + endDate + '\n';
  md += '**Period:** ' + startDate + ' to ' + endDate + '\n\n';
  md += '## Executive Summary\n\n';
  md += '| Metric | Value |\n|---|---|\n';
  md += '| Total Spend | ₹' + fmt(totalCost) + ' |\n';
  md += '| Total Sales (7d) | ₹' + fmt(totalSales) + ' |\n';
  md += '| Total Impressions | ' + totalImpressions.toLocaleString() + ' |\n';
  md += '| Total Clicks | ' + totalClicks.toLocaleString() + ' |\n';
  md += '| Total Purchases (7d) | ' + totalPurchases.toLocaleString() + ' |\n';
  md += '| ACoS | ' + fmt(acos) + '% |\n';
  md += '| ROAS | ' + fmt(roas) + 'x |\n';
  md += '| CTR | ' + fmt(ctr, 2) + '% |\n';
  md += '| CPC | ₹' + fmt(cpc, 2) + ' |\n';
  md += '| Total Budget Allocated | ₹' + fmt(totalBudget) + ' |\n';
  md += '| Budget Utilization | ' + fmt(budgetUtil) + '% |\n';
  md += '| Active Campaigns | ' + c.length + ' |\n\n';

  md += '---\n\n## 1. Campaign Performance\n\n';
  md += '| Campaign | Strategy | Impressions | Clicks | Spend | Sales | ROAS | ACoS | Purchases | CPC |\n';
  md += '|---|---|---|---|---|---|---|---|---|---|\n';
  for (const r of [...c].sort((a: any, b: any) => parseFloat(b.cost || 0) - parseFloat(a.cost || 0))) {
    const s = r.sales7d || 0; const co = r.cost || 0;
    const rv = co > 0 ? s / co : 0; const av = s > 0 ? (co / s * 100) : 0;
    md += '| ' + (r.campaignName || r.campaignId) + ' | ' + (r.campaignBiddingStrategy || '-') + ' | ' + fmt(r.impressions, 0) + ' | ' + fmt(r.clicks, 0) + ' | ₹' + fmt(co) + ' | ₹' + fmt(s) + ' | ' + fmt(rv) + 'x | ' + fmt(av) + '% | ' + fmt(r.purchases7d, 0) + ' | ₹' + fmt(co > 0 && r.clicks ? co / parseFloat(r.clicks) : 0, 2) + ' |\n';
  }

  md += '\n---\n\n## 2. Ad Group Performance\n\n';
  md += '| Campaign | Ad Group | Impressions | Clicks | Spend | Sales | ROAS |\n';
  md += '|---|---|---|---|---|---|---|\n';
  for (const r of [...ag].sort((a: any, b: any) => parseFloat(b.cost || 0) - parseFloat(a.cost || 0))) {
    const s = r.sales7d || 0; const co = r.cost || 0;
    md += '| ' + (r.campaignName || '-') + ' | ' + (r.adGroupName || r.adGroupId || '-') + ' | ' + fmt(r.impressions, 0) + ' | ' + fmt(r.clicks, 0) + ' | ₹' + fmt(co) + ' | ₹' + fmt(s) + ' | ' + fmt(co > 0 ? s / co : 0) + 'x |\n';
  }

  md += '\n---\n\n## 3. Search Term Performance\n\n';
  const highPerf = st.filter((r: any) => parseFloat(r.cost || 0) > 0).sort((a: any, b: any) => parseFloat(b.cost || 0) - parseFloat(a.cost || 0));
  md += '### Top Search Terms (by spend)\n\n';
  md += '| Search Term | Keyword | Campaign | Match Type | Impressions | Clicks | Spend | Sales | ROAS |\n';
  md += '|---|---|---|---|---|---|---|---|---|\n';
  for (const r of highPerf.slice(0, 50)) {
    const s = r.sales7d || 0;
    const co = r.cost || 0;
    const rv = co > 0 ? s / co : 0;
    md += '| ' + (r.searchTerm || '-') + ' | ' + (r.keyword || '-') + ' | ' + (r.campaignName || '-') + ' | ' + (r.matchType || '-') + ' | ' + fmt(r.impressions, 0) + ' | ' + fmt(r.clicks, 0) + ' | ₹' + fmt(co) + ' | ₹' + fmt(s) + ' | ' + fmt(rv) + 'x |\n';
  }

  const wasted = st.filter((r: any) => (parseFloat(r.sales7d || 0) === 0 && parseFloat(r.cost || 0) > 0)).sort((a: any, b: any) => parseFloat(b.cost || 0) - parseFloat(a.cost || 0));
  md += '\n### Wasted Spend (clicks but no sales)\n\n';
  md += '| Search Term | Campaign | Match Type | Spend | Clicks |\n';
  md += '|---|---|---|---|---|\n';
  for (const r of wasted.slice(0, 50)) {
    md += '| ' + (r.searchTerm || '-') + ' | ' + (r.campaignName || '-') + ' | ' + (r.matchType || '-') + ' | ₹' + fmt(r.cost) + ' | ' + fmt(r.clicks, 0) + ' |\n';
  }

  md += '\n---\n\n## 4. Keyword Performance\n\n';
  md += '| Keyword | Campaign | Match Type | Impressions | Clicks | CPC | Spend | Sales | ROAS | Purchases |\n';
  md += '|---|---|---|---|---|---|---|---|---|---|\n';
  for (const r of [...kw].sort((a: any, b: any) => parseFloat(b.cost || 0) - parseFloat(a.cost || 0)).slice(0, 200)) {
    const s = r.sales7d || 0; const co = r.cost || 0; const cpc = co > 0 && r.clicks ? co / parseFloat(r.clicks) : 0;
    md += '| ' + (r.keyword || '-') + ' | ' + (r.campaignName || '-') + ' | ' + (r.matchType || '-') + ' | ' + fmt(r.impressions, 0) + ' | ' + fmt(r.clicks, 0) + ' | ₹' + fmt(cpc) + ' | ₹' + fmt(co) + ' | ₹' + fmt(s) + ' | ' + fmt(co > 0 ? s / co : 0) + 'x | ' + fmt(r.purchases7d, 0) + ' |\n';
  }

  md += '\n---\n\n## 5. Targeting Performance\n\n';
  md += '| Target | Type | Campaign | Impressions | Clicks | Spend | Sales | ROAS |\n';
  md += '|---|---|---|---|---|---|---|---|\n';
  for (const r of [...tg].sort((a: any, b: any) => parseFloat(b.cost || 0) - parseFloat(a.cost || 0))) {
    const s = r.sales7d || 0; const co = r.cost || 0;
    md += '| ' + (r.keyword || '-') + ' | ' + (r.keywordType || '-') + ' | ' + (r.campaignName || '-') + ' | ' + fmt(r.impressions, 0) + ' | ' + fmt(r.clicks, 0) + ' | ₹' + fmt(co) + ' | ₹' + fmt(s) + ' | ' + fmt(co > 0 ? s / co : 0) + 'x |\n';
  }

  md += '\n---\n\n## 6. Advertised Product Performance\n\n';
  md += '| ASIN | SKU | Campaign | Impressions | Clicks | Spend | Sales | ROAS | Purchases | Units Sold |\n';
  md += '|---|---|---|---|---|---|---|---|---|---|\n';
  for (const r of [...pr].sort((a: any, b: any) => parseFloat(b.cost || 0) - parseFloat(a.cost || 0))) {
    const s = r.sales7d || 0; const co = r.cost || 0;
    md += '| ' + (r.advertisedAsin || '-') + ' | ' + (r.advertisedSku || '-') + ' | ' + (r.campaignName || '-') + ' | ' + fmt(r.impressions, 0) + ' | ' + fmt(r.clicks, 0) + ' | ₹' + fmt(co) + ' | ₹' + fmt(s) + ' | ' + fmt(co > 0 ? s / co : 0) + 'x | ' + fmt(r.purchases7d, 0) + ' | ' + fmt(r.unitsSoldClicks7d, 0) + ' |\n';
  }

  md += '\n---\n\n## 7. Placement Performance\n\n';
  md += '| Campaign | Placement | Impressions | Clicks | Spend | Sales | ROAS | CPC | CTR |\n';
  md += '|---|---|---|---|---|---|---|---|---|\n';
  for (const r of [...pl].sort((a: any, b: any) => parseFloat(b.cost || 0) - parseFloat(a.cost || 0))) {
    const s = r.sales7d || 0; const co = r.cost || 0;
    md += '| ' + (r.campaignName || '-') + ' | ' + (r.placementClassification || '-') + ' | ' + fmt(r.impressions, 0) + ' | ' + fmt(r.clicks, 0) + ' | ₹' + fmt(co) + ' | ₹' + fmt(s) + ' | ' + fmt(co > 0 ? s / co : 0) + 'x | ₹' + fmt(co > 0 && r.clicks ? co / parseFloat(r.clicks) : 0, 2) + ' | ' + fmt(r.clickThroughRate || 0, 2) + '% |\n';
  }

  md += '\n---\n\n## 8. Purchased Product Report\n\n';
  md += '| Purchased ASIN | Campaign | Sales | Purchases | Units Sold |\n';
  md += '|---|---|---|---|---|\n';
  for (const r of [...pp].sort((a: any, b: any) => parseFloat(b.sales7d || 0) - parseFloat(a.sales7d || 0))) {
    md += '| ' + (r.purchasedAsin || '-') + ' | ' + (r.campaignName || '-') + ' | ₹' + fmt(r.sales7d) + ' | ' + fmt(r.purchases7d, 0) + ' | ' + fmt(r.unitsSoldClicks7d, 0) + ' |\n';
  }

  md += '\n---\n\n## 9. Budget & Efficiency\n\n';
  md += '| Campaign | Budget | Type | Strategy | Spend | Budget Used | Sales | ROAS |\n';
  md += '|---|---|---|---|---|---|---|---|\n';
  for (const r of [...bg].sort((a: any, b: any) => parseFloat(b.cost || 0) - parseFloat(a.cost || 0))) {
    const s = r.sales7d || 0; const co = r.cost || 0; const budget = r.campaignBudgetAmount; const bu = budget && parseFloat(budget) > 0 ? (co / parseFloat(budget) * 100) : 0;
    md += '| ' + (r.campaignName || r.campaignId) + ' | ₹' + fmt(budget) + ' | ' + (r.campaignBudgetType || '-') + ' | ' + (r.campaignBiddingStrategy || '-') + ' | ₹' + fmt(co) + ' | ' + fmt(bu) + '% | ₹' + fmt(s) + ' | ' + fmt(co > 0 ? s / co : 0) + 'x |\n';
  }

  md += '\n### Budget Summary\n\n';
  md += '| Metric | Value |\n|---|---|\n';
  md += '| Total Budget Allocated | ₹' + fmt(totalBudget) + ' |\n';
  md += '| Total Spend | ₹' + fmt(totalCost) + ' |\n';
  md += '| Budget Utilization | ' + fmt(budgetUtil) + '% |\n';
  md += '| Overall ACoS | ' + fmt(acos) + '% |\n';
  md += '| Overall ROAS | ' + fmt(roas) + 'x |\n';

  fs.writeFileSync('docs/amazon-ads-complete-report.md', md, 'utf-8');
  console.log('\n=== REPORT SAVED to docs/amazon-ads-complete-report.md ===');
}
main().catch(e => { console.error('FATAL:', e); process.exit(1); });
