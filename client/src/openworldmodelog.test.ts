// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './test/openworldwasm';
import { CHUNK } from './openworld';
import { FightState } from './openworldfight';
import { WORLD_LOGS } from './lorelogs';
import { OpenWorldMode } from './openworldmode';
import { worldSaves } from './openworldsave';
import { memoryStore } from './savegame';
import { stopLeftIntervalsAfterEach } from './test/intervals';
stopLeftIntervalsAfterEach();

// The lore logs of the Open world mode (#1589, docs/specs/openworld.md section 12). Open grass in the chunks -3..3; the logs stand on
// (4, 0), within sight of the spawn, (0, 5), and (40, 0), out of it.
function grass(_seed: number, cx: number, cy: number): Uint8Array {
  if (Math.abs(cx) > 3 || Math.abs(cy) > 3) return new Uint8Array();
  const out = new Uint8Array(CHUNK * CHUNK * 3);
  for (let i = 0; i < CHUNK * CHUNK; i++) out.set([2, 2, 0], i * 3);
  return out;
}
const LOGS = Int32Array.of(4, 0, 0, 5, 40, 0);
const setup = () => {
  const saves = worldSaves(memoryStore(), 1);
  const logsOf = vi.fn(() => LOGS);
  const read = vi.fn();
  const none = Array.from({ length: 11 }, () => undefined) as [];
  const m = new OpenWorldMode(grass, () => new Int32Array(), async () => ({ low: {}, high: {} }), () => true, saves, ...none, logsOf, read);
  return { m, saves, logsOf, read };
};
const body = () => document.body.dataset;
const PAGE = '<div id="openworld-log" hidden><h2 id="openworld-log-title"></h2><p id="openworld-log-body"></p></div>';
const panel = () => document.getElementById('openworld-log') as HTMLElement;

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  for (const key of Object.keys(body())) delete body()[key];
});

