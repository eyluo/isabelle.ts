import { Client, Collection, Intents } from 'discord.js';
import { Command, IsabelleClient } from './types';

/**
 * Creates and returns an IsabelleClient — a Discord Client with a
 * typed `commands` collection attached.
 */
export function createClient(): IsabelleClient {
  const client = new Client({
    intents: new Intents(32767), // All intents — required for message content
  }) as IsabelleClient;

  client.commands = new Collection<string, Command>();

  return client;
}
