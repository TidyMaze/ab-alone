// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './test/openworldwasm';
import { CHUNK } from './openworld';
import { OpenWorldMode } from './openworldmode';
import { FightState } from './openworldfight';
import { worldSaves } from './openworldsave';
import { memoryStore } from './savegame';
import { stopLeftIntervalsAfterEach } from './test/intervals';
stopLeftIntervalsAfterEach();

// The goal of the Open world on arrival (#1530): one sentence of objective and the bearing to the nearest tower not beaten in the HUD, and
// the controls behind a collapsed hint that H opens and closes.

function grass(_seed: number, cx: number, cy: number): Uint8Array {
  if (Math.abs(cx) > 3 || Math.abs(cy) > 3) return new Uint8Array();
  const out = new Uint8Array(CHUNK * CHUNK * 3);
  for (let i = 0; i < CHUNK * CHUNK; i++) out.set([1, 2, 4], i * 3);
  return out;
}
const LAIRS = Int32Array.of(3, 0, -4, 2);
const setup = () => {
  const saves = worldSaves(memoryStore(), 1);
  const m = new OpenWorldMode(grass, () => new Int32Array(), async () => ({ low: {}, high: {} }), () => true, saves, () => LAIRS);
  return { m, saves };
};
const text = (id: string): string => document.getElementById(id)!.textContent!;
const fightOf = () => FightState.fromJSON({ removed: [], added: [], beaten: 0 });

beforeEach(() => {
  document.body.innerHTML =
    '<div id="openworld-hud"><p id="openworld-goal"></p><p id="openworld-bearing"></p><details id="openworld-controls"><summary>Controls</summary></details></div><button id="openworld-chip" hidden></button>';
});
afterEach(() => {
  document.body.innerHTML = '';
  for (const key of Object.keys(document.body.dataset)) delete document.body.dataset[key];
});

describe('the goal lines of the HUD (#1530)', () => {
  it('say the objective and the bearing to the nearest tower when a world opens', () => {
    setup().m.enter(7, 800, 600);
    expect(text('openworld-goal')).toBe('Goal: beat the 2 towers of Hollow. One medal each.');
    expect(text('openworld-bearing')).toBe('Nearest tower: 3 cells, to the upper right.'); // the camera at rest sees the ground turned by 30 degrees
  });

  it('follow the hero: a step toward the tower, a tower beaten, and every tower beaten', async () => {
    const { m, saves } = setup();
    m.enter(7, 800, 600);
    m.fixture({ hero: [2, 0], troop: [], enemies: [] });
    expect(text('openworld-bearing')).toBe('Nearest tower: 1 cell, to the upper right.');
    m.fixture({ hero: [2, 0], troop: [], enemies: [], beaten: [0] });
    expect(text('openworld-bearing')).toBe('Nearest tower: 6 cells, to the lower left.'); // (-4, 2) from (2, 0): dq -6, dr 2
    m.fixture({ hero: [2, 0], troop: [], enemies: [], beaten: [0, 1] });
    expect(text('openworld-goal')).toBe('Goal done: all 2 towers are beaten.');
    expect(text('openworld-bearing')).toBe('Left: the dungeon gates.');
    await saves.put(8, [0, 0], [], fightOf(), 0, [], [0]);
    await m.open(8, 800, 600); // a world saved with a tower beaten
    expect(text('openworld-bearing')).toBe('Nearest tower: 4 cells, to the left.'); // the saved world rests the camera at a yaw of +30 degrees
  });

  it('turn with the camera, as the minimap does, and are written only when they change', () => {
    const { m } = setup();
    m.enter(7, 800, 600);
    const before = text('openworld-bearing');
    const render = vi.fn();
    m.turn(Math.PI);
    for (let t = 0; t <= 4000; t += 1000) m.frame(render, t);
    expect(text('openworld-bearing')).toBe('Nearest tower: 3 cells, to the lower left.');
    expect(text('openworld-bearing')).not.toBe(before);
    const goal = document.getElementById('openworld-goal')!;
    const write = vi.spyOn(goal, 'textContent', 'set');
    m.turn(Math.PI / 100);
    for (let t = 5000; t <= 6000; t += 500) m.frame(render, t);
    expect(write).not.toHaveBeenCalled(); // the goal sentence did not change
  });

  it('write nothing for a world with no tower, and leave a page with no HUD alone', () => {
    const m = new OpenWorldMode(grass, () => new Int32Array(), async () => ({ low: {}, high: {} }), () => true, worldSaves(memoryStore(), 1));
    m.enter(7, 800, 600);
    expect(text('openworld-goal')).toBe('');
    expect(text('openworld-bearing')).toBe('');
    document.body.innerHTML = '';
    setup().m.enter(7, 800, 600);
    expect(document.body.dataset.openworld).toBe('7');
  });
});

describe('the collapsed controls of the HUD (#1530)', () => {
  const controls = () => document.getElementById('openworld-controls') as HTMLDetailsElement;

  it('open and close with H, and keep what the player left', () => {
    const { m } = setup();
    m.enter(7, 800, 600);
    expect(controls().open).toBe(false);
    expect(m.key('h')).toBe(true);
    expect(controls().open).toBe(true);
    expect(m.key('H')).toBe(true);
    expect(controls().open).toBe(false);
    m.enter(8, 800, 600); // another world: the hint stays closed
    m.fixture({ hero: [1, 0], troop: [], enemies: [] });
    expect(controls().open).toBe(false);
  });

  it('show the plate first when it is folded, and open the controls on it', () => {
    const { m } = setup();
    m.enter(7, 800, 600);
    const hud = document.getElementById('openworld-hud')!;
    const chip = vi.fn();
    document.getElementById('openworld-chip')!.addEventListener('click', chip);
    hud.dataset.folded = '1';
    m.key('h');
    expect(chip).toHaveBeenCalledTimes(1);
    expect(controls().open).toBe(true);
  });

  it('are not the key of the map: H is ignored while the map is open, and with no HUD it does nothing', () => {
    const { m } = setup();
    m.enter(7, 800, 600);
    m.toggleMap();
    expect(m.key('h')).toBe(false);
    expect(controls().open).toBe(false);
    m.toggleMap();
    document.body.innerHTML = '';
    expect(m.key('h')).toBe(true); // the key is the mode's, there is nothing to open
  });
});