describe('the lore logs of the Open world mode (#1589)', () => {
  it('reads the logs of the seed, draws a stake on each and publishes the ones within sight', () => {
    const { m, logsOf } = setup();
    m.enter(7, 800, 600);
    expect(logsOf).toHaveBeenCalledWith(7);
    expect(body().openworldLogs).toBe('4,0 0,5');
    expect(body().openworldLogsFound).toBe('');
    expect(m.scene!.getObjectByName('log-stake')).toBeDefined();
    m.leave();
    expect(body().openworldLogs).toBeUndefined();
    expect(body().openworldLogsFound).toBeUndefined();
  });

  it('rolling onto a log opens its panel with its title and text, tells the archive and marks it found', () => {
    document.body.innerHTML = PAGE;
    const { m, read } = setup();
    m.enter(7, 800, 600);
    m.fixture({ hero: [3, 0], troop: [], enemies: [] });
    expect(panel().hidden).toBe(true);
    m.key('ArrowRight');
    m.release('ArrowRight');
    expect(body().openworldAt).toBe('4,0');
    expect(panel().hidden).toBe(false);
    expect(document.getElementById('openworld-log-title')!.textContent).toBe(WORLD_LOGS[0]!.title);
    expect(document.getElementById('openworld-log-body')!.textContent).toBe(WORLD_LOGS[0]!.body);
    expect(body().openworldLog).toBe(WORLD_LOGS[0]!.id);
    expect(body().openworldLogsFound).toBe('0');
    expect(read).toHaveBeenCalledWith(WORLD_LOGS[0]!.id);
    expect(m.scene!.getObjectByName('log-stake-found')).toBeDefined();
  });

  it('the next move closes the panel, and a move never waits for it', () => {
    document.body.innerHTML = PAGE;
    const { m } = setup();
    m.enter(7, 800, 600);
    m.fixture({ hero: [3, 0], troop: [], enemies: [] });
    m.key('ArrowRight');
    m.release('ArrowRight');
    m.key('ArrowLeft');
    m.release('ArrowLeft');
    expect(body().openworldAt).toBe('4,-1');
    expect(panel().hidden).toBe(true);
    expect(body().openworldLog).toBeUndefined();
  });

  it('a log found stays found and reads again when the hero rolls onto it again', () => {
    document.body.innerHTML = PAGE;
    const { m, read } = setup();
    m.enter(7, 800, 600);
    for (let i = 0; i < 2; i++) {
      m.fixture({ hero: [3, 0], troop: [], enemies: [] });
      m.key('ArrowRight');
      m.release('ArrowRight');
      expect(panel().hidden).toBe(false);
    }
    expect(body().openworldLogsFound).toBe('0');
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('saves the logs found with the world, and opens a world with them found', async () => {
    document.body.innerHTML = PAGE;
    const { m, saves } = setup();
    m.enter(7, 800, 600);
    m.fixture({ hero: [3, 0], troop: [], enemies: [] });
    m.key('ArrowRight');
    m.release('ArrowRight');
    m.frame(vi.fn());
    await new Promise((done) => setTimeout(done));
    expect((await saves.load(7))!.logs).toEqual([0]);
    m.leave();
    await m.open(7, 800, 600);
    expect(body().openworldLogsFound).toBe('0');
  });

  it('opens a world from a save with logs found, found in the world and none read to the archive', async () => {
    const { m, saves, read } = setup();
    await saves.put(7, [0, 0], [], new FightState(), 0, [], [], [], 0, [1]);
    await m.open(7, 800, 600);
    expect(body().openworldLogsFound).toBe('1');
    expect(read).not.toHaveBeenCalled();
  });

  it('closes the panel when the world is left, and works on a page with no panel', () => {
    document.body.innerHTML = PAGE;
    const { m } = setup();
    m.enter(7, 800, 600);
    m.fixture({ hero: [3, 0], troop: [], enemies: [] });
    m.key('ArrowRight');
    m.release('ArrowRight');
    m.leave();
    expect(panel().hidden).toBe(true);
    expect(body().openworldLog).toBeUndefined();
    document.body.innerHTML = '';
    m.enter(7, 800, 600);
    m.fixture({ hero: [3, 0], troop: [], enemies: [] });
    m.key('ArrowRight');
    m.release('ArrowRight');
    expect(body().openworldAt).toBe('4,0');
  });

  it('a log left out (#1595: the bridge gives it as `i32::MIN` twice) keeps the numbers of the others: no stake, none published, and the next log is still log 1', () => {
    document.body.innerHTML = PAGE;
    const saves = worldSaves(memoryStore(), 1);
    const none = Array.from({ length: 11 }, () => undefined) as [];
    const left = -2147483648;
    const m = new OpenWorldMode(grass, () => new Int32Array(), async () => ({ low: {}, high: {} }), () => true, saves, ...none, () => Int32Array.of(left, left, 4, 0));
    m.enter(7, 800, 600);
    expect(body().openworldLogs).toBe('4,0'); // the cell of log 1 only
    m.fixture({ hero: [3, 0], troop: [], enemies: [] });
    m.key('ArrowRight');
    m.release('ArrowRight');
    expect(body().openworldLog).toBe(WORLD_LOGS[1]!.id); // the second log's text, not the first's
    expect(body().openworldLogsFound).toBe('1');
  });

  it('a world with no logs and no archive callback still works', () => {
    const m = new OpenWorldMode(grass, () => new Int32Array(), async () => ({ low: {}, high: {} }), () => true, worldSaves(memoryStore(), 1));
    m.enter(7, 800, 600);
    expect(body().openworldLogs).toBe('');
    const withLogs = new OpenWorldMode(grass, () => new Int32Array(), async () => ({ low: {}, high: {} }), () => true, worldSaves(memoryStore(), 1), ...(Array.from({ length: 11 }, () => undefined) as []), () => LOGS);
    withLogs.enter(7, 800, 600);
    withLogs.fixture({ hero: [3, 0], troop: [], enemies: [] });
    withLogs.key('ArrowRight');
    withLogs.release('ArrowRight');
    expect(body().openworldLogsFound).toBe('0');
  });

  it('hands the minimap the logs of the discovered cells, the found one marked found', () => {
    const calls: string[] = [];
    const ctx = new Proxy({}, { get: (_t, key) => (typeof key === 'string' && !/^(canvas|fillStyle|strokeStyle|lineWidth|globalAlpha|font|textAlign|textBaseline|lineCap|lineJoin)$/.test(key) ? (...args: unknown[]) => (calls.push(key), args.length ? undefined : { width: 0 }) : undefined), set: () => true });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as CanvasRenderingContext2D);
    const { m } = setup();
    m.enter(7, 800, 600);
    m.fixture({ hero: [3, 0], troop: [], enemies: [] });
    calls.length = 0;
    m.key('ArrowRight');
    m.release('ArrowRight');
    expect(body().openworldLogsFound).toBe('0');
    expect(calls.length).toBeGreaterThan(0); // the minimap was drawn with the found log on its discovered cell
  });
});
