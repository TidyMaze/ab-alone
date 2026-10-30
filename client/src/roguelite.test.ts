// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { cellIndex, type Move } from './board';
import { contrastRatio, type RGB } from './contrast';
import { GLASS, SHELL } from './marbles';
import {
  choices,
  claim,
  clearRun,
  FIGHT_CAP,
  fightOver,
  loadRun,
  mapHtml,
  newRun,
  offers,
  parseMap,
  parseSpecials,
  pick,
  place,
  placeHtml,
  placing,
  rewardHtml,
  RUN_KEY,
  runLine,
  saveRun,
  sparkBurst,
  SPECIAL_LOOKS,
  START_ARMY,
  type MapNode,
  type Run,
} from './roguelite';
import { memoryStore, type KeyStore } from './savegame';

// A small map in the bridge's encoding (crates/abalone-wasm/src/lib.rs): 2 acts of one fight row of 2 nodes, then a
// boss. Act 1: node 0 leads to the boss, node 1 too. Act 2 the same. Indices: 0, 1 fights, 2 boss, 3, 4 fights, 5 boss.
const FLAT = [0, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0];
const MAP = parseMap(FLAT);
const at = (run: Run, ...path: number[]): Run => ({ ...run, path });
const failing: KeyStore = {
  get: () => Promise.reject(new Error('blocked')),
  put: () => Promise.reject(new Error('blocked')),
  delete: () => Promise.reject(new Error('blocked')),
};
// A replay engine that refuses the move [9, ...] and is over after [7, ...].
const engine = (army: number, placed: number[][] = []) => {
  const played: number[] = [];
  return {
    army,
    placed,
    played,
    play(mv: Int32Array): void {
      if (mv[0] === 9) throw new Error('illegal');
      played.push(mv[0]!);
    },
    status: () => (played.includes(7) ? 1 : 0),
  };
};
const MV = [1, 0, 0, 0, 0, 0, 0, 0];

