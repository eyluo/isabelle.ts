import { MessageFlags } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { execute } from '../../src/events/interactionCreate';
import { makeInteraction } from '../helpers';

function withCommand(execute: (i: any) => Promise<void>, commandName = 'ping') {
  const interaction = makeInteraction({ commandName });
  interaction.client.commands.set(commandName, { data: { name: commandName }, execute });
  return interaction;
}

const ephemeralError = {
  content: 'There was an error while executing this command!',
  flags: MessageFlags.Ephemeral,
};

describe('interactionCreate', () => {
  it('routes a slash command to its handler', async () => {
    const handler = vi.fn(async () => {});
    const interaction = withCommand(handler);

    await execute(interaction as any);

    expect(handler).toHaveBeenCalledExactlyOnceWith(interaction);
  });

  it('ignores interactions that are not slash commands (buttons, menus, ...)', async () => {
    const handler = vi.fn(async () => {});
    const interaction = withCommand(handler);
    interaction.isChatInputCommand = () => false;

    await execute(interaction as any);

    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores unknown commands without replying', async () => {
    const interaction = makeInteraction({ commandName: 'does-not-exist' });

    await execute(interaction as any);

    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('replies with an ephemeral error when a command throws before replying', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const interaction = withCommand(async () => {
      throw new Error('boom');
    });

    await execute(interaction as any);

    expect(interaction.reply).toHaveBeenCalledExactlyOnceWith(ephemeralError);
    expect(interaction.followUp).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it('follows up instead of replying when the command already deferred', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const interaction = withCommand(async (i) => {
      await i.deferReply();
      throw new Error('boom after defer');
    });

    await execute(interaction as any);

    // A second reply() on a deferred interaction would itself throw.
    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalledExactlyOnceWith(ephemeralError);
  });
});
