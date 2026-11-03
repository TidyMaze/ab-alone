// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { cellIndex, type Move } from './board';
import { contrastRatio, type RGB } from './contrast';
import { GLASS, SHELL } from './marbles';
import {
  ACT_PERCENT,
  actBoss,
  actsWon,
  ARMIES,
  chooseArmy,
  earned,
  KIND_ACTS,
  readBest,
  recordBest,
  choices,
  claim,
  ELITE_BUDGET,
  eventHtml,
  eventOf,
  EVENTS,
  fightBudget,
  FIGHT_FOES,
  foesOf,
  foePlan,
  FORMATIONS,
  ELITES,
  resolve,
  takeEvent,
  visit,
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
  PLUS_INK,
  rest,
  restHtml,
  upgradable,
  upgrade,
  rewardHtml,
  RUN_KEY,
  runLine,
  saveRun,
  sparkBurst,
  SPECIAL_LOOKS,
  START_ARMY,
  MIN_ARMY,
  left,
  Relic,
  RELICS,
  relicBarHtml,
  relicHtml,
  relicMask,
  relicOffers,
  takeRelic,
  claimTactic,
  buy,
  leaveShop,
  removable,
  removeSpecial,
  SCRAP,
  shopHtml,
  shopStock,
  MAX_TACTICS,
  tacticBarHtml,
  tacticOffer,
  tacticRecord,
  TACTICS,
  useTactic,
  type MapNode,
  type Run,
} from './roguelite';
import { memoryStore, type KeyStore } from './savegame';

