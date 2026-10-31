import { describe, expect, it, vi } from 'vitest';
import { Diagnostics, copyText, gameInfo, layout, renderCostText } from './diagnostics';
import { MoveLog } from './movelog';
import { generateKeys } from './moverecord';

const M1 = [1, 4, 0, 2, 0, 0, 0, 0];
const M2 = [1, 5, 0, -2, 0, 0, 0, 0];

function diagnostics() {
  const clock = { now: 0 };
  const out = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { clock, out, diag: new Diagnostics(() => clock.now, out) };
}

const events = (d: Diagnostics) => d.log.entries.map(({ level, event, data }) => ({ level, event, data }));

describe('Diagnostics events', () => {
  it('logs each connection state change and counts the connection', () => {
    const { clock, diag } = diagnostics();
    diag.connecting();
    clock.now = 700;
    diag.netState('open');
    diag.netState('closed');
    expect(events(diag)).toEqual([
      { level: 'info', event: 'net', data: { state: 'connecting' } },
      { level: 'info', event: 'net', data: { state: 'open' } },
      { level: 'info', event: 'net', data: { state: 'closed' } },
    ]);
    expect(diag.net.counts).toMatchObject({ opened: 1, connectMs: [700], failures: { lost: 1 } });
  });

  it('logs a signaling timeout as a warning, once', () => {
    const { clock, diag } = diagnostics();
    diag.connecting();
    diag.timeout(); // too early: nothing
    clock.now = 60_000;
    diag.timeout();
    diag.timeout();
    expect(events(diag).slice(1)).toEqual([{ level: 'warn', event: 'net', data: { failure: 'signaling-timeout' } }]);
  });

  it('logs a Trystero join error with its cause', () => {
    const { diag } = diagnostics();
    diag.joinError('could not connect to peer p after exchanging SDP');
    expect(events(diag)).toEqual([
      { level: 'warn', event: 'net', data: { failure: 'ice-failed', message: 'could not connect to peer p after exchanging SDP' } },
    ]);
    expect(diag.net.counts.failures).toEqual({ 'ice-failed': 1 });
  });

  it('logs a refused message as a warning, and a desync as an error', () => {
    const { out, diag } = diagnostics();
    diag.refused('malformed');
    diag.refused('bad-chain');
    expect(events(diag)).toEqual([
      { level: 'warn', event: 'refused', data: { reason: 'malformed' } },
      { level: 'error', event: 'desync', data: { reason: 'bad-chain' } },
    ]);
    expect(diag.net.counts).toMatchObject({ refused: { malformed: 1, 'bad-chain': 1 }, desync: 1 });
    expect(out.error).toHaveBeenCalledTimes(1);
  });

  it('logs the bot search time, rounded', () => {
    const { diag } = diagnostics();
    diag.botSearch(812.7, { nodes: 20000 });
    diag.botSearch(40.2, { boss: 'hull' });
    expect(events(diag)).toEqual([
      { level: 'info', event: 'bot-search', data: { ms: 813, nodes: 20000 } },
      { level: 'info', event: 'bot-search', data: { ms: 40, boss: 'hull' } },
    ]);
  });
});

describe('gameInfo', () => {
  const base = { bot: false, fight: null, online: null, toMove: 1, status: 0, moves: [M1, M2] };

  it('names a hot-seat game local and copies its moves', () => {
    const moves = [M1];
    const info = gameInfo({ ...base, moves });
    moves.push(M2);
    expect(info).toEqual({ mode: 'local', layout: 'standard', toMove: 1, status: 0, moves: [M1] });
  });

  it('names a game against the bot', () => {
    expect(gameInfo({ ...base, bot: true }).mode).toBe('bot');
  });

  it('carries the boss and the seed of a boss fight, its ruleset', () => {
    expect(gameInfo({ ...base, bot: true, fight: { id: 'hull', seed: 42 } })).toMatchObject({
      mode: 'boss',
      boss: { id: 'hull', seed: 42 },
    });
  });

  it('carries the game id, the side, the role and the signed log of an online game', async () => {
    const keys = await generateKeys();
    const log = new MoveLog('room', keys.pub);
    await log.sign(keys, M1);
    const info = gameInfo({ ...base, bot: true, online: { game: 'room', side: 1, role: 'player', signed: log.from(0) } });
    expect(info).toMatchObject({ mode: 'online', online: { game: 'room', side: 1, role: 'player' } });
    expect(info.signed).toEqual(log.from(0));
  });
});

