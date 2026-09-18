import { requestAndDownloadReport } from '../src/sp-api/reports';
async function main() {
  const data = await requestAndDownloadReport('GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL', '2026-08-19T00:00:00Z', '2026-08-19T23:59:59Z');
  const lines = data.trim().split('\n');
  console.log('HEADERS:');
  lines[0].split('\t').forEach((h,i)=>console.log(i, h));
}
main().catch(e=>{console.error(e);process.exit(1);});
