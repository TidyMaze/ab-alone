// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './test/openworldwasm';
import { CHUNK } from './openworld';
import { FightState } from './openworldfight';
import { BOSS_COLOURS, ICON } from './openworldlairicon';
import { OpenWorldMode } from './openworldmode';
import { worldSaves } from './openworldsave';
import { memoryStore } from './savegame';
import { stopLeftIntervalsAfterEach } from './test/intervals';
stopLeftIntervalsAfterEach();

// The rings of the towers (#1532, docs/specs/openworld.md section 15): guidance is on the nearest ring with a tower not beaten. A tower in a
// farther ring is drawn only once its cell is discovered, is never an arrow or the bearing, and stays enterable.

function grass(_seed: number, cx: number, cy: number): Uint8Array {
  if (Math.abs(cx) > 3 || Math.abs(cy) > 3) return new Uint8Array();
  const out = new Uint8Array(CHUNK * CHUNK * 3);
  for (let i = 0; i < CHUNK * CHUNK; i++) out.set([1, 2, 4], i * 3);
  return out;
}
// Four towers, the boss of each by its number: two in ring 1, one in ring 2 (14 cells out, not discovered at the spawn), one in ring 3.
const LAIRS = Int32Array.of(3, 0, -4, 2, 14, 0, 0, -20);
const RINGS = Uint8Array.of(1, 1, 2, 3, 0, 2); // the four towers, then the two places: a town and a gate of the second ring
const PLACES = Int32Array.of(0, 0, 0, 1, 6, 6);
const BOSSES = ['echo', 'hull', 'choir', 'chaplain'];
const none = (n: number): undefined[] => Array.from({ length: n }, () => undefined);

const make = (saves = worldSaves(memoryStore(), 1), dungeon?: (...args: unknown[]) => Int32Array, rings: (seed: number) => Uint8Array = () => RINGS) =>
  new (OpenWorldMode as new (...args: unknown[]) => OpenWorldMode)(
    grass, () => new Int32Array(), async () => ({ low: {}, high: {} }), () => true, saves, () => LAIRS,
    ...none(7), dungeon, undefined, () => BOSSES, undefined, undefined, () => PLACES, undefined, undefined, rings,
  );
const text = (id: string): string => document.getElementById(id)!.textContent!;
const body = () => document.body.dataset;
const fills: string[] = [];
const blank = () => {};
const ctx = { fillStyle: '', strokeStyle: '', lineWidth: 0, clearRect: blank, save: blank, restore: blank, fillText: blank, beginPath: blank, arc: blank, moveTo: blank, lineTo: blank, closePath: blank, clip: blank, stroke: blank, fill() { fills.push(ctx.fillStyle); }, fillRect: blank };

beforeEach(() => {
  document.body.innerHTML = '<div id="openworld-hud"><p id="openworld-goal"></p><p id="openworld-bearing"></p></div><p id="openworld-dungeon-note"></p>';
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  fills.length = 0;
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  for (const key of Object.keys(body())) delete body()[key];
});
const drawn = (colour: string): number => fills.filter((c) => c === colour).length;

