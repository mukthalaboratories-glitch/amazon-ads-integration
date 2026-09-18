/**
 * client.ts
 *
 * A thin, reusable HTTP client for the Amazon Advertising API (v3).
 *
 * Every request automatically gets:
 *   - Authorization: Bearer <fresh access token>   (via tokenManager)
 *   - Amazon-Advertising-API-ClientId: <client id>
 *   - Amazon-Advertising-API-Scope: <profile id>    (when a profile is set)
 *
 * All domain-specific helper methods (getCampaigns, getKeywords, etc.) live
 * on `AmazonAdsClient` so callers never construct raw fetch calls by hand.
 */

import { amazonConfig } from './config';
import { getAccessToken } from './auth/tokenManager';
import { classifyAndThrow } from './auth/errors';
import {
  AmazonCampaign,
  AmazonAdGroup,
  AmazonKeyword,
  AmazonTarget,
  SearchTermReportRow,
  ReportRequest,
  ReportStatusResponse,
  V3ListRequest,
  V3CampaignListResponse,
  V3AdGroupListResponse,
  V3KeywordListResponse,
  V3TargetListResponse,
} from './types';
import { getProfiles } from './profiles';

const V3_CAMPAIGN_CT = 'application/vnd.spcampaign.v3+json';
const V3_ADGROUP_CT = 'application/vnd.spadGroup.v3+json';
const V3_KEYWORD_CT = 'application/vnd.spkeyword.v3+json';
const V3_TARGET_CT = 'application/vnd.sptargetingClause.v3+json';
const V3_REPORT_REQ_CT = 'application/vnd.createasyncreportrequest.v3+json';
const V3_REPORT_RESP_CT = 'application/vnd.createasyncreportresponse.v3+json';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  profileId?: string | number;
  headers?: Record<string, string>;
}

export class AmazonAdsClient {
  private readonly clientId: string;
  private readonly baseUrl: string;
  private defaultProfileId?: string;

  constructor(defaultProfileId?: string) {
    this.clientId = amazonConfig.clientId;
    this.baseUrl = amazonConfig.endpoints.advertisingApiHost;
    this.defaultProfileId = defaultProfileId || amazonConfig.profileId;
  }

  setProfileId(profileId: string | number) {
    this.defaultProfileId = String(profileId);
  }

  private async request<T>(options: RequestOptions): Promise<T> {
    const accessToken = await getAccessToken();

    const url = new URL(this.baseUrl + options.path);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }

