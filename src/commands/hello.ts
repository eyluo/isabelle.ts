import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('hello')
  .setDescription('Command placeholder!');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply('hello!');
}