// A small map in the bridge's encoding (crates/abalone-wasm/src/lib.rs): 2 acts of one fight row of 2 nodes, then a
// boss. Act 1: node 0 leads to the boss, node 1 too. Act 2 the same. Indices: 0, 1 fights, 2 boss, 3, 4 fights, 5 boss.
const FLAT = [0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 0, 0];
const MAP = parseMap(FLAT);
const at = (run: Run, ...path: number[]): Run => ({ ...run, path });
const failing: KeyStore = {
  get: () => Promise.reject(new Error('blocked')),
  put: () => Promise.reject(new Error('blocked')),
  delete: () => Promise.reject(new Error('blocked')),
};
// A replay engine that refuses the move [9, ...] and is over after [7, ...].
const engine = ({ army, placed }: Run) => {
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
    expect(MAP[0]).toEqual({ act: 0, row: 0, col: 0, kind: 'fight', links: [0], formation: 0, elite: 0 });
    expect(MAP[2]).toEqual({ act: 0, row: 1, col: 0, kind: 'boss', links: [], formation: 0, elite: 0 });
    expect(parseMap([0, 0, 0, 2, 0, 0, 0, 0, 0, 1, 3, 0, 0, 0, 0, 0, 2, 4, 0, 0, 0]).map((n) => n.kind)).toEqual(['elite', 'rest', 'event']);
    expect(parseMap([0, 0, 1, 0, 0b101, 0, 0])[0]!.links).toEqual([0, 2]);
  });

  it('a new run has the full army and offers the first row of act 1', () => {
    const run = newRun(5, 3);
    expect(run).toEqual({ seed: 5, army: START_ARMY, path: [], fighting: false, moves: [], end: '', specials: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], placed: [], reward: false, event: false, best: 3, relics: [], relic: false, rest: false, tactics: [], scrap: 0, shop: false, bought: [], enemies: true });
    expect(choices(MAP, run)).toEqual([0, 1]);
  });

  it('a fight node leads to its links, a boss to the first row of the next act', () => {
    expect(choices(MAP, at(newRun(1, 3), 0))).toEqual([2]);
    expect(choices(MAP, at(newRun(1, 3), 1, 2))).toEqual([3, 4]);
  });

  it('nothing is offered during a fight or once the run is over', () => {
    expect(choices(MAP, pick(newRun(1, 3), 0))).toEqual([]);
    expect(choices(MAP, { ...newRun(1, 3), end: 'lost' })).toEqual([]);
  });

  it('a pick starts the fight of that node with no move', () => {
    expect(pick({ ...newRun(1, 3), moves: [MV] }, 1)).toEqual({ ...newRun(1, 3), path: [1], fighting: true, moves: [] });
  });

  it('a won fight costs the ejected marbles and goes on, a lost one ends the run', () => {
    const fight = pick(newRun(1, 3), 0);
    expect(fightOver(MAP, fight, true, 2)).toEqual({ ...fight, army: 12, fighting: false, end: '', reward: true, scrap: 10 });
    expect(fightOver(MAP, fight, false, 3).end).toBe('lost');
  });

  it('the run ends below 4 marbles, and is won on the last boss', () => {
    expect(fightOver(MAP, { ...pick(newRun(1, 3), 0), army: 5 }, true, 2)).toMatchObject({ army: 3, end: 'lost', reward: false });
    expect(fightOver(MAP, { ...pick(newRun(1, 3), 2), path: [0, 2] }, true, 0).end).toBe('');
    expect(fightOver(MAP, { ...pick(newRun(1, 3), 5), path: [0, 2, 3, 5] }, true, 1)).toMatchObject({ army: 13, end: 'won', reward: false });
  });

  it('says where the run stands', () => {
    expect(runLine(MAP, newRun(1, 3))).toBe('Rogue-lite run · army 14 marbles · pick a fight');
    expect(runLine(MAP, pick(newRun(1, 3), 1))).toBe('Rogue-lite run · act 1 fight · army 14 marbles');
    expect(runLine(MAP, { ...pick(newRun(1, 3), 5), army: 9 })).toBe('Rogue-lite run · act 2 boss · army 9 marbles');
    expect(runLine(MAP, { ...newRun(1, 3), army: 8, end: 'won' })).toBe('Run won with 8 marbles');
    expect(runLine(MAP, { ...newRun(1, 3), army: 3, end: 'lost' })).toBe('Run lost · 3 marbles left');
    expect(runLine(MAP, { ...newRun(1, 3), specials: [2, 0, 1, 0, 0, 0, 0, 0, 0, 0] })).toBe('Rogue-lite run · army 14 marbles, 2 Heavy, 1 Spark · pick a fight');
    expect(runLine(MAP, { ...newRun(1, 3), specials: [1, 0, 0, 1, 1, 0, 0, 0, 0, 0] })).toBe('Rogue-lite run · army 14 marbles, 1 Heavy, 1 Heavy+, 1 Anchor+ · pick a fight');
  });

  it('draws the map: the picks open, the path taken marked, its links drawn', () => {
    const html = mapHtml(MAP, at(newRun(1, 3), 0, 2));
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
    const doc = new DOMParser().parseFromString(mapHtml(MAP, { ...newRun(1, 3), end: 'lost' }), 'text/html');
    expect(doc.getElementById('run-new')!.textContent).toBe('New run');
  });

  it('saves the run, deletes it once over, and loads it back with its fight replayed', async () => {
    const store = memoryStore();
    const mapOf = (seed: number): MapNode[] => (seed === 1 ? MAP : []);
    expect(await loadRun(store, mapOf, engine)).toBeNull();
    const fight = { ...pick({ ...newRun(1, 3), army: 9 }, 1), moves: [MV, [2, ...MV.slice(1)]] };
    await saveRun(store, fight);
    const loaded = (await loadRun(store, mapOf, engine))!;
    expect(loaded.state).toEqual(fight);
    expect(loaded.map).toBe(MAP);
    expect(loaded.engine).toMatchObject({ army: 9, placed: [], played: [1, 2] });
    const placed = { ...pick({ ...newRun(1, 3), specials: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, 1), placed: [[0, 4, 1]] };
    await saveRun(store, placed);
    expect((await loadRun(store, mapOf, engine))!.engine).toMatchObject({ placed: [[0, 4, 1]] });
    const older: Record<string, unknown> = { ...fight }; // a run saved before the special marbles
    for (const key of ['specials', 'placed', 'reward', 'event', 'relics', 'relic', 'rest', 'tactics', 'scrap', 'shop', 'bought', 'enemies']) delete older[key];
    await store.put(RUN_KEY, older);
    expect((await loadRun(store, mapOf, engine))!.state).toEqual({ ...fight, enemies: false }); // before the varied enemies (#1462): the plain army
    await store.put(RUN_KEY, { ...fight, specials: [1, 0, 2] }); // saved before the upgrades (#1458): none upgraded
    expect((await loadRun(store, mapOf, engine))!.state).toEqual({ ...fight, specials: [1, 0, 2, 0, 0, 0, 0, 0, 0, 0] });
    await store.put(RUN_KEY, { ...fight, specials: [1, 0, 2, 0, 1, 0] }); // saved before the new four (#1461): none of them
    expect((await loadRun(store, mapOf, engine))!.state).toEqual({ ...fight, specials: [1, 0, 2, 0, 1, 0, 0, 0, 0, 0] });
    await store.put(RUN_KEY, { ...fight, specials: [1, 0, 2, 0, 1, 0, 3, 0, 1, 2] });
    expect((await loadRun(store, mapOf, engine))!.state).toEqual({ ...fight, specials: [1, 0, 2, 0, 1, 0, 3, 0, 1, 2] });
    await saveRun(store, at(newRun(1, 3), 0));
    expect(await loadRun(store, mapOf, engine)).toMatchObject({ engine: null });
    await saveRun(store, { ...newRun(1, 3), end: 'won' });
    expect(store.data.has(RUN_KEY)).toBe(false);
    await saveRun(store, newRun(1, 3));
    await clearRun(store);
    expect(store.data.has(RUN_KEY)).toBe(false);
  });

  it.each([
    ['not an object', 'run'],
    ['a bad army', { ...newRun(1, 3), army: 1.5 }],
    ['a bad seed', { ...newRun(1, 3), seed: -1 }],
    ['a bad end', { ...newRun(1, 3), end: 'maybe' }],
    ['a bad move', { ...pick(newRun(1, 3), 0), moves: [[1, 2]] }],
    ['no fighting flag', { ...newRun(1, 3), fighting: 'yes' }],
    ['a path not of the map', at(newRun(1, 3), 2)],
    ['a path that is no list', { ...newRun(1, 3), path: 'x' }],
    ['a fight with no node', { ...newRun(1, 3), fighting: true }],
    ['a move the engine refuses', { ...pick(newRun(1, 3), 0), moves: [[9, ...MV.slice(1)]] }],
    ['a fight already over', { ...pick(newRun(1, 3), 0), moves: [[7, ...MV.slice(1)]] }],
    ['bad special counts', { ...newRun(1, 3), specials: [1, 2] }],
    ['four special counts', { ...newRun(1, 3), specials: [1, 2, 0, 0] }],
    ['nine special counts', { ...newRun(1, 3), specials: [1, 2, 0, 0, 0, 0, 0, 0, 0] }],
    ['eleven special counts', { ...newRun(1, 3), specials: [1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0] }],
    ['a bad rest flag', { ...newRun(1, 3), rest: 1 }],
    ['a bad placement', { ...pick(newRun(1, 3), 0), placed: [[0, 4]] }],
    ['a bad reward flag', { ...newRun(1, 3), reward: 1 }],
    ['a bad event flag', { ...newRun(1, 3), event: 'x' }],
    ['a bad best', { ...newRun(1, 3), best: 4 }],
    ['an unknown relic', { ...newRun(1, 3), relics: [12] }],
    ['a relic twice', { ...newRun(1, 3), relics: [3, 3] }],
    ['relics that are no list', { ...newRun(1, 3), relics: 3 }],
    ['a bad relic flag', { ...newRun(1, 3), relic: 'yes' }],
    ['an unknown tactic', { ...newRun(1, 3), tactics: [5] }],
    ['tactic 0', { ...newRun(1, 3), tactics: [0] }],
    ['four tactics', { ...newRun(1, 3), tactics: [1, 2, 3, 4] }],
    ['tactics that are no list', { ...newRun(1, 3), tactics: 2 }],
    ['a bad scrap', { ...newRun(1, 3), scrap: -1 }],
    ['a bad shop flag', { ...newRun(1, 3), shop: 1 }],
    ['an unknown purchase', { ...newRun(1, 3), bought: [5] }],
    ['a purchase twice', { ...newRun(1, 3), bought: [1, 1] }],
    ['purchases that are no list', { ...newRun(1, 3), bought: 1 }],
  ])('drops a saved run with %s', async (_, raw) => {
    const store = memoryStore();
    await store.put(RUN_KEY, raw);
    expect(await loadRun(store, () => MAP, engine)).toBeNull();
    expect(store.data.has(RUN_KEY)).toBe(false);
  });

  it('a boss fight saved before the act bosses (an army fight then, #800) starts over instead of losing the run', async () => {
    const store = memoryStore();
    const boss = { ...pick(at(newRun(1, 3), 0), 2), moves: [[9, ...MV.slice(1)]] }; // moves the boss board refuses
    await saveRun(store, boss);
    const loaded = (await loadRun(store, () => MAP, engine))!;
    expect(loaded.state).toEqual({ ...boss, moves: [] });
    expect(loaded.engine).toMatchObject({ played: [] });
  });

  it('a blocked storage loses the save, never the run', async () => {
    await expect(saveRun(failing, newRun(1, 3))).resolves.toBeUndefined();
    await expect(clearRun(failing)).resolves.toBeUndefined();
    expect(await loadRun(failing, () => MAP, engine)).toBeNull();
  });

  const won = (run: Run): Run => ({ ...run, path: [0], reward: true });
  it('offers three rewards seeded by the run seed and the node, a marble only below 14, a special only past the specials', () => {
    const full = won(newRun(1, 3));
    expect(offers(full)).toHaveLength(3); // a full army: three of the special marbles
    expect(offers(full).every((o) => [1, 2, 3, 7, 8, 9, 10].includes(o))).toBe(true);
    const short = won({ ...newRun(1, 3), army: 12 });
    expect(offers(short)).toHaveLength(3);
    expect(new Set(offers(short)).size).toBe(3);
    expect(offers(short)).toEqual(offers({ ...short })); // the same seed and node: the same offers
    const seen = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => offers({ ...short, seed }).join()));
    expect(seen.size).toBeGreaterThan(1); // other seeds, other offers
    const nodes = [1, 2, 3, 4, 5, 6, 7, 8].filter((seed) => offers({ ...short, seed }).join() !== offers({ ...short, seed, path: [1] }).join());
    expect(nodes.length).toBeGreaterThan(0); // the node, not only the step: two nodes of a row offer apart
    expect(offers(won({ ...newRun(1, 3), army: 4, specials: [2, 1, 1, 0, 0, 0, 0, 0, 0, 0] }))).toEqual([0]); // all 4 marbles are special
    expect(offers(won({ ...newRun(1, 3), specials: [5, 5, 4, 0, 0, 0, 0, 0, 0, 0] }))).toEqual([]); // nothing left to offer
    expect(offers(won({ ...newRun(1, 3), army: 4, specials: [0, 0, 0, 2, 1, 1, 0, 0, 0, 0] }))).toEqual([0]); // upgraded ones are special too
    expect(offers({ ...short, reward: false })).toEqual([]);
  });

  it('a claimed reward adds a marble or a special marble, once, and only one offered', () => {
    const short = won({ ...newRun(1, 3), army: 12 });
    const [first] = offers(short);
    const after = claim(short, first!);
    expect(after.reward).toBe(false);
    expect(after.army + after.specials.reduce((a, b) => a + b)).toBe(13);
    expect(claim(after, first!)).toBe(after); // no reward pending
    expect(claim(won({ ...newRun(1, 3), army: 4, specials: [2, 1, 1, 0, 0, 0, 0, 0, 0, 0] }), 3).reward).toBe(true); // not offered
    const [dealt] = offers(won(newRun(1, 3)));
    expect(claim(won(newRun(1, 3)), dealt!).specials.map((n, k) => (n ? k + 1 : 0)).filter(Boolean)).toEqual([dealt]);
    expect(claim(won({ ...newRun(1, 3), army: 4, specials: [2, 1, 1, 0, 0, 0, 0, 0, 0, 0] }), 0)).toMatchObject({ army: 5, reward: false });
    expect(choices(MAP, won(newRun(1, 3)))).toEqual([]); // the map waits for the reward
  });

  it('places up to the cap of each type owned on the fight board before its first move, a second press takes it back', () => {
    const fight = pick({ ...newRun(1, 3), specials: [5, 1, 0, 0, 0, 0, 0, 0, 0, 0] }, 0);
    expect(placing(fight)).toBe(true);
    expect(placing(pick(newRun(1, 3), 0))).toBe(false); // no special marble
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
    const fight = { ...pick({ ...newRun(1, 3), specials: [2, 1, 1, 0, 0, 0, 0, 0, 0, 0] }, 0), placed: [[0, 4, 1], [1, 3, 3]] };
    expect(fightOver(MAP, fight, true, 1, [0, 0, 1, 0, 0, 0, 0, 0, 0, 0]).specials).toEqual([1, 1, 1, 0, 0, 0, 0, 0, 0, 0]); // the Heavy went off
    expect(fightOver(MAP, fight, true, 0).specials).toEqual([2, 1, 1, 0, 0, 0, 0, 0, 0, 0]); // none lost
    expect(fightOver(MAP, fight, true, 0).placed).toEqual([]);
    const small = { ...pick({ ...newRun(1, 3), army: 6, specials: [2, 2, 2, 0, 0, 0, 0, 0, 0, 0] }, 0), placed: [] };
    expect(fightOver(MAP, small, true, 2).specials).toEqual([2, 2, 0, 0, 0, 0, 0, 0, 0, 0]); // 4 marbles: the Sparks go first
    expect(fightOver(MAP, small, true, 1).specials).toEqual([2, 2, 1, 0, 0, 0, 0, 0, 0, 0]);
    // The upgraded ones (#1458) count apart and go after the plain ones, the Spark+ first.
    const upgraded = { ...pick({ ...newRun(1, 3), army: 6, specials: [1, 0, 0, 2, 2, 1, 0, 0, 0, 0] }, 0), placed: [[0, 4, 4], [1, 3, 6]] };
    expect(fightOver(MAP, upgraded, true, 2, [0, 0, 0, 1, 0, 1, 0, 0, 0, 0]).specials).toEqual([0, 0, 0, 2, 2, 0, 0, 0, 0, 0]);
    expect(fightOver(MAP, upgraded, true, 1, [0, 0, 0, 0, 0, 1, 0, 0, 0, 0]).specials).toEqual([1, 0, 0, 1, 2, 1, 0, 0, 0, 0]); // the Heavy+ went off
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
    expect(sparkBurst(board, [{ cell: [0, 4] as const, kind: 6 }], down)).toEqual([0, 4]); // a Spark+ does (#1458)
    expect(sparkBurst(board, spark, { cells: [[0, 3], [0, 2]], dir: 4 })).toBeNull(); // backward: no marble off
    expect(sparkBurst(board, spark, { cells: [[0, 2], [0, 3]], dir: 0 })).toBeNull(); // broadside: no push
    set(0, 4, 0);
    expect(sparkBurst(board, spark, down)).toBeNull(); // nothing in front
    expect(sparkBurst(board, spark, { cells: [[0, 4]], dir: 5 })).toBeNull(); // a marble walking off: never legal
  });

  it('gives each type its own shape and a colour 3:1 on both marbles', () => {
    const rgb = (hex: number): RGB => [hex >> 16, (hex >> 8) & 0xff, hex & 0xff];
    expect(SPECIAL_LOOKS.map((l) => l.name)).toEqual(['Heavy', 'Anchor', 'Spark', 'Heavy+', 'Anchor+', 'Spark+', 'Magnet', 'Shield', 'Bomb', 'Medic']);
    expect(new Set([0, 1, 2, 6, 7, 8, 9].map((k) => JSON.stringify(SPECIAL_LOOKS[k]!.points))).size).toBe(7); // a shape each (#1461)
    // An upgraded type (#1458) keeps its type's shape and colour, and carries a `+` in the shell's ink, 3:1 on it.
    expect(SPECIAL_LOOKS.map((l) => l.plus)).toEqual([false, false, false, true, true, true, false, false, false, false]);
    for (const k of [0, 1, 2]) expect(SPECIAL_LOOKS[k + 3]).toMatchObject({ points: SPECIAL_LOOKS[k]!.points, color: SPECIAL_LOOKS[k]!.color });
    expect(PLUS_INK).toBe(SHELL.color);
    expect(SPECIAL_LOOKS.slice(3, 6).map((l) => l.help)).toEqual(['weighs 3 in a push', 'never pushed off, nor the marble in front of it', 'bursts 2 cells']);
    for (const { color } of SPECIAL_LOOKS) {
      expect(contrastRatio(rgb(color), rgb(GLASS.color))).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(rgb(color), rgb(SHELL.color))).toBeGreaterThanOrEqual(3);
    }
  });

  it('draws the placement screen: the types owned, what is left of each, the one picked pressed', () => {
    const fight = { ...pick({ ...newRun(1, 3), specials: [4, 0, 1, 0, 0, 0, 0, 0, 0, 0] }, 0), placed: [[0, 4, 1]] };
    const doc = new DOMParser().parseFromString(placeHtml(fight, 1), 'text/html');
    const kinds = [...doc.querySelectorAll<HTMLButtonElement>('button[data-kind]')];
    expect(kinds.map((b) => b.textContent)).toEqual(['Heavy · 2 left', 'Spark · 1 left']);
    expect(kinds.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    expect(kinds.map((b) => b.dataset.kind)).toEqual(['1', '3']);
    expect(doc.querySelectorAll('svg polygon')).toHaveLength(2);
    expect(doc.querySelector('.run-line')!.textContent).toBe('Place your special marbles');
    // An upgraded type (#1458) is a type of its own, its glyph with a `+`, up to the cap.
    const plus = { ...pick({ ...newRun(1, 3), specials: [0, 0, 0, 4, 0, 0, 0, 0, 0, 0] }, 0), placed: [[0, 4, 4]] };
    const up = new DOMParser().parseFromString(placeHtml(plus, 4), 'text/html').querySelector<HTMLButtonElement>('button[data-kind]')!;
    expect([up.dataset.kind, up.textContent]).toEqual(['4', 'Heavy+ · 2 left']);
    expect(up.querySelector('svg .plus')).not.toBeNull();
    expect(left(plus, 4)).toBe(2);
    expect(place(plus, [0, 3], 4).placed).toEqual([[0, 4, 4], [0, 3, 4]]);
    expect(place(plus, [0, 3], 1)).toBe(plus); // no plain Heavy owned
  });

  it('draws the reward screen: one button per offer', () => {
    const run = won({ ...newRun(1, 3), army: 12 });
    const doc = new DOMParser().parseFromString(rewardHtml(MAP, run), 'text/html');
    const buttons = [...doc.querySelectorAll<HTMLButtonElement>('button[data-offer]')];
    expect(buttons.map((b) => Number(b.dataset.offer))).toEqual(offers(run));
    expect(doc.querySelector('.run-line')!.textContent).toBe('Fight won · pick a reward');
    expect(rewardHtml(MAP, won({ ...newRun(1, 3), army: 4, specials: [2, 1, 1, 0, 0, 0, 0, 0, 0, 0] }))).toContain('One more marble');
    const offering = (kind: number): string => {
      const seed = Array.from({ length: 60 }, (_, n) => n).find((n) => offers(won(newRun(n, 3))).includes(kind))!;
      return rewardHtml(MAP, won(newRun(seed, 3)));
    };
    expect(offering(1)).toContain('Heavy: weighs 2 in a push');
    expect(offering(2)).toContain('Anchor: never pushed off');
    expect(offering(3)).toContain('Spark: bursts when pushed off');
  });
  // Elites, rests, events and act bosses (#800). One act: a fight leads to an elite, a rest and an event, each to the
  // boss. Indices: 0 fight, 1 elite, 2 rest, 3 event, 4 boss.
  const ACT = parseMap([0, 0, 0, 0, 0b111, 0, 0, 0, 1, 0, 2, 1, 0, 0, 0, 1, 1, 3, 1, 0, 0, 0, 1, 2, 4, 1, 0, 0, 0, 2, 0, 1, 0, 0, 0]);
  const parse = (html: string): Document => new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');

  // The rest site (#1458): Rest or Upgrade one special marble.
  it('a rest site waits for its choice, with no fight', () => {
    const site = visit(ACT, { ...newRun(1, 3), army: 6, path: [0] }, 2);
    expect(site).toMatchObject({ army: 6, path: [0, 2], fighting: false, event: false, rest: true });
    expect(choices(ACT, site)).toEqual([]); // the map waits for the choice
    expect(runLine(ACT, site)).toBe('Rogue-lite run · army 6 marbles · pick a fight'); // not rested yet
  });

  it('Rest brings the army back up to 14 and leads on', () => {
    const rested = rest(visit(ACT, { ...newRun(1, 3), army: 6, path: [0] }, 2));
    expect(rested).toMatchObject({ army: START_ARMY, path: [0, 2], fighting: false, rest: false });
    expect(choices(ACT, rested)).toEqual([4]);
    expect(runLine(ACT, rested)).toBe('Rogue-lite run · rested · army 14 marbles · pick a fight');
    expect(rest(newRun(1, 3))).toEqual(newRun(1, 3)); // no rest site waits
  });

  it('Upgrade makes one special marble of the type picked upgraded, the army as it was', () => {
    const site = visit(ACT, { ...newRun(1, 3), army: 6, specials: [1, 0, 2, 0, 0, 0, 0, 0, 0, 0], path: [0] }, 2);
    expect(upgradable(site)).toEqual([1, 3]);
    const up = upgrade(site, 3);
    expect(up).toMatchObject({ army: 6, specials: [1, 0, 1, 0, 0, 1, 0, 0, 0, 0], rest: false });
    expect(choices(ACT, up)).toEqual([4]);
    expect(upgrade(up, 1)).toBe(up); // no rest site waits
    expect(upgrade(site, 2)).toBe(site); // no Anchor to upgrade
    expect(upgrade(site, 4)).toBe(site); // a Heavy+ is upgraded already
    expect(upgradable({ ...site, specials: [0, 0, 0, 1, 1, 1, 0, 0, 0, 0] })).toEqual([]); // nothing left to upgrade
  });

  it('draws the rest site: Rest, an Upgrade per type the army can upgrade, or Upgrade disabled with its reason', () => {
    const site = visit(ACT, { ...newRun(1, 3), army: 6, specials: [1, 0, 2, 0, 0, 0, 0, 0, 0, 0], path: [0] }, 2);
    const doc = parse(restHtml(site));
    expect(doc.querySelector('.run-line')!.textContent).toBe('Rest site · rest or upgrade');
    expect(doc.querySelector('button[data-rest]')!.textContent).toBe('Rest: back up to 14 marbles');
    const ups = [...doc.querySelectorAll<HTMLButtonElement>('button[data-upgrade]')];
    expect(ups.map((b) => [b.dataset.upgrade, b.textContent, b.disabled])).toEqual([
      ['1', 'Upgrade a Heavy: Heavy+ weighs 3 in a push', false],
      ['3', 'Upgrade a Spark: Spark+ bursts 2 cells', false],
    ]);
    expect(ups.map((b) => b.querySelector('svg .plus'))).not.toContain(null); // the upgraded glyph
    expect(restHtml({ ...site, specials: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0] })).toContain('Upgrade an Anchor: Anchor+ never pushed off, nor the marble in front of it');
    const none = parse(restHtml({ ...site, specials: [0, 0, 0, 1, 0, 0, 0, 0, 0, 0] }));
    const off = none.querySelector<HTMLButtonElement>('button[data-upgrade]')!;
    expect([off.textContent, off.disabled]).toEqual(['Upgrade: no special marble left to upgrade', true]);
    const bunks = parse(restHtml({ ...site, relics: [Relic.Bunks] }));
    expect(bunks.querySelector('button[data-rest]')!.textContent).toBe('Rest: back up to 14 marbles · Bunks: a plain marble becomes a Heavy');
  });

  it('a fight, an elite or a boss starts its fight as a pick does', () => {
    const run = { ...newRun(1, 3), path: [0] };
    expect(visit(ACT, run, 1)).toEqual(pick(run, 1));
    expect(visit(ACT, at(run, 0, 1), 4)).toEqual(pick(at(run, 0, 1), 4));
    expect(visit(ACT, newRun(1, 3), 0)).toEqual(pick(newRun(1, 3), 0));
  });

  it('a fight puts 10 enemy marbles on the board, an elite or a boss the full 14, #1145', () => {
    const elite = pick({ ...newRun(1, 3), path: [0] }, 1);
    expect(FIGHT_FOES).toBe(10);
    expect(foesOf(ACT, pick(newRun(1, 3), 0))).toBe(10);
    expect(foesOf(ACT, elite)).toBe(START_ARMY);
  });

  it('an elite: a stronger bot, and a won one gives up to 2 marbles back before its reward', () => {
    const elite = pick({ ...newRun(1, 3), path: [0] }, 1);
    expect(fightBudget(ACT, elite, 1000)).toBe(1000 * ELITE_BUDGET);
    expect(ELITE_BUDGET).toBe(2);
    expect(fightBudget(ACT, pick(newRun(1, 3), 0), 1000)).toBe(1000);
    expect(fightBudget(ACT, { ...elite, fighting: false }, 1000)).toBe(1000);
    expect(fightBudget(ACT, newRun(1, 3), 1000)).toBe(1000);
    expect(fightOver(ACT, elite, true, 3)).toMatchObject({ army: 13, end: '', reward: true });
    expect(fightOver(ACT, elite, true, 0).army).toBe(START_ARMY);
    expect(fightOver(ACT, { ...elite, army: 6 }, true, 2)).toMatchObject({ army: 6, end: '' });
    expect(fightOver(ACT, { ...elite, army: 5 }, true, 2)).toMatchObject({ army: 3, end: 'lost' }); // no marble back once lost
    expect(fightOver(ACT, elite, false, 2).end).toBe('lost');
    expect(runLine(ACT, elite)).toBe('Rogue-lite run · act 1 elite · army 14 marbles');
    const after = fightOver(ACT, { ...elite, army: 10 }, true, 0);
    expect(parse(rewardHtml(ACT, after)).querySelector('.run-line')!.textContent).toBe('Elite beaten · up to 2 marbles back · pick a reward');
    expect(parse(rewardHtml(ACT, won(newRun(1, 3)))).querySelector('.run-line')!.textContent).toBe('Fight won · pick a reward');
  });

  it('an event waits for its choice, seeded by the run seed and the node', () => {
    const run = visit(ACT, { ...newRun(1, 3), path: [0] }, 3);
    expect(run).toMatchObject({ path: [0, 3], fighting: false, event: true });
    expect(choices(ACT, run)).toEqual([]);
    expect(EVENTS).toHaveLength(10);
    expect(EVENTS).toContain(eventOf(run));
    expect(eventOf(run)).toBe(eventOf({ ...run }));
    const seen = new Set(Array.from({ length: 200 }, (_, seed) => eventOf({ ...run, seed })));
    expect(seen.size).toBe(10); // every event shows up
    const nodes = [1, 2, 3, 4, 5, 6, 7, 8].filter((seed) => eventOf({ ...run, seed }) !== eventOf({ ...run, seed, path: [0, 7] }));
    expect(nodes.length).toBeGreaterThan(0);
  });

  it('each event trades marbles for special marbles or back, only when the army can pay and gains', () => {
    const [forge, clamps, wiring, drone, pods] = EVENTS;
    const full = newRun(1, 3);
    expect(takeEvent(full, forge!)).toMatchObject({ army: 12, specials: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
    expect(takeEvent(full, clamps!)).toMatchObject({ army: 12, specials: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0] });
    expect(takeEvent(full, wiring!)).toMatchObject({ army: 13, specials: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0] });
    expect(takeEvent(full, drone!)).toMatchObject({ army: 11, specials: [0, 0, 2, 0, 0, 0, 0, 0, 0, 0] });
    expect(takeEvent({ ...full, army: 10, specials: [1, 1, 1, 0, 0, 0, 0, 0, 0, 0] }, pods!)).toMatchObject({ army: 13, specials: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0] }); // a Spark first
    expect(takeEvent({ ...full, army: 12, specials: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, pods!)).toMatchObject({ army: 14, specials: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }); // up to 14
    expect(takeEvent({ ...full, army: 10, specials: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0] }, pods!)).toMatchObject({ specials: [0, 0, 0, 0, 0, 1, 0, 0, 0, 0] }); // a plain one first
    expect(takeEvent({ ...full, army: 10, specials: [0, 0, 0, 1, 1, 0, 0, 0, 0, 0] }, pods!)).toMatchObject({ specials: [0, 0, 0, 1, 0, 0, 0, 0, 0, 0] }); // then the Anchor+
    expect(takeEvent({ ...full, army: 10 }, pods!)).toBeNull(); // no special marble to give
    expect(takeEvent({ ...full, specials: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, pods!)).toBeNull(); // a full army gains nothing
    expect(takeEvent({ ...full, army: 5 }, forge!)).toBeNull(); // 3 marbles left would end the run
    expect(takeEvent({ ...full, army: 6, specials: [2, 1, 1, 0, 0, 0, 0, 0, 0, 0] }, forge!)).toBeNull(); // no plain marble left to make special
    for (const e of EVENTS) expect(e.title && e.text && e.take).toBeTruthy();
  });

  it('an event resolved: taken it pays and gains, left it changes nothing, and the map goes on', () => {
    const run = visit(ACT, { ...newRun(1, 3), path: [0] }, 3);
    const taken = resolve(run, true);
    expect(taken).toEqual({ ...takeEvent(run, eventOf(run)!)!, event: false });
    expect(choices(ACT, taken)).toEqual([4]);
    expect(resolve(run, false)).toEqual({ ...run, event: false });
    const poor = { ...run, army: MIN_ARMY };
    expect(resolve(poor, true)).toBe(poor); // it cannot pay: the event waits
    expect(resolve(newRun(1, 3), true)).toEqual(newRun(1, 3)); // no event
    expect(eventOf(newRun(1, 3))).toBeNull();
  });

  it('draws the event screen: its title, its text, the trade, disabled when it cannot be paid, and Leave', () => {
    const run = visit(ACT, { ...newRun(1, 3), path: [0] }, 3);
    const e = eventOf(run)!;
    const doc = parse(eventHtml(run));
    expect(doc.querySelector('.run-line')!.textContent).toBe(`Event · ${e.title}`);
    expect(doc.querySelector('.run-help')!.textContent).toBe(e.text);
    const buttons = [...doc.querySelectorAll<HTMLButtonElement>('button[data-choice]')];
    expect(buttons.map((b) => [b.dataset.choice, b.textContent, b.disabled])).toEqual([['1', e.take, false], ['0', 'Leave', false]]);
    const poor = parse(eventHtml({ ...run, army: MIN_ARMY }));
    expect(poor.querySelector<HTMLButtonElement>('button[data-choice="1"]')!.disabled).toBe(true);
  });

  it('draws elites, rests and events on the map', () => {
    const doc = parse(mapHtml(ACT, newRun(1, 3)));
    const nodes = [...doc.querySelectorAll<HTMLButtonElement>('button[data-node]')];
    expect(nodes.map((b) => b.textContent)).toEqual(['Fight', 'Elite', 'Rest', 'Event', 'Boss']);
    expect(nodes.map((b) => b.className)).toEqual(['node', 'node elite', 'node rest', 'node event', 'node boss']);
    expect(nodes[2]!.getAttribute('aria-label')).toBe('Act 1, rest');
  });

  it('a boss node is a roster boss picked by the run seed, at the act strength, a new one each act', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const boss = actBoss(MAP, pick(at(newRun(1, 3), 0), 2), ids)!;
    expect(ids).toContain(boss.id);
    expect(boss.percent).toBe(ACT_PERCENT[0]);
    expect(ACT_PERCENT).toEqual([50, 100, 200]);
    expect(actBoss(MAP, pick(at(newRun(1, 3), 0), 2), ids)).toEqual(boss); // the same run: the same boss and seed
    const second = actBoss(MAP, pick(at(newRun(1, 3), 0, 2, 3), 5), ids)!;
    expect(second.percent).toBe(ACT_PERCENT[1]);
    expect(second.id).not.toBe(boss.id);
    expect(second.seed).not.toBe(boss.seed);
    const firsts = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => actBoss(MAP, pick(at({ ...newRun(seed, 3) }, 0), 2), ids)!.id));
    expect(firsts.size).toBeGreaterThan(1); // other seeds, other bosses
    expect(actBoss(MAP, pick(newRun(1, 3), 0), ids)).toBeNull(); // a fight
    expect(actBoss(MAP, at(newRun(1, 3), 0, 2), ids)).toBeNull(); // the boss beaten, no fight on
    expect(actBoss(MAP, newRun(1, 3), ids)).toBeNull();
  });

  it('a boss fight leaves the special marbles alone: none was placed', () => {
    const fight = pick({ ...at(newRun(1, 3), 0), specials: [1, 0, 1, 0, 0, 0, 0, 0, 0, 0] }, 2);
    expect(fightOver(MAP, fight, true, 2)).toMatchObject({ army: 12, specials: [1, 0, 1, 0, 0, 0, 0, 0, 0, 0], reward: true });
  });

  // Unlocks between runs and the run summary (#801): only variety carries over, never power.
  it('every starting army has 14 marbles, some special, and each is unlocked by the acts won in one run', () => {
    expect(ARMIES.map((a) => a.name)).toEqual(['Standard', 'Bulwark', 'Volatile', 'Ironclad']);
    expect(ARMIES.map((a) => a.acts)).toEqual([0, 1, 2, 3]);
    expect(ARMIES.map((a) => a.specials)).toEqual([[0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 2, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 2, 0, 0, 0, 0, 0, 0, 0], [2, 0, 0, 0, 0, 0, 0, 0, 0, 0]]);
    expect(KIND_ACTS).toEqual([0, 1, 2, 0, 0, 0, 3, 1, 3, 2]); // Heavy from the start, Anchor and Shield after 1 act won, Spark and Medic after 2, Magnet and Bomb after a run won (#1461)
    expect(newRun(1, 3)).toMatchObject({ army: START_ARMY, specials: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], best: 3 });
    expect(newRun(1, 0).best).toBe(0);
  });

  it('the starting army is picked on the map before the first node, only an unlocked one', () => {
    const run = newRun(1, 1);
    expect(chooseArmy(run, 1)).toEqual({ ...run, specials: [0, 2, 0, 0, 0, 0, 0, 0, 0, 0] });
    expect(chooseArmy(chooseArmy(run, 1), 0)).toEqual(run);
    expect(chooseArmy(run, 2)).toBe(run); // locked
    expect(chooseArmy(run, 9)).toBe(run); // no such army
    expect(chooseArmy(at(newRun(1, 3), 0), 1).specials).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); // the run is on
    expect(chooseArmy({ ...newRun(1, 3), end: 'lost' }, 1).specials).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('a special marble type is offered as a reward and by events only once unlocked', () => {
    const full = won(newRun(1, 0));
    expect(offers(full)).toEqual([1]); // only the Heavy
    expect(offers(won(newRun(1, 1))).sort()).toEqual([1, 2, 8]); // and the Shield (#1461)
    expect(offers(won({ ...newRun(1, 0), army: 12 })).sort()).toEqual([0, 1]);
    const gains = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].flatMap((seed) => {
        const e = eventOf({ ...at(newRun(seed, 0), 0), event: true })!;
        return e.gain.flatMap((g, k) => (g ? [k + 1] : []));
      }),
    );
    expect([...gains]).toEqual([1]); // never an Anchor nor a Spark
    expect(EVENTS.filter((e) => e.gain[0] || !e.gain.some(Boolean))).toHaveLength(3); // the Heavy forge, the Cryo pods and the Field manual
  });

  it('counts the acts a run over won: its bosses beaten', () => {
    expect(actsWon(MAP, { ...at(newRun(1, 3), 0), end: 'lost' })).toBe(0);
    expect(actsWon(MAP, { ...at(newRun(1, 3), 0, 2), end: 'lost' })).toBe(0); // lost on the boss
    expect(actsWon(MAP, { ...at(newRun(1, 3), 0, 2, 3), end: 'lost' })).toBe(1);
    expect(actsWon(MAP, { ...at(newRun(1, 3), 0, 2, 3, 5), end: 'won' })).toBe(2);
    expect(actsWon(MAP, at(newRun(1, 3), 0, 2))).toBe(1); // the boss beaten, the run goes on
    expect(actsWon(MAP, pick(at(newRun(1, 3), 0), 2))).toBe(0); // the boss fight on
  });

  it('the unlocks a run earned: the types and armies of the acts it won past the best before it', () => {
    expect(earned(MAP, { ...at(newRun(1, 0), 0, 2, 3), end: 'lost' })).toEqual(['Anchor marbles', 'Shield marbles', 'Bulwark army']);
    expect(earned(MAP, { ...at(newRun(1, 0), 0, 2, 3, 5), end: 'won' })).toEqual(['Anchor marbles', 'Spark marbles', 'Shield marbles', 'Medic marbles', 'Bulwark army', 'Volatile army']);
    expect(earned(MAP, { ...at(newRun(1, 1), 0, 2, 3), end: 'lost' })).toEqual([]);
    expect(earned(MAP, { ...at(newRun(1, 2), 0), end: 'lost' })).toEqual([]);
  });

  it('keeps the most acts won in one run in local storage, never lower, safe when blocked', () => {
    const data = new Map<string, string>();
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    expect(readBest(store)).toBe(0);
    recordBest(store, 2);
    expect(data.get('ab-alone.roguelite')).toBe('2');
    recordBest(store, 1);
    expect(readBest(store)).toBe(2);
    for (const bad of ['x', '7', '-1', '1.5']) {
      data.set('ab-alone.roguelite', bad);
      expect(readBest(store)).toBe(0);
    }
    expect(readBest(null)).toBe(0);
    expect(() => recordBest(null, 1)).not.toThrow();
  });

  it('draws the start: what is unlocked, the armies to pick, the locked ones with what unlocks them', () => {
    const doc = parse(mapHtml(MAP, chooseArmy(newRun(1, 1), 1)));
    const helps = [...doc.querySelectorAll('.run-help')].map((p) => p.textContent);
    expect(helps[0]).toBe(
      'Special marbles in rewards: Heavy, Anchor, Shield · Spark after 2 acts won in a run · Magnet after a run won · Bomb after a run won · Medic after 2 acts won in a run',
    );
    const armies = [...doc.querySelectorAll<HTMLButtonElement>('button[data-army]')];
    expect(armies.map((b) => [b.dataset.army, b.textContent, b.disabled, b.getAttribute('aria-pressed')])).toEqual([
      ['0', 'Standard · 14 marbles', false, 'false'],
      ['1', 'Bulwark · 14 marbles, 2 Anchor', false, 'true'],
      ['2', 'Volatile · after 2 acts won in a run', true, 'false'],
      ['3', 'Ironclad · after a run won', true, 'false'],
    ]);
    expect(parse(mapHtml(MAP, newRun(1, 3))).querySelector('.run-help')!.textContent).toBe('Special marbles in rewards: Heavy, Anchor, Spark, Magnet, Shield, Bomb, Medic');
    const fresh = parse(mapHtml(MAP, newRun(1, 0)));
    expect(fresh.querySelector('.run-help')!.textContent).toBe(
      'Special marbles in rewards: Heavy · Anchor after 1 act won in a run · Spark after 2 acts won in a run · Magnet after a run won · Shield after 1 act won in a run · Bomb after a run won · Medic after 2 acts won in a run',
    );
    expect([...fresh.querySelectorAll('button[data-army]')].map((b) => b.textContent)).toEqual([
      'Standard · 14 marbles',
      'Bulwark · after 1 act won in a run',
      'Volatile · after 2 acts won in a run',
      'Ironclad · after a run won',
    ]);
    expect(parse(mapHtml(MAP, at(newRun(1, 3), 0))).querySelector('button[data-army]')).toBeNull(); // the run is on
  });

  it('draws the summary of a run over: the path, the fights, the army, the unlocks, and New run', () => {
    const over = { ...at(newRun(1, 0), 0, 2, 3), army: 3, specials: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0], end: 'lost' as const };
    const doc = parse(mapHtml(MAP, over));
    expect(doc.querySelector('.run-line')!.textContent).toBe('Run lost · 3 marbles left');
    expect([...doc.querySelectorAll('.run-help')].map((p) => p.textContent)).toEqual([
      'Path: act 1 Fight, Boss · act 2 Fight',
      'Fights: 2 won, 1 lost',
      'Army at the end: 3 marbles, 1 Heavy',
      'Unlocked: Anchor marbles, Shield marbles, Bulwark army',
    ]);
    expect(doc.querySelector('.run-graph')).toBeNull();
    expect(doc.getElementById('run-new')!.textContent).toBe('New run');
    expect(doc.querySelector('.run-tally')!.textContent).toBe('Run voided. Audit reopened.'); // Tally's audit (#1174)
    const none = parse(mapHtml(MAP, { ...at(newRun(1, 3), 0, 2, 3, 5), end: 'won' }));
    expect([...none.querySelectorAll('.run-help')].map((p) => p.textContent).slice(1)).toEqual([
      'Fights: 4 won, 0 lost',
      'Army at the end: 14 marbles',
      'No new unlock',
    ]);
    expect(none.querySelector('.run-tally')!.textContent).toBe('Reconciled: 14.');
    expect(parse(mapHtml(MAP, newRun(1, 3))).querySelector('.run-tally')).toBeNull(); // only a run over
  });
});

