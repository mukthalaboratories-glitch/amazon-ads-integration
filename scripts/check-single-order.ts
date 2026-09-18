import { spApiClient } from '../src/sp-api/client';
import { spApiConfig } from '../src/sp-api/config';

const ORDER_ID = process.argv[2] || '407-4752579-1816323';
async function main() {
  const o = await spApiClient.get<any>(`/orders/v0/orders/${ORDER_ID}?MarketplaceIds=${spApiConfig.marketplaceId}`);
  console.log(JSON.stringify(o, null, 2));
}
main().catch(e => { console.error('Error:', e.message); process.exit(1); });