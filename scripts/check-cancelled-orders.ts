import * as fs from 'fs';
import * as path from 'path';
import { spApiClient } from '../src/sp-api/client';
import { spApiConfig } from '../src/sp-api/config';

const TSV = path.join(process.cwd(), 'docs', 'orders-cancellation-check.tsv');
const OUT = path.join(process.cwd(), 'docs', 'cancelled-order-details.json');

function cancelledIds(): string[] {
  const lines = fs.readFileSync(TSV, 'utf-8').trim().split('\n');
  const hdr = lines[0].split('\t');
  const oid = hdr.indexOf('amazon-order-id');
  const st = hdr.indexOf('order-status');
  const ids: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split('\t');
    if (c[oid]?.trim() && c[st]?.trim() === 'Cancelled') ids.push(c[oid].trim());
  }
  return ids;
}

async function wait(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const ids = cancelledIds();
  if (fs.existsSync(OUT)) fs.unlinkSync(OUT);
  console.log(`Fetching ${ids.length} cancelled orders + items...`);
  for (const id of ids) {
    try {
      const o = await spApiClient.get<any>(`/orders/v0/orders/${id}?MarketplaceIds=${spApiConfig.marketplaceId}`);
      const payload = o.payload || {};
      let items: any[] = [];
      try {
        const it = await spApiClient.get<any>(`/orders/v0/orders/${id}/orderItems?MarketplaceIds=${spApiConfig.marketplaceId}`);
        items = (it.payload.OrderItems || []).map((m: any) => ({
          sku: m.SellerSKU,
          asin: m.ASIN,
          title: m.Title,
          qtyOrdered: m.QuantityOrdered,
          qtyShipped: m.QuantityShipped,
          buyerRequestedCancel: m.BuyerRequestedCancel ?? null,
          shipmentInfo: m.ShipmentInfo || null,
          price: m.ItemPrice || null,
        }));
        await wait(250);
      } catch (e) {
        items = [{ error: (e as Error).message }];
      }
      const rec: Record<string, unknown> = {
        orderId: id,
        status: payload.OrderStatus,
        channel: payload.FulfillmentChannel,
        purchase: payload.PurchaseDate,
        lastUpdate: payload.LastUpdateDate,
        earliestShip: payload.EarliestShipDate || null,
        latestShip: payload.LatestShipDate || null,
        easyShipStatus: payload.EasyShipShipmentStatus || null,
        shipService: payload.ShipServiceLevel || null,
        items,
      };
      fs.appendFileSync(OUT, JSON.stringify(rec) + '\n', 'utf-8');
      console.log(`  ${id}: status=${payload.OrderStatus} easySh=${payload.EasyShipShipmentStatus || '-'} early=${payload.EarliestShipDate || '-'} latest=${payload.LatestShipDate || '-'} items=${items.length}`);
    } catch (e) {
      fs.appendFileSync(OUT, JSON.stringify({ orderId: id, error: (e as Error).message }) + '\n', 'utf-8');
      console.log(`  ${id}: ERROR ${(e as Error).message}`);
    }
    await wait(300);
  }
  console.log(`Saved to ${OUT}`);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });