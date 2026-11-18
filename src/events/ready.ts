import { Client } from 'discord.js';
import { BotEvent } from '../types';

export const name = 'ready';
export const once = true;

export const execute: BotEvent['execute'] = (client: Client) => {
  console.log(`isabelle.ts is ready to roll! Logged in as ${client.user?.tag}`);
};
