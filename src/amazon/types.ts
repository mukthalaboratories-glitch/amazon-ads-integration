/**
 * types.ts
 *
 * Shared type definitions for the Amazon Ads integration.
 * Keeping these in one place avoids duplicated/inconsistent shapes across
 * oauth.ts, tokenManager.ts, profiles.ts, and client.ts.
 */

// ---------------------------------------------------------------------------
// OAuth / LWA
// ---------------------------------------------------------------------------

export interface LwaTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number; // seconds
}

export interface StoredTokenState {
  accessToken: string;
  refreshToken: string;
  /** Epoch millis when the access token expires. */
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// Advertising API errors
// ---------------------------------------------------------------------------

/** Known Amazon Ads / LWA error codes we give friendly messages for. */
export type KnownAmazonErrorCode =
  | 'invalid_scope'
  | 'invalid_client'
  | 'invalid_grant'
  | 'expired_token'
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'network_error'
  | 'unknown';

export class AmazonAdsError extends Error {
  code: KnownAmazonErrorCode;
  httpStatus?: number;
  details?: unknown;

  constructor(
    code: KnownAmazonErrorCode,
    message: string,
    httpStatus?: number,
    details?: unknown,
  ) {
    super(message);
    this.name = 'AmazonAdsError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export interface AmazonProfile {
  profileId: number;
  countryCode: string;
  currencyCode: string;
  timezone: string;
  accountInfo: {
    marketplaceStringId: string;
    id: string;
    type: 'seller' | 'vendor' | 'agency' | string;
    name?: string;
    subType?: string;
    validPaymentMethod?: boolean;
  };
}

// ---------------------------------------------------------------------------
// Campaign management (subset of fields commonly needed; extend as required)
// ---------------------------------------------------------------------------

export interface AmazonCampaign {
  campaignId: string;
  name: string;
  targetingType: string;
  state: 'enabled' | 'paused' | 'archived' | string;
  budget?: { budget: number; budgetType: string };
  startDate?: string;
  endDate?: string;
  portfolioId?: string;
  dynamicBidding?: { strategy: string; placementBidding: unknown[] };
  [key: string]: unknown;
}

export interface AmazonAdGroup {
  adGroupId: string;
  campaignId: string;
  name: string;
  state: string;
  defaultBid?: number;
  [key: string]: unknown;
}

export interface AmazonKeyword {
  keywordId: string;
  adGroupId: string;
  campaignId: string;
  keywordText: string;
  matchType: string;
  state: string;
  bid?: number;
  [key: string]: unknown;
}

export interface AmazonTarget {
  targetId: string;
  adGroupId: string;
  campaignId: string;
  expression: unknown[];
  expressionType?: string;
  state: string;
  bid?: number;
  [key: string]: unknown;
}

export interface SearchTermReportRow {
  query: string;
  campaignId: string;
  adGroupId: string;
  impressions: number;
  clicks: number;
  cost: number;
  [key: string]: unknown;
}

export interface V3ListRequest {
  startIndex: number;
  count: number;
  stateFilter?: string;
}

export interface V3CampaignListResponse {
  campaigns: AmazonCampaign[];
}

export interface V3AdGroupListResponse {
  adGroups: AmazonAdGroup[];
}

export interface V3KeywordListResponse {
  keywords: AmazonKeyword[];
}

export interface V3TargetListResponse {
  targetingClauses: AmazonTarget[];
}

// ---------------------------------------------------------------------------
// Reporting (Amazon Ads Reporting API v3 style)
// ---------------------------------------------------------------------------

export interface ReportRequest {
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  configuration: {
    adProduct: string;
    groupBy: string[];
    columns: string[];
    reportTypeId: string;
    timeUnit: 'SUMMARY' | 'DAILY';
    format: 'GZIP_JSON' | 'JSON';
  };
}

export interface ReportStatusResponse {
  reportId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  url?: string;
  failureReason?: string;
  configuration?: {
    format?: 'GZIP_JSON' | 'JSON';
    adProduct?: string;
    columns?: string[];
    groupBy?: string[];
    reportTypeId?: string;
    timeUnit?: string;
  };
  generatedAt?: string;
  fileSize?: number;
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
// MCP configuration
// ---------------------------------------------------------------------------

export interface McpConnectionConfig {
  url: string;
  headers: Record<string, string>;
}

export interface McpContextModeConfig {
  /** Dynamic Context Mode: MCP server discovers profile/tools at call time. */
  dynamic: {
    mode: 'dynamic';
    description: string;
    config: McpConnectionConfig;
  };
  /** Fixed Context Mode: profile/scope pinned ahead of time for the session. */
  fixed: {
    mode: 'fixed';
    description: string;
    config: McpConnectionConfig & { profileId: string };
  };
}
