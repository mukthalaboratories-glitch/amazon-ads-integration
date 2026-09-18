/**
 * profiles.ts
 *
 * Retrieves the advertiser's Amazon Ads profiles (Step 4). A "profile"
 * represents a specific marketplace + account combination (e.g. your US
 * seller account, your UK vendor account, etc.) and its `profileId` is
 * required as the `Amazon-Advertising-API-Scope` header on almost every
 * other Ads API call.
 */

import { amazonConfig } from './config';
import { classifyAndThrow } from './auth/errors';
import { AmazonProfile } from './types';
import { persistProfileId } from './auth/tokenManager';

export async function getProfiles(accessToken: string): Promise<AmazonProfile[]> {
  let response: Response;
  try {
    response = await fetch(`${amazonConfig.endpoints.advertisingApiHost}/v2/profiles`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Amazon-Advertising-API-ClientId': amazonConfig.clientId,
      },
    });
  } catch (networkErr) {
    return classifyAndThrow(undefined, undefined, networkErr);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return classifyAndThrow(response.status, body);
  }

  return (await response.json()) as AmazonProfile[];
}

/** Pretty-prints profiles to the console, per Step 4's display requirements. */
export function printProfiles(profiles: AmazonProfile[]): void {
  console.log(`\nFound ${profiles.length} Amazon Ads profile(s):\n`);
  profiles.forEach((profile, index) => {
    console.log(`  [${index + 1}] Profile ID:    ${profile.profileId}`);
    console.log(`      Country:      ${profile.countryCode}`);
    console.log(`      Currency:     ${profile.currencyCode}`);
    console.log(`      Account Type: ${profile.accountInfo?.type ?? 'unknown'}`);
    console.log(`      Account Name: ${profile.accountInfo?.name ?? '(unnamed)'}`);
    console.log('');
  });
}

/**
 * Fetches profiles, prints them, and if exactly one exists, automatically
 * persists it as AMAZON_PROFILE_ID (Step 4 requirement). Returns the full
 * list either way so callers (e.g. the CLI) can prompt for a choice when
 * there are multiple.
 */
export async function loadAndResolveProfiles(accessToken: string): Promise<AmazonProfile[]> {
  const profiles = await getProfiles(accessToken);
  printProfiles(profiles);

  if (profiles.length === 1) {
    persistProfileId(profiles[0].profileId);
    console.log(`✓ Automatically saved AMAZON_PROFILE_ID=${profiles[0].profileId} (only one profile found)\n`);
  } else if (profiles.length > 1) {
    console.log(
      'Multiple profiles found. Set AMAZON_PROFILE_ID in .env.local to the one ' +
        'you want to use by default, or pass a profileId explicitly to client calls.\n',
    );
  }

  console.log('✓ Profiles Loaded');
  return profiles;
}