// Relics (#1457, docs/specs/roguelite.md section 9): passive effects for the rest of the run.
describe('roguelite relics', () => {
  const parse = (html: string): Document => new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  // One act: a fight leads to an elite, a rest, an event and a treasure, each to the boss. Indices: 0 fight, 1 elite,
  // 2 rest, 3 event, 4 treasure, 5 boss.
  const ACT = parseMap([0, 0, 0, 0, 0b1111, 0, 0, 0, 1, 0, 2, 1, 0, 0, 0, 1, 1, 3, 1, 0, 0, 0, 1, 2, 4, 1, 0, 0, 0, 1, 3, 5, 1, 0, 0, 0, 2, 0, 1, 0, 0, 0]);
  const run = (state: Partial<Run> = {}): Run => ({ ...newRun(1, 3), path: [0], ...state });
  const ALL = RELICS.map((_, code) => code);

  it('twelve relics, by their code on the bridge, each a name, a one-line rule and its own glyph', () => {
    expect(RELICS).toHaveLength(12);
    expect(Object.keys(Relic)).toEqual(RELICS.map((r) => r.name.replace(/ (\w)/g, (_, c: string) => c.toUpperCase())));
    expect(Object.values(Relic)).toEqual(ALL);
    expect(new Set(RELICS.map((r) => r.icon)).size).toBe(12);
    for (const r of RELICS) expect(r.help).toMatch(/^[^.]+$/); // one line, no full stop
    expect(relicMask(run({ relics: [Relic.Gyroscope, Relic.Detonator] }))).toBe(0b10001);
    expect(relicMask(run())).toBe(0);
  });

  it('a treasure holds one relic, dealt by the run seed and the node, never one the run holds', () => {
    const chest = visit(ACT, run(), 4);
    expect(chest).toMatchObject({ path: [0, 4], fighting: false, relic: true });
    expect(choices(ACT, chest)).toEqual([]); // the map waits for the relic
    const [found] = relicOffers(ACT, chest);
    expect(relicOffers(ACT, chest)).toHaveLength(1);
    expect(relicOffers(ACT, { ...chest })).toEqual([found]); // the same seed and node: the same relic
    const seen = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => relicOffers(ACT, { ...chest, seed })[0]));
    expect(seen.size).toBeGreaterThan(1); // other seeds, other relics
    const one = ALL.filter((c) => c !== Relic.Bunks);
    expect(relicOffers(ACT, { ...chest, relics: one })).toEqual([Relic.Bunks]); // only the one not held
    expect(visit(ACT, run({ relics: ALL }), 4).relic).toBe(false); // none left: an empty chest
    expect(relicOffers(ACT, run())).toEqual([]); // none waits
  });

  it('a relic taken joins the run once, only one offered, and the map goes on', () => {
    const chest = visit(ACT, run(), 4);
    const [found] = relicOffers(ACT, chest);
    const taken = takeRelic(ACT, chest, found!);
    expect(taken).toEqual({ ...chest, relics: [found], relic: false });
    expect(choices(ACT, taken)).toEqual([5]);
    expect(takeRelic(ACT, taken, found!)).toBe(taken); // none waits
    expect(takeRelic(ACT, chest, (found! + 1) % 12)).toBe(chest); // not offered
  });

  it('an elite gives a relic before its reward, an act boss offers 3, the last boss and a fight none', () => {
    const elite = fightOver(ACT, pick(run(), 1), true, 0);
    expect(elite).toMatchObject({ relic: true, reward: true });
    expect(relicOffers(ACT, elite)).toHaveLength(1);
    expect(fightOver(ACT, pick(run(), 1), false, 2).relic).toBe(false); // lost
    expect(fightOver(ACT, pick(newRun(1, 3), 0), true, 0).relic).toBe(false); // a fight
    const boss = fightOver(MAP, pick(at(newRun(1, 3), 0), 2), true, 0);
    expect(boss.relic).toBe(true);
    expect(new Set(relicOffers(MAP, boss)).size).toBe(3);
    expect(relicOffers(MAP, { ...boss, relics: ALL.slice(2) })).toEqual(expect.arrayContaining([0, 1])); // what is left
    expect(fightOver(MAP, pick(at(newRun(1, 3), 0, 2, 3), 5), true, 0)).toMatchObject({ end: 'won', relic: false });
    expect(fightOver(ACT, pick(run({ relics: ALL }), 1), true, 0).relic).toBe(false); // none left
  });

  it('draws the relic screen: a button per relic, its glyph, name and rule', () => {
    const titleOf = (state: Run, map: MapNode[] = ACT): string => parse(relicHtml(map, state)).querySelector('.run-line')!.textContent!;
    const chest = visit(ACT, run(), 4);
    expect(titleOf(chest)).toBe('Treasure · a chest holds a relic');
    expect(titleOf(fightOver(ACT, pick(run(), 1), true, 0))).toBe('Elite beaten · take its relic');
    const boss = fightOver(MAP, pick(at(newRun(1, 3), 0), 2), true, 0);
    expect(titleOf(boss, MAP)).toBe('Boss beaten · pick a relic');
    const buttons = [...parse(relicHtml(MAP, boss)).querySelectorAll<HTMLButtonElement>('button[data-relic]')];
    expect(buttons.map((b) => Number(b.dataset.relic))).toEqual(relicOffers(MAP, boss));
    const first = RELICS[relicOffers(MAP, boss)[0]!]!;
    expect(buttons[0]!.textContent).toBe(`${first.name}: ${first.help}`);
    expect(buttons[0]!.querySelector('svg.glyph path')!.getAttribute('d')).toBe(first.icon);
  });

  it('draws the relic bar: a glyph per relic held, its name and rule as its tooltip, nothing when none', () => {
    expect(relicBarHtml(run())).toBe('');
    const bar = parse(relicBarHtml(run({ relics: [Relic.Jammer, Relic.Gyroscope] }))).querySelector('.relics')!;
    expect(bar.getAttribute('aria-label')).toBe('Relics');
    const glyphs = [...bar.querySelectorAll<HTMLElement>('.relic')];
    expect(glyphs.map((g) => g.title)).toEqual([`Jammer: ${RELICS[3]!.help}`, `Gyroscope: ${RELICS[0]!.help}`]);
    expect(glyphs.map((g) => g.getAttribute('aria-label'))).toEqual(glyphs.map((g) => g.title));
    expect(glyphs.every((g) => g.tabIndex === 0 && g.querySelector('svg path'))).toBe(true);
  });

  // Each relic's rule, where it acts. The Gyroscope and the Detonator act inside a fight, in the engine (relicMask).
  it('Hull plating: the first marble lost in each fight comes back after it', () => {
    expect(fightOver(ACT, { ...pick(newRun(1, 3), 0), relics: [Relic.HullPlating] }, true, 2).army).toBe(13);
    expect(fightOver(ACT, pick(newRun(1, 3), 0), true, 2).army).toBe(12);
    expect(fightOver(ACT, { ...pick(newRun(1, 3), 0), relics: [Relic.HullPlating] }, true, 0).army).toBe(14);
    expect(fightOver(ACT, { ...pick(newRun(1, 3), 0), army: 5, relics: [Relic.HullPlating] }, true, 2)).toMatchObject({ army: 4, end: '' }); // saved
    expect(fightOver(ACT, { ...pick(newRun(1, 3), 0), relics: [Relic.HullPlating] }, false, 3).end).toBe('lost');
  });

  it('Salvage magnet: a won elite gives one more marble back', () => {
    const elite = pick(run({ army: 10, relics: [Relic.SalvageMagnet] }), 1);
    expect(fightOver(ACT, elite, true, 0).army).toBe(13);
    expect(fightOver(ACT, { ...elite, army: 13 }, true, 0).army).toBe(START_ARMY);
    expect(fightOver(ACT, { ...pick(newRun(1, 3), 0), army: 10, relics: [Relic.SalvageMagnet] }, true, 0).army).toBe(10); // a fight
  });

  it('Jammer: the bot searches a quarter fewer positions in fights and elites, not against a boss', () => {
    const jammed = { relics: [Relic.Jammer] };
    expect(fightBudget(ACT, { ...pick(newRun(1, 3), 0), ...jammed }, 1000)).toBe(750);
    expect(fightBudget(ACT, pick(run(jammed), 1), 1000)).toBe(1500);
    expect(fightBudget(ACT, pick(run(jammed), 5), 1000)).toBe(1000);
  });

  it('Bunks: a rest also makes a plain marble a Heavy, an upgrade does not', () => {
    expect(rest(visit(ACT, run({ army: 6, relics: [Relic.Bunks] }), 2))).toMatchObject({ army: START_ARMY, specials: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
    expect(rest(visit(ACT, run({ specials: [5, 5, 0, 0, 0, 4, 0, 0, 0, 0], relics: [Relic.Bunks] }), 2)).specials).toEqual([5, 5, 0, 0, 0, 4, 0, 0, 0, 0]); // no plain marble
    expect(upgrade(visit(ACT, run({ specials: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0], relics: [Relic.Bunks] }), 2), 2).specials).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0, 0]);
  });

  it('Lucky coin: a reward offers 4 instead of 3', () => {
    const short = { ...run({ army: 12 }), reward: true };
    expect(offers(short)).toHaveLength(3);
    const coin = offers({ ...short, relics: [Relic.LuckyCoin] });
    expect(coin).toHaveLength(4);
    expect(new Set(coin).size).toBe(4);
    expect(coin.slice(0, 3)).toEqual(offers(short)); // the same three first
  });

  it('Bargain: an event trade costs a marble less', () => {
    const [forge, , wiring, , pods] = EVENTS;
    const cheap = run({ relics: [Relic.Bargain] });
    expect(takeEvent(cheap, forge!)).toMatchObject({ army: 13, specials: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
    expect(takeEvent(cheap, wiring!)).toMatchObject({ army: 14, specials: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0] }); // free
    expect(takeEvent({ ...cheap, army: 10, specials: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, pods!)).toMatchObject({ army: 13 }); // a gain, no marble paid
    const event = { ...visit(ACT, cheap, 3), seed: [1, 2, 3, 4, 5, 6, 7, 8].find((seed) => eventOf({ ...visit(ACT, cheap, 3), seed })!.army < 0)! };
    expect(parse(eventHtml(event)).querySelector('button[data-choice="1"]')!.textContent).toBe(`${eventOf(event)!.take} · Bargain: 1 marble less`);
  });

  it('Saboteur: the bot has a marble fewer in fights and elites', () => {
    expect(foesOf(ACT, { ...pick(newRun(1, 3), 0), relics: [Relic.Saboteur] })).toBe(FIGHT_FOES - 1);
    expect(foesOf(ACT, pick(run({ relics: [Relic.Saboteur] }), 1))).toBe(START_ARMY - 1);
  });

  it('Dampener: an act boss plays at three quarters of its act strength', () => {
    const ids = ['a', 'b'];
    expect(actBoss(MAP, pick(at({ ...newRun(1, 3), relics: [Relic.Dampener] }, 0), 2), ids)!.percent).toBe(38);
    expect(actBoss(MAP, pick(at({ ...newRun(1, 3), relics: [Relic.Dampener] }, 0, 2, 3), 5), ids)!.percent).toBe(75);
  });

  it('War chest: an act boss beaten gives 2 marbles back', () => {
    const boss = pick(at({ ...newRun(1, 3), army: 10, relics: [Relic.WarChest] }, 0), 2);
    expect(fightOver(MAP, boss, true, 1).army).toBe(11);
    expect(fightOver(MAP, { ...boss, army: 14 }, true, 1).army).toBe(START_ARMY);
    expect(fightOver(MAP, { ...pick(at(newRun(1, 3), 0, 2, 3), 5), army: 10, relics: [Relic.WarChest] }, true, 1)).toMatchObject({ army: 9, end: 'won' });
  });

  it('Quartermaster: a fight holds 4 of each special marble type', () => {
    const fight = pick({ ...newRun(1, 3), specials: [5, 0, 0, 0, 0, 0, 0, 0, 0, 0], relics: [Relic.Quartermaster] }, 0);
    expect(left(fight, 1)).toBe(FIGHT_CAP + 1);
    expect(left({ ...fight, relics: [] }, 1)).toBe(FIGHT_CAP);
  });

  it('only variety carries: a new run holds no relic', () => {
    expect(newRun(1, 3)).toMatchObject({ relics: [], relic: false });
  });

  it('draws the treasure on the map', () => {
    const nodes = [...parse(mapHtml(ACT, newRun(1, 3))).querySelectorAll<HTMLButtonElement>('button[data-node]')];
    expect(nodes[4]!.textContent).toBe('Treasure');
    expect(nodes[4]!.className).toBe('node treasure');
    expect(nodes[4]!.getAttribute('aria-label')).toBe('Act 1, treasure');
  });
});

