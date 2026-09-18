/**
 * scripts/amazon-test.ts
 *
 * `npm run amazon:test`
 *
 * Runs the full Step 12 end-to-end verification:
 *   OAuth (already done) -> Refresh Token -> Access Token -> Profiles API
 *   -> Campaign API -> Report Generation -> Amazon MCP Configuration
 *
 * This is meant to be run *after* `npm run amazon:login` has completed at
 * least once, so a refresh token already exists in .env.local.
 */

import { getAccessToken } from '../src/amazon/auth/tokenManager';
import { loadAndResolveProfiles } from '../src/amazon/profiles';
import { AmazonAdsClient } from '../src/amazon/client';
import { connectAmazonMCP } from '../src/amazon/mcp';
import { amazonConfig } from '../src/amazon/config';
import { AmazonAdsError } from '../src/amazon/types';

async function main() {
  console.log('=== Amazon Ads Integration Test ===\n');

  console.log('[1/6] Refreshing / validating access token...');
  const accessToken = await getAccessToken();
  console.log('✓ Access token is valid.\n');

  console.log('[2/6] Fetching advertising profiles...');
  const profiles = await loadAndResolveProfiles(accessToken);
  if (profiles.length === 0) {
    throw new AmazonAdsError(
      'unknown',
      'No advertising profiles were returned for this account. Nothing further to test.',
    );
  }

  const profileId = amazonConfig.profileId || String(profiles[0].profileId);
  const client = new AmazonAdsClient(profileId);

  console.log(`[3/6] Fetching campaigns for profile ${profileId}...`);
  const campaigns = await client.getCampaigns();
  console.log(`✓ Found ${campaigns.length} campaign(s).\n`);

  if (campaigns.length > 0) {
    console.log(`[4/6] Fetching detail for campaign ${campaigns[0].campaignId}...`);
    const campaign = await client.getCampaign(campaigns[0].campaignId);
    console.log(`✓ Campaign "${campaign.name}" state=${campaign.state}\n`);
    console.log(`[4b/6] Fetching ad groups...`);
    const adGroups = await client.getAdGroups({ campaignIdFilter: campaign.campaignId });
    console.log(`✓ Found ${adGroups.length} ad group(s).\n`);
  } else {
    console.log('[4/6] Skipped -- no campaigns to inspect.\n');
  }

  console.log('[5/6] Requesting a summary report (last 7 days)...');
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const report = await client.generateReport({
      name: 'amazon-ads-integration-test',
      startDate: fmt(start),
      endDate: fmt(end),
      configuration: {
        adProduct: 'SPONSORED_PRODUCTS',
        groupBy: ['campaign'],
        columns: ['impressions', 'clicks', 'cost', 'campaignId', 'campaignName', 'sales7d', 'purchases7d'],
        reportTypeId: 'spCampaigns',
        timeUnit: 'SUMMARY',
        format: 'GZIP_JSON',
      },
    });
    console.log(`✓ Report requested, id=${report.reportId}, status=${report.status}`);

    console.log(`  Polling for completion (may take minutes)...`);
    const data = await client.downloadReport(report.reportId);
    const rows = Array.isArray(data) ? data : [data];
    console.log(`✓ Report complete, ${rows.length} row(s)\n`);
  } catch (err) {
    console.warn(
      '⚠ Report generation step failed (this can happen with brand-new or ' +
        'zero-activity accounts, or may need more time).',
    );
    if (err instanceof AmazonAdsError) console.warn(`  [${err.code}] ${err.message}\n`);
  }

  console.log('[6/6] Generating Amazon Ads MCP configuration...');
  const mcp = await connectAmazonMCP(profileId);
  console.log(`✓ MCP endpoint: ${mcp.fixed.config.url}\n`);

  console.log('✅ Amazon Ads Integration Complete');
  console.log(`\nDiscovered account(s):`);
  profiles.forEach((p) => {
    console.log(
      `  - profileId=${p.profileId} country=${p.countryCode} currency=${p.currencyCode} ` +
        `type=${p.accountInfo?.type} name=${p.accountInfo?.name ?? '(unnamed)'}`,
    );
  });
}

process.on('unhandledRejection', (reason) => {
  console.error('\n✗ Unhandled rejection:', reason instanceof Error ? reason.message : reason);
});

main().catch((err) => {
  if (err instanceof AmazonAdsError) {
    console.error(`\n✗ [${err.code}] ${err.message}`);
  } else {
    console.error('\n✗ Unexpected error:', err instanceof Error ? err.message : String(err));
  }
  process.exit(1);
});
