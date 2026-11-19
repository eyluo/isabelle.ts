import { ChannelType } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MangaDexChapter } from '../../src/util/mangadex';
import { makeConfig } from '../helpers';

const { loadConfig, saveConfig, getLatestChapters } = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  getLatestChapters: vi.fn(),
}));

vi.mock('../../src/config', () => ({ loadConfig, saveConfig }));
vi.mock('../../src/util/mangadex', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/util/mangadex')>();
  return { ...actual, getLatestChapters };
});

let mia: typeof import('../../src/util/mia');

const chapter = (
  num: number,
  overrides: Partial<MangaDexChapter> = {},
): MangaDexChapter => ({
  id: `id-${num}`,
  chapter: num,
  title: `Title ${num}`,
  volume: '15',
  url: `https://mangadex.org/chapter/id-${num}`,
  publishAt: '2026-08-21T07:00:00+00:00',
  ...overrides,
});

function makeTextChannel(type = ChannelType.GuildText) {
  return {
    type,
    send: vi.fn(async () => ({})),
    threads: { create: vi.fn(async () => ({})) },
  };
}

function makeFakeClient(channel?: unknown, { rejectFetch = false } = {}) {
  return {
    channels: {
      fetch: vi.fn(async () => {
        if (rejectFetch) throw new Error('Unknown Channel');
        return channel ?? null;
      }),
    },
  } as any;
}