// Tactics (#1460, docs/specs/roguelite.md section 11): one-use plays of a fight, up to 3 held.
describe('roguelite tactics', () => {
  // One act: a fight leads to an elite, a rest, an event (3) and a treasure, each to the boss.
  const ACT_EVENT = parseMap([0, 0, 0, 0, 0b1111, 0, 0, 0, 1, 0, 2, 1, 0, 0, 0, 1, 1, 3, 1, 0, 0, 0, 1, 2, 4, 1, 0, 0, 0, 1, 3, 5, 1, 0, 0, 0, 2, 0, 1, 0, 0, 0]);
  const parse = (html: string): Document => new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const won = (state: Partial<Run> = {}): Run => fightOver(MAP, { ...pick(newRun(1, 3), 0), ...state }, true, 0);

  it('four tactics by their code on the bridge, each a name, a one-line rule and its own glyph', () => {
    expect(TACTICS.map((t) => t.name)).toEqual(['Reinforce', 'Freeze', 'Swap', 'Fall back']);
    expect(new Set(TACTICS.map((t) => t.icon)).size).toBe(4);
    for (const t of TACTICS) expect(t.help).toMatch(/^[^.]+$/);
    expect(MAX_TACTICS).toBe(3);
    expect(newRun(1, 3).tactics).toEqual([]); // only variety carries: a new run holds none
  });

  it('a tactic is a move record that starts with a 0, its cells for a Swap', () => {
    expect(tacticRecord(2)).toEqual([0, 2, 0, 0, 0, 0, 0, 0]);
    expect(tacticRecord(3, [0, 2], [1, 3])).toEqual([0, 3, 0, 2, 1, 3, 0, 0]);
  });

  it('a tactic used is gone, one of two alike leaves the other', () => {
    const held = { ...newRun(1, 3), tactics: [2, 4, 2] };
    expect(useTactic(held, 2).tactics).toEqual([4, 2]);
    expect(useTactic(held, 4).tactics).toEqual([2, 2]);
    expect(useTactic(held, 1)).toBe(held);
  });

  it('a won fight also offers one tactic, dealt by the run seed and the node, while fewer than 3 are held', () => {
    const run = won();
    const offer = tacticOffer(run);
    expect(offer).toBeGreaterThanOrEqual(1);
    expect(offer).toBeLessThanOrEqual(TACTICS.length);
    expect(tacticOffer({ ...run })).toBe(offer);
    const seen = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => tacticOffer({ ...run, seed })));
    expect(seen.size).toBeGreaterThan(1);
    const nodes = [1, 2, 3, 4, 5, 6, 7, 8].filter((seed) => tacticOffer({ ...run, seed }) !== tacticOffer({ ...run, seed, path: [1] }));
    expect(nodes.length).toBeGreaterThan(0);
    expect(tacticOffer({ ...run, tactics: [1, 1, 1] })).toBe(0); // the hand is full
    expect(tacticOffer({ ...run, reward: false })).toBe(0); // no reward waits
    expect(offers(run)).toHaveLength(3); // the other offers are the same as before
  });

  it('the reward is there for a tactic alone: a full army of special marbles', () => {
    const full = won({ specials: [5, 5, 4, 0, 0, 0, 0, 0, 0, 0] });
    expect(offers(full)).toEqual([]);
    expect(full.reward).toBe(true);
    expect(won({ specials: [5, 5, 4, 0, 0, 0, 0, 0, 0, 0], tactics: [1, 1, 1] }).reward).toBe(false);
  });

  it('a tactic offer claimed joins the hand and ends the reward', () => {
    const run = won({ tactics: [3] });
    const claimed = claimTactic(run);
    expect(claimed).toEqual({ ...run, tactics: [3, tacticOffer(run)], reward: false });
    expect(claimTactic(claimed)).toBe(claimed); // none waits
  });

  it('draws the reward screen with the tactic as its last button', () => {
    const run = won();
    const doc = parse(rewardHtml(MAP, run));
    const buttons = [...doc.querySelectorAll<HTMLButtonElement>('button')];
    const last = buttons[buttons.length - 1]!;
    const tactic = TACTICS[tacticOffer(run) - 1]!;
    expect(last.dataset.tacticOffer).toBe(String(tacticOffer(run)));
    expect(last.textContent).toBe(`${tactic.name}: ${tactic.help}`);
    expect(last.querySelector('svg.glyph path')!.getAttribute('d')).toBe(tactic.icon);
    expect(buttons.filter((b) => b.dataset.offer !== undefined)).toHaveLength(offers(run).length);
    expect(parse(rewardHtml(MAP, won({ tactics: [1, 1, 1] }))).querySelector('[data-tactic-offer]')).toBeNull();
  });

  it('the Field manual event teaches one tactic for a marble, only while the hand has room', () => {
    const manual = EVENTS[5]!;
    expect(manual.title).toBe('Field manual');
    const full = { ...newRun(1, 3), path: [0, 3] };
    expect(takeEvent(full, manual)).toMatchObject({ army: 13, specials: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
    expect(takeEvent(full, manual)!.tactics).toHaveLength(1);
    expect(takeEvent({ ...full, tactics: [1, 1, 1] }, manual)).toBeNull();
    expect(takeEvent({ ...full, army: MIN_ARMY }, manual)).toBeNull();
    const run = visit(ACT_EVENT, { ...newRun(1, 3), path: [0] }, 3);
    const seed = Array.from({ length: 60 }, (_, n) => n).find((n) => eventOf({ ...run, seed: n })!.tactic)!;
    const event = { ...run, seed };
    const code = takeEvent(event, eventOf(event)!)!.tactics[0]!;
    expect(takeEvent({ ...event }, eventOf(event)!)!.tactics).toEqual([code]); // deterministic
    expect(resolve(event, true).tactics).toEqual([code]);
    const take = parse(eventHtml(event)).querySelector('button[data-choice="1"]')!;
    expect(take.textContent).toBe(`Learn ${TACTICS[code - 1]!.name} · lose 1 marble`);
    expect(parse(eventHtml({ ...event, tactics: [1, 1, 1] })).querySelector<HTMLButtonElement>('button[data-choice="1"]')!.disabled).toBe(true);
    const codes = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => takeEvent({ ...run, seed: n }, manual)!.tactics[0]));
    expect(codes.size).toBeGreaterThan(1); // other seeds, other tactics
  });

  it('draws the tactic bar: a glyph button per tactic held, disabled when the engine cannot, nothing when none', () => {
    const held = { ...newRun(1, 3), tactics: [2, 3, 1] };
    expect(tacticBarHtml(newRun(1, 3), 0b1111, false)).toBe('');
    const bar = parse(tacticBarHtml(held, 0b0101, false)).querySelector('.tactics')!;
    expect(bar.getAttribute('aria-label')).toBe('Tactics');
    const buttons = [...bar.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons.map((b) => b.dataset.tactic)).toEqual(['2', '3', '1']);
    expect(buttons.map((b) => b.disabled)).toEqual([true, false, false]); // bit code - 1 of the mask
    expect(buttons.map((b) => b.title)).toEqual(TACTICS.slice(0, 3).map((t, i) => `${TACTICS[[1, 2, 0][i]!]!.name}: ${TACTICS[[1, 2, 0][i]!]!.help}`));
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(buttons.map((b) => b.title));
    expect(buttons.every((b) => b.querySelector('svg path'))).toBe(true);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false']);
    const swapping = [...parse(tacticBarHtml(held, 0b0111, true)).querySelectorAll<HTMLButtonElement>('button')];
    expect(swapping.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']); // only the Swap
  });

  it('the glyph of a tactic reads 3 to 1 on the HUD plate in both themes', () => {
    const ratio = (fg: string, bg: string): number => {
      const rgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as unknown as RGB;
      return contrastRatio(rgb(fg), rgb(bg));
    };
    expect(ratio('#7fd6e8', '#161a1d')).toBeGreaterThanOrEqual(3); // --accent on --panel, dark
    expect(ratio('#0a5f73', '#f3f0e6')).toBeGreaterThanOrEqual(3); // light
  });
});