    const profileId = options.profileId ?? this.defaultProfileId;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'Amazon-Advertising-API-ClientId': this.clientId,
      'Content-Type': 'application/json',
      ...(profileId ? { 'Amazon-Advertising-API-Scope': String(profileId) } : {}),
      ...options.headers,
    };

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (networkErr) {
      return classifyAndThrow(undefined, undefined, networkErr);
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      return classifyAndThrow(response.status, errorBody);
    }

    if (response.status === 204) return undefined as T;

    return (await response.json()) as T;
  }

  private v3ListRequest<T, R>(contentType: string, path: string, params?: { stateFilter?: string }): Promise<R> {
    const body: V3ListRequest = { startIndex: 0, count: 100, ...(params?.stateFilter ? { stateFilter: params.stateFilter } : {}) };
    return this.request<R>({
      method: 'POST',
      path,
      body,
      headers: {
        'Content-Type': contentType,
        Accept: contentType,
      },
    });
  }

  // -------------------------------------------------------------------
  // Domain helper methods (Step 6)
  // -------------------------------------------------------------------

  async getProfiles() {
    return getProfiles(await getAccessToken());
  }

  async getCampaigns(params?: { stateFilter?: string }): Promise<AmazonCampaign[]> {
    const res = await this.v3ListRequest<V3CampaignListResponse, V3CampaignListResponse>(V3_CAMPAIGN_CT, '/sp/campaigns/list', params);
    return res.campaigns;
  }

  async getCampaign(campaignId: string | number): Promise<AmazonCampaign> {
    const campaigns = await this.getCampaigns();
    const found = campaigns.find((c) => c.campaignId === String(campaignId));
    if (!found) throw new Error(`Campaign ${campaignId} not found`);
    return found;
  }

  async getAdGroups(params?: { campaignIdFilter?: string }): Promise<AmazonAdGroup[]> {
    const res = await this.v3ListRequest<V3AdGroupListResponse, V3AdGroupListResponse>(V3_ADGROUP_CT, '/sp/adGroups/list', params);
    let groups = res.adGroups;
    if (params?.campaignIdFilter) {
      groups = groups.filter((g) => g.campaignId === params.campaignIdFilter);
    }
    return groups;
  }

  async getKeywords(params?: { campaignIdFilter?: string; adGroupIdFilter?: string }): Promise<AmazonKeyword[]> {
    const res = await this.v3ListRequest<V3KeywordListResponse, V3KeywordListResponse>(V3_KEYWORD_CT, '/sp/keywords/list', params);
    let keywords = res.keywords;
    if (params?.campaignIdFilter) keywords = keywords.filter((k) => k.campaignId === params.campaignIdFilter);
    if (params?.adGroupIdFilter) keywords = keywords.filter((k) => k.adGroupId === params.adGroupIdFilter);
    return keywords;
  }

  async getTargets(params?: { campaignIdFilter?: string; adGroupIdFilter?: string }): Promise<AmazonTarget[]> {
    const res = await this.v3ListRequest<V3TargetListResponse, V3TargetListResponse>(V3_TARGET_CT, '/sp/targets/list', params);
    let targets = res.targetingClauses;
    if (params?.campaignIdFilter) targets = targets.filter((t) => t.campaignId === params.campaignIdFilter);
    if (params?.adGroupIdFilter) targets = targets.filter((t) => t.adGroupId === params.adGroupIdFilter);
    return targets;
  }

  async generateReport(reportRequest: ReportRequest): Promise<ReportStatusResponse> {
    return this.request<ReportStatusResponse>({
      method: 'POST',
      path: '/reporting/reports',
      body: reportRequest,
      headers: {
        'Content-Type': V3_REPORT_REQ_CT,
        Accept: V3_REPORT_RESP_CT,
      },
    });
  }

  async getReportStatus(reportId: string): Promise<ReportStatusResponse> {
    return this.request<ReportStatusResponse>({
      path: `/reporting/reports/${reportId}`,
      headers: { Accept: V3_REPORT_RESP_CT },
    });
  }

  async downloadReport(reportId: string, pollIntervalMs = 10000, timeoutMs = 300000): Promise<unknown> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const status = await this.getReportStatus(reportId);
      if (status.status === 'COMPLETED' && status.url) {
        const fileResponse = await fetch(status.url);
        if (!fileResponse.ok) throw new Error('Download failed: ' + fileResponse.status);
        const buf = Buffer.from(await fileResponse.arrayBuffer());
        if (status.configuration?.format === 'GZIP_JSON') {
          const { createGunzip } = await import('zlib');
          return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            const gunzip = createGunzip();
            gunzip.on('data', (c: Buffer) => chunks.push(c));
            gunzip.on('end', () => {
              const raw = Buffer.concat(chunks).toString().trim();
              try { resolve(JSON.parse(raw)); }
              catch { resolve(raw.split('\n').filter(Boolean).map(l => JSON.parse(l))); }
            });
            gunzip.on('error', reject);
            gunzip.end(buf);
          });
        }
        return JSON.parse(buf.toString('utf-8'));
      }
      if (status.status === 'FAILED') throw new Error('Report failed: ' + (status.failureReason || 'unknown'));
      await new Promise(r => setTimeout(r, pollIntervalMs));
    }
    throw new Error('Report timed out after ' + timeoutMs + 'ms');
  }

  async searchTerms(params: {
    campaignIdFilter?: string;
    startDate: string;
    endDate: string;
  }): Promise<SearchTermReportRow[]> {
    return this.request<SearchTermReportRow[]>({
      path: '/sp/searchTerms/report',
      query: params,
    });
  }
}

export const amazonAdsClient = new AmazonAdsClient();
