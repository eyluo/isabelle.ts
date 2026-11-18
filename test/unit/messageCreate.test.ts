import { describe, expect, it } from 'vitest';
import { execute } from '../../src/events/messageCreate';
import { makeMessage } from '../helpers';

describe('messageCreate (Ozen auto-reply)', () => {
  it.each([
    'ozen',
    'I love Ozen',
    'OZEN!!!',
    'have you seen ozen the immovable?', // partial title doesn't count
  ])('scolds a user who says %j', async (content) => {
    const message = makeMessage(content);
    await execute(message as any);
    expect(message.reply).toHaveBeenCalledOnce();
    expect(message.reply).toHaveBeenCalledWith(expect.stringContaining('<@user>'));
    expect(message.reply).toHaveBeenCalledWith(expect.stringContaining('Ozen the Immovable Sovereign'));
  });

  it.each([
    'Ozen the Immovable Sovereign is the best',
    'OZEN THE IMMOVABLE SOVEREIGN',
    'nothing to see here',
    '',
  ])('stays quiet for %j', async (content) => {
    const message = makeMessage(content);
    await execute(message as any);
    expect(message.reply).not.toHaveBeenCalled();
  });

  it('ignores bots, so it cannot loop on its own reply', async () => {
    const message = makeMessage('ozen', { bot: true });
    await execute(message as any);
    expect(message.reply).not.toHaveBeenCalled();
  });
});
