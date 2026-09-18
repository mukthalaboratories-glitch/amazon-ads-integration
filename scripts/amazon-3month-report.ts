import fs from 'fs';
import { createGunzip } from 'zlib';
import { amazonConfig } from '../src/amazon/config';
import { getAccessToken } from '../src/amazon/auth/tokenManager';

const BASE = amazonConfig.endpoints.advertisingApiHost;
const SCOPE = amazonConfig.profileId ?? '';
const CT_REQ = 'application/vnd.createasyncreportrequest.v3+json';
const CT_RESP = 'application/vnd.createasyncreportresponse.v3+json';

const START = process.argv[2] || '2026-06-01';
const END = process.argv[3] || '2026-08-11';
const LABEL_FILTER = process.argv[4] || '';   // e.g. 'DAILY' to only pull labels containing DAILY

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
function fmtD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildChunks(): { start: string; end: string }[] {
  const out: { start: string; end: string }[] = [];
  let cur = new Date(START + 'T00:00:00Z');
  const end = new Date(END + 'T00:00:00Z');
  while (cur <= end) {
    let endC = addDays(cur, 30);
    if (endC > end) endC = end;
    out.push({ start: fmtD(cur), end: fmtD(endC) });
    cur = addDays(endC, 1);
  }
  return out;
}

interface RptDef {
  label: string;
  chunk: { start: string; end: string };
  reportTypeId: string;
  timeUnit: 'SUMMARY' | 'WEEKLY' | 'DAILY';
  groupBy: string[];
  columns: string[];
}

