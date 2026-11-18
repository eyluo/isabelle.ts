import * as fs from 'fs';
import * as path from 'path';
import { BotConfig } from './types';

/** Resolved path to .env.json at the project root. */
export const CONFIG_PATH = path.resolve(__dirname, '..', '.env.json');

/** Reads and parses the .env.json config file. */
export function loadConfig(configPath: string = CONFIG_PATH): BotConfig {
  const raw = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(raw);
}

/** Writes the config back to .env.json (used by /mia to persist chapter state). */
export function saveConfig(config: BotConfig, configPath: string = CONFIG_PATH): void {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
}
