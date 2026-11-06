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
import { stopLeftIntervalsAfterEach } from './test/intervals';
stopLeftIntervalsAfterEach();

// The pad a tower beaten through the world leaves (#1531, docs/specs/openworld.md section 15). Open grass in the chunks -3..3; the teleporters
// stand on (2, -1), the spawn's, and (40, 0); the towers on (6, 2), within sight of the spawn, and (40, 3); the pads, one beside each tower, on (6, 1)
// and (40, 2).
function grass(_seed: number, cx: number, cy: number): Uint8Array {
  if (Math.abs(cx) > 3 || Math.abs(cy) > 3) return new Uint8Array();
  const out = new Uint8Array(CHUNK * CHUNK * 3);
  for (let i = 0; i < CHUNK * CHUNK; i++) out.set([2, 2, 0], i * 3);
  return out;
}
const TELEPORTERS = Int32Array.of(2, -1, 40, 0);
const TOWERS = Int32Array.of(6, 2, 40, 3);
const PADS = Int32Array.of(6, 1, 40, 2);
const setup = (pads: (seed: number) => Int32Array = () => PADS, saves = worldSaves(memoryStore(), 1)) => {
  const m = new OpenWorldMode(grass, () => new Int32Array(), async () => ({ low: {}, high: {} }), () => true, saves, () => TOWERS, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, () => TELEPORTERS, undefined, undefined, undefined, undefined, undefined, undefined, undefined, pads);
  return { m, saves };
};
const body = () => document.body.dataset;
const PAGE = '<button id="openworld-map-button" aria-expanded="false">Map</button><button id="openworld-teleport" hidden>Teleport</button>';
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
  const ctx: Record<string, unknown> = {};
  for (const name of ['clearRect', 'save', 'restore', 'beginPath', 'arc', 'moveTo', 'lineTo', 'closePath', 'clip', 'fillText', 'stroke', 'fill', 'fillRect']) ctx[name] = () => {};
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  for (const key of Object.keys(body())) delete body()[key];
});

const fight = () => FightState.fromJSON({ removed: [], added: [], beaten: 0 });

describe('the pad of a tower beaten through the world (#1531)', () => {
  it('a tower not beaten leaves no pad: the network is the seed\'s teleporters alone', () => {
    const { m } = setup();
    m.enter(7, 800, 600);
    expect(body().openworldTeleporters).toBe('2,-1');
    expect(m.scene!.getObjectByName('teleporter-pad')).toBeDefined();
  });

  it('a world saved with a tower beaten opens with its pad in the network, discovered once its cell is', async () => {
    const { m, saves } = setup();
    const seen = new Discovered();
    seen.reveal([0, 0]);
    await saves.put(7, [0, 0], [], fight(), 0, [], [0], seen.toJSON());
    await m.open(7, 800, 600);
    expect(body().openworldTeleporters).toBe('2,-1 6,1');
  });

  it('a pad far from the hero stays undiscovered, then shows when the hero walks up to it', async () => {
    const { m, saves } = setup();
    await saves.put(7, [0, 0], [], fight(), 0, [], [0, 1], new Discovered().toJSON());
    await m.open(7, 800, 600);
    expect(body().openworldTeleporters).toBe('2,-1 6,1');
    m.fixture({ hero: [38, 2], troop: [], enemies: [] });
    expect(body().openworldTeleporters).toBe('2,-1 40,0 6,1 40,2');
  });

  it('the fixture that sets the towers beaten sets the pads with them', () => {
    const { m } = setup();
    m.enter(7, 800, 600);
    m.fixture({ hero: [4, 0], troop: [], enemies: [], beaten: [0] });
    expect(body().openworldTeleporters).toBe('2,-1 6,1');
    m.fixture({ hero: [4, 0], troop: [], enemies: [], beaten: [] });
    expect(body().openworldTeleporters).toBe('2,-1');
  });

  it('a tower another hero beat leaves no pad here: it is drawn beaten for the visit, never filed', () => {
    const { m } = setup();
    m.enter(7, 800, 600);
    m.remoteLair([6, 2]);
    expect(body().openworldTeleporters).toBe('2,-1');
  });

  it('a tower the engine gives no pad for leaves none, and a tower number past the pads is ignored', () => {
    const { m } = setup(() => Int32Array.of(6, 1));
    m.enter(7, 800, 600);
    m.fixture({ hero: [4, 0], troop: [], enemies: [], beaten: [0, 1] });
    expect(body().openworldTeleporters).toBe('2,-1 6,1');
  });

  it('the hero teleports from the spawn pad to the pad of a beaten tower, and the troop arrives round it with no fight', () => {
    document.body.innerHTML = PAGE;
    const { m } = setup();
    m.enter(7, 800, 600);
    m.fixture({ hero: [2, -1], troop: [[1, -1], [0, -1]], enemies: [], beaten: [0] });
    m.teleport();
    click(m, 4); // the pad of the tower, 4 cells east of the spawn pad
    expect(body().openworldAt).toBe('6,1');
    expect(body().openworldPush).toBe('0');
    expect(body().openworldTroop!.split(' ')).toHaveLength(2);
    expect(body().openworldTroop).not.toContain('6,2'); // the tower's cell is not a cell the troop can stand on
  });

  it('a hero standing on the pad of a beaten tower gets the Teleport button', () => {
    document.body.innerHTML = PAGE;
    const { m } = setup();
    m.enter(7, 800, 600);
    m.fixture({ hero: [6, 1], troop: [], enemies: [], beaten: [0] });
    expect((document.getElementById('openworld-teleport') as HTMLButtonElement).hidden).toBe(false);
    m.fixture({ hero: [6, 1], troop: [], enemies: [], beaten: [] });
    expect((document.getElementById('openworld-teleport') as HTMLButtonElement).hidden).toBe(true);
  });
});
