import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CONFIG_PATH, loadConfig, saveConfig } from '../../src/config';
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

  it('round-trips a config through save and load', () => {
    const config = makeConfig({ latestChapter: 70 });
    saveConfig(config, file);
    expect(loadConfig(file)).toEqual(config);
  });

  it('writes human-readable, 4-space indented JSON', () => {
    saveConfig(makeConfig(), file);
    expect(fs.readFileSync(file, 'utf-8')).toMatch(/^\{\n {4}"auth": \{/);
  });

  it('persists a bumped chapter the way /mia does', () => {
    saveConfig(makeConfig({ latestChapter: 62 }), file);
    const config = loadConfig(file);
    config.data.madeInAbyss.latestChapter++;
    saveConfig(config, file);
    expect(loadConfig(file).data.madeInAbyss.latestChapter).toBe(63);
  });

  it('keeps fields it does not know about (e.g. legacy Reddit username)', () => {
    fs.writeFileSync(file, JSON.stringify({ ...makeConfig(), extra: { keep: true } }));
    saveConfig(loadConfig(file), file);
    expect(JSON.parse(fs.readFileSync(file, 'utf-8')).extra).toEqual({ keep: true });
  });

  it('fails loudly when the file is missing or malformed', () => {
    expect(() => loadConfig(path.join(dir, 'nope.json'))).toThrow(/ENOENT/);
    fs.writeFileSync(file, '{ not json');
    expect(() => loadConfig(file)).toThrow(SyntaxError);
  });
});