// The scrap and the shop (#1459, docs/specs/roguelite.md section 12): a currency earned in fights, spent at a Shop node.
describe('roguelite shop', () => {
  const parse = (html: string): Document => new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  // One act: a fight 0 leads to a shop 1 and an elite 2, each to the boss 3; a fight 4 opens the next act.
  const SHOP = parseMap([0, 0, 0, 0, 0b11, 0, 0, 0, 1, 0, 6, 1, 0, 0, 0, 1, 1, 2, 1, 0, 0, 0, 2, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
  const shop = (state: Partial<Run> = {}): Run => visit(SHOP, { ...newRun(1, 3), path: [0], scrap: 500, ...state }, 1);
  const kinds = (run: Run): string[] => shopStock(run).map((i) => i.kind);
  const item = (run: Run, kind: string) => shopStock(run).find((i) => i.kind === kind)!;

  it('a won fight earns scrap, more for an elite and most for a boss, none in a lost one', () => {
    expect(SCRAP).toEqual({ fight: 10, elite: 20, boss: 30 });
    expect(newRun(1, 3).scrap).toBe(0); // no carry-over: a new run starts with none
    const fight = fightOver(SHOP, pick({ ...newRun(1, 3), scrap: 5 }, 0), true, 1);
    expect(fight.scrap).toBe(15);
    expect(fightOver(SHOP, pick({ ...newRun(1, 3), path: [0] }, 2), true, 0).scrap).toBe(20);
    expect(fightOver(SHOP, pick({ ...newRun(1, 3), path: [0, 2] }, 3), true, 0).scrap).toBe(30);
    expect(fightOver(SHOP, pick({ ...newRun(1, 3), scrap: 5 }, 0), false, 0).scrap).toBe(5);
    expect(fightOver(SHOP, { ...pick(newRun(1, 3), 0), army: 5 }, true, 2).scrap).toBe(0); // lost below 4 marbles
  });

  it('a shop waits for the player, with no fight, and the map waits', () => {
    const run = shop();
    expect(run).toMatchObject({ path: [0, 1], fighting: false, shop: true, bought: [] });
    expect(choices(SHOP, run)).toEqual([]);
    expect(choices(SHOP, leaveShop(run))).toEqual([3]);
  });

  it('sells a marble, a special marble, a relic and a tactic at prices from the seed and the node', () => {
    const run = shop();
    expect(kinds(run)).toEqual(['marble', 'special', 'relic', 'tactic']);
    expect(shopStock(run).map((i) => i.id)).toEqual([0, 1, 2, 3]);
    const [marble, special, relic, tactic] = shopStock(run);
    expect(marble!.price).toBeGreaterThanOrEqual(15);
    expect(marble!.price).toBeLessThanOrEqual(20);
    expect(special!.price).toBeGreaterThanOrEqual(25);
    expect(special!.price).toBeLessThanOrEqual(35);
    expect(relic!.price).toBeGreaterThanOrEqual(60);
    expect(relic!.price).toBeLessThanOrEqual(80);
    expect(tactic!.price).toBeGreaterThanOrEqual(30);
    expect(tactic!.price).toBeLessThanOrEqual(40);
    expect(shopStock({ ...run })).toEqual(shopStock(run)); // a reload sells the same
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => JSON.stringify(shopStock({ ...run, seed })));
    expect(new Set(seeds).size).toBeGreaterThan(1); // other seeds, other stock
    expect(shopStock(newRun(1, 3))).toEqual([]); // no shop waits
  });

  it('sells only a relic the run does not hold, and a special marble type unlocked', () => {
    const run = shop();
    const found = item(run, 'relic').code;
    expect(item({ ...run, relics: [found] }, 'relic').code).not.toBe(found);
    expect(kinds({ ...run, relics: RELICS.map((_, c) => c) })).toEqual(['marble', 'special', 'tactic']);
    for (const seed of [1, 2, 3, 4, 5, 6]) expect(item({ ...run, seed, best: 0 }, 'special').code).toBe(1); // only Heavy at first
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => item({ ...run, seed }, 'special').code)).size).toBeGreaterThan(1);
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => item({ ...run, seed }, 'tactic').code)).size).toBeGreaterThan(1);
  });

  it('buying a marble pays the price and adds a marble, only below 14 and with the scrap', () => {
    const run = shop({ army: 9, scrap: 100 });
    const price = item(run, 'marble').price;
    const bought = buy(run, 0);
    expect(bought).toMatchObject({ army: 10, scrap: 100 - price, bought: [0], shop: true });
    expect(kinds(bought)).toEqual(['special', 'relic', 'tactic']); // sold, gone
    expect(buy(bought, 0)).toBe(bought); // once
    expect(buy(shop({ army: 14 }), 0).army).toBe(14); // full
    expect(buy(shop({ army: 14 }), 0).bought).toEqual([]);
    expect(buy(shop({ army: 9, scrap: price - 1 }), 0).army).toBe(9); // too dear
    expect(buy(shop({ army: 9, scrap: price }), 0)).toMatchObject({ army: 10, scrap: 0 });
  });

  it('buying a special marble adds one of its type while the army has a plain marble to make special', () => {
    const run = shop({ army: 9 });
    const { code, price } = item(run, 'special');
    const specials = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0].map((_, k) => Number(k === code - 1));
    expect(buy(run, 1)).toMatchObject({ army: 9, specials, scrap: 500 - price, bought: [1] });
    const full = shop({ army: 4, specials: [4, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
    expect(buy(full, 1)).toBe(full); // all 4 marbles are special already
  });

  it('buying a relic adds it for the rest of the run', () => {
    const run = shop();
    const { code, price } = item(run, 'relic');
    expect(buy(run, 2)).toMatchObject({ relics: [code], scrap: 500 - price, bought: [2] });
    expect(kinds(buy(run, 2))).toEqual(['marble', 'special', 'tactic']);
    expect(buy(shop({ scrap: price - 1 }), 2).relics).toEqual([]);
  });

  it('buying a tactic adds it to the hand, up to 3', () => {
    const run = shop();
    const { code, price } = item(run, 'tactic');
    expect(buy(run, 3)).toMatchObject({ tactics: [code], scrap: 500 - price, bought: [3] });
    const hand = shop({ tactics: [1, 2, 3] });
    expect(buy(hand, 3)).toBe(hand);
  });

  it('buys nothing off a stock that is not there: no shop, an unknown or a sold item', () => {
    const run = newRun(1, 3);
    expect(buy({ ...run, scrap: 500 }, 0)).toEqual({ ...run, scrap: 500 });
    expect(buy(shop(), 9)).toEqual(shop());
    expect(buy(shop(), 4)).toEqual(shop()); // 4 is the removal, not an item
  });

  it('a paid removal makes one special marble plain again, once per shop', () => {
    const run = shop({ army: 9, specials: [1, 0, 2, 0, 0, 1, 0, 0, 0, 0], scrap: 100 });
    expect(removable(run)).toEqual([1, 3, 6]);
    const done = removeSpecial(run, 3);
    expect(done).toMatchObject({ army: 9, specials: [1, 0, 1, 0, 0, 1, 0, 0, 0, 0], bought: [4] });
    expect(100 - done.scrap).toBeGreaterThanOrEqual(20);
    expect(100 - done.scrap).toBeLessThanOrEqual(30);
    expect(removable(done)).toEqual([]); // once per shop
    expect(removeSpecial(done, 1)).toBe(done);
    expect(removeSpecial(run, 2)).toBe(run); // no Anchor to remove
    expect(removeSpecial({ ...run, scrap: 19 }, 1)).toEqual({ ...run, scrap: 19 }); // too dear
    expect(removeSpecial({ ...newRun(1, 3), specials: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0], scrap: 100 }, 1).specials[0]).toBe(1); // no shop
  });

  it('leaving the shop forgets what was bought, the next shop sells afresh', () => {
    const left = leaveShop(buy(shop({ army: 9 }), 0));
    expect(left).toMatchObject({ shop: false, bought: [] });
    expect(left.army).toBe(10);
  });

  it('draws the shop: the scrap, the items with prices, the removal, Leave', () => {
    const run = shop({ army: 9, specials: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0], scrap: 100 });
    const doc = parse(shopHtml(run));
    expect(doc.querySelector('.run-line')!.textContent).toBe('Shop · 100 scrap');
    const buys = [...doc.querySelectorAll<HTMLButtonElement>('button[data-buy]')];
    const stock = shopStock(run);
    expect(buys.map((b) => b.dataset.buy)).toEqual(['0', '1', '2', '3']);
    expect(buys[0]!.textContent).toBe(`One more marble · ${stock[0]!.price} scrap`);
    expect(buys[1]!.textContent).toBe(`${SPECIAL_LOOKS[stock[1]!.code - 1]!.name}: ${SPECIAL_LOOKS[stock[1]!.code - 1]!.help} · ${stock[1]!.price} scrap`);
    expect(buys[2]!.textContent).toBe(`${RELICS[stock[2]!.code]!.name}: ${RELICS[stock[2]!.code]!.help} · ${stock[2]!.price} scrap`);
    expect(buys[3]!.textContent).toBe(`${TACTICS[stock[3]!.code - 1]!.name}: ${TACTICS[stock[3]!.code - 1]!.help} · ${stock[3]!.price} scrap`);
    expect(buys.map((b) => b.querySelector('svg.glyph') !== null)).toEqual([true, true, true, true]);
    const remove = doc.querySelector<HTMLButtonElement>('button[data-remove]')!;
    expect(remove.dataset.remove).toBe('1');
    expect(remove.textContent).toMatch(/^Remove a Heavy: back to a plain marble · \d+ scrap$/);
    expect(doc.querySelector('button[data-leave]')!.textContent).toBe('Leave');
  });

  it('disables an item with its reason: too dear, the army full, no room for a special marble, the hand full', () => {
    const reason = (run: Run, id: number): [string, boolean] => {
      const b = parse(shopHtml(run)).querySelector<HTMLButtonElement>(`button[data-buy="${id}"]`)!;
      return [b.textContent!.split(' · ').slice(2).join(' · '), b.disabled];
    };
    expect(reason(shop({ army: 9, scrap: 0 }), 0)).toEqual(['not enough scrap', true]);
    expect(reason(shop({ army: 14 }), 0)).toEqual(['army full', true]);
    expect(reason(shop({ army: 14, scrap: 0 }), 0)).toEqual(['army full', true]);
    expect(reason(shop({ army: 4, specials: [4, 0, 0, 0, 0, 0, 0, 0, 0, 0] }), 1)).toEqual(['no plain marble left', true]);
    expect(reason(shop({ tactics: [1, 2, 3] }), 3)).toEqual(['hand full', true]);
    expect(reason(shop(), 2)).toEqual(['', false]);
    const none = parse(shopHtml(shop())).querySelector<HTMLButtonElement>('button[data-remove]')!;
    expect([none.dataset.remove, none.textContent, none.disabled]).toEqual(['0', 'Remove a special marble: none to remove', true]);
    const dear = parse(shopHtml(shop({ specials: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0], scrap: 0 }))).querySelector<HTMLButtonElement>('button[data-remove]')!;
    expect([dear.dataset.remove, dear.disabled, dear.textContent!.endsWith(' · not enough scrap')]).toEqual(['1', true, true]);
  });

  it('sold items and a used removal leave the shop', () => {
    const run = removeSpecial(buy(shop({ army: 9, specials: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] }), 0), 1);
    const doc = parse(shopHtml(run));
    expect([...doc.querySelectorAll('button[data-buy]')].map((b) => (b as HTMLElement).dataset.buy)).toEqual(['1', '2', '3']);
    expect(doc.querySelector('button[data-remove]')).toBeNull();
    expect(doc.querySelector('button[data-leave]')).not.toBeNull();
  });

  it('draws the shop on the map, the scrap in the run line and the scrap lost in the summary', () => {
    const nodes = [...parse(mapHtml(SHOP, at(newRun(1, 3), 0))).querySelectorAll<HTMLButtonElement>('button[data-node]')];
    expect(nodes[1]!.textContent).toBe('Shop');
    expect(nodes[1]!.className).toBe('node shop');
    expect(nodes[1]!.getAttribute('aria-label')).toBe('Act 1, shop');
    expect(runLine(SHOP, { ...newRun(1, 3), scrap: 25 })).toBe('Rogue-lite run · army 14 marbles · 25 scrap · pick a fight');
    expect(runLine(SHOP, { ...pick(newRun(1, 3), 0), scrap: 25 })).toBe('Rogue-lite run · act 1 fight · army 14 marbles · 25 scrap');
    expect(runLine(SHOP, newRun(1, 3))).toBe('Rogue-lite run · army 14 marbles · pick a fight'); // none yet: nothing shown
    const over = parse(mapHtml(SHOP, { ...at(newRun(1, 3), 0), army: 3, end: 'lost', scrap: 40 }));
    expect([...over.querySelectorAll('.run-help')].map((p) => p.textContent)).toContain('Scrap left: 40, lost with the run');
    const none = parse(mapHtml(SHOP, { ...at(newRun(1, 3), 0), army: 3, end: 'lost' }));
    expect([...none.querySelectorAll('.run-help')].map((p) => p.textContent!.slice(0, 5))).not.toContain('Scrap');
  });

  it('saves the scrap and the shop with the run, and an older save loads with none', async () => {
    const store = memoryStore();
    const mapOf = (): MapNode[] => SHOP;
    const waiting = buy(shop({ army: 9, scrap: 70 }), 0);
    await saveRun(store, waiting);
    expect((await loadRun(store, mapOf, engine))!.state).toEqual(waiting);
    const older: Record<string, unknown> = { ...waiting };
    for (const key of ['scrap', 'shop', 'bought']) delete older[key];
    await store.put(RUN_KEY, older);
    expect((await loadRun(store, mapOf, engine))!.state).toEqual({ ...waiting, scrap: 0, shop: false, bought: [] });
  });
});