beforeEach(async () => {
  vi.resetModules();
  loadConfig.mockReset();
  saveConfig.mockReset();
  getLatestChapters.mockReset();
  loadConfig.mockReturnValue(makeConfig({ latestChapter: 74 }));
  mia = await import('../../src/util/mia');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('formatChapterAnnouncement & chunkMessages', () => {
  it('truncates only overly long titles while preserving the chapter URL', () => {
    const ch = chapter(74, { title: 'A'.repeat(2500) });
    const formatted = mia.formatChapterAnnouncement(ch);
    expect(formatted.length).toBeLessThanOrEqual(mia.DISCORD_MAX_MESSAGE_LENGTH);
    expect(formatted).toContain('…');
    expect(formatted.endsWith(ch.url)).toBe(true);
  });

  it('drops the title when the URL alone leaves no room for one', () => {
    const ch = chapter(74, { title: 'Hello', url: `https://example.com/${'x'.repeat(1980)}` });
    const formatted = mia.formatChapterAnnouncement(ch);
    expect(formatted).toBe(`Chapter 74 available! Link here: ${ch.url}`);
  });

  it('chunks multiple messages and clamps any individual message exceeding maxLength', () => {
    expect(mia.chunkMessages(['aaa', 'bbb', 'ccccccc'], 6)).toEqual(['aaa', 'bbb', 'ccccc…']);
    expect(mia.chunkMessages(['ccccccc'], 6)).toEqual(['ccccc…']);
    expect(mia.chunkMessages(['a', 'b', 'c'], 6)).toEqual(['a\nb\nc']);
    expect(mia.chunkMessages([], 6)).toEqual([]);
  });
});

describe('checkAndAnnounceMia (proactive mode)', () => {
  it('sends announcements in ascending order with mentions disabled, creates threads, and persists latestChapter', async () => {
    getLatestChapters.mockResolvedValue([
      chapter(75, { title: 'Next' }),
      chapter(74, { title: 'Just that' }),
      chapter(73, { title: 'Old' }),
    ]);
    const channel = makeTextChannel();
    const client = makeFakeClient(channel);

    const result = await mia.checkAndAnnounceMia(client);

    expect(result.expectedChapter).toBe(74);
    expect(result.chapters.map((c) => c.chapter)).toEqual([74, 75]);
    expect(channel.send).toHaveBeenNthCalledWith(1, {
      content: 'Chapter 74 (Just that) available! Link here: https://mangadex.org/chapter/id-74',
      allowedMentions: { parse: [] },
    });
    expect(channel.send).toHaveBeenNthCalledWith(2, {
      content: 'Chapter 75 (Next) available! Link here: https://mangadex.org/chapter/id-75',
      allowedMentions: { parse: [] },
    });
    expect(channel.threads.create).toHaveBeenNthCalledWith(1, {
      name: 'Made in Abyss Chapter 74 Discussion',
    });
    expect(channel.threads.create).toHaveBeenNthCalledWith(2, {
      name: 'Made in Abyss Chapter 75 Discussion',
    });
    expect(saveConfig).toHaveBeenCalledTimes(2);
    expect(saveConfig.mock.calls[1][0].data.madeInAbyss.latestChapter).toBe(76);
  });

  it('persists latestChapter and continues when thread creation fails in proactive mode', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const savedChapters: number[] = [];
    saveConfig.mockImplementation((cfg) => {
      savedChapters.push(cfg.data.madeInAbyss.latestChapter);
    });
    getLatestChapters.mockResolvedValue([chapter(75), chapter(74)]);
    const channel = makeTextChannel();
    channel.threads.create
      .mockRejectedValueOnce(new Error('Missing CreatePublicThreads'))
      .mockResolvedValueOnce({});

    await mia.checkAndAnnounceMia(makeFakeClient(channel));

    expect(channel.send).toHaveBeenCalledTimes(2);
    expect(savedChapters).toEqual([75, 76]);
    expect(err).toHaveBeenCalledWith(
      '[mia] Failed to create discussion thread for chapter 74:',
      expect.any(Error),
    );
  });

  it('persists already-sent chapters if channel.send fails mid-batch', async () => {
    getLatestChapters.mockResolvedValue([chapter(75), chapter(74)]);
    const channel = makeTextChannel();
    channel.send
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('Discord 500'));

    await expect(mia.checkAndAnnounceMia(makeFakeClient(channel))).rejects.toThrow('Discord 500');

    expect(saveConfig).toHaveBeenCalledOnce();
    expect(saveConfig.mock.calls[0][0].data.madeInAbyss.latestChapter).toBe(75);
  });

  it('deduplicates multiple uploads using parsed timestamps across timezone offsets and invalid dates', async () => {
    // +09:00 at 15:00 equals 06:00Z, which is earlier than 07:00Z despite lexical string order.
    getLatestChapters.mockResolvedValue([
      chapter(74, { id: 'invalid', url: 'https://mangadex.org/chapter/invalid', publishAt: 'not-a-date' }),
      chapter(74, { id: 'utc', url: 'https://mangadex.org/chapter/utc', publishAt: '2026-08-21T07:00:00Z' }),
      chapter(74, { id: 'jst-earlier', url: 'https://mangadex.org/chapter/jst-earlier', publishAt: '2026-08-21T15:00:00+09:00' }),
      chapter(74, { id: 'also-invalid', url: 'https://mangadex.org/chapter/also-invalid', publishAt: '' }),
      chapter(74, { id: 'later', url: 'https://mangadex.org/chapter/later', publishAt: '2026-08-22T00:00:00+00:00' }),
    ]);
    const channel = makeTextChannel();

    await mia.checkAndAnnounceMia(makeFakeClient(channel));

    expect(channel.send).toHaveBeenCalledExactlyOnceWith({
      content: expect.stringContaining('https://mangadex.org/chapter/jst-earlier'),
      allowedMentions: { parse: [] },
    });
  });

  it('logs newer non-integer chapters once per process run and ignores older ones', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    loadConfig.mockReturnValue(makeConfig({ latestChapter: 75 }));
    getLatestChapters.mockResolvedValue([
      chapter(74.5, { id: 'extra-74-5', title: 'Volume Extras' }),
      chapter(74.7, { id: 'extra-74-7', title: null }),
      chapter(73.5, { id: 'old-extra', title: 'Old Extra' }),
    ]);
    const channel = makeTextChannel();
    const client = makeFakeClient(channel);

    await mia.checkAndAnnounceMia(client);
    await mia.checkAndAnnounceMia(client);

    expect(channel.send).not.toHaveBeenCalled();
    expect(saveConfig).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith(
      '[mia] Non-integer chapter 74.5 (Volume Extras) found: https://mangadex.org/chapter/id-74.5',
    );
    expect(log).toHaveBeenCalledWith(
      '[mia] Non-integer chapter 74.7 found: https://mangadex.org/chapter/id-74.7',
    );
  });

  it.each([
    ['NaN', Number.NaN],
    ['zero', 0],
    ['negative', -1],
    ['non-integer', 74.5],
    ['string', '74' as any],
  ])('throws on invalid latestChapter (%s) before calling MangaDex', async (_label, badChapter) => {
    loadConfig.mockReturnValue(makeConfig({ latestChapter: badChapter }));

    await expect(mia.checkAndAnnounceMia(makeFakeClient())).rejects.toThrow(
      /Invalid madeInAbyss\.latestChapter/,
    );
    expect(getLatestChapters).not.toHaveBeenCalled();
  });

  it('passes configured mangaID override to MangaDex', async () => {
    loadConfig.mockReturnValue(makeConfig({ latestChapter: 74, mangaID: 'custom-uuid' }));
    getLatestChapters.mockResolvedValue([]);

    await mia.checkAndAnnounceMia(makeFakeClient());

    expect(getLatestChapters).toHaveBeenCalledExactlyOnceWith('custom-uuid');
  });

  it.each([
    ['missing', undefined, false],
    ['not a text channel', makeTextChannel(ChannelType.GuildVoice), false],
    ['fetch throws', undefined, true],
  ])('warns and does not advance latestChapter when proactive channel is %s', async (_label, channel, rejectFetch) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    getLatestChapters.mockResolvedValue([chapter(74)]);

    const result = await mia.checkAndAnnounceMia(makeFakeClient(channel, { rejectFetch }));

    expect(result.chapters).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('skipping proactive announcement'));
    if (rejectFetch) {
      expect(warn).toHaveBeenCalledWith(
        '[mia] Failed to fetch channel mia-channel:',
        expect.any(Error),
      );
    }
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it('serializes concurrent checks so a poll and /mia cannot double-post', async () => {
    let currentConfig = makeConfig({ latestChapter: 74 });
    loadConfig.mockImplementation(() => structuredClone(currentConfig));
    saveConfig.mockImplementation((next) => {
      currentConfig = structuredClone(next);
    });

    let releaseFirstFetch!: () => void;
    getLatestChapters
      .mockImplementationOnce(
        () =>
          new Promise<MangaDexChapter[]>((resolve) => {
            releaseFirstFetch = () => resolve([chapter(74)]);
          }),
      )
      .mockResolvedValueOnce([chapter(74)]);

    const channel = makeTextChannel();
    const client = makeFakeClient(channel);

    const first = mia.checkAndAnnounceMia(client);
    const second = mia.checkAndAnnounceMia(client);

    await Promise.resolve();
    releaseFirstFetch();

    const [res1, res2] = await Promise.all([first, second]);

    expect(res1.chapters.map((c) => c.chapter)).toEqual([74]);
    expect(res2.chapters).toEqual([]);
    expect(channel.send).toHaveBeenCalledOnce();
    expect(channel.threads.create).toHaveBeenCalledOnce();
  });

  it('recovers the serialization lock after an error', async () => {
    getLatestChapters
      .mockRejectedValueOnce(new Error('transient 503'))
      .mockResolvedValueOnce([]);

    const client = makeFakeClient();
    await expect(mia.checkAndAnnounceMia(client)).rejects.toThrow('transient 503');
    await expect(mia.checkAndAnnounceMia(client)).resolves.toEqual({
      expectedChapter: 74,
      chapters: [],
    });
  });
});

