import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'discord.js';
import { BotEvent } from '../types';

/**
 * Scans src/events/ for event files and registers them on the client.
 *
 * To add a new event: create a .ts file in src/events/ that exports
 * `name` (string), optional `once` (boolean), and `execute` (function).
 */
export function loadEvents(client: Client): void {
  const eventsDir = path.join(__dirname, '..', 'events');
  const eventFiles = fs.readdirSync(eventsDir)
    .filter(file => file.endsWith('.js') && !file.endsWith('.d.ts'));

  for (const file of eventFiles) {
    const event: BotEvent = require(path.join(eventsDir, file));

    if (!event.name || !event.execute) {
      console.warn(`  ✗ Skipped event ${file} — missing "name" or "execute" export`);
      continue;
    }

    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      client.on(event.name, (...args) => event.execute(...args));
    }

    console.log(`  ✓ Loaded event: ${event.name}${event.once ? ' (once)' : ''}`);
  }
}
