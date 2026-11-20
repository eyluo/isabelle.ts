import {
  ChatInputCommandInteraction,
  Client,
  Collection,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';

/**
 * Represents a slash command that the bot can handle.
 *
 * To add a new command, create a file in src/commands/ that exports
 * `data` and `execute`. It will be auto-discovered at startup.
 */
export interface Command {
  data:
    | SlashCommandBuilder
    | SlashCommandOptionsOnlyBuilder
    | SlashCommandSubcommandsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

/**
 * Represents a Discord event handler.
 *
 * To add a new event, create a file in src/events/ that exports
 * `name`, optional `once`, and `execute`. It will be auto-discovered at startup.
 */
export interface BotEvent {
  name: string;
  once?: boolean;
  execute: (...args: any[]) => void | Promise<void>;
}

/** Shape of the .env.json configuration file. */
export interface BotConfig {
  auth: {
    discord: {
      token: string;
      clientID: string;
      guildID: string;
    };
  };
  data: {
    madeInAbyss: {
      channelID: string;
      latestChapter: number;
      /** Non-integer / extra chapter numbers already announced with an FYI message. */
      announcedExtras?: number[];
      /** MangaDex manga UUID (defaults to Made in Abyss). */
      mangaID?: string;
      /** Background polling interval in hours (defaults to 24; set to 0 to disable). */
      pollIntervalHours?: number;
    };
  };
}

/** Extended Discord Client that carries the typed command collection. */
export interface IsabelleClient extends Client {
  commands: Collection<string, Command>;
}