function buildReports(): RptDef[] {
  const chunks = buildChunks();
  const out: RptDef[] = [];
  for (const c of chunks) {
    out.push(
      { label: 'WEEKLY_CAMPAIGN', chunk: c, reportTypeId: 'spCampaigns', timeUnit: 'DAILY', groupBy: ['campaign'], columns: ['date', 'campaignId', 'campaignName', 'campaignBiddingStrategy', 'impressions', 'clicks', 'cost', 'sales7d', 'purchases7d', 'costPerClick', 'clickThroughRate'] },
      { label: 'CAMPAIGN_SUMMARY', chunk: c, reportTypeId: 'spCampaigns', timeUnit: 'SUMMARY', groupBy: ['campaign'], columns: ['campaignId', 'campaignName', 'campaignBiddingStrategy', 'impressions', 'clicks', 'cost', 'sales7d', 'roasClicks14d', 'purchases7d', 'costPerClick', 'clickThroughRate'] },
      { label: 'AD_GROUP', chunk: c, reportTypeId: 'spCampaigns', timeUnit: 'SUMMARY', groupBy: ['campaign', 'adGroup'], columns: ['campaignId', 'campaignName', 'adGroupId', 'adGroupName', 'impressions', 'clicks', 'cost', 'sales7d', 'purchases7d'] },
      { label: 'SEARCH_TERM', chunk: c, reportTypeId: 'spSearchTerm', timeUnit: 'SUMMARY', groupBy: ['searchTerm'], columns: ['campaignId', 'campaignName', 'adGroupId', 'adGroupName', 'keywordId', 'keyword', 'matchType', 'searchTerm', 'impressions', 'clicks', 'cost', 'sales7d', 'purchases7d'] },
      { label: 'SEARCH_TERM_DAILY', chunk: c, reportTypeId: 'spSearchTerm', timeUnit: 'DAILY', groupBy: ['searchTerm'], columns: ['date', 'campaignId', 'campaignName', 'adGroupId', 'adGroupName', 'keywordId', 'keyword', 'matchType', 'searchTerm', 'impressions', 'clicks', 'cost', 'sales7d', 'purchases7d'] },
      { label: 'KEYWORD', chunk: c, reportTypeId: 'spKeywords', timeUnit: 'SUMMARY', groupBy: ['adGroup'], columns: ['campaignId', 'campaignName', 'adGroupId', 'adGroupName', 'keywordId', 'keyword', 'matchType', 'impressions', 'clicks', 'cost', 'sales7d', 'purchases7d', 'unitsSoldClicks7d'] },
      { label: 'KEYWORD_DAILY', chunk: c, reportTypeId: 'spKeywords', timeUnit: 'DAILY', groupBy: ['adGroup'], columns: ['date', 'campaignId', 'campaignName', 'adGroupId', 'adGroupName', 'keywordId', 'keyword', 'matchType', 'impressions', 'clicks', 'cost', 'sales7d', 'purchases7d', 'unitsSoldClicks7d'] },
      { label: 'TARGETING', chunk: c, reportTypeId: 'spTargeting', timeUnit: 'SUMMARY', groupBy: ['targeting'], columns: ['campaignId', 'campaignName', 'adGroupId', 'adGroupName', 'keywordId', 'keyword', 'keywordType', 'impressions', 'clicks', 'cost', 'sales7d', 'purchases7d'] },
      { label: 'PRODUCT', chunk: c, reportTypeId: 'spAdvertisedProduct', timeUnit: 'SUMMARY', groupBy: ['advertiser'], columns: ['campaignId', 'campaignName', 'adGroupId', 'adGroupName', 'advertisedAsin', 'advertisedSku', 'impressions', 'clicks', 'cost', 'sales7d', 'purchases7d', 'unitsSoldClicks7d'] },
      { label: 'PLACEMENT', chunk: c, reportTypeId: 'spCampaigns', timeUnit: 'SUMMARY', groupBy: ['campaign', 'campaignPlacement'], columns: ['campaignId', 'campaignName', 'placementClassification', 'impressions', 'clicks', 'cost', 'sales7d', 'costPerClick', 'clickThroughRate', 'purchases7d'] },
      { label: 'PURCHASED_PRODUCT', chunk: c, reportTypeId: 'spPurchasedProduct', timeUnit: 'SUMMARY', groupBy: ['asin'], columns: ['campaignId', 'campaignName', 'adGroupId', 'adGroupName', 'purchasedAsin', 'sales7d', 'purchases7d', 'unitsSoldClicks7d'] },
      { label: 'BUDGET', chunk: c, reportTypeId: 'spCampaigns', timeUnit: 'SUMMARY', groupBy: ['campaign'], columns: ['campaignId', 'campaignName', 'campaignBudgetAmount', 'campaignBudgetType', 'campaignBiddingStrategy', 'impressions', 'clicks', 'cost', 'sales7d'] },
    );
  }
  return out;
}

async function fetchT(url: string, opts: any = {}, ms = 30000): Promise<Response> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: c.signal });
  } finally {
    clearTimeout(t);
  }
}

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
  const res = await fetchT(BASE + '/reporting/reports', {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify(body),
  }, 30000);
  const data = await res.json();
  if (res.ok) return data.reportId;
  if (res.status === 425 && typeof data.detail === 'string') {
    const m = data.detail.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (m) return m[1];
  }
  throw new Error(JSON.stringify(data));
}

async function pollOne(reportId: string): Promise<any> {
  const hdrs = { ...(await headers()), 'Content-Type': undefined as any };
  for (let i = 0; i < 180; i++) {
    await new Promise(r => setTimeout(r, 10000));
    try {
      const res = await fetchT(BASE + '/reporting/reports/' + reportId, { headers: hdrs }, 30000);
      const data = await res.json();
      if (data.status === 'COMPLETED') return data;
      if (data.status === 'FAILED') throw new Error('Report ' + reportId + ' failed: ' + (data.failureReason || 'unknown'));
    } catch (e: any) {
      if (/failed:/.test(e.message || '')) throw e;
    }
  }
  throw new Error('Report ' + reportId + ' timed out');
}

