import * as fs from 'fs';
import * as path from 'path';
import { Command, IsabelleClient } from '../types';

/**
 * Scans src/commands/ for command files and registers them on the client.
 *
 * To add a new command: create a .ts file in src/commands/ that exports
 * `data` (SlashCommandBuilder) and `execute` (async function).
 * It will be picked up automatically on next restart.
 */
export function loadCommands(
  client: IsabelleClient,
  commandsDir: string = path.join(__dirname, '..', 'commands'),
): void {
  const commandFiles = fs
    .readdirSync(commandsDir)
    .filter((file) => file.endsWith('.js') && !file.endsWith('.d.ts'));

  for (const file of commandFiles) {
    // Typed as Partial: a dynamically required file may not satisfy the contract.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const command = require(path.join(commandsDir, file)) as Partial<Command>;

    if (command.data && command.execute) {
      client.commands.set(command.data.name, command as Command);
      console.log(`  ✓ Loaded command: /${command.data.name}`);
    } else {
      console.warn(`  ✗ Skipped ${file} — missing "data" or "execute" export`);
    }
  }
}
