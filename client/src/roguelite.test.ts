// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { cellIndex, type Move } from './board';
import { contrastRatio, type RGB } from './contrast';
import { GLASS, SHELL } from './marbles';
import {
  ACT_PERCENT,
  actBoss,
  choices,
  claim,
  ELITE_BUDGET,
  eventHtml,
  eventOf,
  EVENTS,
  fightBudget,
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
  rewardHtml,
  RUN_KEY,
  runLine,
  saveRun,
  sparkBurst,
  SPECIAL_LOOKS,
  START_ARMY,
  MIN_ARMY,
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
    expect(MAP[0]).toEqual({ act: 0, row: 0, col: 0, kind: 'fight', links: [0] });
    expect(MAP[2]).toEqual({ act: 0, row: 1, col: 0, kind: 'boss', links: [] });
    expect(parseMap([0, 0, 0, 2, 0, 0, 0, 1, 3, 0, 0, 0, 2, 4, 0]).map((n) => n.kind)).toEqual(['elite', 'rest', 'event']);
    expect(parseMap([0, 0, 1, 0, 0b101])[0]!.links).toEqual([0, 2]);
  });

  it('a new run has the full army and offers the first row of act 1', () => {
    const run = newRun(5);
    expect(run).toEqual({ seed: 5, army: START_ARMY, path: [], fighting: false, moves: [], end: '', specials: [0, 0, 0], placed: [], reward: false, event: false });
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
    for (const key of ['specials', 'placed', 'reward', 'event']) delete older[key];
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
    ['a bad event flag', { ...newRun(1), event: 'x' }],
  ])('drops a saved run with %s', async (_, raw) => {
    const store = memoryStore();
    await store.put(RUN_KEY, raw);
    expect(await loadRun(store, () => MAP, engine)).toBeNull();
    expect(store.data.has(RUN_KEY)).toBe(false);
  });

  it('a boss fight saved before the act bosses (an army fight then, #800) starts over instead of losing the run', async () => {
    const store = memoryStore();
    const boss = { ...pick(at(newRun(1), 0), 2), moves: [[9, ...MV.slice(1)]] }; // moves the boss board refuses
    await saveRun(store, boss);
    const loaded = (await loadRun(store, () => MAP, engine))!;
    expect(loaded.state).toEqual({ ...boss, moves: [] });
    expect(loaded.engine).toMatchObject({ played: [] });
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
    const nodes = [1, 2, 3, 4, 5, 6, 7, 8].filter((seed) => offers({ ...short, seed }).join() !== offers({ ...short, seed, path: [1] }).join());
    expect(nodes.length).toBeGreaterThan(0); // the node, not only the step: two nodes of a row offer apart
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
    const doc = new DOMParser().parseFromString(rewardHtml(MAP, run), 'text/html');
    const buttons = [...doc.querySelectorAll<HTMLButtonElement>('button[data-offer]')];
    expect(buttons.map((b) => Number(b.dataset.offer))).toEqual(offers(run));
    expect(doc.querySelector('.run-line')!.textContent).toBe('Fight won · pick a reward');
    expect(rewardHtml(MAP, won({ ...newRun(1), army: 4, specials: [2, 1, 1] }))).toContain('One more marble');
    expect(rewardHtml(MAP, won(newRun(1)))).toContain('Heavy: weighs 2 in a push');
    expect(rewardHtml(MAP, won(newRun(1)))).toContain('Anchor: never pushed off');
    expect(rewardHtml(MAP, won(newRun(1)))).toContain('Spark: bursts when pushed off');
  });
  // Elites, rests, events and act bosses (#800). One act: a fight leads to an elite, a rest and an event, each to the
  // boss. Indices: 0 fight, 1 elite, 2 rest, 3 event, 4 boss.
  const ACT = parseMap([0, 0, 0, 0, 0b111, 0, 1, 0, 2, 1, 0, 1, 1, 3, 1, 0, 1, 2, 4, 1, 0, 2, 0, 1, 0]);
  const parse = (html: string): Document => new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');

  it('a rest brings the army back up to 14 and leads on, with no fight', () => {
    const rested = visit(ACT, { ...newRun(1), army: 6, path: [0] }, 2);
    expect(rested).toMatchObject({ army: START_ARMY, path: [0, 2], fighting: false, event: false });
    expect(choices(ACT, rested)).toEqual([4]);
    expect(runLine(ACT, rested)).toBe('Rogue-lite run · rested · army 14 marbles · pick a fight');
  });

  it('a fight, an elite or a boss starts its fight as a pick does', () => {
    const run = { ...newRun(1), path: [0] };
    expect(visit(ACT, run, 1)).toEqual(pick(run, 1));
    expect(visit(ACT, at(run, 0, 1), 4)).toEqual(pick(at(run, 0, 1), 4));
    expect(visit(ACT, newRun(1), 0)).toEqual(pick(newRun(1), 0));
  });

  it('an elite: a stronger bot, and a won one gives up to 2 marbles back before its reward', () => {
    const elite = pick({ ...newRun(1), path: [0] }, 1);
    expect(fightBudget(ACT, elite, 1000)).toBe(1000 * ELITE_BUDGET);
    expect(ELITE_BUDGET).toBe(2);
    expect(fightBudget(ACT, pick(newRun(1), 0), 1000)).toBe(1000);
    expect(fightBudget(ACT, { ...elite, fighting: false }, 1000)).toBe(1000);
    expect(fightBudget(ACT, newRun(1), 1000)).toBe(1000);
    expect(fightOver(ACT, elite, true, 3)).toMatchObject({ army: 13, end: '', reward: true });
    expect(fightOver(ACT, elite, true, 0).army).toBe(START_ARMY);
    expect(fightOver(ACT, { ...elite, army: 6 }, true, 2)).toMatchObject({ army: 6, end: '' });
    expect(fightOver(ACT, { ...elite, army: 5 }, true, 2)).toMatchObject({ army: 3, end: 'lost' }); // no marble back once lost
    expect(fightOver(ACT, elite, false, 2).end).toBe('lost');
    expect(runLine(ACT, elite)).toBe('Rogue-lite run · act 1 elite · army 14 marbles');
    const after = fightOver(ACT, { ...elite, army: 10 }, true, 0);
    expect(parse(rewardHtml(ACT, after)).querySelector('.run-line')!.textContent).toBe('Elite beaten · up to 2 marbles back · pick a reward');
    expect(parse(rewardHtml(ACT, won(newRun(1)))).querySelector('.run-line')!.textContent).toBe('Fight won · pick a reward');
  });

  it('an event waits for its choice, seeded by the run seed and the node', () => {
    const run = visit(ACT, { ...newRun(1), path: [0] }, 3);
    expect(run).toMatchObject({ path: [0, 3], fighting: false, event: true });
    expect(choices(ACT, run)).toEqual([]);
    expect(EVENTS).toHaveLength(5);
    expect(EVENTS).toContain(eventOf(run));
    expect(eventOf(run)).toBe(eventOf({ ...run }));
    const seen = new Set(Array.from({ length: 60 }, (_, seed) => eventOf({ ...run, seed })));
    expect(seen.size).toBe(5); // every event shows up
    const nodes = [1, 2, 3, 4, 5, 6, 7, 8].filter((seed) => eventOf({ ...run, seed }) !== eventOf({ ...run, seed, path: [0, 7] }));
    expect(nodes.length).toBeGreaterThan(0);
  });

  it('each event trades marbles for special marbles or back, only when the army can pay and gains', () => {
    const [forge, clamps, wiring, drone, pods] = EVENTS;
    const full = newRun(1);
    expect(takeEvent(full, forge!)).toMatchObject({ army: 12, specials: [1, 0, 0] });
    expect(takeEvent(full, clamps!)).toMatchObject({ army: 12, specials: [0, 1, 0] });
    expect(takeEvent(full, wiring!)).toMatchObject({ army: 13, specials: [0, 0, 1] });
    expect(takeEvent(full, drone!)).toMatchObject({ army: 11, specials: [0, 0, 2] });
    expect(takeEvent({ ...full, army: 10, specials: [1, 1, 1] }, pods!)).toMatchObject({ army: 13, specials: [1, 1, 0] }); // a Spark first
    expect(takeEvent({ ...full, army: 12, specials: [1, 0, 0] }, pods!)).toMatchObject({ army: 14, specials: [0, 0, 0] }); // up to 14
    expect(takeEvent({ ...full, army: 10 }, pods!)).toBeNull(); // no special marble to give
    expect(takeEvent({ ...full, specials: [1, 0, 0] }, pods!)).toBeNull(); // a full army gains nothing
    expect(takeEvent({ ...full, army: 5 }, forge!)).toBeNull(); // 3 marbles left would end the run
    expect(takeEvent({ ...full, army: 6, specials: [2, 1, 1] }, forge!)).toBeNull(); // no plain marble left to make special
    for (const e of EVENTS) expect(e.title && e.text && e.take).toBeTruthy();
  });

  it('an event resolved: taken it pays and gains, left it changes nothing, and the map goes on', () => {
    const run = visit(ACT, { ...newRun(1), path: [0] }, 3);
    const taken = resolve(run, true);
    expect(taken).toEqual({ ...takeEvent(run, eventOf(run)!)!, event: false });
    expect(choices(ACT, taken)).toEqual([4]);
    expect(resolve(run, false)).toEqual({ ...run, event: false });
    const poor = { ...run, army: MIN_ARMY };
    expect(resolve(poor, true)).toBe(poor); // it cannot pay: the event waits
    expect(resolve(newRun(1), true)).toEqual(newRun(1)); // no event
    expect(eventOf(newRun(1))).toBeNull();
  });

  it('draws the event screen: its title, its text, the trade, disabled when it cannot be paid, and Leave', () => {
    const run = visit(ACT, { ...newRun(1), path: [0] }, 3);
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
    const doc = parse(mapHtml(ACT, newRun(1)));
    const nodes = [...doc.querySelectorAll<HTMLButtonElement>('button[data-node]')];
    expect(nodes.map((b) => b.textContent)).toEqual(['Fight', 'Elite', 'Rest', 'Event', 'Boss']);
    expect(nodes.map((b) => b.className)).toEqual(['node', 'node elite', 'node rest', 'node event', 'node boss']);
    expect(nodes[2]!.getAttribute('aria-label')).toBe('Act 1, rest');
  });

  it('a boss node is a roster boss picked by the run seed, at the act strength, a new one each act', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const boss = actBoss(MAP, pick(at(newRun(1), 0), 2), ids)!;
    expect(ids).toContain(boss.id);
    expect(boss.percent).toBe(ACT_PERCENT[0]);
    expect(ACT_PERCENT).toEqual([50, 100, 200]);
    expect(actBoss(MAP, pick(at(newRun(1), 0), 2), ids)).toEqual(boss); // the same run: the same boss and seed
    const second = actBoss(MAP, pick(at(newRun(1), 0, 2, 3), 5), ids)!;
    expect(second.percent).toBe(ACT_PERCENT[1]);
    expect(second.id).not.toBe(boss.id);
    expect(second.seed).not.toBe(boss.seed);
    const firsts = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => actBoss(MAP, pick(at({ ...newRun(seed) }, 0), 2), ids)!.id));
    expect(firsts.size).toBeGreaterThan(1); // other seeds, other bosses
    expect(actBoss(MAP, pick(newRun(1), 0), ids)).toBeNull(); // a fight
    expect(actBoss(MAP, at(newRun(1), 0, 2), ids)).toBeNull(); // the boss beaten, no fight on
    expect(actBoss(MAP, newRun(1), ids)).toBeNull();
  });

  it('a boss fight leaves the special marbles alone: none was placed', () => {
    const fight = pick({ ...at(newRun(1), 0), specials: [1, 0, 1] }, 2);
    expect(fightOver(MAP, fight, true, 2)).toMatchObject({ army: 12, specials: [1, 0, 1], reward: true });
  });
});
