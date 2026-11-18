import { createClient } from './client';
import { loadCommands } from './handlers/commandHandler';
import { loadEvents } from './handlers/eventHandler';
import { loadConfig } from './config';

const config = loadConfig();
const client = createClient();

console.log('Loading commands...');
loadCommands(client);

console.log('Loading events...');
loadEvents(client);

client.login(config.auth.discord.token);