async function downloadReport(url: string): Promise<any[]> {
  const res = await fetchT(url, {}, 120000);
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

function mergeRows(existing: any[], fresh: any[]): any[] {
  const seen = new Set(existing.map((r: any) => JSON.stringify(r)));
  for (const r of fresh) {
    const k = JSON.stringify(r);
    if (!seen.has(k)) { seen.add(k); existing.push(r); }
  }
  return existing;
}

async function main() {
  if (process.env.ADS_REBUILD_ONLY === '1') {
    const results: Record<string, any[]> = {};
    const RAW = 'docs/amazon-ads-raw-3mo.json';
    if (fs.existsSync(RAW)) {
      const prev = JSON.parse(fs.readFileSync(RAW, 'utf-8'));
      for (const [k, v] of Object.entries(prev)) results[k] = Array.isArray(v) ? v : [];
    }
    console.log('Rebuild-only: using raw file, generating report.');
    for (const [k, v] of Object.entries(results)) console.log('  ' + k + ': ' + v.length);
    buildMarkdown(results);
    buildExcel(results);
    return;
  }

  const reports = buildReports().filter(r => !LABEL_FILTER || r.label.includes(LABEL_FILTER));
  const chunks = buildChunks();
  console.log('Period:', START, 'to', END, 'split into ' + chunks.length + ' chunks');
  console.log('Creating ' + reports.length + ' reports...\n');

  const results: Record<string, any[]> = {};
  const RAW = 'docs/amazon-ads-raw-3mo.json';
  if (fs.existsSync(RAW)) {
    try {
      const prev = JSON.parse(fs.readFileSync(RAW, 'utf-8'));
      for (const [k, v] of Object.entries(prev)) results[k] = Array.isArray(v) ? v : [];
      console.log('Loaded existing raw data:', Object.entries(results).map(([k, v]) => k + '=' + v.length).join(', '));
    } catch { /* ignore corrupt */ }
  }

  const ts = Date.now();
  const created: any[] = [];
  for (const r of reports) {
    try {
      const id = await createReport({
        name: r.label + ' ' + r.chunk.start + ' ' + ts,
        startDate: r.chunk.start,
        endDate: r.chunk.end,
        configuration: {
          adProduct: 'SPONSORED_PRODUCTS',
          groupBy: r.groupBy,
          columns: r.columns,
          reportTypeId: r.reportTypeId,
          timeUnit: r.timeUnit,
          format: 'GZIP_JSON',
        },
      });
      console.log('  Created ' + r.label + ' [' + r.chunk.start + ']: ' + id);
      created.push({ ...r, reportId: id });
    } catch (e: any) {
      console.log('  FAILED to create ' + r.label + ' [' + r.chunk.start + ']: ' + e.message.slice(0, 300));
    }
  }

  console.log('\nPolling reports...');
  await Promise.all(created.map(async r => {
    try {
      const status = await pollOne(r.reportId);
      console.log('  ' + r.label + ' [' + r.chunk.start + '] COMPLETED');
      try {
        const data = await downloadReport(status.url);
        mergeRows(results[r.label] || (results[r.label] = []), data);
        fs.writeFileSync(RAW, JSON.stringify(results, null, 2));
        console.log('    downloaded ' + data.length + ' rows -> ' + r.label + ' total ' + results[r.label].length);
      } catch (e: any) {
        console.log('    download failed: ' + e.message);
      }
    } catch (e: any) {
      console.log('  ' + r.label + ' [' + r.chunk.start + '] NOT COMPLETED: ' + e.message);
    }
  }));

  console.log('\nFinal row counts:');
  for (const [k, v] of Object.entries(results)) console.log('  ' + k + ': ' + v.length);

  fs.writeFileSync(RAW, JSON.stringify(results, null, 2));
  console.log('\nRaw data saved to ' + RAW);

  buildMarkdown(results);
  buildExcel(results);
}

function weekStart(ds: string): string {
  if (ds === 'unknown') return 'unknown';
  const d = new Date(ds + 'T00:00:00Z');
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().slice(0, 10);
}

function buildMarkdown(results: Record<string, any[]>) {
  const weekly = results['WEEKLY_CAMPAIGN'] || [];
  const campaigns = results['CAMPAIGN_SUMMARY'] || [];
  const adgroups = results['AD_GROUP'] || [];
  const search = results['SEARCH_TERM'] || [];
  const keywords = results['KEYWORD'] || [];
  const targeting = results['TARGETING'] || [];
  const products = results['PRODUCT'] || [];
  const placements = results['PLACEMENT'] || [];
  const purchased = results['PURCHASED_PRODUCT'] || [];
  const budgets = results['BUDGET'] || [];

  const sum = (rows: any[], k: string) => rows.reduce((s: number, r: any) => s + parseFloat(r[k] || 0), 0);
  const totalCost = sum(campaigns, 'cost');
  const totalSales = sum(campaigns, 'sales7d');
  const totalImp = sum(campaigns, 'impressions');
  const totalClicks = sum(campaigns, 'clicks');
  const totalPurchases = sum(campaigns, 'purchases7d');

  let md = '# Amazon Ads — 3-Month Performance Report (Weekly)\n\n';
  md += '**Generated:** ' + new Date().toISOString().slice(0, 10) + '\n';
  md += '**Period:** ' + START + ' to ' + END + ' (last ~3 months)\n\n';

  md += '## Executive Summary\n\n';
  md += '| Metric | Value |\n|---|---|\n';
  md += '| Total Spend | ₹' + fmt(totalCost) + ' |\n';
  md += '| Total Sales (7d) | ₹' + fmt(totalSales) + ' |\n';
  md += '| Total Impressions | ' + Math.round(totalImp).toLocaleString() + ' |\n';
  md += '| Total Clicks | ' + Math.round(totalClicks).toLocaleString() + ' |\n';
  md += '| Total Purchases (7d) | ' + Math.round(totalPurchases).toLocaleString() + ' |\n';
  md += '| ACoS | ' + fmt(totalCost > 0 && totalSales > 0 ? totalCost / totalSales * 100 : 0) + '% |\n';
  md += '| ROAS | ' + fmt(totalCost > 0 ? totalSales / totalCost : 0) + 'x |\n';
  md += '| CTR | ' + fmt(totalImp > 0 ? totalClicks / totalImp * 100 : 0, 2) + '% |\n';
  md += '| CPC | ₹' + fmt(totalClicks > 0 ? totalCost / totalClicks : 0, 2) + ' |\n';
  md += '| Active Campaigns | ' + campaigns.length + ' |\n\n';

  // === WEEKLY BREAKDOWN ===
  md += '---\n\n## Weekly Breakdown\n\n';
  const weeks = new Map<string, { cost: number; sales: number; imp: number; clicks: number; pur: number; campaigns: Map<string, { cost: number; sales: number }> }>();
  for (const r of weekly) {
    const wk = weekStart(r.date || r.startDate || 'unknown');
    if (!weeks.has(wk)) weeks.set(wk, { cost: 0, sales: 0, imp: 0, clicks: 0, pur: 0, campaigns: new Map() });
    const w = weeks.get(wk)!;
    w.cost += parseFloat(r.cost || 0);
    w.sales += parseFloat(r.sales7d || 0);
    w.imp += parseInt(r.impressions || 0);
    w.clicks += parseInt(r.clicks || 0);
    w.pur += parseInt(r.purchases7d || 0);
    const ck = r.campaignName || r.campaignId;
    if (!w.campaigns.has(ck)) w.campaigns.set(ck, { cost: 0, sales: 0 });
    const cc = w.campaigns.get(ck)!;
    cc.cost += parseFloat(r.cost || 0);
    cc.sales += parseFloat(r.sales7d || 0);
  }

  md += '| Week (start) | Spend | Sales | ROAS | ACoS | Impressions | Clicks | Purchases |\n';
  md += '|---|---|---|---|---|---|---|---|\n';
  for (const [wk, w] of [...weeks.entries()].sort()) {
    const roas = w.cost > 0 ? w.sales / w.cost : 0;
    const acos = w.sales > 0 ? w.cost / w.sales * 100 : 0;
    md += '| ' + wk + ' | ₹' + fmt(w.cost) + ' | ₹' + fmt(w.sales) + ' | ' + fmt(roas) + 'x | ' + fmt(acos) + '% | ' + Math.round(w.imp).toLocaleString() + ' | ' + Math.round(w.clicks).toLocaleString() + ' | ' + Math.round(w.pur) + ' |\n';
  }

  md += '\n### Weekly Spend by Campaign\n\n';
  md += '| Campaign | ' + [...weeks.keys()].sort().map(w => w.slice(5)).join(' | ') + ' | Total |\n';
  md += '|---|' + [...weeks.keys()].map(() => '---|').join('') + '---|\n';
  const allCampaigns = new Set<string>();
  [...weeks.values()].forEach(w => w.campaigns.forEach((_, ck) => allCampaigns.add(ck)));
  for (const ck of allCampaigns) {
    const row = [...weeks.keys()].sort().map(w => weeks.get(w)!.campaigns.get(ck)?.cost ?? 0);
    const tot = row.reduce((a, b) => a + b, 0);
    md += '| ' + ck + ' | ' + row.map(v => '₹' + fmt(v)).join(' | ') + ' | ₹' + fmt(tot) + ' |\n';
  }

  // === CAMPAIGN SUMMARY ===
  md += '\n---\n\n## Campaign Performance (3 months)\n\n';
  md += '| Campaign | Strategy | Impressions | Clicks | Spend | Sales | ROAS | ACoS | Purchases | CPC |\n';
  md += '|---|---|---|---|---|---|---|---|---|---|\n';
  for (const r of [...campaigns].sort((a: any, b: any) => parseFloat(b.cost || 0) - parseFloat(a.cost || 0))) {
    const s = parseFloat(r.sales7d || 0); const co = parseFloat(r.cost || 0);
    md += '| ' + (r.campaignName || r.campaignId) + ' | ' + (r.campaignBiddingStrategy || '-') + ' | ' + fmt(r.impressions, 0) + ' | ' + fmt(r.clicks, 0) + ' | ₹' + fmt(co) + ' | ₹' + fmt(s) + ' | ' + fmt(co > 0 ? s / co : 0) + 'x | ' + fmt(s > 0 ? co / s * 100 : 0) + '% | ' + fmt(r.purchases7d, 0) + ' | ₹' + fmt(co > 0 && r.clicks ? co / parseFloat(r.clicks) : 0, 2) + ' |\n';
  }

  // === AD GROUP ===
  md += '\n---\n\n## Ad Group Performance\n\n';
  md += '| Campaign | Ad Group | Impressions | Clicks | Spend | Sales | ROAS | Purchases |\n';
  md += '|---|---|---|---|---|---|---|---|\n';
  for (const r of [...adgroups].sort((a: any, b: any) => parseFloat(b.cost || 0) - parseFloat(a.cost || 0))) {
    const s = parseFloat(r.sales7d || 0); const co = parseFloat(r.cost || 0);
    md += '| ' + (r.campaignName || '-') + ' | ' + (r.adGroupName || r.adGroupId || '-') + ' | ' + fmt(r.impressions, 0) + ' | ' + fmt(r.clicks, 0) + ' | ₹' + fmt(co) + ' | ₹' + fmt(s) + ' | ' + fmt(co > 0 ? s / co : 0) + 'x | ' + fmt(r.purchases7d, 0) + ' |\n';
  }

  // === SEARCH TERMS ===
  md += '\n---\n\n## Search Term Performance\n\n';
  md += '### Top Search Terms by Spend\n\n';
  md += '| Search Term | Keyword | Campaign | Match Type | Impressions | Clicks | Spend | Sales | ROAS |\n';
  md += '|---|---|---|---|---|---|---|---|---|\n';
  const stSorted = search.filter((r: any) => parseFloat(r.cost || 0) > 0).sort((a: any, b: any) => parseFloat(b.cost || 0) - parseFloat(a.cost || 0));
  for (const r of stSorted.slice(0, 60)) {
    const s = parseFloat(r.sales7d || 0); const co = parseFloat(r.cost || 0);
    md += '| ' + (r.searchTerm || '-') + ' | ' + (r.keyword || '-') + ' | ' + (r.campaignName || '-') + ' | ' + (r.matchType || '-') + ' | ' + fmt(r.impressions, 0) + ' | ' + fmt(r.clicks, 0) + ' | ₹' + fmt(co) + ' | ₹' + fmt(s) + ' | ' + fmt(co > 0 ? s / co : 0) + 'x |\n';
  }

  const wasted = search.filter((r: any) => parseFloat(r.sales7d || 0) === 0 && parseFloat(r.cost || 0) > 0).sort((a: any, b: any) => parseFloat(b.cost || 0) - parseFloat(a.cost || 0));
  md += '\n### Wasted Spend (no sales)\n\n';
  md += '| Search Term | Campaign | Match Type | Spend | Clicks |\n';
  md += '|---|---|---|---|---|\n';
  for (const r of wasted.slice(0, 60)) {
    md += '| ' + (r.searchTerm || '-') + ' | ' + (r.campaignName || '-') + ' | ' + (r.matchType || '-') + ' | ₹' + fmt(r.cost) + ' | ' + fmt(r.clicks, 0) + ' |\n';
  }

  // === KEYWORDS ===
  md += '\n---\n\n## Keyword Performance\n\n';
  md += '| Keyword | Campaign | Match Type | Impressions | Clicks | CPC | Spend | Sales | ROAS | Purchases |\n';
  md += '|---|---|---|---|---|---|---|---|---|---|\n';
  for (const r of [...keywords].sort((a: any, b: any) => parseFloat(b.cost || 0) - parseFloat(a.cost || 0)).slice(0, 200)) {
    const s = parseFloat(r.sales7d || 0); const co = parseFloat(r.cost || 0);
    md += '| ' + (r.keyword || '-') + ' | ' + (r.campaignName || '-') + ' | ' + (r.matchType || '-') + ' | ' + fmt(r.impressions, 0) + ' | ' + fmt(r.clicks, 0) + ' | ₹' + fmt(co > 0 && r.clicks ? co / parseFloat(r.clicks) : 0) + ' | ₹' + fmt(co) + ' | ₹' + fmt(s) + ' | ' + fmt(co > 0 ? s / co : 0) + 'x | ' + fmt(r.purchases7d, 0) + ' |\n';
  }

  // === TARGETING ===
  md += '\n---\n\n## Targeting Performance\n\n';
  md += '| Target | Type | Campaign | Impressions | Clicks | Spend | Sales | ROAS |\n';
  md += '|---|---|---|---|---|---|---|---|\n';
  for (const r of [...targeting].sort((a: any, b: any) => parseFloat(b.cost || 0) - parseFloat(a.cost || 0))) {
    const s = parseFloat(r.sales7d || 0); const co = parseFloat(r.cost || 0);
    md += '| ' + (r.keyword || '-') + ' | ' + (r.keywordType || '-') + ' | ' + (r.campaignName || '-') + ' | ' + fmt(r.impressions, 0) + ' | ' + fmt(r.clicks, 0) + ' | ₹' + fmt(co) + ' | ₹' + fmt(s) + ' | ' + fmt(co > 0 ? s / co : 0) + 'x |\n';
  }

  // === PRODUCTS ===
  md += '\n---\n\n## Advertised Product Performance\n\n';
  md += '| ASIN | SKU | Campaign | Impressions | Clicks | Spend | Sales | ROAS | Purchases | Units |\n';
  md += '|---|---|---|---|---|---|---|---|---|---|\n';
  for (const r of [...products].sort((a: any, b: any) => parseFloat(b.cost || 0) - parseFloat(a.cost || 0))) {
    const s = parseFloat(r.sales7d || 0); const co = parseFloat(r.cost || 0);
    md += '| ' + (r.advertisedAsin || '-') + ' | ' + (r.advertisedSku || '-') + ' | ' + (r.campaignName || '-') + ' | ' + fmt(r.impressions, 0) + ' | ' + fmt(r.clicks, 0) + ' | ₹' + fmt(co) + ' | ₹' + fmt(s) + ' | ' + fmt(co > 0 ? s / co : 0) + 'x | ' + fmt(r.purchases7d, 0) + ' | ' + fmt(r.unitsSoldClicks7d, 0) + ' |\n';
  }

  // === PLACEMENT ===
  md += '\n---\n\n## Placement Performance\n\n';
  md += '| Campaign | Placement | Impressions | Clicks | Spend | Sales | ROAS | CPC | CTR |\n';
  md += '|---|---|---|---|---|---|---|---|---|\n';
  for (const r of [...placements].sort((a: any, b: any) => parseFloat(b.cost || 0) - parseFloat(a.cost || 0))) {
    const s = parseFloat(r.sales7d || 0); const co = parseFloat(r.cost || 0);
    md += '| ' + (r.campaignName || '-') + ' | ' + (r.placementClassification || '-') + ' | ' + fmt(r.impressions, 0) + ' | ' + fmt(r.clicks, 0) + ' | ₹' + fmt(co) + ' | ₹' + fmt(s) + ' | ' + fmt(co > 0 ? s / co : 0) + 'x | ₹' + fmt(co > 0 && r.clicks ? co / parseFloat(r.clicks) : 0, 2) + ' | ' + fmt(r.clickThroughRate || 0, 2) + '% |\n';
  }

  // === PURCHASED PRODUCTS ===
  md += '\n---\n\n## Purchased Product Report\n\n';
  md += '| Purchased ASIN | Campaign | Sales | Purchases | Units |\n';
  md += '|---|---|---|---|---|\n';
  for (const r of [...purchased].sort((a: any, b: any) => parseFloat(b.sales7d || 0) - parseFloat(a.sales7d || 0))) {
    md += '| ' + (r.purchasedAsin || '-') + ' | ' + (r.campaignName || '-') + ' | ₹' + fmt(r.sales7d) + ' | ' + fmt(r.purchases7d, 0) + ' | ' + fmt(r.unitsSoldClicks7d, 0) + ' |\n';
  }

  // === BUDGET ===
  md += '\n---\n\n## Budget & Efficiency\n\n';
  md += '| Campaign | Budget | Type | Strategy | Spend | Budget Used | Sales | ROAS |\n';
  md += '|---|---|---|---|---|---|---|---|\n';
  for (const r of [...budgets].sort((a: any, b: any) => parseFloat(b.cost || 0) - parseFloat(a.cost || 0))) {
    const s = parseFloat(r.sales7d || 0); const co = parseFloat(r.cost || 0); const budget = r.campaignBudgetAmount;
    const bu = budget && parseFloat(budget) > 0 ? co / parseFloat(budget) * 100 : 0;
    md += '| ' + (r.campaignName || r.campaignId) + ' | ₹' + fmt(budget) + ' | ' + (r.campaignBudgetType || '-') + ' | ' + (r.campaignBiddingStrategy || '-') + ' | ₹' + fmt(co) + ' | ' + fmt(bu) + '% | ₹' + fmt(s) + ' | ' + fmt(co > 0 ? s / co : 0) + 'x |\n';
  }

  fs.writeFileSync('docs/amazon-ads-3month-report.md', md, 'utf-8');
  console.log('\n=== REPORT SAVED to docs/amazon-ads-3month-report.md ===');
}

function buildExcel(results: Record<string, any[]>) {
  try {
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();
    for (const [name, rows] of Object.entries(results)) {
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 30));
    }
    const out = 'docs/amazon-ads-3month-report.xlsx';
    XLSX.writeFile(wb, out);
    console.log('=== EXCEL SAVED to ' + out + ' ===');
  } catch (e: any) {
    console.log('Excel export skipped: ' + e.message);
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
