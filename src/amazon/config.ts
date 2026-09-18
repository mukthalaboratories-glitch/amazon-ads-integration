/**
 * config.ts
 *
 * Centralized configuration for the Amazon Ads integration.
 *
 * Responsibilities:
 *  - Load and validate required environment variables.
 *  - Map AMAZON_REGION -> the correct LWA + Advertising API + MCP hosts.
 *  - Expose a single typed `amazonConfig` object the rest of the codebase
 *    depends on, so nothing else reads `process.env` directly.
 *
 * NOTE: This module intentionally does NOT throw on missing OAuth tokens
 * (access/refresh token), because on a first run those legitimately don't
 * exist yet -- the user has to complete `npm run amazon:login` first.
 * It DOES throw on missing client credentials, since nothing can work
 * without those.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env.local explicitly (not the default .env) to match the project's
// stated convention of storing secrets in `.env.local`.
const ENV_FILE = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(ENV_FILE)) {
  dotenv.config({ path: ENV_FILE });
} else {
  // Fall back to standard dotenv resolution (e.g. .env) so the module
  // doesn't hard-fail in environments that use a different file name.
  dotenv.config();
}

export type AmazonRegion = 'NA' | 'EU' | 'FE';

interface RegionEndpoints {
  /** Login with Amazon token/authorization host (regional, per Amazon docs) */
  lwaAuthorizeHost: string;
  lwaTokenHost: string;
  /** Amazon Advertising API host for this region */
  advertisingApiHost: string;
  /** Official Amazon Ads MCP Server endpoint for this region */
  mcpEndpoint: string;
}

// Regional endpoint table. Advertising API hosts are region-specific per
// Amazon's published documentation; LWA token exchange is done against the
// global api.amazon.com host for all regions (North America LWA host is
// used for NA/EU/FE authorization per Amazon's current LWA setup), while
// the *resource* (Advertising API / MCP) hosts differ by region.
const REGION_TABLE: Record<AmazonRegion, RegionEndpoints> = {
  NA: {
    lwaAuthorizeHost: 'https://www.amazon.com/ap/oa',
    lwaTokenHost: 'https://api.amazon.com/auth/o2/token',
    advertisingApiHost: 'https://advertising-api.amazon.com',
    mcpEndpoint: 'https://advertising-ai-na.amazon.com/mcp',
  },
  EU: {
    lwaAuthorizeHost: 'https://eu.account.amazon.com/ap/oa',
    lwaTokenHost: 'https://api.amazon.com/auth/o2/token',
    advertisingApiHost: 'https://advertising-api-eu.amazon.com',
    mcpEndpoint: 'https://advertising-ai-eu.amazon.com/mcp',
  },
  FE: {
    lwaAuthorizeHost: 'https://apac.account.amazon.com/ap/oa',
    lwaTokenHost: 'https://api.amazon.com/auth/o2/token',
    advertisingApiHost: 'https://advertising-api-fe.amazon.com',
    mcpEndpoint: 'https://advertising-ai-fe.amazon.com/mcp',
  },
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `[amazon/config] Missing required environment variable: ${name}. ` +
        `Copy .env.local.example to .env.local and fill it in.`,
    );
  }
  return value;
}

function readRegion(): AmazonRegion {
  const raw = (process.env.AMAZON_REGION || 'NA').toUpperCase();
  if (raw === 'NA' || raw === 'EU' || raw === 'FE') {
    return raw;
  }
  throw new Error(
    `[amazon/config] Invalid AMAZON_REGION "${raw}". Must be one of: NA, EU, FE.`,
  );
}

export interface AmazonConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  region: AmazonRegion;
  scope: string;
  endpoints: RegionEndpoints;
  /** Path to the .env.local file, used by tokenManager to persist tokens. */
  envFilePath: string;
  // These are optional because they may not exist before the first login.
  refreshToken: string | undefined;
  accessToken: string | undefined;
  profileId: string | undefined;
}

export function loadAmazonConfig(): AmazonConfig {
  const region = readRegion();

  return {
    clientId: requireEnv('AMAZON_CLIENT_ID'),
    clientSecret: requireEnv('AMAZON_CLIENT_SECRET'),
    redirectUri: process.env.AMAZON_REDIRECT_URI || 'http://localhost:3000/auth/amazon/callback',
    region,
    // Fixed scope per the project requirements. Kept as a constant (not an
    // env var) since changing it requires a new LWA app configuration.
    scope: 'advertising::campaign_management',
    endpoints: REGION_TABLE[region],
    envFilePath: ENV_FILE,
    refreshToken: process.env.AMAZON_REFRESH_TOKEN || undefined,
    accessToken: process.env.AMAZON_ACCESS_TOKEN || undefined,
    profileId: process.env.AMAZON_PROFILE_ID || undefined,
  };
}

// Singleton instance used throughout the app. Re-exported so callers can
// just `import { amazonConfig } from './config'`.
export const amazonConfig = loadAmazonConfig();
