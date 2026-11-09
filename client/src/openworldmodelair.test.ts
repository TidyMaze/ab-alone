// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import './test/openworldwasm';
import type { Axial } from './board';
import { CHUNK } from './openworld';
import { CLAIM_NOTE } from './openworldgoal';
import { OpenWorldMode } from './openworldmode';
import { worldSaves } from './openworldsave';
import { memoryStore } from './savegame';
import { stopLeftIntervalsAfterEach } from './test/intervals';
stopLeftIntervalsAfterEach();

// Open grass everywhere in the square -3..3 of chunks; the lairs stand at (3, 0) and (-4, 2), lair 0 beaten in `saved`.
function grass(_seed: number, cx: number, cy: number): Uint8Array {
  if (Math.abs(cx) > 3 || Math.abs(cy) > 3) return new Uint8Array();
  const out = new Uint8Array(CHUNK * CHUNK * 3);
  for (let i = 0; i < CHUNK * CHUNK; i++) out.set([1, 2, 4], i * 3);
  return out;
}
const LAIRS = Int32Array.of(3, 0, -4, 2);
/** A mode with the stage of the story (#1546) and Tally's claim line, the parameters between them left to their defaults. */
const withStage = (saves: ReturnType<typeof worldSaves>, stage: () => number, tally?: () => string, lairs: () => Int32Array = () => LAIRS, onLair: (seed: number, lair: number) => void = () => {}) =>
  new OpenWorldMode(grass, () => new Int32Array(), async () => ({ low: {}, high: {} }), () => true, saves, lairs, onLair, undefined, undefined, tally, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, stage);
const setup = (beaten: number[] = [], stage: () => number = () => 1) => {
  const store = memoryStore();
  const saves = worldSaves(store, 1);
  const lairsOf = vi.fn(() => LAIRS);
  const onLair = vi.fn();
  const m = withStage(saves, stage, undefined, lairsOf, onLair);
  return { m, saves, lairsOf, onLair, beaten };
};
const body = () => document.body.dataset;

afterEach(() => {
  for (const key of Object.keys(body())) delete body()[key];
});

describe('the boss lairs of the Open world mode (#1170)', () => {
  it('publishes the lair cells and the beaten ones on entering, and draws a landmark on each', async () => {
    const { m, saves, lairsOf } = setup();
    await saves.put(7, [0, 0], [], (await import('./openworldfight')).FightState.fromJSON({ removed: [], added: [], beaten: 0 }), 0, [], [1]);
    await m.open(7, 800, 600);
    expect(lairsOf).toHaveBeenCalledWith(7);
    expect(body().openworldLairs).toBe('3,0 -4,2');
    expect(body().openworldLairsBeaten).toBe('1');
    m.leave();
    expect(body().openworldLairs).toBeUndefined();
    expect(body().openworldLairsBeaten).toBeUndefined();
  });

  it('publishes no beaten lair for a world with no save', () => {
    const { m } = setup();
    m.enter(7, 800, 600);
    expect(body().openworldLairs).toBe('3,0 -4,2');
    expect(body().openworldLairsBeaten).toBe('');
  });

  it('stepping onto a lair cell from its entrance starts the lair: the mode is left, the hero stays on the entrance and the save keeps it', async () => {
    const { m, saves, onLair } = setup();
    m.enter(7, 800, 600);
    m.fixture({ hero: [2, 0], troop: [[1, 0]], enemies: [] });
    m.key('ArrowRight');
    m.release('ArrowRight');
    expect(onLair).toHaveBeenCalledWith(7, 0, [], []);
    expect(m.active).toBe(false);
    for (let i = 0; i < 10; i++) await new Promise((done) => setTimeout(done));
    expect((await saves.load(7))!.hero).toEqual([2, 0]);
  });

  it('tells the lair the special marbles and the relics the army brings (#1655), as copies', () => {
    const { m, onLair } = setup();
    m.enter(7, 800, 600);
    const army = { specials: [1, 9], brought: [9, 1], relics: [0, 4], relicsBrought: [4, 0] };
    m.fixture({ hero: [2, 0], troop: [[1, 0]], enemies: [], army });
    m.key('ArrowRight');
    m.release('ArrowRight');
    expect(onLair).toHaveBeenCalledWith(7, 0, [9, 1], [4, 0]);
    expect(onLair.mock.calls[0]![2]).not.toBe(army.brought);
  });

  it('starts the second lair too, and a lair already beaten again', () => {
    const { m, onLair } = setup();
    m.enter(7, 800, 600);
    m.fixture({ hero: [-4, 3], troop: [], enemies: [] });
    m.key('ArrowLeft');
    m.release('ArrowLeft');
    expect(onLair).toHaveBeenCalledWith(7, 1, [], []);
  });

  it('ignores a press on a lair cell the hero is not next to', () => {
    const { m, onLair } = setup();
    m.enter(7, 800, 600);
    (m as unknown as { roll(to: Axial): void }).roll([3, 0]);
    expect(onLair).not.toHaveBeenCalled();
    expect(m.active).toBe(true);
  });

  it('leaves the world on a lair even when nothing is listening for it', () => {
    const m = new OpenWorldMode(grass, () => new Int32Array(), async () => ({ low: {}, high: {} }), () => true, worldSaves(memoryStore(), 1), () => LAIRS);
    m.enter(7, 800, 600);
    m.fixture({ hero: [2, 0], troop: [], enemies: [] });
    m.key('ArrowRight');
    m.release('ArrowRight');
    expect(m.active).toBe(false);
  });

  it('saves the beaten lairs it was opened with', async () => {
    const { m, saves } = setup();
    await saves.put(7, [0, 0], [], (await import('./openworldfight')).FightState.fromJSON({ removed: [], added: [], beaten: 0 }), 0, [], [0]);
    await m.open(7, 800, 600);
    m.fixture({ hero: [0, 1], troop: [], enemies: [] });
    m.key('ArrowLeft');
    m.release('ArrowLeft');
    m.leave();
    for (let i = 0; i < 10; i++) await new Promise((done) => setTimeout(done));
    expect((await saves.load(7))!.lairs).toEqual([0]);
  });
});

