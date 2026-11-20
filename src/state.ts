import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { CONFIG_PATH, loadConfig } from './config';
import { BotState } from './types';

/** Current schema version for state.json. */
export const STATE_VERSION = 1 as const;

/** Resolved path to state.json at the project root. */
export const STATE_PATH = path.resolve(__dirname, '..', 'state.json');

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates and normalizes an untrusted JSON value against the BotState v1
 * contract, throwing a descriptive error if the shape or version is invalid.
 */
export function parseState(raw: unknown): BotState {
  if (!isPlainObject(raw)) {
    throw new Error('Invalid state.json: expected a JSON object');
  }

  if (raw.version !== STATE_VERSION) {
    throw new Error(
      `Unsupported state.json version: expected ${STATE_VERSION}, got ${String(raw.version)}`,
    );
  }

  if (!isPlainObject(raw.madeInAbyss)) {
    throw new Error('Invalid state.json: missing madeInAbyss object');
  }

  const { latestChapter, announcedExtras } = raw.madeInAbyss;
  if (
    typeof latestChapter !== 'number' ||
    !Number.isInteger(latestChapter) ||
    latestChapter < 1
  ) {
    throw new Error(
      `Invalid state.json: madeInAbyss.latestChapter must be a positive integer, got ${String(latestChapter)}`,
    );
  }

  let normalizedExtras: number[] = [];
  if (announcedExtras !== undefined) {
    if (!Array.isArray(announcedExtras)) {
      throw new Error('Invalid state.json: madeInAbyss.announcedExtras must be an array');
    }
    for (const item of announcedExtras) {
      if (typeof item !== 'number' || !Number.isFinite(item) || Number.isInteger(item)) {
        throw new Error(
          `Invalid state.json: madeInAbyss.announcedExtras entries must be finite non-integer numbers, got ${String(item)}`,
        );
      }
    }
    normalizedExtras = [...new Set(announcedExtras)].sort((a, b) => a - b);
  }

  return {
    version: STATE_VERSION,
    madeInAbyss: {
      latestChapter,
      announcedExtras: normalizedExtras,
    },
  };
}

/**
 * Validates and atomically writes runtime state to state.json via a temp file
 * + rename so a mid-write crash cannot truncate or corrupt state.
 */
export function saveState(state: BotState, statePath: string = STATE_PATH): void {
  const validated = parseState(state);
  const tmpPath = `${statePath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(validated, null, 4), { mode: 0o600 });
    fs.renameSync(tmpPath, statePath);
  } catch (error) {
    fs.rmSync(tmpPath, { force: true });
    throw error;
  }
}

/**
 * Loads and validates state.json.
 *
 * On first run when state.json does not exist yet, attempts a one-time
 * bootstrap from legacy `data.madeInAbyss.latestChapter` (and optional
 * `announcedExtras`) in .env.json and persists state.json automatically.
 */
export function loadState(
  statePath: string = STATE_PATH,
  configPath: string = CONFIG_PATH,
): BotState {
  try {
    const raw = fs.readFileSync(statePath, 'utf-8');
    return parseState(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  // One-time bootstrap from legacy .env.json fields if present.
  const legacyMia = loadConfig(configPath).data?.madeInAbyss;
  if (
    typeof legacyMia?.latestChapter !== 'number' ||
    !Number.isInteger(legacyMia.latestChapter) ||
    legacyMia.latestChapter < 1
  ) {
    throw new Error(
      `State file not found at ${statePath} and no valid legacy data.madeInAbyss.latestChapter found in ${configPath}. Create state.json (see state.example.json).`,
    );
  }

  const legacyExtras = Array.isArray(legacyMia.announcedExtras)
    ? legacyMia.announcedExtras.filter(
        (n): n is number => typeof n === 'number' && Number.isFinite(n) && !Number.isInteger(n),
      )
    : [];

  const bootstrapped = parseState({
    version: STATE_VERSION,
    madeInAbyss: {
      latestChapter: legacyMia.latestChapter,
      announcedExtras: legacyExtras,
    },
  });

  saveState(bootstrapped, statePath);
  console.log(`[state] Bootstrapped ${path.basename(statePath)} from legacy .env.json fields.`);
  return bootstrapped;
}
