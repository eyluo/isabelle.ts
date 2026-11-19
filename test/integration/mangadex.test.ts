import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getLatestChapters, MADE_IN_ABYSS_MANGA_ID } from '../../src/util/mangadex';
import { jsonResponse } from '../helpers';

function feedItem(
  id: string,
  overrides: Partial<{
    chapter: string | null;
    title: string | null;
    volume: string | null;
    externalUrl: string | null;
    publishAt: string;
  }> = {},
) {
  return {
    id,
    attributes: {
      chapter: '74',
      title: 'Just that',
      volume: '15',
      externalUrl: null,
      publishAt: '2026-08-21T07:21:48+00:00',
      ...overrides,
    },
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

describe('mangadex.getLatestChapters', () => {
  it('queries the unauthenticated MangaDex feed with expected params, User-Agent, and timeout signal', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          feedItem('ch-74-5', { chapter: '74.5', title: 'Volume Extras' }),
          feedItem('ch-74', { chapter: '74', title: 'Just that' }),
        ],
      }),
    );

    const chapters = await getLatestChapters();

    expect(chapters).toEqual([
      {
        id: 'ch-74-5',
        chapter: 74.5,
        title: 'Volume Extras',
        volume: '15',
        url: 'https://mangadex.org/chapter/ch-74-5',
        publishAt: '2026-08-21T07:21:48+00:00',
      },
      {
        id: 'ch-74',
        chapter: 74,
        title: 'Just that',
        volume: '15',
        url: 'https://mangadex.org/chapter/ch-74',
        publishAt: '2026-08-21T07:21:48+00:00',
      },
    ]);

    const [rawUrl, init] = fetchMock.mock.calls[0];
    const url = new URL(rawUrl);
    expect(url.origin).toBe('https://api.mangadex.org');
    expect(url.pathname).toBe(`/manga/${MADE_IN_ABYSS_MANGA_ID}/feed`);
    expect(url.searchParams.getAll('translatedLanguage[]')).toEqual(['en']);
    expect(url.searchParams.get('order[chapter]')).toBe('desc');
    expect(url.searchParams.get('limit')).toBe('100');
    expect(url.searchParams.get('includeFuturePublishAt')).toBe('0');
    expect(url.searchParams.get('includeEmptyPages')).toBe('0');
    expect(url.searchParams.get('includeFutureUpdates')).toBe('0');
    expect(init.headers['User-Agent']).toBe('isabelle.ts discord bot');
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('encodes custom manga IDs and respects custom limits', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }));

    await getLatestChapters(' custom/id ', 5);

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe('/manga/custom%2Fid/feed');
    expect(url.searchParams.get('limit')).toBe('5');
  });

  it('prefers non-blank externalUrl, falls back on blank externalUrl, and normalizes optional fields', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          feedItem('ch-ext', {
            chapter: '75',
            title: '   ',
            volume: null,
            externalUrl: '  https://example.com/official/75  ',
            publishAt: undefined as any,
          }),
          feedItem('ch-blank-ext', {
            chapter: '74',
            title: null,
            volume: null,
            externalUrl: '   ',
          }),
        ],
      }),
    );

    const chapters = await getLatestChapters();
    expect(chapters).toEqual([
      {
        id: 'ch-ext',
        chapter: 75,
        title: null,
        volume: null,
        url: 'https://example.com/official/75',
        publishAt: '',
      },
      {
        id: 'ch-blank-ext',
        chapter: 74,
        title: null,
        volume: null,
        url: 'https://mangadex.org/chapter/ch-blank-ext',
        publishAt: '2026-08-21T07:21:48+00:00',
      },
    ]);
  });

  it('skips entries with missing attributes or invalid/non-standard chapter strings', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          null,
          { id: 'no-attrs' },
          feedItem('null-ch', { chapter: null }),
          feedItem('empty-ch', { chapter: '  ' }),
          feedItem('nan-ch', { chapter: 'Extra' }),
          feedItem('sci-ch', { chapter: '1e2' }),
          feedItem('hex-ch', { chapter: '0x4b' }),
          feedItem('neg-ch', { chapter: '-5' }),
          feedItem('trailing-dot', { chapter: '74.' }),
          feedItem('valid-ch', { chapter: '74' }),
        ],
      }),
    );

    const chapters = await getLatestChapters();
    expect(chapters.map((c) => c.id)).toEqual(['valid-ch']);
  });

  it('throws a clear error when the response body is missing a data array', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ result: 'ok' }));

    await expect(getLatestChapters()).rejects.toThrow(/malformed: missing data array/);
  });

  it('throws a descriptive error on non-2xx responses and truncates huge bodies', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ result: 'error' }, 503));
    await expect(getLatestChapters()).rejects.toThrow(/MangaDex request failed: 503/);

    const hugeHtml = '<html>' + 'x'.repeat(1000) + '</html>';
    fetchMock.mockResolvedValueOnce(new Response(hugeHtml, { status: 502 }));
    await expect(getLatestChapters()).rejects.toThrow(/^MangaDex request failed: 502 .{500}…$/);
  });
});