describe('roguelite', () => {
  it('parses the map records of the bridge', () => {
    expect(MAP).toHaveLength(6);
    expect(MAP[0]).toEqual({ act: 0, row: 0, col: 0, boss: false, links: [0] });
    expect(MAP[2]).toEqual({ act: 0, row: 1, col: 0, boss: true, links: [] });
    expect(parseMap([0, 0, 1, 0, 0b101])[0]!.links).toEqual([0, 2]);
  });

  it('a new run has the full army and offers the first row of act 1', () => {
    const run = newRun(5);
    expect(run).toEqual({ seed: 5, army: START_ARMY, path: [], fighting: false, moves: [], end: '', specials: [0, 0, 0], placed: [], reward: false });
    expect(choices(MAP, run)).toEqual([0, 1]);
  });

  it('a fight node leads to its links, a boss to the first row of the next act', () => {
    expect(choices(MAP, at(newRun(1), 0))).toEqual([2]);
    expect(choices(MAP, at(newRun(1), 1, 2))).toEqual([3, 4]);
  });

  it('nothing is offered during a fight or once the run is over', () => {
    expect(choices(MAP, pick(newRun(1), 0))).toEqual([]);
    expect(choices(MAP, { ...newRun(1), end: 'lost' })).toEqual([]);
  });

  it('a pick starts the fight of that node with no move', () => {
    expect(pick({ ...newRun(1), moves: [MV] }, 1)).toEqual({ ...newRun(1), path: [1], fighting: true, moves: [] });
  });

  it('a won fight costs the ejected marbles and goes on, a lost one ends the run', () => {
    const fight = pick(newRun(1), 0);
    expect(fightOver(MAP, fight, true, 2)).toEqual({ ...fight, army: 12, fighting: false, end: '', reward: true });
    expect(fightOver(MAP, fight, false, 3).end).toBe('lost');
  });

  it('the run ends below 4 marbles, and is won on the last boss', () => {
    expect(fightOver(MAP, { ...pick(newRun(1), 0), army: 5 }, true, 2)).toMatchObject({ army: 3, end: 'lost', reward: false });
    expect(fightOver(MAP, { ...pick(newRun(1), 2), path: [0, 2] }, true, 0).end).toBe('');
    expect(fightOver(MAP, { ...pick(newRun(1), 5), path: [0, 2, 3, 5] }, true, 1)).toMatchObject({ army: 13, end: 'won', reward: false });
  });

  it('says where the run stands', () => {
    expect(runLine(MAP, newRun(1))).toBe('Rogue-lite run · army 14 marbles · pick a fight');
    expect(runLine(MAP, pick(newRun(1), 1))).toBe('Rogue-lite run · act 1 fight · army 14 marbles');
    expect(runLine(MAP, { ...pick(newRun(1), 5), army: 9 })).toBe('Rogue-lite run · act 2 boss · army 9 marbles');
    expect(runLine(MAP, { ...newRun(1), army: 8, end: 'won' })).toBe('Run won with 8 marbles');
    expect(runLine(MAP, { ...newRun(1), army: 3, end: 'lost' })).toBe('Run lost · 3 marbles left');
    expect(runLine(MAP, { ...newRun(1), specials: [2, 0, 1] })).toBe('Rogue-lite run · army 14 marbles, 2 Heavy, 1 Spark · pick a fight');
  });

  it('draws the map: the picks open, the path taken marked, its links drawn', () => {
    const html = mapHtml(MAP, at(newRun(1), 0, 2));
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    const nodes = [...doc.querySelectorAll<HTMLButtonElement>('button[data-node]')];
    expect(nodes.map((b) => b.textContent)).toEqual(['Fight', 'Fight', 'Boss', 'Fight', 'Fight', 'Boss']);
    expect(nodes.map((b) => b.disabled)).toEqual([true, true, true, false, false, true]);
    expect(nodes.map((b) => b.className)).toEqual(['node taken', 'node', 'node boss here', 'node', 'node', 'node boss']);
    expect(nodes[3]!.getAttribute('aria-label')).toBe('Act 2, fight');
    expect(nodes[0]!.getAttribute('style')).toBe('left:25%;top:12.5%');
    expect(nodes[4]!.getAttribute('style')).toBe('left:75%;top:62.5%');
    const lines = [...doc.querySelectorAll('line')];
    expect(lines).toHaveLength(6); // 2 fights to the boss in each act, the act 1 boss to the 2 fights of act 2
    expect(lines.filter((l) => l.classList.contains('taken'))).toHaveLength(1);
    expect(doc.querySelector('.run-line')!.textContent).toBe('Rogue-lite run · army 14 marbles · pick a fight');
    expect(doc.getElementById('run-new')).toBeNull();
  });

  it('a run over offers a new run', () => {
    const doc = new DOMParser().parseFromString(mapHtml(MAP, { ...newRun(1), end: 'lost' }), 'text/html');
    expect(doc.getElementById('run-new')!.textContent).toBe('New run');
  });

  it('saves the run, deletes it once over, and loads it back with its fight replayed', async () => {
    const store = memoryStore();
    const mapOf = (seed: number): MapNode[] => (seed === 1 ? MAP : []);
    expect(await loadRun(store, mapOf, engine)).toBeNull();
    const fight = { ...pick({ ...newRun(1), army: 9 }, 1), moves: [MV, [2, ...MV.slice(1)]] };
    await saveRun(store, fight);
    const loaded = (await loadRun(store, mapOf, engine))!;
    expect(loaded.state).toEqual(fight);
    expect(loaded.map).toBe(MAP);
    expect(loaded.engine).toMatchObject({ army: 9, placed: [], played: [1, 2] });
    const placed = { ...pick({ ...newRun(1), specials: [1, 0, 0] }, 1), placed: [[0, 4, 1]] };
    await saveRun(store, placed);
    expect((await loadRun(store, mapOf, engine))!.engine).toMatchObject({ placed: [[0, 4, 1]] });
    const older: Record<string, unknown> = { ...fight }; // a run saved before the special marbles
    for (const key of ['specials', 'placed', 'reward']) delete older[key];
    await store.put(RUN_KEY, older);
    expect((await loadRun(store, mapOf, engine))!.state).toEqual(fight);
    await saveRun(store, at(newRun(1), 0));
    expect(await loadRun(store, mapOf, engine)).toMatchObject({ engine: null });
    await saveRun(store, { ...newRun(1), end: 'won' });
    expect(store.data.has(RUN_KEY)).toBe(false);
    await saveRun(store, newRun(1));
    await clearRun(store);
    expect(store.data.has(RUN_KEY)).toBe(false);
  });

  it.each([
    ['not an object', 'run'],
    ['a bad army', { ...newRun(1), army: 1.5 }],
    ['a bad seed', { ...newRun(1), seed: -1 }],
    ['a bad end', { ...newRun(1), end: 'maybe' }],
    ['a bad move', { ...pick(newRun(1), 0), moves: [[1, 2]] }],
    ['no fighting flag', { ...newRun(1), fighting: 'yes' }],
    ['a path not of the map', at(newRun(1), 2)],
    ['a path that is no list', { ...newRun(1), path: 'x' }],
    ['a fight with no node', { ...newRun(1), fighting: true }],
    ['a move the engine refuses', { ...pick(newRun(1), 0), moves: [[9, ...MV.slice(1)]] }],
    ['a fight already over', { ...pick(newRun(1), 0), moves: [[7, ...MV.slice(1)]] }],
    ['bad special counts', { ...newRun(1), specials: [1, 2] }],
    ['a bad placement', { ...pick(newRun(1), 0), placed: [[0, 4]] }],
    ['a bad reward flag', { ...newRun(1), reward: 1 }],
  ])('drops a saved run with %s', async (_, raw) => {
    const store = memoryStore();
    await store.put(RUN_KEY, raw);
    expect(await loadRun(store, () => MAP, engine)).toBeNull();
    expect(store.data.has(RUN_KEY)).toBe(false);
  });

  it('a blocked storage loses the save, never the run', async () => {
    await expect(saveRun(failing, newRun(1))).resolves.toBeUndefined();
    await expect(clearRun(failing)).resolves.toBeUndefined();
    expect(await loadRun(failing, () => MAP, engine)).toBeNull();
  });

  const won = (run: Run): Run => ({ ...run, path: [0], reward: true });
  it('offers three rewards seeded by the run seed and the node, a marble only below 14, a special only past the specials', () => {
    const full = won(newRun(1));
    expect(offers(full).sort()).toEqual([1, 2, 3]); // a full army: the three special marbles
    const short = won({ ...newRun(1), army: 12 });
    expect(offers(short)).toHaveLength(3);
    expect(new Set(offers(short)).size).toBe(3);
    expect(offers(short)).toEqual(offers({ ...short })); // the same seed and node: the same offers
    const seen = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => offers({ ...short, seed }).join()));
    expect(seen.size).toBeGreaterThan(1); // other seeds, other offers
    expect(offers(won({ ...newRun(1), army: 4, specials: [2, 1, 1] }))).toEqual([0]); // all 4 marbles are special
    expect(offers(won({ ...newRun(1), specials: [5, 5, 4] }))).toEqual([]); // nothing left to offer
    expect(offers({ ...short, reward: false })).toEqual([]);
  });

  it('a claimed reward adds a marble or a special marble, once, and only one offered', () => {
    const short = won({ ...newRun(1), army: 12 });
    const [first] = offers(short);
    const after = claim(short, first!);
    expect(after.reward).toBe(false);
    expect(after.army + after.specials.reduce((a, b) => a + b)).toBe(13);
    expect(claim(after, first!)).toBe(after); // no reward pending
    expect(claim(won({ ...newRun(1), army: 4, specials: [2, 1, 1] }), 3).reward).toBe(true); // not offered
    expect(claim(won(newRun(1)), 2).specials).toEqual([0, 1, 0]);
    expect(claim(won({ ...newRun(1), army: 4, specials: [2, 1, 1] }), 0)).toMatchObject({ army: 5, reward: false });
    expect(choices(MAP, won(newRun(1)))).toEqual([]); // the map waits for the reward
  });

  it('places up to the cap of each type owned on the fight board before its first move, a second press takes it back', () => {
    const fight = pick({ ...newRun(1), specials: [5, 1, 0] }, 0);
    expect(placing(fight)).toBe(true);
    expect(placing(pick(newRun(1), 0))).toBe(false); // no special marble
    expect(placing({ ...fight, moves: [MV] })).toBe(false); // the fight is on
    let run = fight;
    for (const r of [4, 3, 2, 1]) run = place(run, [0, r], 1);
    expect(run.placed).toEqual([[0, 4, 1], [0, 3, 1], [0, 2, 1]]); // FIGHT_CAP Heavy
    expect(FIGHT_CAP).toBe(3);
    run = place(run, [0, 4], 2); // the Anchor replaces the Heavy on its marble
    expect(run.placed).toEqual([[0, 3, 1], [0, 2, 1], [0, 4, 2]]);
    expect(place(run, [1, 3], 2)).toBe(run); // the only Anchor is placed
    expect(place(run, [1, 3], 3)).toBe(run); // no Spark owned
    run = place(run, [0, 3], 1);
    expect(run.placed).toEqual([[0, 2, 1], [0, 4, 2]]);
    expect(place({ ...run, moves: [MV] }, [1, 3], 1).placed).toEqual(run.placed);
  });

  it('a fight over keeps the special marbles that stayed on the board, never more than the army', () => {
    const fight = { ...pick({ ...newRun(1), specials: [2, 1, 1] }, 0), placed: [[0, 4, 1], [1, 3, 3]] };
    expect(fightOver(MAP, fight, true, 1, [0, 0, 1]).specials).toEqual([1, 1, 1]); // the Heavy went off
    expect(fightOver(MAP, fight, true, 0).specials).toEqual([2, 1, 1]); // none lost
    expect(fightOver(MAP, fight, true, 0).placed).toEqual([]);
    const small = { ...pick({ ...newRun(1), army: 6, specials: [2, 2, 2] }, 0), placed: [] };
    expect(fightOver(MAP, small, true, 2).specials).toEqual([2, 2, 0]); // 4 marbles: the Sparks go first
    expect(fightOver(MAP, small, true, 1).specials).toEqual([2, 2, 1]);
  });

  it('parses the special marbles of the bridge', () => {
    expect(parseSpecials([-1, 4, 2, 0, -4, 3])).toEqual([{ cell: [-1, 4], kind: 2 }, { cell: [0, -4], kind: 3 }]);
  });

  it('finds the Spark a push throws off: the last marble of the pushed line at the rim', () => {
    const board = Array<number>(61).fill(0);
    const set = (q: number, r: number, v: number): void => void (board[cellIndex(q, r)] = v);
    // Black (1) at (0, 2), (0, 3) pushes White (2) at (0, 4) off along r + 1 (direction 5 is (0, 1), board.ts).
    set(0, 2, 1);
    set(0, 3, 1);
    set(0, 4, 2);
    const down: Move = { cells: [[0, 2], [0, 3]], dir: 5 };
    const spark = [{ cell: [0, 4] as const, kind: 3 }];
    expect(sparkBurst(board, spark, down)).toEqual([0, 4]);
    expect(sparkBurst(board, [{ cell: [0, 4] as const, kind: 1 }], down)).toBeNull(); // a Heavy does not burst
    expect(sparkBurst(board, spark, { cells: [[0, 3], [0, 2]], dir: 4 })).toBeNull(); // backward: no marble off
    expect(sparkBurst(board, spark, { cells: [[0, 2], [0, 3]], dir: 0 })).toBeNull(); // broadside: no push
    set(0, 4, 0);
    expect(sparkBurst(board, spark, down)).toBeNull(); // nothing in front
    expect(sparkBurst(board, spark, { cells: [[0, 4]], dir: 5 })).toBeNull(); // a marble walking off: never legal
  });

  it('gives each type its own shape and a colour 3:1 on both marbles', () => {
    const rgb = (hex: number): RGB => [hex >> 16, (hex >> 8) & 0xff, hex & 0xff];
    expect(SPECIAL_LOOKS.map((l) => l.name)).toEqual(['Heavy', 'Anchor', 'Spark']);
    expect(new Set(SPECIAL_LOOKS.map((l) => l.points.length)).size).toBe(3); // square, triangle, star
    for (const { color } of SPECIAL_LOOKS) {
      expect(contrastRatio(rgb(color), rgb(GLASS.color))).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(rgb(color), rgb(SHELL.color))).toBeGreaterThanOrEqual(3);
    }
  });

  it('draws the placement screen: the types owned, what is left of each, the one picked pressed', () => {
    const fight = { ...pick({ ...newRun(1), specials: [4, 0, 1] }, 0), placed: [[0, 4, 1]] };
    const doc = new DOMParser().parseFromString(placeHtml(fight, 1), 'text/html');
    const kinds = [...doc.querySelectorAll<HTMLButtonElement>('button[data-kind]')];
    expect(kinds.map((b) => b.textContent)).toEqual(['Heavy · 2 left', 'Spark · 1 left']);
    expect(kinds.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    expect(kinds.map((b) => b.dataset.kind)).toEqual(['1', '3']);
    expect(doc.querySelectorAll('svg polygon')).toHaveLength(2);
    expect(doc.querySelector('.run-line')!.textContent).toBe('Place your special marbles');
  });

  it('draws the reward screen: one button per offer', () => {
    const run = won({ ...newRun(1), army: 12 });
    const doc = new DOMParser().parseFromString(rewardHtml(run), 'text/html');
    const buttons = [...doc.querySelectorAll<HTMLButtonElement>('button[data-offer]')];
    expect(buttons.map((b) => Number(b.dataset.offer))).toEqual(offers(run));
    expect(doc.querySelector('.run-line')!.textContent).toBe('Fight won · pick a reward');
    expect(rewardHtml(won({ ...newRun(1), army: 4, specials: [2, 1, 1] }))).toContain('One more marble');
    expect(rewardHtml(won(newRun(1)))).toContain('Heavy: weighs 2 in a push');
    expect(rewardHtml(won(newRun(1)))).toContain('Anchor: never pushed off');
    expect(rewardHtml(won(newRun(1)))).toContain('Spark: bursts when pushed off');
  });
});
