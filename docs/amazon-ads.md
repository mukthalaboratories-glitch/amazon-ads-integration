# Amazon Ads Integration

This document explains how the Amazon Ads authentication + API + MCP integration
in `src/amazon/` works, and how to connect it to various MCP clients.

## 1. Setup

1. Copy the template and fill in your credentials:
   ```bash
   cp .env.local.example .env.local
   ```
2. Fill in `AMAZON_CLIENT_ID`, `AMAZON_CLIENT_SECRET`, and set `AMAZON_REGION`
   to `NA`, `EU`, or `FE` depending on which Amazon Ads marketplace region
   your account belongs to. Leave the token fields blank — they're populated
   automatically.
3. Install dependencies and run the login flow once:
   ```bash
   npm install
   npm run amazon:login
   ```
4. Verify everything end-to-end:
   ```bash
   npm run amazon:test
   ```

## 2. How OAuth works

This integration uses Login with Amazon's (LWA) standard OAuth2
**authorization code** flow:

1. `GET /auth/amazon` generates a random `state` value and redirects your
   browser to Amazon's consent screen with `scope=advertising::campaign_management`.
2. After you approve, Amazon redirects back to
   `GET /auth/amazon/callback?code=...&state=...`.
3. The callback verifies `state` (CSRF protection), then exchanges `code`
   for an `access_token` + `refresh_token` at `https://api.amazon.com/auth/o2/token`.
4. Both tokens are cached in memory and written back into `.env.local`, and
   profiles are fetched immediately so you can confirm access worked.

`npm run amazon:login` wraps this in a temporary local Express server so you
don't need your main app running just to authorize.

## 3. How refresh tokens work

- The `refresh_token` returned on first authorization does **not** expire
  under normal use and is only issued once per initial consent grant.
- The `access_token` is short-lived (Amazon typically issues ~1 hour tokens).
- `getAccessToken()` in `src/amazon/auth/tokenManager.ts` is the single
  source of truth for getting a valid token: it checks the cached expiry,
  and if the token is expired or about to expire, it silently calls
  `refreshAccessToken()` behind the scenes and persists the new token. You
  never need to run the login flow again unless the refresh token itself is
  revoked or invalidated (e.g. you change your Amazon account password or
  revoke API access in Seller/Vendor Central).

**Production note:** writing tokens to `.env.local` is convenient for local
development, but is not a production-grade secret store — anyone with
filesystem access to the server can read it, and it doesn't work across
multiple app instances. In production:
- Store `refreshToken` in a secrets manager (AWS Secrets Manager, GCP Secret
  Manager, HashiCorp Vault) or an encrypted database column scoped to the
  authenticated user/tenant.
- Never log or persist the raw `access_token` beyond in-memory caching.
- Rotate/revoke stored refresh tokens if you detect suspicious activity.

## 4. How to change regions

Amazon Ads has three regional API endpoints. Set `AMAZON_REGION` in
`.env.local` to one of:

| Region | Covers                                  |
|--------|------------------------------------------|
| `NA`   | North America (US, CA, MX, BR)           |
| `EU`   | Europe, Middle East, India                |
| `FE`   | Far East (Japan, Australia, Singapore)    |

Changing this switches both the Advertising API host
(`advertising-api*.amazon.com`) and the MCP endpoint
(`advertising-ai-{region}.amazon.com/mcp`) used by every request — see the
region table in `src/amazon/config.ts`. You do not need a different
Client ID/Secret to switch regions unless your LWA security profile itself
is region-restricted.

## 5. How to regenerate tokens

If your refresh token is ever revoked, invalid, or you want to switch which
Amazon account is authorized:

```bash
npm run amazon:login
```

This re-runs the full OAuth consent flow and overwrites the stored
`AMAZON_ACCESS_TOKEN` / `AMAZON_REFRESH_TOKEN` in `.env.local`. You do not
need to manually delete the old values first.

If you just want to force an access-token refresh without a full re-login
(e.g. for debugging), delete `AMAZON_ACCESS_TOKEN` from `.env.local` — the
token manager will detect it's missing/expired and mint a new one from the
existing refresh token on the next call.

## 6. Connecting MCP clients

Run:

```bash
npm run amazon:mcp
```

This prints a ready-to-copy JSON config block with a **live** access token,
in two modes:

- **Dynamic Context Mode** — no advertising profile pinned; the MCP server
  resolves it per call. Good for exploring multiple accounts.
- **Fixed Context Mode** — a specific `AMAZON_PROFILE_ID` is pinned into the
  scope header, so every call in the session is locked to one account.
  Recommended for automated workflows.

Because the printed access token expires (typically within an hour), treat
the output of `amazon:mcp` as something you regenerate whenever you reconnect
a client, rather than a permanent, one-time paste.

### Claude Desktop

Add the printed config to your Claude Desktop MCP settings file
(`claude_desktop_config.json`), for example:

```json
{
  "mcpServers": {
    "amazon-ads": {
      "url": "https://advertising-ai-fe.amazon.com/mcp",
      "headers": {
        "Authorization": "Bearer <token from amazon:mcp>",
        "Amazon-Ads-ClientId": "<your client id>",
        "Amazon-Advertising-API-Scope": "<your profile id>"
      }
    }
  }
}
```

Restart Claude Desktop after editing the file.

### Claude Code

Claude Code supports remote MCP servers via its MCP configuration. Add an
entry with the same `url` and `headers` block from `npm run amazon:mcp` to
your Claude Code MCP server list (project-level or global config, depending
on your Claude Code version), then reconnect.

### Kiro

Kiro's MCP settings accept the same `url` + `headers` shape. Paste the
generated block into Kiro's MCP server configuration panel and save; Kiro
will validate the connection on next use.

### Any other MCP client

Any MCP-compatible client that supports HTTP/SSE remote servers needs only:
- `url`: the regional MCP endpoint (`mcp.fixed.config.url` /
  `mcp.dynamic.config.url` from `connectAmazonMCP()`)
- `headers`: the `Authorization`, `Amazon-Ads-ClientId`, and (for Fixed Context
  Mode) `Amazon-Advertising-API-Scope` headers

If your client supports a startup hook or dynamic header injection, prefer
calling `connectAmazonMCP()` at connection time over pasting a static token,
since it guarantees a fresh, non-expired token every time.

## 7. Error reference

`src/amazon/auth/errors.ts` classifies and explains the errors you're most
likely to hit:

| Code             | Meaning |
|------------------|---------|
| `invalid_scope`  | The LWA app isn't authorized for `advertising::campaign_management`. |
| `invalid_client` | Client ID/secret mismatch. |
| `invalid_grant`  | Auth code or refresh token invalid/expired/reused — re-run `amazon:login`. |
| `expired_token`  | Access token expired — should self-heal via `getAccessToken()`. |
| `unauthorized`   | HTTP 401 — missing/invalid bearer token. |
| `forbidden`      | HTTP 403 — insufficient permissions/scope for the resource. |
| `rate_limited`   | HTTP 429 — back off and retry. |
| `network_error`  | DNS/timeout/connection failure talking to Amazon. |

## 8. CLI reference

| Command                 | Purpose |
|--------------------------|---------|
| `npm run amazon:login`   | Runs the OAuth flow once, stores tokens. |
| `npm run amazon:profiles`| Lists all advertising profiles for this account. |
| `npm run amazon:test`    | End-to-end smoke test: auth → profiles → campaigns → report → MCP. |
| `npm run amazon:mcp`     | Prints ready-to-copy MCP client configuration. |
