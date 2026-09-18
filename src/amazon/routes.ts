/**
 * routes.ts
 *
 * Express router exposing:
 *   GET /auth/amazon           -> starts the LWA OAuth flow (Step 1)
 *   GET /auth/amazon/callback  -> handles Amazon's redirect back (Step 2)
 *
 * Mount this in your existing Express app with:
 *
 *   import { amazonAuthRouter } from './amazon/routes';
 *   app.use(amazonAuthRouter);
 */

import { Router, Request, Response } from 'express';
import { buildAuthorizationUrl, consumeState } from './auth/oauth';
import { completeLogin, getAccessToken } from './auth/tokenManager';
import { loadAndResolveProfiles } from './profiles';
import { AmazonAdsError } from './types';

export const amazonAuthRouter = Router();

amazonAuthRouter.get('/auth/amazon', (req: Request, res: Response) => {
  const { url } = buildAuthorizationUrl();
  res.redirect(url);
});

amazonAuthRouter.get('/auth/amazon/callback', async (req: Request, res: Response) => {
  const { code, state, error, error_description: errorDescription } = req.query as Record<string, string>;

  // Amazon can redirect back with an error instead of a code (e.g. user
  // declined consent).
  if (error) {
    console.error(`✗ OAuth error from Amazon: ${error} - ${errorDescription || ''}`);
    res.status(400).send(`Amazon Login Failed: ${error} - ${errorDescription || ''}`);
    return;
  }

  if (!consumeState(state)) {
    console.error('✗ OAuth callback rejected: invalid or expired state parameter (possible CSRF).');
    res.status(400).send('Invalid or expired state parameter. Please restart the login flow at /auth/amazon.');
    return;
  }

  if (!code) {
    res.status(400).send('Missing "code" query parameter from Amazon redirect.');
    return;
  }

  try {
    await completeLogin(code);
    console.log('✓ OAuth Success');

    // Immediately pull profiles per Step 4, so the user sees them right away.
    const accessToken = await getAccessToken();
    const profiles = await loadAndResolveProfiles(accessToken);

    res.send(
      `<h1>✓ Amazon Ads Authorization Complete</h1>` +
        `<p>Found ${profiles.length} profile(s). You can close this tab and return to the terminal.</p>`,
    );
  } catch (err) {
    if (err instanceof AmazonAdsError) {
      console.error(`✗ [${err.code}] ${err.message}`);
      res.status(err.httpStatus || 500).send(`Amazon Ads Error [${err.code}]: ${err.message}`);
    } else {
      console.error('✗ Unexpected error during OAuth callback:', err);
      res.status(500).send('Unexpected error completing Amazon login. Check server logs.');
    }
  }
});
