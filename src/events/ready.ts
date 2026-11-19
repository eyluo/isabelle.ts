import { Client, Events } from 'discord.js';
import { startMiaPoller } from '../util/mia';

export const name = Events.ClientReady;
export const once = true;

export function execute(client: Client<true>): void {
  console.log(`isabelle.ts is ready to roll! Logged in as ${client.user.tag}`);
  startMiaPoller(client);
}
