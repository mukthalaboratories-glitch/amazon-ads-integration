/**
 * mcp.ts
 *
 * Generates client configuration for the *official* Amazon Ads MCP Server.
 * This module does not implement an MCP server itself -- it produces the
 * connection config (endpoint + headers) that any MCP-compatible client
 * (Claude Desktop, Claude Code, Kiro, etc.) needs to connect to Amazon's
 * hosted MCP server.
 *
 * Tokens are NEVER hardcoded or cached here -- connectAmazonMCP() always
 * calls getAccessToken() fresh, so the generated config reflects a
 * currently-valid token at the moment it's produced. Since MCP client
 * configs are typically static (pasted into a JSON config file once),
 * docs/amazon-ads.md explains the token-refresh implication of that.
 */

import { amazonConfig } from './config';
import { getAccessToken } from './auth/tokenManager';
import { McpConnectionConfig, McpContextModeConfig } from './types';

/**
 * Builds the raw connection object (Step 7): endpoint + headers, using a
 * freshly-fetched access token every time this is called.
 */
export async function generateMcpConfig(profileId?: string): Promise<McpConnectionConfig> {
  const accessToken = await getAccessToken();
  const resolvedProfileId = profileId ?? amazonConfig.profileId;

  return {
    url: amazonConfig.endpoints.mcpEndpoint,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Amazon-Ads-ClientId': amazonConfig.clientId,
      'Amazon-Advertising-API-Scope': resolvedProfileId ?? '',
    },
  };
}

/**
 * Step 8: returns everything an MCP client needs, in both supported
 * connection modes:
 *
 *  - Dynamic Context Mode: the MCP server is given only the access token
 *    and client id; it discovers available profiles/tools per-call. Good
 *    for exploratory use or multi-account setups.
 *  - Fixed Context Mode: a specific profileId is pinned into the scope
 *    header up front, so every tool call in the session is locked to one
 *    advertising account. Recommended for automated/scripted workflows.
 */
export async function connectAmazonMCP(profileId?: string): Promise<McpContextModeConfig> {
  const resolvedProfileId = profileId ?? amazonConfig.profileId;

  const dynamicConfig = await generateMcpConfig(); // no scope pinned
  const { 'Amazon-Advertising-API-Scope': _drop, ...dynamicHeaders } = dynamicConfig.headers;

  const fixedConfig = await generateMcpConfig(resolvedProfileId);

  if (!resolvedProfileId) {
    console.warn(
      '⚠ No AMAZON_PROFILE_ID set -- Fixed Context Mode config will have an ' +
        'empty scope header. Run `npm run amazon:profiles` first.',
    );
  }

  console.log('✓ MCP Ready');

  return {
    dynamic: {
      mode: 'dynamic',
      description:
        'MCP server resolves the advertising profile/tools at call time. ' +
        'No profile is pinned in the connection headers.',
      config: { url: dynamicConfig.url, headers: dynamicHeaders },
    },
    fixed: {
      mode: 'fixed',
      description:
        'Every tool call in this session is scoped to a single, pre-selected ' +
        'advertising profile.',
      config: { ...fixedConfig, profileId: resolvedProfileId ?? '' },
    },
  };
}

/** Pretty-prints a ready-to-copy MCP client config block (used by the CLI). */
export function printMcpConfig(config: McpConnectionConfig, label: string): void {
  console.log(`\n--- ${label} ---`);
  console.log(
    JSON.stringify(
      {
        mcpServers: {
          'amazon-ads': {
            url: config.url,
            headers: config.headers,
          },
        },
      },
      null,
      2,
    ),
  );
}
