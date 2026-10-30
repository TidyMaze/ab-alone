// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  choices,
  clearRun,
  fightOver,
  loadRun,
  mapHtml,
  newRun,
  parseMap,
  pick,
  RUN_KEY,
  runLine,
  saveRun,
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
const engine = (army: number) => {
  const played: number[] = [];
  return {
    army,
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
    expect(run).toEqual({ seed: 5, army: START_ARMY, path: [], fighting: false, moves: [], end: '' });
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
    expect(fightOver(MAP, fight, true, 2)).toEqual({ ...fight, army: 12, fighting: false, end: '' });
    expect(fightOver(MAP, fight, false, 3).end).toBe('lost');
  });

  it('the run ends below 4 marbles, and is won on the last boss', () => {
    expect(fightOver(MAP, { ...pick(newRun(1), 0), army: 5 }, true, 2)).toMatchObject({ army: 3, end: 'lost' });
    expect(fightOver(MAP, { ...pick(newRun(1), 2), path: [0, 2] }, true, 0).end).toBe('');
    expect(fightOver(MAP, { ...pick(newRun(1), 5), path: [0, 2, 3, 5] }, true, 1)).toMatchObject({ army: 13, end: 'won' });
  });

  it('says where the run stands', () => {
    expect(runLine(MAP, newRun(1))).toBe('Rogue-lite run · army 14 marbles · pick a fight');
    expect(runLine(MAP, pick(newRun(1), 1))).toBe('Rogue-lite run · act 1 fight · army 14 marbles');
    expect(runLine(MAP, { ...pick(newRun(1), 5), army: 9 })).toBe('Rogue-lite run · act 2 boss · army 9 marbles');
    expect(runLine(MAP, { ...newRun(1), army: 8, end: 'won' })).toBe('Run won with 8 marbles');
    expect(runLine(MAP, { ...newRun(1), army: 3, end: 'lost' })).toBe('Run lost · 3 marbles left');
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
    expect(loaded.engine).toMatchObject({ army: 9, played: [1, 2] });
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
});
