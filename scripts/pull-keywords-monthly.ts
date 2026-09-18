import fs from 'fs';
import { createGunzip } from 'zlib';
import { amazonConfig } from '../src/amazon/config';
import { getAccessToken } from '../src/amazon/auth/tokenManager';

const BASE = amazonConfig.endpoints.advertisingApiHost;
const SCOPE = amazonConfig.profileId ?? '';
const CT_REQ = 'application/vnd.createasyncreportrequest.v3+json';
const CT_RESP = 'application/vnd.createasyncreportresponse.v3+json';

const MONTHS = [
  { month: '2026-06', start: '2026-06-01', end: '2026-06-30' },
  { month: '2026-07', start: '2026-07-01', end: '2026-07-31' },
  { month: '2026-08', start: '2026-08-01', end: '2026-08-14' },
];

interface RptDef {
  label: string;
  month: string;
  reportTypeId: string;
  timeUnit: 'SUMMARY' | 'DAILY';
  groupBy: string[];
  columns: string[];
}

function buildReports(): RptDef[] {
  const out: RptDef[] = [];
  for (const m of MONTHS) {
    out.push(
      { label: 'KEYWORD', month: m.month, reportTypeId: 'spKeywords', timeUnit: 'SUMMARY', groupBy: ['adGroup'], columns: ['campaignId', 'campaignName', 'adGroupId', 'adGroupName', 'keywordId', 'keyword', 'matchType', 'impressions', 'clicks', 'cost', 'sales7d', 'purchases7d', 'unitsSoldClicks7d'] },
      { label: 'SEARCH_TERM', month: m.month, reportTypeId: 'spSearchTerm', timeUnit: 'SUMMARY', groupBy: ['searchTerm'], columns: ['campaignId', 'campaignName', 'adGroupId', 'adGroupName', 'keywordId', 'keyword', 'matchType', 'searchTerm', 'impressions', 'clicks', 'cost', 'sales7d', 'purchases7d', 'unitsSoldClicks7d'] },
    );
  }
  return out;
}

async function fetchT(url: string, opts: any = {}, ms = 30000): Promise<Response> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...opts, signal: c.signal }); } finally { clearTimeout(t); }
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
  const res = await fetchT(BASE + '/reporting/reports', { method: 'POST', headers: await headers(), body: JSON.stringify(body) }, 30000);
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
    } catch (e: any) { if (/failed:/.test(e.message || '')) throw e; }
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

async function main() {
  const reports = buildReports();
  console.log('Creating ' + reports.length + ' reports...\n');
  const created: any[] = [];
  const ts = Date.now();
  for (const r of reports) {
    try {
      const id = await createReport({
        name: r.label + ' ' + r.month + ' ' + ts,
        startDate: r.month + '-01',
        endDate: r.month === '2026-08' ? '2026-08-14' : r.month + '-' + (r.month === '2026-06' ? '30' : '31'),
        configuration: {
          adProduct: 'SPONSORED_PRODUCTS',
          groupBy: r.groupBy,
          columns: r.columns,
          reportTypeId: r.reportTypeId,
          timeUnit: r.timeUnit,
          format: 'GZIP_JSON',
        },
      });
      console.log('  Created ' + r.label + ' [' + r.month + ']: ' + id);
      created.push({ ...r, reportId: id });
    } catch (e: any) {
      console.log('  FAILED ' + r.label + ' [' + r.month + ']: ' + e.message.slice(0, 200));
    }
  }

  console.log('\nPolling reports...');
  const results: Record<string, any[]> = { KEYWORD: [], SEARCH_TERM: [] };
  await Promise.all(created.map(async r => {
    try {
      const status = await pollOne(r.reportId);
      console.log('  ' + r.label + ' [' + r.month + '] COMPLETED');
      const data = await downloadReport(status.url);
      for (const row of data) results[r.label].push({ ...row, month: r.month, ctr: row.impressions ? (row.clicks / row.impressions) : 0 });
      console.log('    +' + data.length + ' -> ' + r.label + ' total ' + results[r.label].length);
    } catch (e: any) {
      console.log('  ' + r.label + ' [' + r.month + '] FAILED: ' + e.message);
    }
  }));

  fs.writeFileSync('docs/ads-keywords-jun-aug.json', JSON.stringify(results, null, 2));
  console.log('\nKEYWORD rows: ' + results.KEYWORD.length + ' | SEARCH_TERM rows: ' + results.SEARCH_TERM.length);
  console.log('Saved docs/ads-keywords-jun-aug.json');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