describe('the medal count of the Open world HUD (#1171)', () => {
  const withMedals = (medals: () => { have: number; total: number }) =>
    new OpenWorldMode(grass, () => new Int32Array(), async () => ({ low: {}, high: {} }), () => true, worldSaves(memoryStore(), 1), () => LAIRS, () => {}, undefined, medals);

  it('writes "Medals N / total" in the HUD when a world opens, and leaves the page alone without a HUD', () => {
    const out = document.createElement('output');
    out.id = 'openworld-medals';
    document.body.append(out);
    const m = withMedals(() => ({ have: 3, total: 14 }));
    m.enter(7, 800, 600);
    expect(out.textContent).toBe('Medals 3 / 14');
    out.remove();
    m.enter(7, 800, 600); // no element: nothing to write to
    expect(body().openworld).toBe('7');
  });

  it('counts no medal by default', () => {
    const out = document.createElement('output');
    out.id = 'openworld-medals';
    document.body.append(out);
    setup().m.enter(7, 800, 600);
    expect(out.textContent).toBe('Medals 0 / 0');
    out.remove();
  });
});

describe("Tally's line in the Open world HUD (#1171)", () => {
  const withTally = (tally: () => string) =>
    new OpenWorldMode(grass, () => new Int32Array(), async () => ({ low: {}, high: {} }), () => true, worldSaves(memoryStore(), 1), () => LAIRS, () => {}, undefined, undefined, tally);

  it('writes the line the page gives when a world opens, and clears it when the page gives none', () => {
    const out = document.createElement('p');
    out.id = 'openworld-tally';
    document.body.append(out);
    const lines = ['Claim 0412: unworked.', ''];
    const m = withTally(() => lines.shift()!);
    m.enter(7, 800, 600);
    expect(out.textContent).toBe(`Claim 0412: unworked. ${CLAIM_NOTE}`); // the line is explained once, in one sentence (#1530)
    m.enter(7, 800, 600);
    expect(out.textContent).toBe('');
    out.remove();
    m.enter(7, 800, 600); // no element: nothing to write to
    expect(body().openworld).toBe('7');
  });

  it('shows no line by default', () => {
    const out = document.createElement('p');
    out.id = 'openworld-tally';
    out.textContent = 'old';
    document.body.append(out);
    setup().m.enter(7, 800, 600);
    expect(out.textContent).toBe('');
    out.remove();
  });
});