describe('Diagnostics text', () => {
  it('is JSON with the build, the environment, the game, the counters and the events', () => {
    const { clock, diag } = diagnostics();
    diag.connecting();
    clock.now = 10;
    diag.netState('open');
    diag.refused('malformed');
    const text = diag.text({
      renderCost: 'draw calls: 1',
      build: 'abc123',
      exported: '2026-10-24T10:00:00.000Z',
      environment: { backend: 'WebGL2' },
      game: gameInfo({ bot: true, fight: null, online: null, toMove: 1, status: 0, moves: [M1, M2] }),
    });
    const parsed = JSON.parse(text);
    expect(parsed).toEqual({
      app: 'ab-alone',
      build: 'abc123',
      exported: '2026-10-24T10:00:00.000Z',
      environment: { backend: 'WebGL2' },
      renderCost: 'draw calls: 1',
      game: { mode: 'bot', layout: 'standard', toMove: 1, status: 0, moves: [M1, M2] },
      counters: { opened: 1, failures: {}, connectMs: [10], refused: { malformed: 1 }, desync: 0 },
      dropped: 0,
      events: [
        { t: 0, level: 'info', event: 'net', data: { state: 'connecting' } },
        { t: 10, level: 'info', event: 'net', data: { state: 'open' } },
        { t: 10, level: 'warn', event: 'refused', data: { reason: 'malformed' } },
      ],
    });
    // One move and one event per line, so the text reads well pasted into an issue.
    expect(text).toContain('\n      [1,4,0,2,0,0,0,0],\n');
    expect(text).toContain('\n    {"t":10,"level":"warn","event":"refused","data":{"reason":"malformed"}}\n');
  });

  it('never holds a private key, only the public ones: it may be pasted into a public issue', async () => {
    const keys = await generateKeys();
    const log = new MoveLog('room', keys.pub);
    await log.sign(keys, M1);
    const { diag } = diagnostics();
    diag.log.log('info', 'oops', { keys, priv: 'secret' });
    const text = diag.text({
      renderCost: 'draw calls: 1',
      build: 'b',
      exported: 'e',
      environment: { keys },
      game: gameInfo({ bot: false, fight: null, online: { game: 'room', side: 1, role: 'player', signed: log.from(0) }, toMove: 2, status: 0, moves: [M1] }),
    });
    const pkcs8 = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('pkcs8', keys.priv))));
    const jwk = await crypto.subtle.exportKey('jwk', keys.priv);
    expect(text).toContain(keys.pub);
    expect(text).not.toContain('"priv"');
    expect(text).not.toContain('secret');
    expect(text).not.toContain(pkcs8);
    expect(text).not.toContain(jwk.d!);
  });
});

describe('layout', () => {
  it('writes objects one key per line, arrays one compact item per line, empty ones inline', () => {
    expect(layout({ a: 1, b: { c: [] }, d: {}, e: [[1, 2], { f: 'x' }] })).toBe(
      ['{', '  "a": 1,', '  "b": {', '    "c": []', '  },', '  "d": {},', '  "e": [', '    [1,2],', '    {"f":"x"}', '  ]', '}'].join('\n'),
    );
  });

  it('writes a bare value as JSON', () => {
    expect(layout('x')).toBe('"x"');
    expect(layout(null)).toBe('null');
  });
});

describe('copyText', () => {
  it('writes the text to the clipboard', async () => {
    const writeText = vi.fn(async () => {});
    expect(await copyText('hello', { writeText })).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('says so when the clipboard refuses, or is missing outside a secure page', async () => {
    expect(await copyText('hello', { writeText: async () => Promise.reject(new Error('NotAllowedError')) })).toBe(false);
    expect(await copyText('hello', undefined)).toBe(false);
  });
});

describe('renderCostText', () => {
  it('lists the draw calls, triangles, geometries, textures, point lights, tier and pixel ratio', () => {
    const cost = { calls: 120, triangles: 45_000, geometries: 80, textures: 12, pointLights: 3, tier: 'high', pixelRatio: 1.5 };
    expect(renderCostText(cost)).toBe(
      'draw calls: 120\ntriangles: 45000\ngeometries: 80\ntextures: 12\npoint lights: 3\ntier: high\npixel ratio: 1.5',
    );
  });
});
