import { spApiClient } from '../src/sp-api/client';
import { spApiConfig } from '../src/sp-api/config';

const IDS = (process.argv[2] || '408-7198549-6198762,406-4327041-9804316,171-7579907-1446758,404-7977975-7280342,408-3254196-7826713').split(',');

async function wait(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  for (const id of IDS) {
    console.log(`\n======== ${id} ========`);
    const o = await spApiClient.get<any>(`/orders/v0/orders/${id}?MarketplaceIds=${spApiConfig.marketplaceId}`);
    console.log(JSON.stringify(o.payload, null, 2));
    try {
      const it = await spApiClient.get<any>(`/orders/v0/orders/${id}/orderItems?MarketplaceIds=${spApiConfig.marketplaceId}`);
      console.log('--- orderItems ---');
      console.log(JSON.stringify(it.payload, null, 2));
    } catch (e) {
      console.log('items error:', (e as Error).message);
    }
    await wait(500);
  }
}
main().catch(e => { console.error('Error:', e.message); process.exit(1); });