describe('the ending line of the Open world (#1175)', () => {
  const ENDING = 'Variance noted. Clamp: open. Crew attached: 6.';
  const hud = () => {
    const out = document.createElement('p');
    out.id = 'openworld-tally';
    document.body.append(out);
    return out;
  };
  const fightOf = async () => (await import('./openworldfight')).FightState.fromJSON({ removed: [], added: [], beaten: 0 });

  it('shows the ending line instead of the claim line once a world opens with every lair beaten, and the claim line before', async () => {
    const out = hud();
    const { m, saves } = setup([], () => 7);
    await saves.put(7, [0, 0], [], await fightOf(), 0, [], [0]);
    await m.open(7, 800, 600);
    expect(out.textContent).toBe('Seats on file: 1 of 2. Clamp: open.'); // one lair of two: not over, the ledger line (#1315, #1546)
    m.leave();
    await saves.put(7, [0, 0], [], await fightOf(), 0, [], [1, 0]);
    await m.open(7, 800, 600);
    expect(out.textContent).toBe(ENDING);
    out.remove();
  });

  it('does not use up the claim line when the world is over', async () => {
    const out = hud();
    const tally = vi.fn(() => 'Claim 0412: unworked.');
    const m = withStage(worldSaves(memoryStore(), 1), () => 7, tally);
    m.enter(7, 800, 600, null);
    m.fixture({ hero: [0, 0], troop: [], enemies: [], beaten: [0, 1] });
    expect(tally).toHaveBeenCalledTimes(1);
    expect(out.textContent).toBe(ENDING);
    out.remove();
  });

  // #1546: the clamp opens with the epilogue, at stage 7: before it the line agrees and says locked, and the ledger line gives way to the open clamp.
  it('says the clamp is locked before stage 7 and open from it, in the ending line and the ledger line', async () => {
    const out = hud();
    let stage = 6;
    const { m, saves } = setup([], () => stage);
    await saves.put(7, [0, 0], [], await fightOf(), 0, [], [1, 0]);
    await m.open(7, 800, 600);
    expect(out.textContent).toBe('Variance noted. Clamp: locked. Crew attached: 6.');
    m.leave();
    stage = 7;
    await m.open(7, 800, 600);
    expect(out.textContent).toBe(ENDING);
    m.leave();
    await saves.put(7, [0, 0], [], await fightOf(), 0, [], [0]);
    await m.open(7, 800, 600);
    expect(out.textContent).toBe('Seats on file: 1 of 2. Clamp: open.');
    out.remove();
  });

  it('a world with no lair is never over', () => {
    const out = hud();
    const m = new OpenWorldMode(grass, () => new Int32Array(), async () => ({ low: {}, high: {} }), () => true, worldSaves(memoryStore(), 1), () => new Int32Array());
    m.enter(7, 800, 600);
    expect(out.textContent).toBe('');
    out.remove();
  });

  it('the fixture sets the beaten lairs, draws them and saves them; without them it keeps the lairs as they were', async () => {
    const out = hud();
    const { m, saves } = setup([], () => 7);
    m.enter(7, 800, 600);
    m.fixture({ hero: [0, 0], troop: [], enemies: [] });
    expect(body().openworldLairsBeaten).toBe('');
    m.fixture({ hero: [0, 0], troop: [], enemies: [], beaten: [0] });
    expect(body().openworldLairsBeaten).toBe('0');
    expect(out.textContent).toBe('');
    m.fixture({ hero: [0, 0], troop: [], enemies: [], beaten: [0, 1] });
    expect(out.textContent).toBe(ENDING);
    m.leave();
    for (let i = 0; i < 10; i++) await new Promise((done) => setTimeout(done));
    expect((await saves.load(7))!.lairs).toEqual([0, 1]);
    out.remove();
  });

  it('shows the ledger line of the seats on file once a world opens with some lairs beaten (#1315)', async () => {
    const out = hud();
    const { m, saves } = setup();
    await saves.put(7, [0, 0], [], await fightOf(), 0, [], [0]);
    await m.open(7, 800, 600);
    expect(out.textContent).toBe('Seats on file: 1 of 2. Slag-glass remembers heat.');
    m.leave();
    await saves.put(7, [0, 0], [], await fightOf(), 0, [], []);
    await m.open(7, 800, 600);
    expect(out.textContent).toBe(''); // none beaten: the page gives the line (none here)
    out.remove();
  });

  it('does not use up the claim line once a lair is beaten, the ledger line shows instead (#1315)', async () => {
    const out = hud();
    const tally = vi.fn(() => 'Claim 0412: unworked.');
    const saves = worldSaves(memoryStore(), 1);
    await saves.put(7, [0, 0], [], await fightOf(), 0, [], [0]);
    const m = new OpenWorldMode(grass, () => new Int32Array(), async () => ({ low: {}, high: {} }), () => true, saves, () => LAIRS, () => {}, undefined, undefined, tally);
    await m.open(7, 800, 600);
    expect(tally).toHaveBeenCalledTimes(0); // the claim line is not asked for once a lair is beaten
    expect(out.textContent).toBe('Seats on file: 1 of 2. Slag-glass remembers heat.');
    out.remove();
  });

  it('an old save with no lairs still loads, not over', async () => {
    const out = hud();
    const { m } = setup();
    m.enter(7, 800, 600, null);
    expect(out.textContent).toBe('');
    out.remove();
  });
});
