import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '../../src/client';
import { loadCommands } from '../../src/handlers/commandHandler';
import { loadEvents } from '../../src/handlers/eventHandler';

/**
 * The loaders discover compiled .js files at runtime, so these tests run
 * against dist/ (npm test builds first) plus temp dirs with fake modules.
 */
const DIST = path.resolve(__dirname, '..', '..', 'dist');

let tmp: string;
let client: ReturnType<typeof createClient>;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'isabelle-loaders-'));
  client = createClient();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  client.destroy();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function writeModule(name: string, source: string) {
  fs.writeFileSync(path.join(tmp, name), source);
}

describe('loadCommands', () => {
  it('discovers every built command', () => {
    loadCommands(client, path.join(DIST, 'commands'));
    expect([...client.commands.keys()].sort()).toEqual(['hello', 'mia', 'ping']);
  });

  it('skips files missing data or execute, and non-.js files', () => {
    writeModule('good.js', `exports.data = { name: 'good' }; exports.execute = async () => {};`);
    writeModule('noExecute.js', `exports.data = { name: 'broken' };`);
    writeModule('noData.js', `exports.execute = async () => {};`);
    writeModule('types.d.ts', `export {};`);
    writeModule('README.md', `# not a command`);

    loadCommands(client, tmp);

    expect([...client.commands.keys()]).toEqual(['good']);
    expect(console.warn).toHaveBeenCalledTimes(2);
  });
});

describe('loadEvents', () => {
  it('registers every built event with the right once/on behaviour', () => {
    loadEvents(client, path.join(DIST, 'events'));

    expect(client.listenerCount('clientReady')).toBe(1);
    expect(client.listenerCount('interactionCreate')).toBe(1);
    expect(client.listenerCount('messageCreate')).toBe(1);
  });

  it('fires `once` handlers a single time and `on` handlers every time', () => {
    writeModule(
      'a.js',
      `exports.name = 'testOnce'; exports.once = true; exports.execute = (x) => globalThis.__calls.push('once:' + x);`,
    );
    writeModule(
      'b.js',
      `exports.name = 'testOn'; exports.execute = (x) => globalThis.__calls.push('on:' + x);`,
    );
    const calls: string[] = [];
    (globalThis as any).__calls = calls;

    loadEvents(client, tmp);
    client.emit('testOnce' as any, 1);
    client.emit('testOnce' as any, 2);
    client.emit('testOn' as any, 1);
    client.emit('testOn' as any, 2);

    expect(calls).toEqual(['once:1', 'on:1', 'on:2']);
    delete (globalThis as any).__calls;
  });

  it('skips event files missing name or execute', () => {
    writeModule('noName.js', `exports.execute = () => {};`);
    writeModule('noExecute.js', `exports.name = 'x';`);

    loadEvents(client, tmp);

    expect(client.listenerCount('x')).toBe(0);
    expect(console.warn).toHaveBeenCalledTimes(2);
  });
});

describe('slash command definitions (what `npm run deploy` sends)', () => {
  const commands = fs
    .readdirSync(path.join(DIST, 'commands'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => require(path.join(DIST, 'commands', f)).data.toJSON());

  it.each(commands.map((c) => [c.name, c]))('/%s is valid for the Discord API', (_name, json) => {
    // Discord's rules for chat-input command names and descriptions.
    expect(json.name).toMatch(/^[-_\p{L}\p{N}]{1,32}$/u);
    expect(json.name).toBe(json.name.toLowerCase());
    expect(json.description.length).toBeGreaterThanOrEqual(1);
    expect(json.description.length).toBeLessThanOrEqual(100);
  });

  it('has no duplicate names', () => {
    const names = commands.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
