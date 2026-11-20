import { ChannelType, Client, TextChannel } from 'discord.js';
import { loadConfig, saveConfig } from '../config';
import { getLatestChapters, MADE_IN_ABYSS_MANGA_ID, MangaDexChapter } from './mangadex';

/** Default background check cadence (once per day). */
export const DEFAULT_POLL_INTERVAL_HOURS = 24;
/** Discord's maximum message content length. */
export const DISCORD_MAX_MESSAGE_LENGTH = 2000;
const MS_PER_HOUR = 60 * 60 * 1000;
/** Maximum delay Node.js setTimeout accepts without 32-bit signed int overflow (~24.85 days). */
const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * Serializes chapter checks so a background poll and a manual /mia invocation
 * cannot race, double-post, or overwrite persisted chapter state.
 */
let pendingCheck: Promise<unknown> = Promise.resolve();

function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = pendingCheck.then(fn, fn);
  pendingCheck = run.catch(() => {});
  return run;
}

/**
 * Formats the announcement message for a released chapter, truncating only
 * the chapter title if needed to stay within Discord's 2000-character limit.
 * Non-integer / extra chapters are formatted as an FYI message.
 */
export function formatChapterAnnouncement(chapter: MangaDexChapter): string {
  const prefix = Number.isInteger(chapter.chapter)
    ? `Chapter ${chapter.chapter}`
    : `FYI: Extra chapter ${chapter.chapter}`;
  const suffix = ` available! Link here: ${chapter.url}`;
  if (!chapter.title) return `${prefix}${suffix}`;

  const maxTitleLength = DISCORD_MAX_MESSAGE_LENGTH - prefix.length - suffix.length - 3; // " ()"
  if (maxTitleLength <= 0) return `${prefix}${suffix}`;

  const title =
    chapter.title.length > maxTitleLength
      ? `${chapter.title.slice(0, maxTitleLength - 1)}…`
      : chapter.title;
  return `${prefix} (${title})${suffix}`;
}

/**
 * Groups announcement lines into chunks that each fit within Discord's
 * 2000-character message limit.
 */
