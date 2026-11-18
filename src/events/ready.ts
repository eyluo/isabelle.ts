import { Client, Events } from 'discord.js';

export const name = Events.ClientReady;
export const once = true;

export function execute(client: Client<true>): void {
  console.log(`isabelle.ts is ready to roll! Logged in as ${client.user.tag}`);
}
