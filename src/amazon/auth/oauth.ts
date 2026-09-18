/**
 * oauth.ts
 *
 * Implements the Login with Amazon (LWA) OAuth2 "authorization code" flow:
 *   1. buildAuthorizationUrl() -> redirect the user's browser here
 *   2. exchangeCodeForTokens() -> called by the /auth/amazon/callback route
 *
 * This module does not persist tokens itself -- that's tokenManager.ts's
 * job. oauth.ts only knows how to talk to Amazon's LWA endpoints.
 */

import crypto from 'crypto';
import { amazonConfig } from '../config';
import { LwaTokenResponse } from '../types';
import { classifyAndThrow } from './errors';

// In-memory store of valid `state` values, mapped to a creation timestamp.
// This is sufficient for a single-instance dev/CLI flow. In a multi-instance
// production deployment, back this with Redis or a signed/encrypted cookie
// instead (see docs/amazon-ads.md).
const pendingStates = new Map<string, number>();
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Generates a cryptographically secure random `state` and remembers it. */
export function generateState(): string {
  const state = crypto.randomBytes(24).toString('hex');
  pendingStates.set(state, Date.now());
  pruneExpiredStates();
  return state;
}

/** Validates a `state` value returned by Amazon on the callback. */
export function consumeState(state: string | undefined): boolean {
  if (!state) return false;
  const createdAt = pendingStates.get(state);
  pendingStates.delete(state); // one-time use, whether valid or not
  if (!createdAt) return false;
  return Date.now() - createdAt <= STATE_TTL_MS;
}

function pruneExpiredStates() {
  const now = Date.now();
  for (const [state, createdAt] of pendingStates.entries()) {
    if (now - createdAt > STATE_TTL_MS) pendingStates.delete(state);
  }
}

/**
 * Builds the URL to redirect the user to in order to begin the LWA consent
 * flow for the `advertising::campaign_management` scope.
 */
export function buildAuthorizationUrl(): { url: string; state: string } {
  const state = generateState();

  const params = new URLSearchParams({
    client_id: amazonConfig.clientId,
    scope: amazonConfig.scope,
    response_type: 'code',
    redirect_uri: amazonConfig.redirectUri,
    state,
  });

  return {
    url: `${amazonConfig.endpoints.lwaAuthorizeHost}?${params.toString()}`,
    state,
  };
}

/**
 * Exchanges an authorization `code` (from the callback query string) for an
 * access token + refresh token pair.
 */
export async function exchangeCodeForTokens(code: string): Promise<LwaTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: amazonConfig.clientId,
    client_secret: amazonConfig.clientSecret,
    redirect_uri: amazonConfig.redirectUri,
  });

  return performTokenRequest(body);
}

/**
 * Exchanges a stored `refresh_token` for a new access token. Amazon does not
 * rotate the refresh token on this call, so we keep reusing the original one
 * (but we still read it back defensively in case Amazon ever changes this).
 */
export async function refreshAccessToken(refreshToken: string): Promise<LwaTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: amazonConfig.clientId,
    client_secret: amazonConfig.clientSecret,
  });

  return performTokenRequest(body);
}

async function performTokenRequest(body: URLSearchParams): Promise<LwaTokenResponse> {
  let response: Response;
  try {
    response = await fetch(amazonConfig.endpoints.lwaTokenHost, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch (networkErr) {
    return classifyAndThrow(undefined, undefined, networkErr);
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    return classifyAndThrow(response.status, payload);
  }

  return payload as LwaTokenResponse;
}