// The four new special marbles (#1461, docs/specs/roguelite.md section 13): Magnet, Shield, Bomb and Medic, kinds 7 to 10.
describe('roguelite Magnet, Shield, Bomb and Medic', () => {
  const parse = (html: string): Document => new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const rgb = (hex: number): RGB => [hex >> 16, (hex >> 8) & 0xff, hex & 0xff];
  const NEW = [7, 8, 9, 10];
  const counts = (...kinds: number[]): number[] => SPECIAL_LOOKS.map((_, k) => kinds.filter((kind) => kind === k + 1).length);
  const won = (run: Run): Run => ({ ...run, path: [0], reward: true });

  it('looks: a shape of its own and a colour of its own, 3:1 on the glass and on the shell, never the colour alone', () => {
    const plain = [0, 1, 2, 6, 7, 8, 9].map((k) => SPECIAL_LOOKS[k]!);
    expect(new Set(plain.map((l) => l.color)).size).toBe(7);
    expect(new Set(plain.map((l) => JSON.stringify(l.points))).size).toBe(7);
    expect(SPECIAL_LOOKS.slice(6).map((l) => [l.name, l.plus, l.help])).toEqual([
      ['Magnet', false, 'pulls an enemy two cells away one cell closer after it moves'],
      ['Shield', false, 'the first push that would move it fails'],
      ['Bomb', false, 'bursts after your third turn and is lost'],
      ['Medic', false, 'comes back once on your back row when ejected'],
    ]);
    for (const { color } of SPECIAL_LOOKS.slice(6)) {
      expect(contrastRatio(rgb(color), rgb(GLASS.color))).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(rgb(color), rgb(SHELL.color))).toBeGreaterThanOrEqual(3);
    }
  });

  it('every event gains one count per special marble type, and four events give the new ones', () => {
    expect(EVENTS.every((e) => e.gain.length === SPECIAL_LOOKS.length)).toBe(true);
    const [lodestone, bulkhead, charge, sickbay] = EVENTS.slice(6);
    expect([lodestone, bulkhead, charge, sickbay].map((e) => e!.title)).toEqual(['Lodestone', 'Bulkhead', 'Unexploded charge', 'Sick bay']);
    const full = newRun(1, 3);
    expect(takeEvent(full, lodestone!)).toMatchObject({ army: 12, specials: counts(7) });
    expect(takeEvent(full, bulkhead!)).toMatchObject({ army: 12, specials: counts(8) });
    expect(takeEvent(full, charge!)).toMatchObject({ army: 13, specials: counts(9) });
    expect(takeEvent(full, sickbay!)).toMatchObject({ army: 12, specials: counts(10) });
    expect(takeEvent({ ...full, army: 6, specials: counts(1, 1, 1, 1, 2, 2) }, charge!)).toBeNull(); // no plain marble left
  });

  it('a type is dealt in events only once unlocked, and every one shows up at 3 acts', () => {
    const gains = (best: number): number[] => [
      ...new Set(
        Array.from({ length: 200 }, (_, seed) => eventOf({ ...at(newRun(seed, best), 0), event: true })!).flatMap((e) =>
          e.gain.flatMap((g, k) => (g ? [k + 1] : [])),
        ),
      ),
    ].sort((a, b) => a - b);
    expect(gains(0)).toEqual([1]);
    expect(gains(1)).toEqual([1, 2, 8]);
    expect(gains(2)).toEqual([1, 2, 3, 8, 10]);
    expect(gains(3)).toEqual([1, 2, 3, 7, 8, 9, 10]);
  });

  it('is offered as a reward once unlocked: Shield after 1 act, Medic after 2, Magnet and Bomb after a run won', () => {
    const dealt = (best: number): number[] =>
      [...new Set(Array.from({ length: 60 }, (_, seed) => offers(won(newRun(seed, best)))).flat())].sort((a, b) => a - b);
    expect(dealt(0)).toEqual([1]);
    expect(dealt(1)).toEqual([1, 2, 8]);
    expect(dealt(2)).toEqual([1, 2, 3, 8, 10]);
    expect(dealt(3)).toEqual([1, 2, 3, 7, 8, 9, 10]);
    const seed = Array.from({ length: 60 }, (_, s) => s).find((s) => offers(won(newRun(s, 3))).includes(7))!;
    const run = won(newRun(seed, 3));
    expect(claim(run, 7).specials).toEqual(counts(7));
    const button = parse(rewardHtml(MAP, run)).querySelector('button[data-offer="7"]')!;
    expect(button.textContent).toBe(`Magnet: ${SPECIAL_LOOKS[6]!.help}`);
    expect(button.querySelectorAll('svg.glyph polygon')).toHaveLength(1);
  });

  it('is placed, counted and listed like the others: at most 3 a fight, a button and a glyph each', () => {
    const fight = pick({ ...newRun(1, 3), specials: counts(7, 7, 7, 7, 8, 9, 10) }, 0);
    expect(left(fight, 7)).toBe(FIGHT_CAP);
    let run = fight;
    for (const r of [4, 3, 2, 1]) run = place(run, [0, r], 7);
    expect(run.placed).toEqual([[0, 4, 7], [0, 3, 7], [0, 2, 7]]);
    run = place(run, [-1, 4], 8);
    run = place(run, [-2, 4], 9);
    run = place(run, [-3, 4], 10);
    const doc = parse(placeHtml(run, 8));
    const buttons = [...doc.querySelectorAll<HTMLButtonElement>('button[data-kind]')];
    expect(buttons.map((b) => [b.dataset.kind, b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['7', 'Magnet · 0 left', 'false'],
      ['8', 'Shield · 0 left', 'true'],
      ['9', 'Bomb · 0 left', 'false'],
      ['10', 'Medic · 0 left', 'false'],
    ]);
    expect(doc.querySelectorAll('svg.glyph polygon')).toHaveLength(4);
    expect(runLine(MAP, { ...newRun(1, 3), specials: counts(7, 8, 9, 10) })).toBe('Rogue-lite run · army 14 marbles, 1 Magnet, 1 Shield, 1 Bomb, 1 Medic · pick a fight');
  });

  it('the rest site upgrades none of them: no upgraded form', () => {
    const site = visit(parseMap([0, 0, 0, 3, 0, 0, 0]), { ...newRun(1, 3), specials: counts(7, 8, 9, 10) }, 0);
    expect(upgradable(site)).toEqual([]);
    expect(upgrade(site, 7)).toBe(site);
    expect(parse(restHtml(site)).querySelector<HTMLButtonElement>('button[data-upgrade]')!.disabled).toBe(true);
  });

  it('a smaller army loses them first: the Medic, the Bomb, the Shield, then the Magnet, then the older types', () => {
    const fight = { ...pick({ ...newRun(1, 3), army: 10, specials: counts(1, 2, 3, 7, 8, 9, 10) }, 0), placed: [] };
    expect(fightOver(MAP, fight, true, 4).specials).toEqual(counts(1, 2, 3, 7, 8, 9)); // 6 marbles: the Medic goes
    expect(fightOver(MAP, fight, true, 6).specials).toEqual(counts(1, 2, 3, 7)); // 4 marbles: the Bomb and the Shield too
    const many = { ...pick({ ...newRun(1, 3), army: 10, specials: counts(1, 1, 2, 3, 7, 8, 9, 10) }, 0), placed: [] };
    expect(fightOver(MAP, many, true, 6).specials).toEqual(counts(1, 1, 2, 3)); // 4 marbles: the Magnet too, before any older type
    const bombed = { ...pick({ ...newRun(1, 3), army: 8, specials: counts(9) }, 0), placed: [[0, 4, 9]] };
    expect(fightOver(MAP, bombed, true, 1, counts()).specials).toEqual(counts()); // the Bomb burst: gone with its marble
    const medic = { ...pick({ ...newRun(1, 3), army: 8, specials: counts(10) }, 0), placed: [[0, 4, 10]] };
    expect(fightOver(MAP, medic, true, 0, counts())).toMatchObject({ army: 8, specials: counts() }); // back as a plain marble
  });

  it('the shop sells the unlocked ones and takes them back for scrap', () => {
    const shop = (state: Partial<Run> = {}): Run => ({ ...newRun(1, 3), army: 9, path: [0], shop: true, scrap: 500, ...state });
    const codes = (best: number): number[] =>
      [...new Set(Array.from({ length: 80 }, (_, seed) => shopStock(shop({ seed, best })).find((i) => i.kind === 'special')!.code))].sort((a, b) => a - b);
    expect(codes(0)).toEqual([1]);
    expect(codes(1)).toEqual([1, 2, 8]);
    expect(codes(3)).toEqual([1, 2, 3, 7, 8, 9, 10]);
    const seed = Array.from({ length: 80 }, (_, s) => s).find((s) => shopStock(shop({ seed: s })).find((i) => i.kind === 'special')!.code === 9)!;
    expect(buy(shop({ seed }), 1).specials).toEqual(counts(9));
    const held = shop({ specials: counts(8, 10) });
    expect(removable(held)).toEqual([8, 10]);
    expect(removeSpecial(held, 10)).toMatchObject({ specials: counts(8), bought: [4] });
    expect(parse(shopHtml(held)).querySelector('button[data-remove="8"]')!.textContent).toMatch(/^Remove a Shield: back to a plain marble/);
  });

  it('a run saved before them loads with none of them', async () => {
    const store = memoryStore();
    const run = { ...pick({ ...newRun(1, 3), specials: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, 0), moves: [] as number[][] };
    const older: Record<string, unknown> = { ...run, specials: [1, 0, 0, 0, 0, 0] };
    await store.put(RUN_KEY, older);
    expect((await loadRun(store, () => MAP, engine))!.state.specials).toEqual(run.specials);
  });
});

describe('varied enemy armies (#1462)', () => {
  // A snake fight (node 0) leading to a wedge elite, The Artificer (node 1), then the boss, in the bridge's encoding.
  const FOES = parseMap([0, 0, 0, 0, 0b1, 3, 0, 0, 1, 0, 2, 0b1, 4, 2, 0, 2, 0, 1, 0, 0, 0]);

  it('the map record carries the formation of a node and the archetype of an elite', () => {
    expect(FOES[0]).toMatchObject({ kind: 'fight', formation: 3, elite: 0 });
    expect(FOES[1]).toMatchObject({ kind: 'elite', formation: 4, elite: 2 });
    expect(FORMATIONS).toEqual(['Standard', 'Belgian daisy', 'German daisy', 'Snake', 'Wedge']);
    expect(ELITES.map((e) => e.name)).toEqual(['The Wall', 'The Artificer', 'The Brute']);
    expect(ELITES.map((e) => e.help)).toEqual(['Anchors', 'Sparks and Bombs', 'Heavies']);
  });

  it('a new run has the varied enemies, and the fight HUD names the formation and the elite', () => {
    expect(newRun(1, 3).enemies).toBe(true);
    expect(runLine(FOES, pick(newRun(1, 3), 0))).toBe('Rogue-lite run · act 1 fight · Snake · army 14 marbles');
    expect(runLine(FOES, pick({ ...newRun(1, 3), path: [0] }, 1))).toBe('Rogue-lite run · act 1 elite · The Artificer · Wedge · army 14 marbles');
    expect(runLine(FOES, pick({ ...newRun(1, 3), path: [0, 1] }, 2))).toBe('Rogue-lite run · act 1 boss · army 14 marbles');
    // The Standard formation is the layout of before: nothing to name.
    expect(runLine(MAP, pick(newRun(1, 3), 0))).toBe('Rogue-lite run · act 1 fight · army 14 marbles');
    // A run saved before them fights the plain army, and the HUD names nothing.
    expect(runLine(FOES, pick({ ...newRun(1, 3), enemies: false }, 0))).toBe('Rogue-lite run · act 1 fight · army 14 marbles');
  });

  it('the map names an elite by its archetype, and only for a run with the varied enemies', () => {
    const labels = (run: Run): string[] =>
      [...new DOMParser().parseFromString(mapHtml(FOES, run), 'text/html').querySelectorAll<HTMLButtonElement>('button[data-node]')].map((b) => `${b.textContent}|${b.getAttribute('aria-label')}`);
    const after = { ...newRun(1, 3), path: [0] };
    expect(labels(after)).toEqual(['Fight|Act 1, fight', 'EliteThe Artificer|Act 1, elite, The Artificer', 'Boss|Act 1, boss']);
    expect(labels({ ...after, enemies: false })).toEqual(['Fight|Act 1, fight', 'Elite|Act 1, elite', 'Boss|Act 1, boss']);
  });

  it('the bot\'s army of the fight is the bridge\'s plan for the node, a marble short with the Saboteur', () => {
    const seen: number[][] = [];
    const planOf = (node: number, less: number): ArrayLike<number> => {
      seen.push([node, less]);
      return Int32Array.from([10 - less, 3, 0, -4, 2]);
    };
    expect(foePlan(FOES, pick(newRun(1, 3), 0), planOf)).toEqual([10, 3, 0, -4, 2]);
    expect(foePlan(FOES, pick({ ...newRun(1, 3), path: [0], relics: [Relic.Saboteur] }, 1), planOf)).toEqual([9, 3, 0, -4, 2]);
    expect(seen).toEqual([[0, 0], [1, 1]]);
    // A run saved before them: the count alone, as before.
    expect(foePlan(FOES, pick({ ...newRun(1, 3), enemies: false }, 0), planOf)).toBe(FIGHT_FOES);
    expect(seen).toHaveLength(2);
  });

  it('a saved run keeps the flag, and one saved before it fights the plain army', async () => {
    const store = memoryStore();
    const fight = pick(newRun(1, 3), 0);
    await saveRun(store, fight);
    expect((await loadRun(store, () => FOES, engine))!.state.enemies).toBe(true);
    await store.put(RUN_KEY, { ...fight, enemies: 'yes' });
    expect(await loadRun(store, () => FOES, engine)).toBeNull();
    await store.put(RUN_KEY, { ...fight, enemies: false });
    expect((await loadRun(store, () => FOES, engine))!.state.enemies).toBe(false);
  });
});
