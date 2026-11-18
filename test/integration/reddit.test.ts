import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, makeConfig } from '../helpers';

// Hoisted so the same fake survives vi.resetModules() below.
const { loadConfig } = vi.hoisted(() => ({ loadConfig: vi.fn() }));
vi.mock('../../src/config', () => ({ loadConfig }));

/** A sticky endpoint response: [post listing, comments listing]. */
const stickyBody = (title: string) => [
  { data: { children: [{ data: { title, url: 'https://example.com/post', permalink: '/r/MadeInAbyss/x' } }] } },
  { data: { children: [] } },
];
const tokenBody = (token = 'tok-1', expiresIn = 3600) => ({ access_token: token, expires_in: expiresIn });

// reddit.ts caches the access token at module level, so each test gets a
// fresh copy of the module.
let reddit: typeof import('../../src/util/reddit');
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetModules();
  vi.mocked(loadConfig).mockReturnValue(makeConfig());
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  reddit = await import('../../src/util/reddit');
});

describe('reddit.getSticky', () => {
  it('authenticates with client credentials, then queries the sticky endpoint', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(tokenBody('tok-1')))
      .mockResolvedValueOnce(jsonResponse(stickyBody('Chapter 62')));

    const post = await reddit.getSticky('MadeInAbyss', 2);

    expect(post).toEqual({ title: 'Chapter 62', url: 'https://example.com/post', permalink: '/r/MadeInAbyss/x' });

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe('https://www.reddit.com/api/v1/access_token');
    expect(tokenInit.method).toBe('POST');
    expect(tokenInit.body).toBe('grant_type=client_credentials');
    expect(tokenInit.headers.Authorization)
      .toBe(`Basic ${Buffer.from('reddit-id:reddit-secret').toString('base64')}`);
    expect(tokenInit.headers['User-Agent']).toBe('isabelle-tests');

    const [apiUrl, apiInit] = fetchMock.mock.calls[1];
    expect(apiUrl).toBe('https://oauth.reddit.com/r/MadeInAbyss/about/sticky?num=2&raw_json=1');
    expect(apiInit.headers.Authorization).toBe('Bearer tok-1');
    expect(apiInit.headers['User-Agent']).toBe('isabelle-tests');
  });

  it('reuses a cached token across calls', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(tokenBody('tok-1')))
      // A Response body can only be read once, so build a fresh one per call.
      .mockImplementation(async () => jsonResponse(stickyBody('anything')));

    await reddit.getSticky('MadeInAbyss', 1);
    await reddit.getSticky('MadeInAbyss', 2);

    const tokenCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('access_token'));
    expect(tokenCalls).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('fetches a new token once the old one is about to expire', async () => {
    vi.useFakeTimers();
    try {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(tokenBody('tok-1', 3600)))
        .mockResolvedValueOnce(jsonResponse(stickyBody('a')))
        .mockResolvedValueOnce(jsonResponse(tokenBody('tok-2', 3600)))
        .mockResolvedValueOnce(jsonResponse(stickyBody('b')));

      await reddit.getSticky('MadeInAbyss', 1);
      // Tokens are refreshed 60s before expiry.
      vi.advanceTimersByTime((3600 - 60) * 1000 + 1);
      await reddit.getSticky('MadeInAbyss', 1);

      expect(fetchMock.mock.calls[3][1].headers.Authorization).toBe('Bearer tok-2');
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns null when the subreddit has no sticky in that slot (404)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(tokenBody()))
      .mockResolvedValueOnce(jsonResponse({ message: 'Not Found', error: 404 }, 404));

    await expect(reddit.getSticky('MadeInAbyss', 2)).resolves.toBeNull();
  });

  it('returns null for an empty listing', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(tokenBody()))
      .mockResolvedValueOnce(jsonResponse([{ data: { children: [] } }]));

    await expect(reddit.getSticky('MadeInAbyss', 1)).resolves.toBeNull();
  });

  it('throws a descriptive error when authentication fails', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'invalid_grant' }, 401));

    await expect(reddit.getSticky('MadeInAbyss', 1)).rejects.toThrow(/Reddit auth failed: 401/);
    expect(fetchMock).toHaveBeenCalledOnce(); // never reaches the API
  });

  it('throws a descriptive error on other API failures', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(tokenBody()))
      .mockResolvedValueOnce(jsonResponse({ message: 'Too Many Requests' }, 429));

    await expect(reddit.getSticky('MadeInAbyss', 1)).rejects.toThrow(/Reddit request failed: 429/);
  });
});
