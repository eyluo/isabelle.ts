import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { BotConfig } from './types';

/** Resolved path to .env.json at the project root. */
export const CONFIG_PATH = path.resolve(__dirname, '..', '.env.json');

/** Reads and parses the .env.json config file. */
export function loadConfig(configPath: string = CONFIG_PATH): BotConfig {
  const raw = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(raw) as BotConfig;
}

/**
 * Atomically writes the config back to .env.json via a temp file + rename
 * so a mid-write crash cannot truncate or corrupt credentials/state.
 */
export function saveConfig(config: BotConfig, configPath: string = CONFIG_PATH): void {
  const tmpPath = `${configPath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(config, null, 4), { mode: 0o600 });
    fs.renameSync(tmpPath, configPath);
  } catch (error) {
    fs.rmSync(tmpPath, { force: true });
    throw error;
  }
}
