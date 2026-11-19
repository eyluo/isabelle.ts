import * as fs from 'fs';
import * as path from 'path';
import { BotConfig } from './types';

/** Resolved path to .env.json at the project root. */
export const CONFIG_PATH = path.resolve(__dirname, '..', '.env.json');

/** Reads and parses the read-only .env.json config file. */
export function loadConfig(configPath: string = CONFIG_PATH): BotConfig {
  const raw = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(raw) as BotConfig;
}
