import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('hello')
  .setDescription('Command placeholder!');

export async function execute(interaction: CommandInteraction): Promise<void> {
  await interaction.reply('hello!');
}
