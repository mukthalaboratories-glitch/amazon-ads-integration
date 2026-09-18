import { spApiClient } from '../src/sp-api/client';
import { spApiConfig } from '../src/sp-api/config';

const IDS = (process.argv[2] || '408-7198549-6198762,406-4327041-9804316,171-7579907-1446758,404-7977975-7280342,408-3254196-7826713').split(',');

async function wait(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  for (const id of IDS) {
    console.log(`\n======== EASYSHIP ${id} ========`);
    try {
      const res = await spApiClient.get<any>(`/easyShip/2022-03-23/shipments/${id}?marketplaceIds=${spApiConfig.marketplaceId}`);
      console.log(JSON.stringify(res, null, 2));
    } catch (e) {
      console.log('easyship error:', (e as Error).message);
    }
    await wait(500);
  }
}
main().catch(e => { console.error('Error:', e.message); process.exit(1); });