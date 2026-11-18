import { describe, expect, it } from 'vitest';
import * as ping from '../../src/commands/ping';
import * as hello from '../../src/commands/hello';
import { makeInteraction } from '../helpers';

describe.each([
  { command: ping, name: 'ping', reply: 'Pong!' },
  { command: hello, name: 'hello', reply: 'hello!' },
])('/$name', ({ command, name, reply }) => {
  it('is registered under the expected name', () => {
    expect(command.data.name).toBe(name);
  });

  it(`replies ${JSON.stringify(reply)}`, async () => {
    const interaction = makeInteraction({ commandName: name });
    await command.execute(interaction as any);
    expect(interaction.reply).toHaveBeenCalledExactlyOnceWith(reply);
  });
});
