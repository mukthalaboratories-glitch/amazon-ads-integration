/**
 * tokenManager.ts
 *
 * Owns the *lifecycle* of the access token:
 *   - Caches the current access token + its expiry in memory.
 *   - Transparently refreshes it using the refresh token when it's expired
 *     (or about to expire), so callers never have to think about it.
 *   - Persists newly-issued tokens back to `.env.local` for local/dev use.
 *
 * IMPORTANT (production note, see docs/amazon-ads.md for detail):
 * Writing tokens back to a `.env.local` file is convenient for local
 * development and single-user CLI usage, but it is NOT a production-grade
 * secret store. In production, persist `refreshToken` in a secrets manager
 * (AWS Secrets Manager, GCP Secret Manager, HashiCorp Vault) or an encrypted
 * database column, and never write secrets to disk on an app server.
 */

import fs from 'fs';
import { amazonConfig } from '../config';
import { exchangeCodeForTokens, refreshAccessToken } from './oauth';
import { StoredTokenState } from '../types';
import { AmazonAdsError } from '../types';

// Refresh a little early to avoid races where a token expires mid-request.
const EXPIRY_SAFETY_MARGIN_MS = 60 * 1000; // 60 seconds

let cachedState: StoredTokenState | null = bootstrapFromConfig();

function bootstrapFromConfig(): StoredTokenState | null {
  if (amazonConfig.accessToken && amazonConfig.refreshToken) {
    return {
      accessToken: amazonConfig.accessToken,
      refreshToken: amazonConfig.refreshToken,
      // We don't know the real expiry of a token loaded from disk, so treat
      // it as already expired -- this forces one refresh on first use,
      // which is cheap and guarantees correctness.
      expiresAt: 0,
    };
  }
  return null;
}

/**
 * Completes the OAuth flow after the user authorizes on Amazon's side:
 * exchanges the `code` for tokens, caches them, and persists them.
 */
export async function completeLogin(code: string): Promise<StoredTokenState> {
  const tokenResponse = await exchangeCodeForTokens(code);

  if (!tokenResponse.refresh_token) {
    throw new AmazonAdsError(
      'unknown',
      'Amazon did not return a refresh_token. Make sure the LWA consent ' +
        'screen was shown (first-time authorization) -- Amazon only issues ' +
        'a refresh token on the initial consent grant.',
    );
  }

  cachedState = {
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    expiresAt: Date.now() + tokenResponse.expires_in * 1000,
  };

  console.log('✓ Access Token Received');
  console.log('✓ Refresh Token Received');

  persistTokens(cachedState);

  return cachedState;
}

/**
 * Returns a valid, non-expired access token, transparently refreshing it
 * first if necessary. This is the ONLY function the rest of the app should
 * call to get a bearer token -- never read AMAZON_ACCESS_TOKEN directly.
 */
export async function getAccessToken(): Promise<string> {
  if (!cachedState) {
    throw new AmazonAdsError(
      'invalid_grant',
      'No stored credentials found. Run `npm run amazon:login` first to ' +
        'authorize this application with Amazon.',
    );
  }

  const isExpiringSoon = Date.now() >= cachedState.expiresAt - EXPIRY_SAFETY_MARGIN_MS;

  if (isExpiringSoon) {
    const refreshed = await refreshAccessToken(cachedState.refreshToken);

    cachedState = {
      accessToken: refreshed.access_token,
      // Amazon generally does not rotate the refresh token, but if it ever
      // does send a new one, prefer it.
      refreshToken: refreshed.refresh_token || cachedState.refreshToken,
      expiresAt: Date.now() + refreshed.expires_in * 1000,
    };

    console.log('✓ Token Refreshed');
    persistTokens(cachedState);
  }

  return cachedState.accessToken;
}

/** Returns the cached refresh token, if any -- used by CLI diagnostics. */
export function getCachedRefreshToken(): string | undefined {
  return cachedState?.refreshToken;
}

/**
 * Writes the current tokens back into `.env.local`, replacing existing
 * AMAZON_ACCESS_TOKEN / AMAZON_REFRESH_TOKEN lines or appending them if
 * absent. Leaves every other line in the file untouched.
 */
function persistTokens(state: StoredTokenState): void {
  const filePath = amazonConfig.envFilePath;

  let lines: string[] = [];
  if (fs.existsSync(filePath)) {
    lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  }

  const updates: Record<string, string> = {
    AMAZON_ACCESS_TOKEN: state.accessToken,
    AMAZON_REFRESH_TOKEN: state.refreshToken,
  };

  const seen = new Set<string>();

  const newLines = lines.map((line) => {
    const match = line.match(/^([A-Z_]+)=/);
    if (match && updates[match[1]] !== undefined) {
      seen.add(match[1]);
      return `${match[1]}=${updates[match[1]]}`;
    }
    return line;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) {
      newLines.push(`${key}=${value}`);
    }
  }

  fs.writeFileSync(filePath, newLines.join('\n'));

  // Keep process.env in sync for the lifetime of this process too.
  process.env.AMAZON_ACCESS_TOKEN = state.accessToken;
  process.env.AMAZON_REFRESH_TOKEN = state.refreshToken;
}

/** Persists a chosen/derived profile id back to `.env.local`, same pattern as tokens. */
export function persistProfileId(profileId: string | number): void {
  const filePath = amazonConfig.envFilePath;
  let lines: string[] = [];
  if (fs.existsSync(filePath)) {
    lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  }

  let found = false;
  const newLines = lines.map((line) => {
    if (line.match(/^AMAZON_PROFILE_ID=/)) {
      found = true;
      return `AMAZON_PROFILE_ID=${profileId}`;
    }
    return line;
  });

  if (!found) newLines.push(`AMAZON_PROFILE_ID=${profileId}`);

  fs.writeFileSync(filePath, newLines.join('\n'));
  process.env.AMAZON_PROFILE_ID = String(profileId);
}
