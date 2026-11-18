import { loadConfig } from '../config';

/**
 * Minimal Reddit API client using built-in fetch and app-only OAuth
 * (client_credentials grant). Replaces snoowrap, which pulled in a large,
 * vulnerable dependency tree and required the account password.
 *
 * Requires a Reddit "script" or "web" app: https://www.reddit.com/prefs/apps
 */

const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const API_BASE = 'https://oauth.reddit.com';

export interface RedditPost {
  title: string;
  url: string;
  permalink: string;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value;
  }

  const { clientID, clientSecret, userAgent } = loadConfig().auth.reddit;
  const basic = Buffer.from(`${clientID}:${clientSecret}`).toString('base64');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent,
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    throw new Error(`Reddit auth failed: ${res.status} ${await res.text()}`);
  }

  const body = (await res.json()) as { access_token: string; expires_in: number };
  // Refresh a minute early to avoid using a token right as it expires.
  cachedToken = {
    value: body.access_token,
    expiresAt: Date.now() + (body.expires_in - 60) * 1000,
  };
  return cachedToken.value;
}

/**
 * Returns the Nth stickied post (1 or 2) of a subreddit, or null if the
 * subreddit has no sticky in that slot.
 */
export async function getSticky(subreddit: string, num: 1 | 2): Promise<RedditPost | null> {
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}/r/${subreddit}/about/sticky?num=${num}&raw_json=1`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': loadConfig().auth.reddit.userAgent,
    },
  });

  // Reddit responds 404 when there is no sticky in the requested slot.
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Reddit request failed: ${res.status} ${await res.text()}`);
  }

  // The endpoint returns a [post listing, comments listing] pair.
  const listings = (await res.json()) as Array<{ data: { children: Array<{ data: RedditPost }> } }>;
  return listings[0]?.data.children[0]?.data ?? null;
}
