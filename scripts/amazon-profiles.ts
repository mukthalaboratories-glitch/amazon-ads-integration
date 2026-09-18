/**
 * scripts/amazon-profiles.ts
 *
 * `npm run amazon:profiles`
 *
 * Fetches and prints all Amazon Ads profiles for the currently authorized
 * account. If exactly one profile exists, it's auto-saved as
 * AMAZON_PROFILE_ID (handled inside loadAndResolveProfiles).
 */

import { getAccessToken } from '../src/amazon/auth/tokenManager';
import { loadAndResolveProfiles } from '../src/amazon/profiles';
import { AmazonAdsError } from '../src/amazon/types';

async function main() {
  const accessToken = await getAccessToken();
  await loadAndResolveProfiles(accessToken);
}

main().catch((err) => {
  if (err instanceof AmazonAdsError) {
    console.error(`\n✗ [${err.code}] ${err.message}`);
  } else {
    console.error('\n✗ Unexpected error:', err);
  }
  process.exit(1);
});