describe('startMiaPoller', () => {
  it('checks immediately on startup and repeats daily (every 24h) by default', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    getLatestChapters.mockResolvedValue([]);
    const client = makeFakeClient();

    const stop = mia.startMiaPoller(client);
    await vi.advanceTimersByTimeAsync(0);
    expect(getLatestChapters).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(getLatestChapters).toHaveBeenCalledTimes(2);

    stop();
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(getLatestChapters).toHaveBeenCalledTimes(2);
  });

  it('chunks intervals larger than 24.85 days without 32-bit timer overflow', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    loadConfig.mockReturnValue(makeConfig({ pollIntervalHours: 720 })); // 30 days
    getLatestChapters.mockResolvedValue([]);

    const stop = mia.startMiaPoller(makeFakeClient());
    await vi.advanceTimersByTimeAsync(0);
    expect(getLatestChapters).toHaveBeenCalledTimes(1);

    // After 25 days (past 32-bit max), it must NOT have fired early.
    await vi.advanceTimersByTimeAsync(25 * 24 * 60 * 60 * 1000);
    expect(getLatestChapters).toHaveBeenCalledTimes(1);

    // After the remaining 5 days (30 days total), it fires once.
    await vi.advanceTimersByTimeAsync(5 * 24 * 60 * 60 * 1000);
    expect(getLatestChapters).toHaveBeenCalledTimes(2);
    stop();
  });

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['non-number string', 'daily' as any],
  ])('warns and falls back to 24h when pollIntervalHours is %s', async (_label, badValue) => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    loadConfig.mockReturnValue(makeConfig({ pollIntervalHours: badValue }));
    getLatestChapters.mockResolvedValue([]);

    const stop = mia.startMiaPoller(makeFakeClient());
    await vi.advanceTimersByTimeAsync(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Invalid pollIntervalHours'));
    expect(getLatestChapters).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(getLatestChapters).toHaveBeenCalledTimes(2);
    stop();
  });

  it.each([0, -5])('disables polling when pollIntervalHours is %s', async (hours) => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    loadConfig.mockReturnValue(makeConfig({ pollIntervalHours: hours }));

    const stop = mia.startMiaPoller(makeFakeClient());
    await vi.advanceTimersByTimeAsync(48 * 60 * 60 * 1000);

    expect(getLatestChapters).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('disabled'));
    stop();
  });

  it('does not schedule another poll if stop() is called while a poll is in flight', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    let resolveFetch!: () => void;
    getLatestChapters.mockImplementationOnce(
      () => new Promise<MangaDexChapter[]>((resolve) => {
        resolveFetch = () => resolve([]);
      }),
    );

    const stop = mia.startMiaPoller(makeFakeClient());
    await Promise.resolve();
    stop();
    resolveFetch();
    await vi.advanceTimersByTimeAsync(48 * 60 * 60 * 1000);

    expect(getLatestChapters).toHaveBeenCalledTimes(1);
  });

  it('logs and swallows errors during scheduled polls so the bot stays up', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    getLatestChapters.mockRejectedValue(new Error('network down'));

    const stop = mia.startMiaPoller(makeFakeClient());
    await vi.advanceTimersByTimeAsync(0);

    expect(err).toHaveBeenCalledWith(
      '[mia] Scheduled chapter check failed:',
      expect.any(Error),
    );
    stop();
  });
});
