import { describe, expect, it, vi } from 'vitest';
import { Events } from 'discord.js';

vi.mock('../../src/util/mia', () => ({ startMiaPoller: vi.fn() }));

import { startMiaPoller } from '../../src/util/mia';
import * as ready from '../../src/events/ready';

describe('ready', () => {
  it('runs once on ClientReady, logs the bot tag, and starts the MIA poller', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const client = { user: { tag: 'Isabelle#0001' } } as any;

    ready.execute(client);

    expect(ready.name).toBe(Events.ClientReady);
    expect(ready.once).toBe(true);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Isabelle#0001'));
    expect(startMiaPoller).toHaveBeenCalledExactlyOnceWith(client);
  });
});
