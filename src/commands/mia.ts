import { ChannelType, ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { loadConfig, saveConfig } from '../config';
import { getSticky } from '../util/reddit';

export const data = new SlashCommandBuilder()
  .setName('mia')
  .setDescription('Checks on the newest chapter of Made in Abyss');

/**
 * Checks if any stickied posts on r/MadeInAbyss contain the next
 * chapter number. If found, posts a link and creates a discussion thread.
 */
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  // Reddit calls can exceed Discord's 3-second reply window, so defer first.
  await interaction.deferReply();

  const config = loadConfig();
  const chapterToCheck = config.data.madeInAbyss.latestChapter;

  for (const slot of [1, 2] as const) {
    const stickyPost = await getSticky('MadeInAbyss', slot);
    if (!stickyPost?.title.includes(chapterToCheck.toString())) continue;

    await interaction.editReply(
      `Chapter ${chapterToCheck} available! Link here: ${stickyPost.url}`
    );

    // Create a discussion thread in the designated channel
    const miaChannel = interaction.guild?.channels.cache.get(
      config.data.madeInAbyss.channelID
    );
    if (miaChannel?.type === ChannelType.GuildText) {
      await miaChannel.threads.create({
        name: `Made in Abyss Chapter ${chapterToCheck} Discussion`,
      });
    }

    // Persist the updated chapter number
    config.data.madeInAbyss.latestChapter++;
    saveConfig(config);
    return;
  }

  await interaction.editReply(`Chapter ${chapterToCheck} is not available yet...`);
}
