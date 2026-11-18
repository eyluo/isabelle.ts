import { SlashCommandBuilder } from '@discordjs/builders';
import { Client, Collection, CommandInteraction } from 'discord.js';

/**
 * Represents a slash command that the bot can handle.
 *
 * To add a new command, create a file in src/commands/ that exports
 * a `Command` object. It will be auto-discovered at startup.
 */
export interface Command {
  data: SlashCommandBuilder |
    Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'>;
  execute: (interaction: CommandInteraction) => Promise<void>;
}

/**
 * Represents a Discord event handler.
 *
 * To add a new event, create a file in src/events/ that exports
 * a `BotEvent` object. It will be auto-discovered at startup.
 */
export interface BotEvent {
  name: string;
  once?: boolean;
  execute: (...args: any[]) => void;
}

/** Shape of the .env.json configuration file. */
export interface BotConfig {
  auth: {
    discord: {
      token: string;
      clientID: string;
      guildID: string;
    };
    reddit: {
      clientID: string;
      clientSecret: string;
      username: string;
      userAgent: string;
      password: string;
    };
  };
  data: {
    madeInAbyss: {
      channelID: string;
      latestChapter: number;
    };
  };
}

/** Extended Discord Client that carries typed command and config references. */
export interface IsabelleClient extends Client {
  commands: Collection<string, Command>;
}