describe('the towers drawn on the minimap and the map (#1532)', () => {
  it('are the ones of the ring to beat at the spawn: the farther towers are not drawn before their cell is discovered', () => {
    make().enter(7, 800, 600);
    expect(drawn(BOSS_COLOURS.echo!)).toBe(1);
    expect(drawn(BOSS_COLOURS.hull!)).toBe(1);
    expect(drawn(BOSS_COLOURS.choir!)).toBe(0); // ring 2, 14 cells out
    expect(drawn(BOSS_COLOURS.chaplain!)).toBe(0); // ring 3
  });

  it('show the next ring once the ring to beat is beaten, the beaten ones staying drawn', () => {
    const m = make();
    m.enter(7, 800, 600);
    fills.length = 0;
    m.fixture({ hero: [0, 0], troop: [], enemies: [], beaten: [0, 1] });
    expect(drawn(ICON.done)).toBe(2);
    expect(drawn(BOSS_COLOURS.choir!)).toBe(1);
    expect(drawn(BOSS_COLOURS.chaplain!)).toBe(0);
  });

  it('keep a farther tower the hero has walked to, though it is neither an arrow nor the bearing', () => {
    const m = make();
    m.enter(7, 800, 600);
    m.fixture({ hero: [0, -12], troop: [], enemies: [] }); // the third ring's tower (0, -20) is within 10 cells: discovered
    fills.length = 0;
    m.fixture({ hero: [0, -12], troop: [], enemies: [] });
    expect(drawn(BOSS_COLOURS.chaplain!)).toBe(1);
    expect(text('openworld-bearing')).toMatch(/^Nearest tower: 1[0-9] cells/); // (3, 0) or (-4, 2), not the 8 cells to the third ring
  });

  it('draw every tower for a world with no rings: the guidance is the whole roster', () => {
    make(undefined, undefined, () => new Uint8Array()).enter(7, 800, 600);
    expect(drawn(BOSS_COLOURS.chaplain!)).toBe(1);
  });
});

describe('the bearing and the Nearest tower button of the ring to beat (#1532)', () => {
  it('point at the nearest tower of the ring to beat, not a nearer one of a farther ring', () => {
    const m = make();
    m.enter(7, 800, 600);
    m.fixture({ hero: [12, 0], troop: [], enemies: [] }); // the second ring's tower (14, 0) is 2 cells off, the first ring's (3, 0) 9
    expect(text('openworld-bearing')).toMatch(/^Nearest tower: 9 cells/);
    m.fixture({ hero: [12, 0], troop: [], enemies: [], beaten: [0, 1] });
    expect(text('openworld-bearing')).toMatch(/^Nearest tower: 2 cells/);
  });

  it('send the button to the ring to beat: the towers beyond it go to the bridge as beaten, tried last', () => {
    const dungeon = vi.fn((..._args: unknown[]) => new Int32Array());
    const m = make(undefined, dungeon);
    m.enter(7, 800, 600);
    m.dungeon();
    expect(dungeon.mock.calls[0]![2]).toEqual(Int32Array.of(2, 3));
    m.fixture({ hero: [0, 0], troop: [], enemies: [], beaten: [0] });
    m.dungeon();
    expect(dungeon.mock.calls[1]![2]).toEqual(Int32Array.of(0, 2, 3));
    m.fixture({ hero: [0, 0], troop: [], enemies: [], beaten: [0, 1] });
    m.dungeon();
    expect(dungeon.mock.calls[2]![2]).toEqual(Int32Array.of(0, 1, 3));
  });
});

describe('the rings published on the page (#1532)', () => {
  it('list the ring of each tower by number and the dungeon tier of each gate, none for a town', () => {
    const m = make();
    m.enter(7, 800, 600);
    expect(body().openworldRings).toBe('1 1 2 3');
    expect(body().openworldGateRings).toBe('2');
    m.leave();
    expect(body().openworldRings).toBeUndefined();
    expect(body().openworldGateRings).toBeUndefined();
  });
});

describe('a save from before the rings (#1532)', () => {
  it('keeps the lairs beaten by their number: lair k is still boss k, wherever its tower stands now', async () => {
    const saves = worldSaves(memoryStore(), 1);
    await saves.put(9, [0, 0], [], FightState.fromJSON({ removed: [], added: [], beaten: 0 }), 0, [], [3]); // a record that held lair 3 beaten
    const m = make(saves);
    await m.open(9, 800, 600);
    expect(body().openworldLairsBeaten).toBe('3');
    expect(drawn(ICON.done)).toBeGreaterThan(0); // lair 3, the Chaplain's, drawn beaten
    expect(drawn(BOSS_COLOURS.echo!)).toBeGreaterThan(0);
  });
});
