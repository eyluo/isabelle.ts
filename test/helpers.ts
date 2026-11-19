import { vi } from 'vitest';
import type { BotConfig, BotState, MadeInAbyssState } from '../src/types';

/**
 * Shared test fixtures. discord.js objects are replaced by small fakes that
 * implement only what our code touches — no network, no login.
 */

export function makeConfig(overrides: Partial<BotConfig['data']['madeInAbyss']> = {}): BotConfig {
  return {
    auth: {
      discord: { token: 'fake-token', clientID: 'client-1', guildID: 'guild-1' },
    },
    data: {
      madeInAbyss: { channelID: 'mia-channel', ...overrides },
    },
  };
}

export function makeState(overrides: Partial<MadeInAbyssState> = {}): BotState {
  return {
    version: 1,
    madeInAbyss: {
      latestChapter: 74,
      announcedExtras: [],
      ...overrides,
    },
  };
}

/** Fake ChatInputCommandInteraction. Tracks replied/deferred like the real one. */
export function makeInteraction(opts: { commandName?: string; channels?: Map<string, unknown> } = {}) {
  const channels = opts.channels ?? new Map();
  const interaction = {
    commandName: opts.commandName ?? 'ping',
    replied: false,
    deferred: false,
    client: {
      commands: new Map(),
      channels: {
        fetch: vi.fn(async (id: string) => channels.get(id) ?? null),
      },
    },
    guild: { channels: { cache: channels } },
    isChatInputCommand: () => true,
    reply: vi.fn(async () => { interaction.replied = true; }),
    deferReply: vi.fn(async () => { interaction.deferred = true; }),
    editReply: vi.fn(async () => {}),
    followUp: vi.fn(async () => {}),
  };
  return interaction;
}

/** Fake Message for messageCreate. */
export function makeMessage(content: string, { bot = false } = {}) {
  return {
    content,
    author: { bot, toString: () => '<@user>' },
    reply: vi.fn(async () => {}),
  };
}

/** Minimal fetch Response stand-in. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
