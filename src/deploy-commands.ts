import * as fs from 'fs';
import * as path from 'path';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import { loadConfig } from './config';

const config = loadConfig();

// Discover all command files and collect their slash command data
const commandsDir = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsDir)
  .filter(file => file.endsWith('.js') && !file.endsWith('.d.ts'));

const commands: any[] = [];

for (const file of commandFiles) {
  const command = require(path.join(commandsDir, file));
  if (command.data) {
    commands.push(command.data.toJSON());
    console.log(`  ✓ Found command: /${command.data.name}`);
  }
}

// Register commands with Discord API (guild-scoped for fast updates)
const rest = new REST({ version: '9' }).setToken(config.auth.discord.token);

rest.put(
  Routes.applicationGuildCommands(config.auth.discord.clientID, config.auth.discord.guildID),
  { body: commands }
)
  .then(() => console.log(`Successfully registered ${commands.length} application commands.`))
  .catch(console.error);
