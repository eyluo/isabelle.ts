import * as fs from 'fs';
import * as path from 'path';
import { REST, RESTPostAPIChatInputApplicationCommandsJSONBody, Routes } from 'discord.js';
import { loadConfig } from './config';
import { Command } from './types';

const config = loadConfig();

// Discover all command files and collect their slash command data
const commandsDir = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsDir).filter((file) => file.endsWith('.js'));

const commands: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [];

for (const file of commandFiles) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const command = require(path.join(commandsDir, file)) as Partial<Command>;
  if (command.data) {
    commands.push(command.data.toJSON());
    console.log(`  ✓ Found command: /${command.data.name}`);
  }
}

// Register commands with Discord API (guild-scoped for instant updates)
const rest = new REST().setToken(config.auth.discord.token);

rest
  .put(Routes.applicationGuildCommands(config.auth.discord.clientID, config.auth.discord.guildID), {
    body: commands,
  })
  .then(() => console.log(`Successfully registered ${commands.length} application commands.`))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
