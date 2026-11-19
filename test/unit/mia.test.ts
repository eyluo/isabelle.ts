import { ChannelType } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MangaDexChapter } from '../../src/util/mangadex';
import { makeConfig, makeInteraction } from '../helpers';

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

let execute: typeof import('../../src/commands/mia').execute;

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

function makeMiaChannel(type = ChannelType.GuildText) {
  return {
    type,
    send: vi.fn(async () => ({})),
    threads: { create: vi.fn(async () => ({})) },
  };
}

describe('/mia', () => {
  beforeEach(async () => {
    vi.resetModules();
    loadConfig.mockReset();
    saveConfig.mockReset();
    getLatestChapters.mockReset();
    loadConfig.mockReturnValue(makeConfig({ latestChapter: 74 }));
    ({ execute } = await import('../../src/commands/mia'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defers before calling MangaDex, to stay inside the 3s reply window', async () => {
    getLatestChapters.mockResolvedValue([]);
    const interaction = makeInteraction();

    await execute(interaction as any);

    expect(interaction.deferReply).toHaveBeenCalledOnce();
    expect(interaction.deferReply.mock.invocationCallOrder[0])
      .toBeLessThan(getLatestChapters.mock.invocationCallOrder[0]);
  });

  it('announces the chapter with mentions disabled, opens a thread, and bumps latestChapter', async () => {
    getLatestChapters.mockResolvedValue([chapter(74, { title: 'Just that' })]);
    const channel = makeMiaChannel();
    const interaction = makeInteraction({ channels: new Map([['mia-channel', channel]]) });

    await execute(interaction as any);

    expect(interaction.editReply).toHaveBeenCalledExactlyOnceWith({
      content: 'Chapter 74 (Just that) available! Link here: https://mangadex.org/chapter/id-74',
      allowedMentions: { parse: [] },
    });
    expect(interaction.followUp).not.toHaveBeenCalled();
    expect(channel.send).not.toHaveBeenCalled();
    expect(channel.threads.create).toHaveBeenCalledExactlyOnceWith({
      name: 'Made in Abyss Chapter 74 Discussion',
    });
    expect(saveConfig).toHaveBeenCalledOnce();
    expect(saveConfig.mock.calls[0][0].data.madeInAbyss.latestChapter).toBe(75);
  });

  it('chunks large catch-up replies across editReply and followUp within 2000 chars', async () => {
    loadConfig.mockReturnValue(makeConfig({ latestChapter: 1 }));
    // 25 chapters with ~100-char titles easily exceed Discord's 2000-char limit.
    const manyChapters = Array.from({ length: 25 }, (_, i) =>
      chapter(i + 1, { title: `Long Chapter Title Number ${i + 1} ${'x'.repeat(60)}` }),
    );
    getLatestChapters.mockResolvedValue(manyChapters);
    const channel = makeMiaChannel();
    const interaction = makeInteraction({ channels: new Map([['mia-channel', channel]]) });

    await execute(interaction as any);

    expect(interaction.editReply).toHaveBeenCalledOnce();
    expect(interaction.followUp).toHaveBeenCalled();
    const allPayloads = [
      interaction.editReply.mock.calls[0][0],
      ...interaction.followUp.mock.calls.map((c) => c[0]),
    ] as Array<{ content: string; allowedMentions: { parse: string[] } }>;
    for (const payload of allPayloads) {
      expect(payload.content.length).toBeLessThanOrEqual(2000);
      expect(payload.allowedMentions).toEqual({ parse: [] });
    }
    expect(allPayloads.map((p) => p.content).join('\n').split('\n')).toHaveLength(25);
    expect(saveConfig).toHaveBeenCalledOnce();
    expect(saveConfig.mock.calls[0][0].data.madeInAbyss.latestChapter).toBe(26);
  });

  it('persists latestChapter and attempts remaining threads even if thread creation fails', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    getLatestChapters.mockResolvedValue([chapter(75), chapter(74)]);
    const channel = makeMiaChannel();
    channel.threads.create
      .mockRejectedValueOnce(new Error('Missing Permissions'))
      .mockResolvedValueOnce({});
    const interaction = makeInteraction({ channels: new Map([['mia-channel', channel]]) });

    await execute(interaction as any);

    expect(saveConfig).toHaveBeenCalledOnce();
    expect(saveConfig.mock.calls[0][0].data.madeInAbyss.latestChapter).toBe(76);
    expect(channel.threads.create).toHaveBeenCalledTimes(2);
    expect(err).toHaveBeenCalledWith(
      '[mia] Failed to create discussion thread for chapter 74:',
      expect.any(Error),
    );
  });

  it('omits parentheses when a chapter has no title', async () => {
    getLatestChapters.mockResolvedValue([chapter(74, { title: null })]);
    const interaction = makeInteraction({ channels: new Map([['mia-channel', makeMiaChannel()]]) });

    await execute(interaction as any);

    expect(interaction.editReply).toHaveBeenCalledExactlyOnceWith({
      content: 'Chapter 74 available! Link here: https://mangadex.org/chapter/id-74',
      allowedMentions: { parse: [] },
    });
  });

  it('sends an FYI without opening a thread for new non-integer chapters, and persists announcedExtras', async () => {
    loadConfig.mockReturnValue(makeConfig({ latestChapter: 75 }));
    getLatestChapters.mockResolvedValue([
      chapter(74.5, { title: 'Volume Extras' }),
      chapter(74, { title: 'Just that' }),
    ]);
    const channel = makeMiaChannel();
    const interaction = makeInteraction({ channels: new Map([['mia-channel', channel]]) });

    await execute(interaction as any);

    expect(interaction.editReply).toHaveBeenCalledExactlyOnceWith({
      content: 'FYI: Extra chapter 74.5 (Volume Extras) available! Link here: https://mangadex.org/chapter/id-74.5',
      allowedMentions: { parse: [] },
    });
    expect(channel.threads.create).not.toHaveBeenCalled();
    expect(saveConfig).toHaveBeenCalledOnce();
    expect(saveConfig.mock.calls[0][0].data.madeInAbyss.latestChapter).toBe(75);
    expect(saveConfig.mock.calls[0][0].data.madeInAbyss.announcedExtras).toEqual([74.5]);
  });

  it('announces mainline + extra chapters together in /mia but only opens threads for mainline', async () => {
    getLatestChapters.mockResolvedValue([
      chapter(74.5, { title: 'Volume Extras' }),
      chapter(74, { title: 'Just that' }),
    ]);
    const channel = makeMiaChannel();
    const interaction = makeInteraction({ channels: new Map([['mia-channel', channel]]) });

    await execute(interaction as any);

    expect(interaction.editReply).toHaveBeenCalledExactlyOnceWith({
      content: [
        'Chapter 74 (Just that) available! Link here: https://mangadex.org/chapter/id-74',
        'FYI: Extra chapter 74.5 (Volume Extras) available! Link here: https://mangadex.org/chapter/id-74.5',
      ].join('\n'),
      allowedMentions: { parse: [] },
    });
    expect(channel.threads.create).toHaveBeenCalledExactlyOnceWith({
      name: 'Made in Abyss Chapter 74 Discussion',
    });
    expect(saveConfig).toHaveBeenCalledOnce();
    expect(saveConfig.mock.calls[0][0].data.madeInAbyss.latestChapter).toBe(75);
    expect(saveConfig.mock.calls[0][0].data.madeInAbyss.announcedExtras).toEqual([74.5]);
  });

  it('reports not available (and saves nothing) when only older or already-announced extra chapters exist', async () => {
    loadConfig.mockReturnValue(makeConfig({ latestChapter: 75, announcedExtras: [74.5] }));
    getLatestChapters.mockResolvedValue([
      chapter(74.5, { title: 'Volume Extras' }),
      chapter(74, { title: 'Just that' }),
    ]);
    const interaction = makeInteraction();

    await execute(interaction as any);

    expect(interaction.editReply).toHaveBeenCalledExactlyOnceWith('Chapter 75 is not available yet...');
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', undefined],
    ['not a text channel', makeMiaChannel(ChannelType.GuildVoice)],
  ])('still announces and saves when the discussion channel is %s', async (_label, channel) => {
    getLatestChapters.mockResolvedValue([chapter(74)]);
    const channels = new Map(channel ? [['mia-channel', channel]] : []);
    const interaction = makeInteraction({ channels });

    await execute(interaction as any);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Chapter 74') }),
    );
    expect(saveConfig).toHaveBeenCalledOnce();
    if (channel) expect(channel.threads.create).not.toHaveBeenCalled();
  });

  it('lets MangaDex errors propagate so interactionCreate can report them', async () => {
    getLatestChapters.mockRejectedValue(new Error('MangaDex request failed: 503'));
    await expect(execute(makeInteraction() as any)).rejects.toThrow('503');
    expect(saveConfig).not.toHaveBeenCalled();
  });
});
