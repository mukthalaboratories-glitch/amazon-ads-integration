import { sign as aws4Sign } from 'aws4';

export interface SignOptions {
  method: string;
  path: string;
  body?: string;
  headers?: Record<string, string>;
}

export function signRequest(opts: SignOptions, accessKeyId: string, secretAccessKey: string, region: string): { headers: Record<string, string> } {
  if (!accessKeyId || !secretAccessKey) {
    return { headers: opts.headers || {} };
  }

  const signed = aws4Sign(
    {
      service: 'execute-api',
      region,
      method: opts.method,
      path: opts.path,
      body: opts.body,
      headers: opts.headers,
    },
    { accessKeyId, secretAccessKey },
  );

  return { headers: signed.headers as Record<string, string> };
}
