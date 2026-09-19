import { execSync } from 'child_process';

function yesterdayIST(): string {
  // Asia/Kolkata is UTC+5:30, so yesterday IST = today UTC +5:30 minus 1 day
  const now = new Date();
  // convert to IST date string
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  ist.setDate(ist.getDate() - 1);
  return ist.toISOString().slice(0, 10);
}

function monthFile(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const m = d.getUTCMonth(); // 0-11
  const map: Record<number, string> = { 5: 'june', 6: 'july', 7: 'aug', 8: 'sep', 9: 'oct', 10: 'nov', 11: 'dec', 0: 'jan', 1: 'feb', 2: 'mar', 3: 'apr', 4: 'may' };
  return `amazon_${map[m]}_raw.json`;
}

function run(cmd: string) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

async function main() {
  const y = yesterdayIST();
  const mf = monthFile(y);
  console.log(`Daily auto for ${y} -> ${mf}`);

  // 1. Amazon orders for yesterday
  run(`npx tsx scripts/pull-aug-range.ts ${y} ${y} ${mf}`);
  // 2. Backfill location for yesterday
  run(`npx tsx scripts/backfill-order-location.ts ${y} ${y}`);
  // 3. Inventory through yesterday
  run(`npx tsx scripts/pull-inventory.ts 2026-07-01 ${y}`);
  // 4. Amazon ads for yesterday
  run(`npx tsx scripts/amazon-3month-report.ts ${y} ${y}`);
  // 5. Re-parse marketplace exports if new files dropped (auto-detect latest)
  try { run(`python scripts/parse-flipkart-ads.py`); } catch {}
  try { run(`python scripts/parse-firstcry-ads.py`); } catch {}
  // 6. Push everything (batch handles dedupe for all, but yesterday is the new bit)
  // Use batch to avoid per-day summary overhead
  run(`python scripts/batch_push_missing.py`);
  // 7. Push orders/inventory/ads (batch already pushed Daily, but orders/inventory/ads need separate)
  run(`python scripts/push-orders.py`);
  run(`python scripts/push-inventory.py`);
  run(`python scripts/push-ads.py`);
  // 7. Rebuild summaries
  const URL = process.env.WEB_APP_URL || 'https://script.google.com/macros/s/AKfycbz07KglX7GGgM6JCbaYxk78S7JTV4gcSNRVR8Da5PM-e5G4w-QyscZqOvwkdx34nuZe/exec';
  const key = process.env.PUSH_KEY || 'catche-daily-2026';
  const base = `${URL}?key=${key}`;
  for (const act of ['summary', 'adsSummary', 'pnl']) {
    console.log(`Trigger ${act}`);
    try { execSync(`curl -s "${base}&action=${act}" | head -c 500`, { stdio: 'inherit' }); } catch {}
  }
  console.log(`\nDone for ${y}`);
}

main().catch(e => { console.error(e); process.exit(1); });
