import http from 'http';
import { Readable } from 'stream';
import { amazonConfig } from '../src/amazon/config';
import { getAccessToken } from '../src/amazon/auth/tokenManager';

const PORT = 3100;

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return {
    Authorization: 'Bearer ' + token,
    'Amazon-Ads-ClientId': amazonConfig.clientId,
    'Amazon-Advertising-API-Scope': amazonConfig.profileId ?? '',
  };
}

const server = http.createServer(async (req, res) => {
  let authHeaders: Record<string, string>;
  try {
    authHeaders = await getAuthHeaders();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Auth error:', msg);
    res.writeHead(500);
    res.end('Authentication failed');
    return;
  }

  const qs = req.url && req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const url = amazonConfig.endpoints.mcpEndpoint + qs;

  const headers: Record<string, string> = { ...authHeaders };
  if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'] as string;
  if (req.headers['accept']) headers['Accept'] = req.headers['accept'] as string;

  try {
    let body: string | undefined;
    if (req.method !== 'GET') {
      body = await new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks).toString()));
        req.on('error', reject);
      });
    }

    const upstream = await fetch(url, {
      method: req.method,
      headers,
      body,
    });

    res.writeHead(upstream.status);
    for (const [k, v] of upstream.headers) {
      const lk = k.toLowerCase();
      if (lk !== 'content-encoding' && lk !== 'content-length') {
        res.setHeader(k, v);
      }
    }

    if (upstream.body) {
      const nodeStream = Readable.fromWeb(upstream.body as import('stream/web').ReadableStream);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Proxy error (' + req.method + ' ' + url + '):', msg);
    if (!res.headersSent) res.writeHead(502);
    res.end();
  }
});

server.listen(PORT, () => {
  console.log('V Amazon Ads MCP Proxy running at http://localhost:' + PORT + '/mcp');
  console.log('  Configure MCP client: { "mcpServers": { "amazon-ads": { "url": "http://localhost:' + PORT + '/mcp" } } }');
});
