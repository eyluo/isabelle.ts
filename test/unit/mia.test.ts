import { ChannelType } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeConfig, makeInteraction } from '../helpers';

vi.mock('../../src/config', () => ({ loadConfig: vi.fn(), saveConfig: vi.fn() }));
vi.mock('../../src/util/reddit', () => ({ getSticky: vi.fn() }));

import { loadConfig, saveConfig } from '../../src/config';
import { getSticky } from '../../src/util/reddit';
import { execute } from '../../src/commands/mia';

const post = (title: string) => ({ title, url: `https://example.com/${encodeURIComponent(title)}`, permalink: '/r/x' });

function makeMiaChannel(type = ChannelType.GuildText) {
  return { type, threads: { create: vi.fn(async () => ({})) } };
}

describe('/mia', () => {
  beforeEach(() => {
    // Drop any queued mockResolvedValueOnce results from the previous test.
    vi.mocked(getSticky).mockReset();
    vi.mocked(loadConfig).mockReturnValue(makeConfig({ latestChapter: 62 }));
  });

  it('defers before calling Reddit, to stay inside the 3s reply window', async () => {
    vi.mocked(getSticky).mockResolvedValue(null);
    const interaction = makeInteraction();
    await execute(interaction as any);

    expect(interaction.deferReply).toHaveBeenCalledOnce();
    expect(interaction.deferReply.mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(getSticky).mock.invocationCallOrder[0]);
  });

  it('announces the chapter, opens a thread and bumps latestChapter when found', async () => {
    vi.mocked(getSticky).mockResolvedValueOnce(post('Chapter 62 is out!'));
    const channel = makeMiaChannel();
    const interaction = makeInteraction({ channels: new Map([['mia-channel', channel]]) });

    await execute(interaction as any);

    expect(interaction.editReply).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(/^Chapter 62 available! Link here: https:\/\/example\.com\//),
    );
    expect(channel.threads.create).toHaveBeenCalledExactlyOnceWith({
      name: 'Made in Abyss Chapter 62 Discussion',
    });
    expect(saveConfig).toHaveBeenCalledOnce();
    expect(vi.mocked(saveConfig).mock.calls[0][0].data.madeInAbyss.latestChapter).toBe(63);
    // Found in the first sticky, so the second is never requested.
    expect(getSticky).toHaveBeenCalledExactlyOnceWith('MadeInAbyss', 1);
  });

  it('checks the second sticky when the first does not match', async () => {
    vi.mocked(getSticky)
      .mockResolvedValueOnce(post('Weekly discussion thread'))
      .mockResolvedValueOnce(post('Chapter 62'));
    const interaction = makeInteraction({ channels: new Map([['mia-channel', makeMiaChannel()]]) });

    await execute(interaction as any);

    expect(getSticky).toHaveBeenNthCalledWith(2, 'MadeInAbyss', 2);
    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('Chapter 62 available!'));
    expect(saveConfig).toHaveBeenCalledOnce();
  });

  it('reports not available (and saves nothing) when no sticky matches', async () => {
    vi.mocked(getSticky).mockResolvedValue(post('Chapter 61 discussion'));
    const interaction = makeInteraction();

    await execute(interaction as any);

    expect(interaction.editReply).toHaveBeenCalledExactlyOnceWith('Chapter 62 is not available yet...');
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it('handles a subreddit with no stickies', async () => {
    vi.mocked(getSticky).mockResolvedValue(null);
    const interaction = makeInteraction();

    await execute(interaction as any);

    expect(interaction.editReply).toHaveBeenCalledWith('Chapter 62 is not available yet...');
  });

  it.each([
    ['missing', undefined],
    ['not a text channel', makeMiaChannel(ChannelType.GuildVoice)],
  ])('still announces and saves when the discussion channel is %s', async (_label, channel) => {
    vi.mocked(getSticky).mockResolvedValueOnce(post('Chapter 62'));
    const channels = new Map(channel ? [['mia-channel', channel]] : []);
    const interaction = makeInteraction({ channels });

    await execute(interaction as any);

    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('available!'));
    expect(saveConfig).toHaveBeenCalledOnce();
    if (channel) expect(channel.threads.create).not.toHaveBeenCalled();
  });

  it('lets Reddit errors propagate so interactionCreate can report them', async () => {
    vi.mocked(getSticky).mockRejectedValue(new Error('Reddit request failed: 503'));
    await expect(execute(makeInteraction() as any)).rejects.toThrow('503');
    expect(saveConfig).not.toHaveBeenCalled();
  });
});
