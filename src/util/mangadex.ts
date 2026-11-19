/**
 * Minimal unauthenticated MangaDex API client using built-in fetch.
 *
 * Public catalogue endpoints (such as GET /manga/{id}/feed) do not require
 * authentication; MangaDex only asks for a descriptive User-Agent header.
 */

const API_BASE = 'https://api.mangadex.org';
const CHAPTER_WEB_BASE = 'https://mangadex.org/chapter';
const USER_AGENT = 'isabelle.ts discord bot';
const MAX_ERROR_BODY_LENGTH = 500;
const STRICT_CHAPTER_RE = /^\d+(?:\.\d+)?$/;

/** Default fetch timeout so stalled requests cannot block /mia or scheduled polls. */
export const MANGADEX_TIMEOUT_MS = 15_000;

/** MangaDex UUID for Made in Abyss (Tsukushi Akihito). */
export const MADE_IN_ABYSS_MANGA_ID = '80422e14-b9ad-4fda-970f-de370d5fa4e5';

export interface MangaDexChapter {
  id: string;
  chapter: number;
  title: string | null;
  volume: string | null;
  url: string;
  publishAt: string;
}

interface RawMangaDexFeedItem {
  id?: string;
  attributes?: {
    chapter?: string | null;
    title?: string | null;
    volume?: string | null;
    externalUrl?: string | null;
    publishAt?: string;
  };
}

interface RawMangaDexFeedResponse {
  data?: RawMangaDexFeedItem[];
}

/**
 * Fetches recent English chapters for a manga from the MangaDex feed,
 * ordered highest chapter number first.
 */
export async function getLatestChapters(
  mangaID: string = MADE_IN_ABYSS_MANGA_ID,
  limit: number = 100,
): Promise<MangaDexChapter[]> {
  const params = new URLSearchParams();
  params.append('translatedLanguage[]', 'en');
  params.set('order[chapter]', 'desc');
  params.set('limit', String(limit));
  params.set('includeFuturePublishAt', '0');
  params.set('includeEmptyPages', '0');
  params.set('includeFutureUpdates', '0');

  const encodedID = encodeURIComponent(mangaID.trim());
  const res = await fetch(`${API_BASE}/manga/${encodedID}/feed?${params}`, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(MANGADEX_TIMEOUT_MS),
  });

  if (!res.ok) {
    const rawBody = await res.text();
    const snippet =
      rawBody.length > MAX_ERROR_BODY_LENGTH
        ? `${rawBody.slice(0, MAX_ERROR_BODY_LENGTH)}…`
        : rawBody;
    throw new Error(`MangaDex request failed: ${res.status} ${snippet}`);
  }

  const body = (await res.json()) as RawMangaDexFeedResponse | null;
  if (!body || !Array.isArray(body.data)) {
    throw new Error('MangaDex response malformed: missing data array');
  }

  const chapters: MangaDexChapter[] = [];

  for (const item of body.data) {
    if (!item?.id || !item.attributes) continue;

    const rawChapter = item.attributes.chapter?.trim();
    if (!rawChapter || !STRICT_CHAPTER_RE.test(rawChapter)) continue;

    const chapterNum = Number(rawChapter);
    const title = item.attributes.title?.trim() || null;
    const externalUrl = item.attributes.externalUrl?.trim();

    chapters.push({
      id: item.id,
      chapter: chapterNum,
      title,
      volume: item.attributes.volume ?? null,
      url: externalUrl || `${CHAPTER_WEB_BASE}/${item.id}`,
      publishAt: item.attributes.publishAt ?? '',
    });
  }

  return chapters;
}
