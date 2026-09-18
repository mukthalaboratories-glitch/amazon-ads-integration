/**
 * errors.ts
 *
 * Central place that turns raw HTTP status codes / LWA error bodies into a
 * typed `AmazonAdsError` with a friendly, actionable message. Used by both
 * the OAuth token exchange and the general Advertising API client so error
 * handling is consistent everywhere.
 */

import { AmazonAdsError, KnownAmazonErrorCode } from '../types';

interface LwaErrorBody {
  error?: string;
  error_description?: string;
}

const FRIENDLY_MESSAGES: Record<KnownAmazonErrorCode, string> = {
  invalid_scope:
    'The requested scope is not authorized for this LWA application. ' +
    'Double check that "advertising::campaign_management" is enabled for ' +
    'your Login with Amazon security profile in Seller/Vendor Central.',
  invalid_client:
    'AMAZON_CLIENT_ID / AMAZON_CLIENT_SECRET are invalid or do not match. ' +
    'Verify both values against your LWA security profile.',
  invalid_grant:
    'The authorization code or refresh token is invalid, expired, or was ' +
    'already used. Run `npm run amazon:login` again to re-authorize.',
  expired_token:
    'The access token has expired. This should self-heal automatically on ' +
    'the next call via getAccessToken() -- if you see this repeatedly, the ' +
    'stored refresh token itself may be invalid.',
  unauthorized:
    'Received HTTP 401 Unauthorized. The access token is missing, malformed, ' +
    'or expired.',
  forbidden:
    'Received HTTP 403 Forbidden. The authenticated user does not have ' +
    'permission for this profile/resource, or the required scope is missing.',
  rate_limited:
    'Received HTTP 429 Too Many Requests. Back off and retry with ' +
    'exponential backoff; you are exceeding Amazon Ads API rate limits.',
  network_error:
    'A network-level failure occurred while calling Amazon (DNS, timeout, ' +
    'TLS, or connection reset). Check connectivity and retry.',
  unknown: 'An unrecognized error occurred while calling Amazon.',
};

/**
 * Inspects an HTTP status + response body (or a caught network exception)
 * and throws a correctly-classified AmazonAdsError. This function's return
 * type is `never` -- it always throws -- but is typed to return T so it can
 * be used in a `return classifyAndThrow(...)` expression position.
 */
export function classifyAndThrow<T>(
  status: number | undefined,
  body: unknown,
  networkErr?: unknown,
): T {
  if (networkErr) {
    throw new AmazonAdsError(
      'network_error',
      `${FRIENDLY_MESSAGES.network_error} Original error: ${
        networkErr instanceof Error ? networkErr.message : String(networkErr)
      }`,
      undefined,
      networkErr,
    );
  }

  const parsed = (body || {}) as LwaErrorBody & { code?: string; message?: string };
  const errorField = parsed.error || parsed.code;

  let code: KnownAmazonErrorCode = 'unknown';

  if (errorField === 'invalid_scope') code = 'invalid_scope';
  else if (errorField === 'invalid_client') code = 'invalid_client';
  else if (errorField === 'invalid_grant') code = 'invalid_grant';
  else if (status === 401) code = 'unauthorized';
  else if (status === 403) code = 'forbidden';
  else if (status === 429) code = 'rate_limited';
  else if (status && status >= 500) code = 'unknown';

  const description = parsed.error_description || parsed.message || '';
  const message = `${FRIENDLY_MESSAGES[code]}${description ? ` (Amazon says: ${description})` : ''}`;

  throw new AmazonAdsError(code, message, status, body);
}