export function chunkMessages(
  messages: string[],
  maxLength: number = DISCORD_MAX_MESSAGE_LENGTH,
): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const message of messages) {
    const candidate = current ? `${current}\n${message}` : message;
    if (candidate.length <= maxLength) {
      current = candidate;
    } else {
      if (current) chunks.push(current);
      current = message.length > maxLength ? `${message.slice(0, maxLength - 1)}…` : message;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

async function fetchMiaTextChannel(
  client: Client,
  channelID: string,
): Promise<TextChannel | null> {
  try {
    const channel = await client.channels.fetch(channelID);
    return channel?.type === ChannelType.GuildText ? channel : null;
  } catch (error) {
    console.warn(`[mia] Failed to fetch channel ${channelID}:`, error);
    return null;
  }
}

async function createDiscussionThreadSafely(
  channel: TextChannel,
  chapterNumber: number,
): Promise<void> {
  try {
    await channel.threads.create({
      name: `Made in Abyss Chapter ${chapterNumber} Discussion`,
    });
  } catch (error) {
    console.error(`[mia] Failed to create discussion thread for chapter ${chapterNumber}:`, error);
  }
}

function isEarlierPublish(candidate: string, existing: string): boolean {
  const candidateMs = Date.parse(candidate);
  const existingMs = Date.parse(existing);
  if (Number.isNaN(candidateMs)) return false;
  if (Number.isNaN(existingMs)) return true;
  return candidateMs < existingMs;
}

function parseAnnouncedExtras(raw: unknown): Set<number> {
  if (!Array.isArray(raw)) return new Set();
  return new Set(
    raw.filter(
      (n): n is number => typeof n === 'number' && Number.isFinite(n) && !Number.isInteger(n),
    ),
  );
}

/**
 * Filters a MangaDex chapter feed down to newly released chapters
 * (> nextChapter - 1), deduplicating multiple uploads of the same chapter
 * number by earliest publishAt and skipping already-announced extra chapters.
 * Returns mainline and extra chapters together sorted ascending by chapter number.
 */
function selectNewChapters(
  chapters: MangaDexChapter[],
  nextChapter: number,
  announcedExtras: ReadonlySet<number>,
): MangaDexChapter[] {
  const byNumber = new Map<number, MangaDexChapter>();

  for (const ch of chapters) {
    if (ch.chapter <= nextChapter - 1) continue;
    if (!Number.isInteger(ch.chapter) && announcedExtras.has(ch.chapter)) continue;

    // If multiple scanlation groups uploaded the same chapter, keep the earliest release.
    const existing = byNumber.get(ch.chapter);
    if (!existing || isEarlierPublish(ch.publishAt, existing.publishAt)) {
      byNumber.set(ch.chapter, ch);
    }
  }

  return [...byNumber.values()].sort((a, b) => a.chapter - b.chapter);
}

/** Updates miaConfig.announcedExtras, pruning extras now covered by latestChapter. */
function setPrunedExtras(
  miaConfig: { latestChapter: number; announcedExtras?: number[] },
  announcedExtras: ReadonlySet<number>,
): void {
  const remaining = [...announcedExtras]
    .filter((n) => n > miaConfig.latestChapter - 1)
    .sort((a, b) => a - b);
  if (remaining.length > 0) {
    miaConfig.announcedExtras = remaining;
  } else {
    delete miaConfig.announcedExtras;
  }
}

export interface MiaCheckResult {
  /** The mainline chapter number we were checking for before any update. */
  expectedChapter: number;
  /** Newly released chapters found (mainline and extras, sorted ascending). */
  chapters: MangaDexChapter[];
}

/**
 * Checks MangaDex for new Made in Abyss chapters, announces them (either via
 * the provided reply callback for /mia, or proactively in the configured
 * channel), persists state immediately after announcement, and opens discussion
 * threads for mainline integer chapters on a best-effort basis.
 */
export function checkAndAnnounceMia(
  client: Client,
  options: { onAnnounce?: (chapters: MangaDexChapter[]) => Promise<void> } = {},
): Promise<MiaCheckResult> {
  return serialize(async () => {
    const config = loadConfig();
    const miaConfig = config.data.madeInAbyss;
    const expectedChapter = miaConfig.latestChapter;

    if (
      typeof expectedChapter !== 'number' ||
      !Number.isInteger(expectedChapter) ||
      expectedChapter < 1
    ) {
      throw new Error(`Invalid madeInAbyss.latestChapter in config: ${String(expectedChapter)}`);
    }

    const announcedExtras = parseAnnouncedExtras(miaConfig.announcedExtras);
    const mangaID = miaConfig.mangaID ?? MADE_IN_ABYSS_MANGA_ID;
    const feed = await getLatestChapters(mangaID);
    const newChapters = selectNewChapters(feed, expectedChapter, announcedExtras);

    if (newChapters.length === 0) {
      return { expectedChapter, chapters: [] };
    }

    const channel = await fetchMiaTextChannel(client, miaConfig.channelID);

    if (options.onAnnounce) {
      // Interactive (/mia): reply first, persist immediately so thread errors cannot cause double-posts.
      await options.onAnnounce(newChapters);

      for (const ch of newChapters) {
        if (Number.isInteger(ch.chapter)) {
          miaConfig.latestChapter = ch.chapter + 1;
        } else {
          announcedExtras.add(ch.chapter);
        }
      }
      setPrunedExtras(miaConfig, announcedExtras);
      saveConfig(config);

      if (channel) {
        for (const ch of newChapters) {
          if (Number.isInteger(ch.chapter)) {
            await createDiscussionThreadSafely(channel, ch.chapter);
          }
        }
      }
    } else {
      // Proactive poll: require the target text channel so chapters aren't silently skipped.
      if (!channel) {
        console.warn(
          `[mia] Configured channel ${miaConfig.channelID} is missing or not a text channel; skipping proactive announcement.`,
        );
        return { expectedChapter, chapters: [] };
      }

      for (const ch of newChapters) {
        await channel.send({
          content: formatChapterAnnouncement(ch),
          allowedMentions: { parse: [] },
        });

        if (Number.isInteger(ch.chapter)) {
          miaConfig.latestChapter = ch.chapter + 1;
          setPrunedExtras(miaConfig, announcedExtras);
          saveConfig(config);
          await createDiscussionThreadSafely(channel, ch.chapter);
        } else {
          announcedExtras.add(ch.chapter);
          setPrunedExtras(miaConfig, announcedExtras);
          saveConfig(config);
        }
      }
    }

    return { expectedChapter, chapters: newChapters };
  });
}

function resolvePollIntervalHours(raw: unknown): number {
  if (raw === undefined) return DEFAULT_POLL_INTERVAL_HOURS;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    console.warn(
      `[mia] Invalid pollIntervalHours (${String(raw)}); defaulting to ${DEFAULT_POLL_INTERVAL_HOURS}h.`,
    );
    return DEFAULT_POLL_INTERVAL_HOURS;
  }
  return raw;
}

/**
 * Starts proactive background polling for new Made in Abyss chapters.
 * Runs one check immediately on startup, then schedules the next check
 * `pollIntervalHours` (defaults to 24h) after each run completes.
 * Set `pollIntervalHours: 0` in .env.json to disable.
 *
 * Uses chunked setTimeout calls so intervals longer than ~24.85 days do not
 * overflow Node.js's 32-bit timer limit. Returns a stop function.
 */
export function startMiaPoller(client: Client): () => void {
  const intervalHours = resolvePollIntervalHours(
    loadConfig().data.madeInAbyss.pollIntervalHours,
  );

  if (intervalHours <= 0) {
    console.log('[mia] Proactive chapter polling is disabled.');
    return () => {};
  }

  const intervalMs = intervalHours * MS_PER_HOUR;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  const scheduleAfter = (remainingMs: number) => {
    if (stopped) return;
    const delay = Math.min(remainingMs, MAX_TIMEOUT_MS);
    timer = setTimeout(() => {
      timer = null;
      const nextRemaining = remainingMs - delay;
      if (nextRemaining > 0) {
        scheduleAfter(nextRemaining);
      } else {
        void runAndReschedule();
      }
    }, delay);
    timer.unref();
  };

  const runAndReschedule = async () => {
    try {
      await checkAndAnnounceMia(client);
    } catch (error) {
      console.error('[mia] Scheduled chapter check failed:', error);
    } finally {
      scheduleAfter(intervalMs);
    }
  };

  console.log(`[mia] Polling MangaDex for new chapters every ${intervalHours}h.`);
  void runAndReschedule();

  return () => {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}
