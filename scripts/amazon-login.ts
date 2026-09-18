/**
 * scripts/amazon-login.ts
 *
 * `npm run amazon:login`
 *
 * Spins up a temporary local Express server (only for the duration of the
 * login flow) that hosts /auth/amazon and /auth/amazon/callback, then opens
 * the authorization URL in the user's default browser. Once the callback
 * fires successfully, the server shuts itself down.
 */

import express from 'express';
import { amazonAuthRouter } from '../src/amazon/routes';
import { amazonConfig } from '../src/amazon/config';

async function main() {
  const app = express();
  app.use(amazonAuthRouter);

  const port = new URL(amazonConfig.redirectUri).port || '3000';

  const server = app.listen(Number(port), async () => {
    const loginUrl = `http://localhost:${port}/auth/amazon`;
    console.log(`\nStarting Amazon Ads login flow...`);
    console.log(`If your browser doesn't open automatically, visit:\n  ${loginUrl}\n`);

    // Best-effort auto-open; falls back silently to the printed URL above.
    try {
      const open = (await import('open')).default;
      await open(loginUrl);
    } catch {
      // 'open' package not installed or unavailable -- not fatal.
    }
  });

  // Give the callback route a way to signal "we're done" back to this script.
  const shutdownTimer = setInterval(() => {
    if (process.env.AMAZON_ACCESS_TOKEN && process.env.AMAZON_REFRESH_TOKEN) {
      clearInterval(shutdownTimer);
      console.log('\n✅ Login flow complete. Shutting down temporary local server.');
      server.close(() => process.exit(0));
    }
  }, 1000);

  // Safety timeout: don't hang forever if the user abandons the flow.
  setTimeout(() => {
    console.error('\n✗ Timed out waiting for OAuth callback (10 minutes). Exiting.');
    server.close(() => process.exit(1));
  }, 10 * 60 * 1000);
}

main().catch((err) => {
  console.error('✗ Fatal error starting login flow:', err);
  process.exit(1);
});
