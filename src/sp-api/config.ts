import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

const ENV_FILE = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(ENV_FILE)) {
  dotenv.config({ path: ENV_FILE });
} else {
  dotenv.config();
}

export type SpApiRegion = 'NA' | 'EU' | 'FE';

interface SpRegionEndpoints {
  spApiHost: string;
}

const SP_REGION_TABLE: Record<SpApiRegion, SpRegionEndpoints> = {
  NA: { spApiHost: 'https://sellingpartnerapi-na.amazon.com' },
  EU: { spApiHost: 'https://sellingpartnerapi-eu.amazon.com' },
  FE: { spApiHost: 'https://sellingpartnerapi-fe.amazon.com' },
};

const SANDBOX_REGION_TABLE: Record<SpApiRegion, SpRegionEndpoints> = {
  NA: { spApiHost: 'https://sandbox.sellingpartnerapi-na.amazon.com' },
  EU: { spApiHost: 'https://sandbox.sellingpartnerapi-eu.amazon.com' },
  FE: { spApiHost: 'https://sandbox.sellingpartnerapi-fe.amazon.com' },
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`[sp-api/config] Missing required env var: ${name}`);
  }
  return value;
}

export interface SpApiConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  region: SpApiRegion;
  sandbox: boolean;
  marketplaceId: string;
  endpoints: SpRegionEndpoints;
}

const MARKETPLACE_IDS: Record<SpApiRegion, string> = {
  NA: 'ATVPDKIKX0DER',
  EU: 'A21TJRUUN4KGV',
  FE: 'A2Q3Y263D00KWC',
};

export function loadSpApiConfig(): SpApiConfig {
  const rawRegion = (process.env.SP_API_REGION || 'EU').toUpperCase() as SpApiRegion;
  const region: SpApiRegion = ['NA', 'EU', 'FE'].includes(rawRegion) ? rawRegion : 'EU';
  const sandbox = process.env.SP_API_SANDBOX === 'true';

  return {
    clientId: requireEnv('SP_API_CLIENT_ID'),
    clientSecret: requireEnv('SP_API_CLIENT_SECRET'),
    refreshToken: requireEnv('SP_API_REFRESH_TOKEN'),
    region,
    sandbox,
    marketplaceId: process.env.SP_API_MARKETPLACE_ID || MARKETPLACE_IDS[region],
    endpoints: sandbox ? SANDBOX_REGION_TABLE[region] : SP_REGION_TABLE[region],
  };
}

export const spApiConfig = loadSpApiConfig();
