import { Interaction } from 'discord.js';
import { IsabelleClient } from '../types';

export const name = 'interactionCreate';

export async function execute(interaction: Interaction): Promise<void> {
  if (!interaction.isCommand()) return;

  const client = interaction.client as IsabelleClient;
  const command = client.commands.get(interaction.commandName);

  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error executing /${interaction.commandName}:`, error);
    const reply = {
      content: 'There was an error while executing this command!',
      ephemeral: true,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
}
