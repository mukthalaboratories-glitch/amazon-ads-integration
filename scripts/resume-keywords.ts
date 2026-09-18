import fs from 'fs';
import { createGunzip } from 'zlib';
import { amazonConfig } from '../src/amazon/config';
import { getAccessToken } from '../src/amazon/auth/tokenManager';

const BASE = amazonConfig.endpoints.advertisingApiHost;
const SCOPE = amazonConfig.profileId ?? '';
const CT_RESP = 'application/vnd.createasyncreportresponse.v3+json';

const REPORTS: { label: string; month: string; reportId: string }[] = [
  { label: 'KEYWORD', month: '2026-06', reportId: '3aaa3a00-5256-48c9-8794-7870d22b1c55' },
  { label: 'SEARCH_TERM', month: '2026-06', reportId: 'ba6ef12e-e3c2-4544-9d61-a96a0c7ce4df' },
  { label: 'KEYWORD', month: '2026-07', reportId: 'e13f10ae-98da-4617-830b-d84aa55acdc6' },
  { label: 'SEARCH_TERM', month: '2026-07', reportId: '4e30fe95-4a91-4662-89b5-19b0908b902d' },
  { label: 'KEYWORD', month: '2026-08', reportId: '11d075b8-3092-4b02-9ca0-83e4d87c2a48' },
  { label: 'SEARCH_TERM', month: '2026-08', reportId: '384392db-c465-4007-8600-65aaf9fe605a' },
];

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
    'Content-Type': CT_RESP,
    Accept: CT_RESP,
  };
}

async function pollOne(reportId: string): Promise<any> {
  const hdrs = await headers();
  for (let i = 0; i < 240; i++) {
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
  const results: Record<string, any[]> = { KEYWORD: [], SEARCH_TERM: [] };
  for (const r of REPORTS) {
    try {
      console.log('Polling ' + r.label + ' [' + r.month + ']...');
      const status = await pollOne(r.reportId);
      const data = await downloadReport(status.url);
      for (const row of data) results[r.label].push({ ...row, month: r.month, ctr: row.impressions ? row.clicks / row.impressions : 0 });
      console.log('  COMPLETED +' + data.length + ' -> ' + r.label + ' total ' + results[r.label].length);
    } catch (e: any) {
      console.log('  ' + r.label + ' [' + r.month + '] ERROR: ' + e.message);
    }
  }
  fs.writeFileSync('docs/ads-keywords-jun-aug.json', JSON.stringify(results, null, 2));
  console.log('\nKEYWORD rows: ' + results.KEYWORD.length + ' | SEARCH_TERM rows: ' + results.SEARCH_TERM.length);
  console.log('Saved docs/ads-keywords-jun-aug.json');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
