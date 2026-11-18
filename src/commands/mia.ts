import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, TextChannel } from 'discord.js';
import { loadConfig, saveConfig } from '../config';

const snoowrap = require('snoowrap');

// Lazy-initialized Reddit client (created on first /mia invocation)
let rClient: any = null;

function getRedditClient(): any {
  if (!rClient) {
    const config = loadConfig();
    rClient = new snoowrap({
      userAgent: config.auth.reddit.userAgent,
      clientId: config.auth.reddit.clientID,
      clientSecret: config.auth.reddit.clientSecret,
      username: config.auth.reddit.username,
      password: config.auth.reddit.password,
    });
  }
  return rClient;
}

export const data = new SlashCommandBuilder()
  .setName('mia')
  .setDescription('Checks on the newest chapter of Made in Abyss');

/**
 * Checks if any stickied posts on r/MadeInAbyss contain the next
 * chapter number. If found, posts a link and creates a discussion thread.
 */
export async function execute(interaction: CommandInteraction): Promise<void> {
  const config = loadConfig();
  const chapterToCheck = config.data.madeInAbyss.latestChapter;
  const numStickyPosts = 2;

  for (let i = 0; i < numStickyPosts; i++) {
    const stickyPost = await getRedditClient()
      .getSubreddit('MadeInAbyss')
      .getSticky({ num: i + 1 });

    if (stickyPost.title.includes(chapterToCheck.toString())) {
      await interaction.reply(
        `Chapter ${chapterToCheck} available! Link here: ${stickyPost.url}`
      );

      // Create a discussion thread in the designated channel
      const miaChannel = interaction.guild?.channels.cache.get(
        config.data.madeInAbyss.channelID
      ) as TextChannel | undefined;

      if (miaChannel) {
        await miaChannel.threads.create({
          name: `Made in Abyss Chapter ${chapterToCheck} Discussion`,
        });
      }

      // Persist the updated chapter number
      config.data.madeInAbyss.latestChapter++;
      saveConfig(config);

      return;
    }
  }

  await interaction.reply(
    `Chapter ${chapterToCheck} is not available yet...`
  );
}
