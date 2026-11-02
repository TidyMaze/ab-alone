// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './test/openworldwasm';
import type { Axial } from './board';
import { CHUNK } from './openworld';
import { Discovered } from './openworlddiscovered';
import { FightState } from './openworldfight';
import { UNIT } from './openworldmap';
import { screenOffset } from './openworldminimap';
import { OpenWorldMode } from './openworldmode';
import { worldSaves } from './openworldsave';
import { memoryStore } from './savegame';

// The teleporters of the Open world mode (#1412, docs/specs/openworld.md section 10). Open grass in the chunks -3..3, water on
// (11, 0); the teleporters stand on (2, -1), the spawn's, (10, 0), within sight of the spawn, (40, 0), out of it, and (63, 0), on the
// edge of the world. A lair stands on (10, 2).
function grass(_seed: number, cx: number, cy: number): Uint8Array {
  if (Math.abs(cx) > 3 || Math.abs(cy) > 3) return new Uint8Array();
  const out = new Uint8Array(CHUNK * CHUNK * 3);
  for (let i = 0; i < CHUNK * CHUNK; i++) {
    const q = cx * CHUNK + (i % CHUNK);
    const r = cy * CHUNK + Math.floor(i / CHUNK);
    out.set([2, q === 11 && r === 0 ? 0 : 2, 0], i * 3);
  }
  return out;
}
const TELEPORTERS = Int32Array.of(2, -1, 10, 0, 40, 0, 63, 0);
const setup = () => {
  const saves = worldSaves(memoryStore(), 1);
  const teleportersOf = vi.fn(() => TELEPORTERS);
  const m = new OpenWorldMode(grass, () => new Int32Array(), async () => ({ low: {}, high: {} }), () => true, saves, () => Int32Array.of(10, 2), undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, teleportersOf);
  return { m, saves, teleportersOf };
};
const body = () => document.body.dataset;
const button = () => document.getElementById('openworld-teleport') as HTMLButtonElement;
const caption = () => document.getElementById('openworld-map-note')!;
const PAGE = '<button id="openworld-map-button" aria-expanded="false">Map</button><button id="openworld-teleport" hidden>Teleport</button>';
/** A click on the map, which opens on the hero at UNIT px a cell, turned with the camera: on the cell `dq` east of the hero. */
const click = (m: OpenWorldMode, dq: number): void => {
  const root = document.getElementById('openworld-map')!;
  const [q, r] = body().openworldAt!.split(',').map(Number);
  const at: Axial = [q!, r!];
  const { x, y } = screenOffset(at, [at[0] + dq, at[1]], m.yaw);
  for (const type of ['pointerdown', 'pointerup']) {
    const event = new MouseEvent(type, { bubbles: true, clientX: 400 + x * UNIT, clientY: 300 + y * UNIT });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    root.dispatchEvent(event);
  }
};

beforeEach(() => {
  // A 2D context that draws nothing: the map draws, so it knows the camera's turn and the teleporter it rings.
  const ctx: Record<string, unknown> = {};
  for (const name of ['clearRect', 'save', 'restore', 'beginPath', 'arc', 'moveTo', 'lineTo', 'closePath', 'clip', 'stroke', 'fill', 'fillRect']) ctx[name] = () => {};
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  for (const key of Object.keys(body())) delete body()[key];
});

