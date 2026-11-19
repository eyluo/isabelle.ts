import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadState, parseState, saveState, STATE_PATH, STATE_VERSION } from '../../src/state';
import { makeConfig, makeState } from '../helpers';

let dir: string;
let stateFile: string;
let configFile: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'isabelle-state-'));
  stateFile = path.join(dir, 'state.json');
  configFile = path.join(dir, '.env.json');
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('state contract (parseState)', () => {
  it('validates the committed state.example.json template', () => {
    const examplePath = path.resolve(__dirname, '..', '..', 'state.example.json');
    const parsed = JSON.parse(fs.readFileSync(examplePath, 'utf-8'));
    expect(parseState(parsed)).toEqual({
      version: STATE_VERSION,
      madeInAbyss: {
        latestChapter: expect.any(Number),
        announcedExtras: [],
      },
    });
  });

  it('defaults omitted announcedExtras to [] and deduplicates/sorts extras', () => {
    expect(
      parseState({ version: 1, madeInAbyss: { latestChapter: 75 } }),
    ).toEqual(makeState({ latestChapter: 75, announcedExtras: [] }));

    expect(
      parseState({
        version: 1,
        madeInAbyss: { latestChapter: 75, announcedExtras: [74.7, 74.5, 74.7] },
      }),
    ).toEqual(makeState({ latestChapter: 75, announcedExtras: [74.5, 74.7] }));
  });

  it.each([
    ['non-object', null, /expected a JSON object/],
    ['array', [], /expected a JSON object/],
    ['unsupported version', { version: 2, madeInAbyss: { latestChapter: 75 } }, /Unsupported state\.json version/],
    ['missing madeInAbyss', { version: 1 }, /missing madeInAbyss object/],
    ['zero latestChapter', { version: 1, madeInAbyss: { latestChapter: 0 } }, /latestChapter must be a positive integer/],
    ['non-integer latestChapter', { version: 1, madeInAbyss: { latestChapter: 74.5 } }, /latestChapter must be a positive integer/],
    ['non-array announcedExtras', { version: 1, madeInAbyss: { latestChapter: 75, announcedExtras: 'bad' } }, /announcedExtras must be an array/],
    ['integer inside announcedExtras', { version: 1, madeInAbyss: { latestChapter: 75, announcedExtras: [74] } }, /announcedExtras entries must be finite non-integer numbers/],
    ['non-number inside announcedExtras', { version: 1, madeInAbyss: { latestChapter: 75, announcedExtras: ['74.5'] } }, /announcedExtras entries must be finite non-integer numbers/],
  ])('rejects invalid state (%s)', (_label, input, pattern) => {
    expect(() => parseState(input)).toThrow(pattern);
  });
});

describe('state persistence (loadState / saveState)', () => {
  it('defaults to state.json at the project root', () => {
    expect(STATE_PATH).toBe(path.resolve(__dirname, '..', '..', 'state.json'));
  });

  it('round-trips state atomically with 0o600 permissions and 4-space indentation', () => {
    const state = makeState({ latestChapter: 75, announcedExtras: [74.5] });
    saveState(state, stateFile);

    expect(fs.readdirSync(dir)).toEqual(['state.json']);
    expect(fs.statSync(stateFile).mode & 0o777).toBe(0o600);
    expect(fs.readFileSync(stateFile, 'utf-8')).toMatch(/^\{\n {4}"version": 1,/);
    expect(loadState(stateFile, configFile)).toEqual(state);
  });

  it('refuses to save invalid state and leaves existing state.json untouched', () => {
    saveState(makeState({ latestChapter: 75 }), stateFile);

    expect(() => saveState({ version: 1, madeInAbyss: { latestChapter: 0, announcedExtras: [] } }, stateFile))
      .toThrow(/latestChapter/);
    expect(loadState(stateFile, configFile).madeInAbyss.latestChapter).toBe(75);
  });

  it('cleans up the temp file if renaming into place fails', () => {
    const dirTarget = path.join(dir, 'not-a-file');
    fs.mkdirSync(dirTarget);

    expect(() => saveState(makeState(), dirTarget)).toThrow();
    expect(fs.readdirSync(dir)).toEqual(['not-a-file']);
  });

  it('bootstraps state.json once from legacy .env.json fields when state.json is absent', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    fs.writeFileSync(
      configFile,
      JSON.stringify(makeConfig({ latestChapter: 75, announcedExtras: [74.5, 'ignored' as any] })),
    );

    const state = loadState(stateFile, configFile);

    expect(state).toEqual(makeState({ latestChapter: 75, announcedExtras: [74.5] }));
    expect(fs.existsSync(stateFile)).toBe(true);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Bootstrapped state.json'));
  });

  it('bootstraps with empty announcedExtras when legacy .env.json has only latestChapter', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    fs.writeFileSync(configFile, JSON.stringify(makeConfig({ latestChapter: 75 })));

    expect(loadState(stateFile, configFile)).toEqual(
      makeState({ latestChapter: 75, announcedExtras: [] }),
    );
  });

  it('fails loudly if state.json is missing and .env.json has no valid legacy latestChapter', () => {
    fs.writeFileSync(configFile, JSON.stringify(makeConfig()));

    expect(() => loadState(stateFile, configFile)).toThrow(/Create state\.json/);
  });

  it('fails loudly if state.json contains invalid JSON or fails schema validation', () => {
    fs.writeFileSync(stateFile, '{ not json');
    expect(() => loadState(stateFile, configFile)).toThrow(SyntaxError);

    fs.writeFileSync(stateFile, JSON.stringify({ version: 99 }));
    expect(() => loadState(stateFile, configFile)).toThrow(/Unsupported state\.json version/);
  });
});
