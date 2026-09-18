import { spApiConfig } from './config';
import { getSpApiAccessToken } from './auth/tokenManager';

export class SpApiClient {
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = spApiConfig.endpoints.spApiHost;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const accessToken = await getSpApiAccessToken();

    const bodyStr = body ? JSON.stringify(body) : undefined;

    const headers: Record<string, string> = {
      'x-amz-access-token': accessToken,
      'content-type': 'application/json',
      host: new URL(this.baseUrl).host,
    };

    const url = this.baseUrl + path;

    const res = await fetch(url, {
      method,
      headers,
      body: bodyStr,
    });

    if (res.status === 401 || res.status === 403) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`SP-API auth error ${res.status}: ${errBody}. Try enabling SigV4 signing.`);
    }

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`SP-API error ${res.status} on ${method} ${path}: ${errBody}`);
    }

    if (res.status === 204) return undefined as T;

    return (await res.json()) as T;
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }
}

export const spApiClient = new SpApiClient();
