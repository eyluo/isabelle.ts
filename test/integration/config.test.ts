import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CONFIG_PATH, loadConfig } from '../../src/config';
import { makeConfig } from '../helpers';

let dir: string;
let file: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'isabelle-config-'));
  file = path.join(dir, '.env.json');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('config', () => {
  it('defaults to .env.json at the project root', () => {
    expect(CONFIG_PATH).toBe(path.resolve(__dirname, '..', '..', '.env.json'));
  });

  it('loads and parses a valid .env.json file', () => {
    const config = makeConfig({ pollIntervalHours: 12 });
    fs.writeFileSync(file, JSON.stringify(config, null, 4));
    expect(loadConfig(file)).toEqual(config);
  });

  it('preserves unknown/legacy fields when reading .env.json', () => {
    const legacy = { ...makeConfig({ latestChapter: 75 }), extra: { keep: true } };
    fs.writeFileSync(file, JSON.stringify(legacy));
    expect(loadConfig(file)).toEqual(legacy);
  });

  it('fails loudly when the file is missing or malformed', () => {
    expect(() => loadConfig(path.join(dir, 'nope.json'))).toThrow(/ENOENT/);
    fs.writeFileSync(file, '{ not json');
    expect(() => loadConfig(file)).toThrow(SyntaxError);
  });
});
