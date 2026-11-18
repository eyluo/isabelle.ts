import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { Command, IsabelleClient } from './types';

/**
 * Creates and returns an IsabelleClient — a Discord Client with a
 * typed `commands` collection attached.
 *
 * Only the intents the bot actually uses are requested. MessageContent is a
 * privileged intent: it must also be enabled in the Discord Developer Portal
 * (Bot → Privileged Gateway Intents) for the Ozen auto-reply to work.
 */
export function createClient(): IsabelleClient {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  }) as IsabelleClient;

  client.commands = new Collection<string, Command>();

  return client;
}
