import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { checkAndAnnounceMia, chunkMessages, formatChapterAnnouncement } from '../util/mia';

export const data = new SlashCommandBuilder()
  .setName('mia')
  .setDescription('Checks on the newest chapter of Made in Abyss');

/**
 * Checks MangaDex for the next mainline chapter of Made in Abyss.
 * If found, posts a link, opens a discussion thread, and persists the chapter number.
 */
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  // External API calls can exceed Discord's 3-second reply window, so defer first.
  await interaction.deferReply();

  const { expectedChapter, chapters } = await checkAndAnnounceMia(interaction.client, {
    onAnnounce: async (found) => {
      const chunks = chunkMessages(found.map(formatChapterAnnouncement));
      await interaction.editReply({ content: chunks[0], allowedMentions: { parse: [] } });
      for (const chunk of chunks.slice(1)) {
        await interaction.followUp({ content: chunk, allowedMentions: { parse: [] } });
      }
    },
  });

  if (chapters.length === 0) {
    await interaction.editReply(`Chapter ${expectedChapter} is not available yet...`);
  }
}
