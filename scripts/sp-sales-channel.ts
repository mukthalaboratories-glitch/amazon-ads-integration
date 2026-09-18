import { requestAndDownloadReport } from '../src/sp-api/reports';
import { spApiConfig } from '../src/sp-api/config';

async function main() {
  const daysBack = parseInt(process.argv[2] || '60', 10);
  const filter = (process.argv[3] || '').toLowerCase();
  const end = new Date();
  const start = new Date(end.getTime() - daysBack * 86400000);
  const fmt = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const startStr = fmt(start);
  const endStr = fmt(end);

  console.log(`SP-API Order Channel Check`);
  console.log(`  Marketplace: ${spApiConfig.marketplaceId}`);
  console.log(`  Period: ${startStr} to ${endStr}`);
  if (filter) console.log(`  Filtering for: "${filter}"`);
  console.log();

  console.log('Requesting report...');
  const data = await requestAndDownloadReport('GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL', startStr, endStr);
  const lines = data.trim().split('\n');

  if (lines.length < 2) {
    console.log('\nNo orders found in this period.');
    return;
  }

  const headers = lines[0].split('\t');
  const idx = (name: string) => headers.indexOf(name);
  const get = (line: string, name: string) => line.split('\t')[idx(name)]?.trim() || '';

  const channelCounts = new Map<string, number>();
  const orderChannelCounts = new Map<string, number>();
  const fulfilledByCounts = new Map<string, number>();
  const filtered: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const salesChannel = get(line, 'sales-channel');
    const orderChannel = get(line, 'order-channel');
    const fulfilledBy = get(line, 'fulfilled-by');
    channelCounts.set(salesChannel, (channelCounts.get(salesChannel) || 0) + 1);
    orderChannelCounts.set(orderChannel, (orderChannelCounts.get(orderChannel) || 0) + 1);
    fulfilledByCounts.set(fulfilledBy, (fulfilledByCounts.get(fulfilledBy) || 0) + 1);

    if (filter && line.toLowerCase().includes(filter)) {
      filtered.push(line);
    }
  }

  const totalRows = lines.length - 1;

  console.log(`\n=== Sales Channel Distribution (${totalRows} order lines) ===`);
  for (const [ch, count] of [...channelCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${ch || '(empty)'}: ${count}`);
  }

  console.log(`\n=== Order Channel Distribution ===`);
  for (const [ch, count] of [...orderChannelCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${ch || '(empty)'}: ${count}`);
  }

  console.log(`\n=== Fulfilled By Distribution ===`);
  for (const [ch, count] of [...fulfilledByCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${ch || '(empty)'}: ${count}`);
  }

  if (filter) {
    console.log(`\n=== Rows matching "${filter}" (${filtered.length}) ===`);
    for (const line of filtered.slice(0, 50)) {
      const cols = line.split('\t');
      const display: Record<string, string> = {};
      headers.forEach((h, i) => { display[h.trim()] = cols[i]?.trim() || ''; });
      console.log(JSON.stringify(display));
    }
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
