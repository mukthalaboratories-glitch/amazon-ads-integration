import { requestAndDownloadReport } from '../src/sp-api/reports';
import { spApiConfig } from '../src/sp-api/config';

const SKU = process.argv[2] || '';
const REPORT_TYPE = process.argv[3] || 'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL';
const DAYS_BACK = parseInt(process.argv[4] || '400', 10);

async function main() {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - DAYS_BACK * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  console.log(`SP-API Sales Check`);
  console.log(`  Region: ${spApiConfig.region}${spApiConfig.sandbox ? ' (sandbox)' : ''}`);
  console.log(`  Marketplace: ${spApiConfig.marketplaceId}`);
  console.log(`  Report Type: ${REPORT_TYPE}`);
  console.log(`  Period: ${fmt(startDate)} to ${fmt(endDate)}`);
  if (SKU) console.log(`  SKU: ${SKU}`);
  console.log();

  console.log('Requesting report (this can take a minute)...');
  const data = await requestAndDownloadReport(REPORT_TYPE, startDate.toISOString(), endDate.toISOString());
  const lines = data.trim().split('\n');

  if (lines.length < 2) {
    console.log('No data returned.');
    return;
  }

  const headers = lines[0].split('\t');
  console.log(`\nReport returned ${lines.length - 1} rows, ${headers.length} columns\n`);

  if (!SKU) {
    console.log('Columns:', headers.join(' | '));
    console.log('\nFirst 5 rows:');
    for (let i = 1; i < Math.min(lines.length, 6); i++) {
      console.log(`  ${lines[i]}`);
    }
    console.log(`\nTo filter by SKU, run: npm run sp-api:sales -- "YOUR_SKU"`);
    return;
  }

  const matching: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(SKU.toLowerCase())) {
      matching.push(lines[i]);
    }
  }

  if (matching.length === 0) {
    console.log(`No rows found matching SKU "${SKU}"`);
    return;
  }

  console.log(`Found ${matching.length} rows for SKU "${SKU}":\n`);
  for (const row of matching) {
    const cols = row.split('\t');
    const display: Record<string, string> = {};
    headers.forEach((h, i) => { display[h.trim()] = cols[i]?.trim() || ''; });
    console.log(JSON.stringify(display, null, 2));
    console.log();
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
