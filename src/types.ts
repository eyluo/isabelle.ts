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

/** Shape of the read-only .env.json configuration file. */
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
      /** MangaDex manga UUID (defaults to Made in Abyss). */
      mangaID?: string;
      /** Background polling interval in hours (defaults to 24; set to 0 to disable). */
      pollIntervalHours?: number;
      /** @deprecated Migrated to state.json on first run. */
      latestChapter?: number;
      /** @deprecated Migrated to state.json on first run. */
      announcedExtras?: number[];
    };
  };
}

/** Mutable Made in Abyss progress state stored in state.json. */
export interface MadeInAbyssState {
  /** Next mainline integer chapter number to check for (1-based). */
  latestChapter: number;
  /** Non-integer / extra chapter numbers already announced with an FYI message. */
  announcedExtras: number[];
}

/** Shape of the git-ignored state.json runtime state file. */
export interface BotState {
  version: 1;
  madeInAbyss: MadeInAbyssState;
}

/** Extended Discord Client that carries the typed command collection. */
export interface IsabelleClient extends Client {
  commands: Collection<string, Command>;
}
