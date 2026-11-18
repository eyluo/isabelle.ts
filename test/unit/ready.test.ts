import { describe, expect, it, vi } from 'vitest';
import { Events } from 'discord.js';
import * as ready from '../../src/events/ready';

describe('ready', () => {
  it('runs once on ClientReady and logs the bot tag', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    ready.execute({ user: { tag: 'Isabelle#0001' } } as any);

    expect(ready.name).toBe(Events.ClientReady);
    expect(ready.once).toBe(true);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Isabelle#0001'));
  });
});