describe('the teleporters of the Open world mode (#1412)', () => {
  it('reads the teleporters of the seed, publishes the discovered ones and draws them in the world', () => {
    const { m, teleportersOf } = setup();
    m.enter(7, 800, 600);
    expect(teleportersOf).toHaveBeenCalledWith(7);
    expect(body().openworldTeleporters).toBe('2,-1 10,0');
    expect(m.scene!.getObjectByName('teleporter-pad')).toBeDefined();
    m.leave();
    expect(body().openworldTeleporters).toBeUndefined();
  });

  it('shows the Teleport button only while the hero stands on a teleporter', () => {
    document.body.innerHTML = PAGE;
    const { m } = setup();
    m.enter(7, 800, 600);
    expect(button().hidden).toBe(true);
    m.fixture({ hero: [2, -1], troop: [], enemies: [] });
    expect(button().hidden).toBe(false);
    m.leave();
    expect(button().hidden).toBe(true);
  });

  it('the Teleport action opens the map in the choice of a teleporter, only on a teleporter, and closes it again', () => {
    document.body.innerHTML = PAGE;
    const { m } = setup();
    m.teleport(); // outside a world: nothing
    m.enter(7, 800, 600);
    m.teleport(); // off a teleporter: nothing
    expect(m.mapShown).toBe(false);
    m.fixture({ hero: [2, -1], troop: [], enemies: [] });
    expect(m.key('t')).toBe(true);
    expect(m.mapShown).toBe(true);
    expect(caption().textContent).toBe('Choose a teleporter');
    expect(m.key('T')).toBe(true);
    expect(m.mapShown).toBe(false);
    m.teleport();
    m.teleport();
    expect(m.mapShown).toBe(false);
  });

  it('a click on a discovered teleporter moves the hero and the troop there, round it, and saves the world', async () => {
    document.body.innerHTML = PAGE;
    const { m, saves } = setup();
    m.enter(7, 800, 600);
    m.fixture({ hero: [2, -1], troop: [[1, -1], [0, -1]], enemies: [] });
    m.teleport();
    click(m, 8); // a cell next to (10, 0): close enough
    expect(m.mapShown).toBe(false);
    expect(body().openworldAt).toBe('10,0');
    expect(body().openworldTroop).toBe('9,0 9,1');
    expect(body().openworldPush).toBe('0'); // no fight on arrival
    m.frame(vi.fn());
    await new Promise((done) => setTimeout(done));
    expect((await saves.load(7))!.hero).toEqual([10, 0]);
  });

  it('a click on no teleporter, on one not discovered yet, or on the hero\'s own says so on the map and the hero stays', () => {
    document.body.innerHTML = PAGE;
    const { m } = setup();
    m.enter(7, 800, 600);
    m.fixture({ hero: [2, -1], troop: [], enemies: [] });
    m.teleport();
    click(m, -30);
    expect(caption().textContent).toBe('No discovered teleporter there');
    m.key('Escape');
    m.fixture({ hero: [40, 0], troop: [], enemies: [] }); // (40, 0) is discovered now, and the hero stands on it
    m.fixture({ hero: [2, -1], troop: [], enemies: [] });
    expect(body().openworldTeleporters).toBe('2,-1 10,0 40,0');
    m.teleport();
    click(m, 0);
    expect(caption().textContent).toBe('the hero stands on that teleporter');
    expect(body().openworldAt).toBe('2,-1');
  });

  it('a teleporter with an enemy on it, or with no room round it for the troop, is refused', () => {
    document.body.innerHTML = PAGE;
    const { m } = setup();
    m.enter(7, 800, 600);
    m.fixture({ hero: [63, 0], troop: [], enemies: [] }); // the edge teleporter: discovered, half its ring off the world
    m.fixture({ hero: [10, 0], troop: Array.from({ length: 6 }, (): Axial => [10, -3]), enemies: [] });
    m.fixture({ hero: [2, -1], troop: Array.from({ length: 30 }, (): Axial => [0, 3]), enemies: [[10, 0]] });
    m.teleport();
    click(m, 8);
    expect(caption().textContent).toBe('an enemy stands on the teleporter on (10,0)');
    m.key('Escape');
    m.fixture({ hero: [2, -1], troop: Array.from({ length: 30 }, (): Axial => [0, 3]), enemies: [] });
    m.teleport();
    click(m, 61);
    expect(caption().textContent).toBe('no room for the troop round the teleporter on (63,0)');
  });

  it('keeps the troop off the water, the lair and the enemies round the teleporter it arrives on', () => {
    document.body.innerHTML = PAGE;
    const { m } = setup();
    m.enter(7, 800, 600);
    m.fixture({ hero: [2, -1], troop: Array.from({ length: 20 }, (): Axial => [0, 3]), enemies: [[9, 0]] });
    m.teleport();
    click(m, 8);
    const troop = body().openworldTroop!.split(' ');
    expect(troop).toHaveLength(20);
    for (const taken of ['11,0', '10,2', '9,0']) expect(troop).not.toContain(taken);
  });

  it('Enter picks the teleporter the map rings, nearest its middle; a click on the map outside the choice picks nothing', () => {
    document.body.innerHTML = PAGE;
    const { m } = setup();
    m.enter(7, 800, 600);
    m.fixture({ hero: [2, -1], troop: [], enemies: [] });
    m.key('m');
    click(m, 8);
    expect(m.mapShown).toBe(true);
    expect(m.key('Enter')).toBe(false); // the plain map: Enter is not the mode's
    m.key('m');
    m.teleport();
    expect(m.key('Enter')).toBe(true);
    expect(body().openworldAt).toBe('10,0');
  });

  it('a save keeps the teleporters discovered: they are the cells discovered, saved with the world', async () => {
    const { m, saves } = setup();
    const seen = new Discovered();
    seen.reveal([40, 0]);
    await saves.put(7, [0, 0], [], FightState.fromJSON({ removed: [], added: [], beaten: 0 }), 0, [], [], seen.toJSON());
    await m.open(7, 800, 600);
    expect(body().openworldTeleporters).toBe('2,-1 10,0 40,0');
  });
});
