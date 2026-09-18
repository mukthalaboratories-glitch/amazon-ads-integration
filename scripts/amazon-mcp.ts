/**
 * scripts/amazon-mcp.ts
 *
 * `npm run amazon:mcp`
 *
 * Prints a ready-to-copy MCP client configuration block for the official
 * Amazon Ads MCP Server, in both Dynamic and Fixed Context Mode, using a
 * freshly-issued access token.
 */

import { connectAmazonMCP, printMcpConfig } from '../src/amazon/mcp';
import { amazonConfig } from '../src/amazon/config';
import { AmazonAdsError } from '../src/amazon/types';

async function main() {
  const result = await connectAmazonMCP(amazonConfig.profileId);

  printMcpConfig(result.dynamic.config, 'Dynamic Context Mode (no profile pinned)');
  printMcpConfig(result.fixed.config, 'Fixed Context Mode (profile pinned)');

  console.log(
    '\nNote: the Authorization header above contains a live access token that ' +
      'expires shortly. If your MCP client stores this config statically, re-run ' +
      '`npm run amazon:mcp` whenever the token expires, or wire your client to ' +
      'call getAccessToken() dynamically -- see docs/amazon-ads.md.',
  );
}

main().catch((err) => {
  if (err instanceof AmazonAdsError) {
    console.error(`\n✗ [${err.code}] ${err.message}`);
  } else {
    console.error('\n✗ Unexpected error:', err);
  }
  process.exit(1);
});
