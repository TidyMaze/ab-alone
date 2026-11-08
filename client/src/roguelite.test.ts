// @vitest-environment jsdom
import type { RGB } from './palettes';
import { describe, expect, it } from 'vitest';
import { cellIndex, type Move } from './board';
import { BLUEPRINTS, blueprintId, CELLS, COLLECT_COST, LEGACY_UNLOCKED } from './collector';
import { GLASS, SHELL } from './marbles';
import {
  ACT_ONE_LEAVES,
  ACT_PERCENT,
  actBoss,
  BONUS_SCRAP,
  bonusHtml,
  bonusRelic,
  MOVE_BUDGET,
  movesLine,
  rounds,
  takeBonus,
  ASCENSIONS,
  chooseAscension,
  MAX_ASCENSION,
  readAscension,
  recordAscension,
  dailyRun,
  runScore,
  SCORE,
  scoreParts,
  actsWon,
  BIOMES,
  biomeOf,
  chooseExit,
  currentBiome,
  runCue,
  exitHtml,
  exitOffers,
  chooseCommander,
  COMMANDERS,
  collect,
  bankedTownLine,
  blueprintText,
  collectorHtml,
  earned,
  leaveCollector,
  KIND_ACTS,
  readBest,
  recordBest,
  choices,
  claim,
  ELITE_BUDGET,
  auditLine,
  choiceText,
  eventHtml,
  eventOf,
  foretold,
  relicText,
  CURSE_FIGHTS,
  EVENTS,
  fightBudget,
  FIGHT_FOES,
  FIRST_FOES,
  Key,
  foesOf,
  foePlan,
  FORMATIONS,
  ELITES,
  resolve,
  takeEvent,
  visit,
  clearRun,
  FIGHT_CAP,
  FLASK_MARBLES,
  FLASKS,
  MAX_FLASKS,
  drink,
  fightOver,
  loadRun,
  mapHtml,
  newRun,
  offers,
  parseMap,
  parseSpecials,
  armyKept,
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
  AFFINITIES,
  affinityBarHtml,
  MAX_AFFINITY,
  scrollHtml,
  scrollOffers,
  takeScroll,
  type MapNode,
  type Run,
  type RunEvent,
  nearestGap,
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
/** The run `run`, waiting at an event, with a seed that deals the event `title`. */
const waitingAt = (title: string, run: Run): Run => ({
  ...run,
  seed: Array.from({ length: 600 }, (_, seed) => seed).find((seed) => eventOf({ ...run, seed })!.title === title)!,
});
/** The special marble types an event can give (the bridge's kinds). */
const grants = (e: RunEvent): number[] => e.choices.flatMap((c) => [c.win.special, c.fail.special]).filter(Boolean);

describe('roguelite', () => {
  it('parses the map records of the bridge', () => {
    expect(MAP).toHaveLength(6);
    expect(MAP[0]).toEqual({ act: 0, row: 0, col: 0, kind: 'fight', links: [0], skips: [], formation: 0, elite: 0 });
    expect(MAP[2]).toEqual({ act: 0, row: 1, col: 0, kind: 'boss', links: [], skips: [], formation: 0, elite: 0 });
    expect(parseMap([0, 0, 0, 2, 0, 0, 0, 0, 0, 1, 3, 0, 0, 0, 0, 0, 2, 4, 0, 0, 0, 0, 0, 3, 7, 0, 0, 0]).map((n) => n.kind)).toEqual(['elite', 'rest', 'event', 'unknown']);
    expect(parseMap([0, 0, 1, 0, 0b101, 0, 0])[0]!.links).toEqual([0, 2]);
  });

  it('a new run has the full army and offers the first row of act 1', () => {
    const run = newRun(5, 3, []);
    expect(run).toEqual({ seed: 5, army: START_ARMY, path: [], fighting: false, moves: [], end: '', specials: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], placed: [], reward: false, event: false, best: 3, relics: [], commander: -1, ascension: 0, top: 0, relic: false, rest: false, tactics: [], scrap: 0, shop: false, bought: [], enemies: true, told: '', unlocked: [], cells: 0, carried: [], banked: [], drop: 0, collector: false, exits: true, exit: false, biomes: [], first: 0, flawless: 0, daily: '', auto: false, keys: [], curse: 0, flasks: 2, affinities: [0, 0, 0], scroll: false, spent: [0, 0, 0, 0], bonus: false, runes: 0, found: 0, map: 0 });
    expect(choices(MAP, run)).toEqual([0, 1]);
  });

  it('a fight node leads to its links, a boss to the first row of the next act', () => {
    expect(choices(MAP, at(newRun(1, 3, LEGACY_UNLOCKED), 0))).toEqual([2]);
    expect(choices(MAP, at(newRun(1, 3, LEGACY_UNLOCKED), 1, 2))).toEqual([3, 4]);
  });

  it('nothing is offered during a fight or once the run is over', () => {
    expect(choices(MAP, pick(newRun(1, 3, LEGACY_UNLOCKED), 0))).toEqual([]);
    expect(choices(MAP, { ...newRun(1, 3, LEGACY_UNLOCKED), end: 'lost' })).toEqual([]);
  });

  it('a pick starts the fight of that node with no move', () => {
    expect(pick({ ...newRun(1, 3, LEGACY_UNLOCKED), moves: [MV] }, 1)).toEqual({ ...newRun(1, 3, LEGACY_UNLOCKED), path: [1], fighting: true, moves: [] });
  });

  it('a won fight costs the ejected marbles and goes on, a lost one ends the run', () => {
    const fight = pick(newRun(1, 3, LEGACY_UNLOCKED), 0);
    expect(fightOver(MAP, fight, true, 2)).toEqual({ ...fight, army: 12, fighting: false, end: '', reward: true, scrap: 10, cells: CELLS.fight });
    expect(fightOver(MAP, fight, false, 3).end).toBe('lost');
  });

  it('the run ends below 4 marbles, and is won on the last boss', () => {
    expect(fightOver(MAP, { ...pick(newRun(1, 3, LEGACY_UNLOCKED), 0), army: 5 }, true, 2)).toMatchObject({ army: 3, end: 'lost', reward: false });
    expect(fightOver(MAP, { ...pick(newRun(1, 3, LEGACY_UNLOCKED), 2), path: [0, 2] }, true, 0).end).toBe('');
    expect(fightOver(MAP, { ...pick(newRun(1, 3, LEGACY_UNLOCKED), 5), path: [0, 2, 3, 5] }, true, 1)).toMatchObject({ army: 13, end: 'won', reward: false });
  });

  it('says where the run stands', () => {
    expect(runLine(MAP, newRun(1, 3, LEGACY_UNLOCKED))).toBe('Rogue-lite run · army 14 marbles · pick a fight');
    expect(runLine(MAP, pick(newRun(1, 3, LEGACY_UNLOCKED), 1))).toBe('Rogue-lite run · act 1 fight · army 14 marbles');
    expect(runLine(MAP, { ...pick(newRun(1, 3, LEGACY_UNLOCKED), 5), army: 9 })).toBe('Rogue-lite run · act 2 boss · army 9 marbles');
    expect(runLine(MAP, { ...newRun(1, 3, LEGACY_UNLOCKED), army: 8, end: 'won' })).toBe('Run won with 8 marbles');
    expect(runLine(MAP, { ...newRun(1, 3, LEGACY_UNLOCKED), army: 3, end: 'lost' })).toBe('Run lost · 3 marbles left');
    expect(runLine(MAP, { ...newRun(1, 3, LEGACY_UNLOCKED), specials: [2, 0, 1, 0, 0, 0, 0, 0, 0, 0] })).toBe('Rogue-lite run · army 14 marbles, 2 Heavy, 1 Spark · pick a fight');
    expect(runLine(MAP, { ...newRun(1, 3, LEGACY_UNLOCKED), specials: [1, 0, 0, 1, 1, 0, 0, 0, 0, 0] })).toBe('Rogue-lite run · army 14 marbles, 1 Heavy, 1 Heavy+, 1 Anchor+ · pick a fight');
  });

  it('draws the map: the picks open, the path taken marked, its links drawn', () => {
    const html = mapHtml(MAP, at(newRun(1, 3, LEGACY_UNLOCKED), 0, 2));
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    const nodes = [...doc.querySelectorAll<HTMLButtonElement>('button[data-node]')];
    expect(nodes.map((b) => b.textContent)).toEqual(['Fight', 'Fight', 'Boss', 'Fight', 'Fight', 'Boss']);
    expect(nodes.map((b) => b.disabled)).toEqual([true, true, true, false, false, true]);
    expect(nodes.map((b) => b.className)).toEqual(['node taken', 'node', 'node boss here', 'node', 'node', 'node boss']);
    expect(nodes.map((b) => b.dataset.nodeKind)).toEqual(['fight', 'fight', 'boss', 'fight', 'fight', 'boss']);
    expect(nodes[3]!.getAttribute('aria-label')).toBe('Act 2, fight');
    expect(nodes[0]!.getAttribute('style')).toBe('left:25%;top:20%'); // below its act's header, which takes half a row
    expect(nodes[4]!.getAttribute('style')).toBe('left:75%;top:70%');
    const lines = [...doc.querySelectorAll('line')];
    expect(lines).toHaveLength(4); // 2 fights to the boss in each act, none from a boss to the next act (#1543)
    expect(lines.filter((l) => l.classList.contains('taken'))).toHaveLength(1);
    expect(doc.querySelector('.run-line')!.textContent).toBe('Rogue-lite run · army 14 marbles · pick a fight');
    expect(doc.getElementById('run-new')).toBeNull();
  });

  it('draws each node kind with its own icon above its name, and a header per act', () => {
    const doc = new DOMParser().parseFromString(mapHtml(parseMap([0, 0, 0, 7, 0, 0, 0]), newRun(1, 3, LEGACY_UNLOCKED)), 'text/html');
    expect(doc.querySelectorAll('button[data-node] > svg.glyph')).toHaveLength(1);
    const kinds = ['fight', 'boss', 'elite', 'rest', 'event', 'treasure', 'shop', 'unknown'];
    const paths = kinds.map((kind) => {
      const one = new DOMParser().parseFromString(mapHtml(parseMap([0, 0, 0, kinds.indexOf(kind), 0, 0, 0]), newRun(1, 3, LEGACY_UNLOCKED)), 'text/html');
      return one.querySelector('button[data-node] > svg.glyph path')!.getAttribute('d');
    });
    expect(new Set(paths).size).toBe(kinds.length); // one icon a kind, none alike
    const heads = [...new DOMParser().parseFromString(mapHtml(MAP, newRun(1, 3, LEGACY_UNLOCKED)), 'text/html').querySelectorAll('.act-head')];
    expect(heads.map((h) => h.textContent)).toEqual(['Act 1 · Meadow', 'Act 2']); // the biome of an act not yet picked is not named
    expect(heads.map((h) => h.getAttribute('style'))).toEqual(['top:5%', 'top:55%']);
    const picked = new DOMParser().parseFromString(mapHtml(MAP, { ...newRun(1, 3, LEGACY_UNLOCKED), biomes: [2], path: [0, 2] }), 'text/html');
    expect([...picked.querySelectorAll('.act-head')].map((h) => h.textContent)).toEqual(['Act 1 · Meadow', 'Act 2 · Tundra']);
    const old = new DOMParser().parseFromString(mapHtml(MAP, { ...newRun(1, 3, LEGACY_UNLOCKED), exits: false }), 'text/html');
    expect([...old.querySelectorAll('.act-head')].map((h) => h.textContent)).toEqual(['Act 1', 'Act 2']); // a run saved before the biomes
  });

  it('marks the links to the nodes that can be picked next, and lists the icons in a legend', () => {
    const doc = new DOMParser().parseFromString(mapHtml(MAP, at(newRun(1, 3, LEGACY_UNLOCKED), 1)), 'text/html');
    const lines = [...doc.querySelectorAll('line')];
    expect(lines.filter((l) => l.classList.contains('next'))).toHaveLength(1); // the fight 1 to the boss 2
    expect(lines.filter((l) => l.classList.contains('taken'))).toHaveLength(0);
    expect([...new DOMParser().parseFromString(mapHtml(MAP, at(newRun(1, 3, LEGACY_UNLOCKED), 1, 2)), 'text/html').querySelectorAll('line')].filter((l) => l.classList.contains('taken'))).toHaveLength(1);
    expect([...doc.querySelectorAll('.run-legend li')].map((li) => li.textContent)).toEqual(['Fight', 'Elite', 'Rest', 'Treasure', 'Shop', 'Unknown', 'Boss', 'Open', 'Taken']);
    expect(doc.querySelectorAll('.run-legend li svg.glyph')).toHaveLength(7);
  });

  it('previews a node on hover and focus: its kind, the elite archetype, the formation if known and the biome (#1468)', () => {
    // Act 1: a Snake fight, a Wall elite of the Wedge formation and a rest on a row of three, then the boss.
    const flat = [0, 0, 0, 0, 1, 3, 0, /**/ 0, 0, 1, 2, 1, 1, 1, /**/ 0, 0, 2, 3, 1, 0, 0, /**/ 0, 1, 0, 1, 0, 0, 0];
    const parse = (html: string): Document => new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    const preview = (run: Run): string[] =>
      [...parse(mapHtml(parseMap(flat), run)).querySelectorAll<HTMLButtonElement>('button[data-node]')].map((b) => b.dataset.tip!);
    expect(preview(newRun(1, 3, LEGACY_UNLOCKED))).toEqual([
      'Fight\nFormation: Snake\nAct 1 · Meadow',
      'Elite: The Wall (Anchors)\nFormation: Belgian daisy\nAct 1 · Meadow',
      'Rest\nAct 1 · Meadow',
      'Boss\nAct 1 · Meadow',
    ]);
    expect(preview({ ...newRun(1, 3, LEGACY_UNLOCKED), enemies: false, exits: false })).toEqual(['Fight\nAct 1', 'Elite\nAct 1', 'Rest\nAct 1', 'Boss\nAct 1']); // a run saved before the varied enemies and the biomes
    const sides = [...parse(mapHtml(parseMap(flat), newRun(1, 3, LEGACY_UNLOCKED))).querySelectorAll<HTMLButtonElement>('button[data-node]')].map((b) => b.dataset.tipSide);
    expect(sides).toEqual(['left', 'mid', 'right', 'mid']); // the preview keeps inside the plate
    expect(parse(mapHtml(parseMap([0, 0, 0, 7, 0, 0, 0]), newRun(1, 3, LEGACY_UNLOCKED))).querySelector<HTMLButtonElement>('button[data-node]')!.dataset.tip).toBe('Unknown\nAct 1 · Meadow'); // what it hides stays hidden
  });

  it('a run over offers a new run', () => {
    const doc = new DOMParser().parseFromString(mapHtml(MAP, { ...newRun(1, 3, LEGACY_UNLOCKED), end: 'lost' }), 'text/html');
    expect(doc.getElementById('run-new')!.textContent).toBe('New run');
  });

  it('saves the run, deletes it once over, and loads it back with its fight replayed', async () => {
    const store = memoryStore();
    const mapOf = (seed: number): MapNode[] => (seed === 1 ? MAP : []);
    expect(await loadRun(store, mapOf, engine)).toBeNull();
    const fight = { ...pick({ ...newRun(1, 3, LEGACY_UNLOCKED), army: 9 }, 1), moves: [MV, [2, ...MV.slice(1)]] };
    await saveRun(store, fight);
    const loaded = (await loadRun(store, mapOf, engine))!;
    expect(loaded.state).toEqual(fight);
    expect(loaded.map).toBe(MAP);
    expect(loaded.engine).toMatchObject({ army: 9, placed: [], played: [1, 2] });
    const placed = { ...pick({ ...newRun(1, 3, LEGACY_UNLOCKED), specials: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, 1), placed: [[0, 4, 1]] };
    await saveRun(store, placed);
    expect((await loadRun(store, mapOf, engine))!.engine).toMatchObject({ placed: [[0, 4, 1]] });
    const older: Record<string, unknown> = { ...fight }; // a run saved before the special marbles
    for (const key of ['specials', 'placed', 'reward', 'event', 'relics', 'relic', 'rest', 'tactics', 'scrap', 'shop', 'bought', 'enemies', 'unlocked', 'cells', 'carried', 'banked', 'drop', 'collector', 'told', 'commander', 'ascension', 'top', 'exits', 'exit', 'biomes', 'flawless', 'daily', 'auto', 'curse', 'affinities', 'scroll', 'spent', 'bonus']) delete older[key];
    await store.put(RUN_KEY, older);
    expect((await loadRun(store, mapOf, engine))!.state).toEqual({ ...fight, enemies: false, exits: false, spent: [] }); // before the varied enemies (#1462): the plain army; before the bonus room (#1473): no count
    await store.put(RUN_KEY, { ...fight, specials: [1, 0, 2] }); // saved before the upgrades (#1458): none upgraded
    expect((await loadRun(store, mapOf, engine))!.state).toEqual({ ...fight, specials: [1, 0, 2, 0, 0, 0, 0, 0, 0, 0] });
    await store.put(RUN_KEY, { ...fight, specials: [1, 0, 2, 0, 1, 0] }); // saved before the new four (#1461): none of them
    expect((await loadRun(store, mapOf, engine))!.state).toEqual({ ...fight, specials: [1, 0, 2, 0, 1, 0, 0, 0, 0, 0] });
    await store.put(RUN_KEY, { ...fight, specials: [1, 0, 2, 0, 1, 0, 3, 0, 1, 2] });
    expect((await loadRun(store, mapOf, engine))!.state).toEqual({ ...fight, specials: [1, 0, 2, 0, 1, 0, 3, 0, 1, 2] });
    const picked = chooseCommander(newRun(1, 3, LEGACY_UNLOCKED), 2); // the commander is saved with the run, its relic and its special marbles
    await saveRun(store, picked);
    expect((await loadRun(store, mapOf, engine))!.state).toEqual(picked);
    expect(picked).toMatchObject({ commander: 2, relics: [Relic.Detonator], specials: [0, 0, 2, 0, 0, 0, 0, 0, 0, 0] });
    const juggernaut = { ...picked, commander: 3, relics: [Relic.Bunks], specials: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0] }; // saved before #1632, with its two Heavies
    await saveRun(store, juggernaut);
    expect((await loadRun(store, mapOf, engine))!.state).toEqual(juggernaut);
    await saveRun(store, at(newRun(1, 3, LEGACY_UNLOCKED), 0));
    expect(await loadRun(store, mapOf, engine)).toMatchObject({ engine: null });
    await saveRun(store, { ...newRun(1, 3, LEGACY_UNLOCKED), end: 'won' });
    expect(store.data.has(RUN_KEY)).toBe(false);
    await saveRun(store, newRun(1, 3, LEGACY_UNLOCKED));
    await clearRun(store);
    expect(store.data.has(RUN_KEY)).toBe(false);
  });

  it.each([
    ['not an object', 'run'],
    ['a bad army', { ...newRun(1, 3, LEGACY_UNLOCKED), army: 1.5 }],
    ['a bad seed', { ...newRun(1, 3, LEGACY_UNLOCKED), seed: -1 }],
    ['a bad end', { ...newRun(1, 3, LEGACY_UNLOCKED), end: 'maybe' }],
    ['a bad move', { ...pick(newRun(1, 3, LEGACY_UNLOCKED), 0), moves: [[1, 2]] }],
    ['no fighting flag', { ...newRun(1, 3, LEGACY_UNLOCKED), fighting: 'yes' }],
    ['a path not of the map', at(newRun(1, 3, LEGACY_UNLOCKED), 2)],
    ['a path that is no list', { ...newRun(1, 3, LEGACY_UNLOCKED), path: 'x' }],
    ['a fight with no node', { ...newRun(1, 3, LEGACY_UNLOCKED), fighting: true }],
    ['a move the engine refuses', { ...pick(newRun(1, 3, LEGACY_UNLOCKED), 0), moves: [[9, ...MV.slice(1)]] }],
    ['a fight already over', { ...pick(newRun(1, 3, LEGACY_UNLOCKED), 0), moves: [[7, ...MV.slice(1)]] }],
    ['bad special counts', { ...newRun(1, 3, LEGACY_UNLOCKED), specials: [1, 2] }],
    ['four special counts', { ...newRun(1, 3, LEGACY_UNLOCKED), specials: [1, 2, 0, 0] }],
    ['nine special counts', { ...newRun(1, 3, LEGACY_UNLOCKED), specials: [1, 2, 0, 0, 0, 0, 0, 0, 0] }],
    ['eleven special counts', { ...newRun(1, 3, LEGACY_UNLOCKED), specials: [1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0] }],
    ['a bad rest flag', { ...newRun(1, 3, LEGACY_UNLOCKED), rest: 1 }],
    ['a bad placement', { ...pick(newRun(1, 3, LEGACY_UNLOCKED), 0), placed: [[0, 4]] }],
    ['a bad reward flag', { ...newRun(1, 3, LEGACY_UNLOCKED), reward: 1 }],
    ['a bad event flag', { ...newRun(1, 3, LEGACY_UNLOCKED), event: 'x' }],
    ['a bad best', { ...newRun(1, 3, LEGACY_UNLOCKED), best: 4 }],
    ['an unknown commander', { ...newRun(1, 3, LEGACY_UNLOCKED), commander: 4 }],
    ['a commander below none', { ...newRun(1, 3, LEGACY_UNLOCKED), commander: -2 }],
    ['an unknown relic', { ...newRun(1, 3, LEGACY_UNLOCKED), relics: [16] }],
    ['a relic twice', { ...newRun(1, 3, LEGACY_UNLOCKED), relics: [3, 3] }],
    ['relics that are no list', { ...newRun(1, 3, LEGACY_UNLOCKED), relics: 3 }],
    ['a bad relic flag', { ...newRun(1, 3, LEGACY_UNLOCKED), relic: 'yes' }],
    ['an unknown tactic', { ...newRun(1, 3, LEGACY_UNLOCKED), tactics: [5] }],
    ['tactic 0', { ...newRun(1, 3, LEGACY_UNLOCKED), tactics: [0] }],
    ['four tactics', { ...newRun(1, 3, LEGACY_UNLOCKED), tactics: [1, 2, 3, 4] }],
    ['tactics that are no list', { ...newRun(1, 3, LEGACY_UNLOCKED), tactics: 2 }],
    ['a bad scrap', { ...newRun(1, 3, LEGACY_UNLOCKED), scrap: -1 }],
    ['a bad shop flag', { ...newRun(1, 3, LEGACY_UNLOCKED), shop: 1 }],
    ['an unknown purchase', { ...newRun(1, 3, LEGACY_UNLOCKED), bought: [6] }],
    ['a purchase twice', { ...newRun(1, 3, LEGACY_UNLOCKED), bought: [1, 1] }],
    ['purchases that are no list', { ...newRun(1, 3, LEGACY_UNLOCKED), bought: 1 }],
    ['an unknown unlocked blueprint', { ...newRun(1, 3, LEGACY_UNLOCKED), unlocked: [14] }],
    ['an unlocked blueprint twice', { ...newRun(1, 3, LEGACY_UNLOCKED), unlocked: [2, 2] }],
    ['unlocked blueprints that are no list', { ...newRun(1, 3, LEGACY_UNLOCKED), unlocked: 2 }],
    ['bad cells', { ...newRun(1, 3, LEGACY_UNLOCKED), cells: -1 }],
    ['an unknown carried blueprint', { ...newRun(1, 3, LEGACY_UNLOCKED), carried: [14] }],
    ['a blueprint carried twice', { ...newRun(1, 3, LEGACY_UNLOCKED), carried: [1, 1] }],
    ['an unknown banked blueprint', { ...newRun(1, 3, LEGACY_UNLOCKED), banked: [-1] }],
    ['a bad drop', { ...newRun(1, 3, LEGACY_UNLOCKED), drop: 15 }],
    ['a bad collector flag', { ...newRun(1, 3, LEGACY_UNLOCKED), collector: 1 }],
    ['a bad scroll flag', { ...newRun(1, 3, LEGACY_UNLOCKED), scroll: 1 }],
    ['affinities that are no list', { ...newRun(1, 3, LEGACY_UNLOCKED), affinities: 1 }],
    ['two affinities', { ...newRun(1, 3, LEGACY_UNLOCKED), affinities: [1, 0] }],
    ['an affinity above its top level', { ...newRun(1, 3, LEGACY_UNLOCKED), affinities: [0, 3, 0] }],
    ['a negative affinity', { ...newRun(1, 3, LEGACY_UNLOCKED), affinities: [0, 0, -1] }],
    ['a told line that is no text', { ...newRun(1, 3, LEGACY_UNLOCKED), told: 3 }],
    ['a told line with markup', { ...newRun(1, 3, LEGACY_UNLOCKED), told: '<b>' }],
    ['a told line too long', { ...newRun(1, 3, LEGACY_UNLOCKED), told: 'x'.repeat(201) }],
  ])('drops a saved run with %s', async (_, raw) => {
    const store = memoryStore();
    await store.put(RUN_KEY, raw);
    expect(await loadRun(store, () => MAP, engine)).toBeNull();
    expect(store.data.has(RUN_KEY)).toBe(false);
  });

  it('a boss fight saved before the act bosses (an army fight then, #800) starts over instead of losing the run', async () => {
    const store = memoryStore();
    const boss = { ...pick(at(newRun(1, 3, LEGACY_UNLOCKED), 0), 2), moves: [[9, ...MV.slice(1)]] }; // moves the boss board refuses
    await saveRun(store, boss);
    const loaded = (await loadRun(store, () => MAP, engine))!;
    expect(loaded.state).toEqual({ ...boss, moves: [] });
    expect(loaded.engine).toMatchObject({ played: [] });
  });

  it('a blocked storage loses the save, never the run', async () => {
    await expect(saveRun(failing, newRun(1, 3, LEGACY_UNLOCKED))).resolves.toBeUndefined();
    await expect(clearRun(failing)).resolves.toBeUndefined();
    expect(await loadRun(failing, () => MAP, engine)).toBeNull();
  });

  const won = (run: Run): Run => ({ ...run, path: [0], reward: true });
  it('offers three rewards seeded by the run seed and the node, a marble only below 14, a special only past the specials', () => {
    const full = won(newRun(1, 3, LEGACY_UNLOCKED));
    expect(offers(full)).toHaveLength(3); // a full army: three of the special marbles
    expect(offers(full).every((o) => [1, 2, 3, 7, 8, 9, 10].includes(o))).toBe(true);
    const short = won({ ...newRun(1, 3, LEGACY_UNLOCKED), army: 12 });
    expect(offers(short)).toHaveLength(3);
    expect(new Set(offers(short)).size).toBe(3);
    expect(offers(short)).toEqual(offers({ ...short })); // the same seed and node: the same offers
    const seen = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => offers({ ...short, seed }).join()));
    expect(seen.size).toBeGreaterThan(1); // other seeds, other offers
    const nodes = [1, 2, 3, 4, 5, 6, 7, 8].filter((seed) => offers({ ...short, seed }).join() !== offers({ ...short, seed, path: [1] }).join());
    expect(nodes.length).toBeGreaterThan(0); // the node, not only the step: two nodes of a row offer apart
    expect(offers(won({ ...newRun(1, 3, LEGACY_UNLOCKED), army: 4, specials: [2, 1, 1, 0, 0, 0, 0, 0, 0, 0] }))).toEqual([0]); // all 4 marbles are special
    expect(offers(won({ ...newRun(1, 3, LEGACY_UNLOCKED), specials: [5, 5, 4, 0, 0, 0, 0, 0, 0, 0] }))).toEqual([]); // nothing left to offer
    expect(offers(won({ ...newRun(1, 3, LEGACY_UNLOCKED), army: 4, specials: [0, 0, 0, 2, 1, 1, 0, 0, 0, 0] }))).toEqual([0]); // upgraded ones are special too
    expect(offers({ ...short, reward: false })).toEqual([]);
  });

  it('a claimed reward adds a marble or a special marble, once, and only one offered', () => {
    const short = won({ ...newRun(1, 3, LEGACY_UNLOCKED), army: 12 });
    const [first] = offers(short);
    const after = claim(short, first!);
    expect(after.reward).toBe(false);
    expect(after.army + after.specials.reduce((a, b) => a + b)).toBe(13);
    expect(claim(after, first!)).toBe(after); // no reward pending
    expect(claim(won({ ...newRun(1, 3, LEGACY_UNLOCKED), army: 4, specials: [2, 1, 1, 0, 0, 0, 0, 0, 0, 0] }), 3).reward).toBe(true); // not offered
    const [dealt] = offers(won(newRun(1, 3, LEGACY_UNLOCKED)));
    expect(claim(won(newRun(1, 3, LEGACY_UNLOCKED)), dealt!).specials.map((n, k) => (n ? k + 1 : 0)).filter(Boolean)).toEqual([dealt]);
    expect(claim(won({ ...newRun(1, 3, LEGACY_UNLOCKED), army: 4, specials: [2, 1, 1, 0, 0, 0, 0, 0, 0, 0] }), 0)).toMatchObject({ army: 5, reward: false });
    expect(choices(MAP, won(newRun(1, 3, LEGACY_UNLOCKED)))).toEqual([]); // the map waits for the reward
  });

  it('places up to the cap of each type owned on the fight board before its first move, a second press takes it back', () => {
    const fight = pick({ ...newRun(1, 3, LEGACY_UNLOCKED), specials: [5, 1, 0, 0, 0, 0, 0, 0, 0, 0] }, 0);
    expect(placing(fight)).toBe(true);
    expect(placing(pick(newRun(1, 3, LEGACY_UNLOCKED), 0))).toBe(false); // no special marble
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
    const fight = { ...pick({ ...newRun(1, 3, LEGACY_UNLOCKED), specials: [2, 1, 1, 0, 0, 0, 0, 0, 0, 0] }, 0), placed: [[0, 4, 1], [1, 3, 3]] };
    expect(fightOver(MAP, fight, true, 1, [0, 0, 1, 0, 0, 0, 0, 0, 0, 0]).specials).toEqual([1, 1, 1, 0, 0, 0, 0, 0, 0, 0]); // the Heavy went off
    expect(fightOver(MAP, fight, true, 0).specials).toEqual([2, 1, 1, 0, 0, 0, 0, 0, 0, 0]); // none lost
    expect(fightOver(MAP, fight, true, 0).placed).toEqual([]);
    const small = { ...pick({ ...newRun(1, 3, LEGACY_UNLOCKED), army: 6, specials: [2, 2, 2, 0, 0, 0, 0, 0, 0, 0] }, 0), placed: [] };
    expect(fightOver(MAP, small, true, 2).specials).toEqual([2, 2, 0, 0, 0, 0, 0, 0, 0, 0]); // 4 marbles: the Sparks go first
    expect(fightOver(MAP, small, true, 1).specials).toEqual([2, 2, 1, 0, 0, 0, 0, 0, 0, 0]);
    // The upgraded ones (#1458) count apart and go after the plain ones, the Spark+ first.
    const upgraded = { ...pick({ ...newRun(1, 3, LEGACY_UNLOCKED), army: 6, specials: [1, 0, 0, 2, 2, 1, 0, 0, 0, 0] }, 0), placed: [[0, 4, 4], [1, 3, 6]] };
    expect(fightOver(MAP, upgraded, true, 2, [0, 0, 0, 1, 0, 1, 0, 0, 0, 0]).specials).toEqual([0, 0, 0, 2, 2, 0, 0, 0, 0, 0]);
    expect(fightOver(MAP, upgraded, true, 1, [0, 0, 0, 0, 0, 1, 0, 0, 0, 0]).specials).toEqual([1, 0, 0, 1, 2, 1, 0, 0, 0, 0]); // the Heavy+ went off
  });

  it('parses the special marbles of the bridge', () => {
    expect(parseSpecials([-1, 4, 2, 0, -4, 3])).toEqual([{ cell: [-1, 4], kind: 2 }, { cell: [0, -4], kind: 3 }]);
  });

  it('counts by type only the army special marbles left on the board, never the bot ones, #1492', () => {
    const board = new Array<number>(61).fill(0);
    board[cellIndex(-1, 4)] = 1; // the army's Anchor
    board[cellIndex(0, 4)] = 1; // the army's Heavy
    board[cellIndex(1, -4)] = 2; // the bot's Heavy
    expect(armyKept(board, [-1, 4, 2, 0, 4, 1, 1, -4, 1])).toEqual([1, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(armyKept(board, [])).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
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

  it('gives each type its own shape (#1461)', () => {
    expect(SPECIAL_LOOKS.map((l) => l.name)).toEqual(['Heavy', 'Anchor', 'Spark', 'Heavy+', 'Anchor+', 'Spark+', 'Magnet', 'Shield', 'Bomb', 'Medic']);
    expect(new Set([0, 1, 2, 6, 7, 8, 9].map((k) => JSON.stringify(SPECIAL_LOOKS[k]!.points))).size).toBe(7); // a shape each (#1461)
    // An upgraded type (#1458) keeps its type's shape and colour, and carries a `+` in the shell's ink.
    expect(SPECIAL_LOOKS.map((l) => l.plus)).toEqual([false, false, false, true, true, true, false, false, false, false]);
    for (const k of [0, 1, 2]) expect(SPECIAL_LOOKS[k + 3]).toMatchObject({ points: SPECIAL_LOOKS[k]!.points, color: SPECIAL_LOOKS[k]!.color });
    expect(PLUS_INK).toBe(SHELL.color);
    expect(SPECIAL_LOOKS.slice(3, 6).map((l) => l.help)).toEqual(['weighs 3 in a push', 'never pushed off, nor the marble in front of it', 'bursts 2 cells']);
  });

  it('draws the placement screen: the types owned, what is left of each, the one picked pressed', () => {
    const fight = { ...pick({ ...newRun(1, 3, LEGACY_UNLOCKED), specials: [4, 0, 1, 0, 0, 0, 0, 0, 0, 0] }, 0), placed: [[0, 4, 1]] };
    const doc = new DOMParser().parseFromString(placeHtml(fight, 1), 'text/html');
    const kinds = [...doc.querySelectorAll<HTMLButtonElement>('button[data-kind]')];
    expect(kinds.map((b) => b.textContent)).toEqual(['Heavy · 2 left', 'Spark · 1 left']);
    expect(kinds.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    expect(kinds.map((b) => b.dataset.kind)).toEqual(['1', '3']);
    expect(doc.querySelectorAll('svg polygon')).toHaveLength(2);
    expect(doc.querySelector('.run-line')!.textContent).toBe('Place your special marbles');
    // An upgraded type (#1458) is a type of its own, its glyph with a `+`, up to the cap.
    const plus = { ...pick({ ...newRun(1, 3, LEGACY_UNLOCKED), specials: [0, 0, 0, 4, 0, 0, 0, 0, 0, 0] }, 0), placed: [[0, 4, 4]] };
    const up = new DOMParser().parseFromString(placeHtml(plus, 4), 'text/html').querySelector<HTMLButtonElement>('button[data-kind]')!;
    expect([up.dataset.kind, up.textContent]).toEqual(['4', 'Heavy+ · 2 left']);
    expect(up.querySelector('svg .plus')).not.toBeNull();
    expect(left(plus, 4)).toBe(2);
    expect(place(plus, [0, 3], 4).placed).toEqual([[0, 4, 4], [0, 3, 4]]);
    expect(place(plus, [0, 3], 1)).toBe(plus); // no plain Heavy owned
  });

  it('draws the reward screen: one button per offer', () => {
    const run = won({ ...newRun(1, 3, LEGACY_UNLOCKED), army: 12 });
    const doc = new DOMParser().parseFromString(rewardHtml(MAP, run), 'text/html');
    const buttons = [...doc.querySelectorAll<HTMLButtonElement>('button[data-offer]')];
    expect(buttons.map((b) => Number(b.dataset.offer))).toEqual(offers(run));
    expect(doc.querySelector('.run-line')!.textContent).toBe('Fight won · pick a reward');
    expect(rewardHtml(MAP, won({ ...newRun(1, 3, LEGACY_UNLOCKED), army: 4, specials: [2, 1, 1, 0, 0, 0, 0, 0, 0, 0] }))).toContain('One more marble');
    const offering = (kind: number): string => {
      const seed = Array.from({ length: 60 }, (_, n) => n).find((n) => offers(won(newRun(n, 3, LEGACY_UNLOCKED))).includes(kind))!;
      return rewardHtml(MAP, won(newRun(seed, 3, LEGACY_UNLOCKED)));
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
    const site = visit(ACT, { ...newRun(1, 3, LEGACY_UNLOCKED), army: 6, path: [0] }, 2);
    expect(site).toMatchObject({ army: 6, path: [0, 2], fighting: false, event: false, rest: true });
    expect(choices(ACT, site)).toEqual([]); // the map waits for the choice
    expect(runLine(ACT, site)).toBe('Rogue-lite run · army 6 marbles · pick a fight'); // not rested yet
  });

  it('Rest brings the army back up to 14 and leads on', () => {
    const rested = rest(visit(ACT, { ...newRun(1, 3, LEGACY_UNLOCKED), army: 6, path: [0] }, 2));
    expect(rested).toMatchObject({ army: START_ARMY, path: [0, 2], fighting: false, rest: false });
    expect(choices(ACT, rested)).toEqual([4]);
    expect(runLine(ACT, rested)).toBe('Rogue-lite run · rested · army 14 marbles · pick a fight');
    expect(rest(newRun(1, 3, LEGACY_UNLOCKED))).toEqual(newRun(1, 3, LEGACY_UNLOCKED)); // no rest site waits
  });

  it('Upgrade makes one special marble of the type picked upgraded, the army as it was', () => {
    const site = visit(ACT, { ...newRun(1, 3, LEGACY_UNLOCKED), army: 6, specials: [1, 0, 2, 0, 0, 0, 0, 0, 0, 0], path: [0] }, 2);
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
    const site = visit(ACT, { ...newRun(1, 3, LEGACY_UNLOCKED), army: 6, specials: [1, 0, 2, 0, 0, 0, 0, 0, 0, 0], path: [0] }, 2);
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
    const run = { ...newRun(1, 3, LEGACY_UNLOCKED), path: [0], spent: [] }; // no count: no bonus room before the boss
    expect(visit(ACT, run, 1)).toEqual(pick(run, 1));
    expect(visit(ACT, at(run, 0, 1), 4)).toEqual(pick(at(run, 0, 1), 4));
    expect(visit(ACT, newRun(1, 3, LEGACY_UNLOCKED), 0)).toEqual(pick(newRun(1, 3, LEGACY_UNLOCKED), 0));
  });

  it('a fight puts 10 enemy marbles on the board, an elite or a boss the full 14, #1145', () => {
    const elite = pick({ ...newRun(1, 3, LEGACY_UNLOCKED), path: [0] }, 1);
    expect(FIGHT_FOES).toBe(10);
    expect(FIRST_FOES).toBe(8);
    expect(foesOf(ACT, pick(newRun(1, 3, LEGACY_UNLOCKED), 0))).toBe(FIRST_FOES); // act 1, row 1 (#1502)
    expect(foesOf([{ ...ACT[0]!, row: 1 }], pick(newRun(1, 3, LEGACY_UNLOCKED), 0))).toBe(10);
    expect(foesOf([{ ...ACT[0]!, act: 1 }], pick(newRun(1, 3, LEGACY_UNLOCKED), 0))).toBe(10);
    expect(foesOf(ACT, elite)).toBe(START_ARMY);
  });

  it('an elite: a stronger bot, and a won one gives up to 2 marbles back before its reward', () => {
    const elite = pick({ ...newRun(1, 3, LEGACY_UNLOCKED), path: [0], keys: [Key.Emerald] }, 1); // not the marked one (#1467)
    expect(fightBudget(ACT, elite, 1000)).toBe(1000 * ELITE_BUDGET);
    expect(ELITE_BUDGET).toBe(2);
    expect(fightBudget(ACT, pick(newRun(1, 3, LEGACY_UNLOCKED), 0), 1000)).toBe(1000);
    expect(fightBudget(ACT, { ...elite, fighting: false }, 1000)).toBe(1000);
    expect(fightBudget(ACT, newRun(1, 3, LEGACY_UNLOCKED), 1000)).toBe(1000);
    expect(fightOver(ACT, elite, true, 3)).toMatchObject({ army: 13, end: '', reward: true });
    expect(fightOver(ACT, elite, true, 0).army).toBe(START_ARMY);
    expect(fightOver(ACT, { ...elite, army: 6 }, true, 2)).toMatchObject({ army: 6, end: '' });
    expect(fightOver(ACT, { ...elite, army: 5 }, true, 2)).toMatchObject({ army: 3, end: 'lost' }); // no marble back once lost
    expect(fightOver(ACT, elite, false, 2).end).toBe('lost');
    expect(runLine(ACT, elite)).toBe('Rogue-lite run · act 1 elite · army 14 marbles');
    const after = fightOver(ACT, { ...elite, army: 10 }, true, 0);
    expect(parse(rewardHtml(ACT, after)).querySelector('.run-line')!.textContent).toBe('Elite beaten · up to 2 marbles back · pick a reward');
    expect(parse(rewardHtml(ACT, won(newRun(1, 3, LEGACY_UNLOCKED)))).querySelector('.run-line')!.textContent).toBe('Fight won · pick a reward');
  });

  // Events (#800, #1463): about twenty, each with 2 or 3 choices, some of them gambles drawn from the run seed and the node.
  const EVENT_NODE = visit(ACT, { ...newRun(1, 3, LEGACY_UNLOCKED), path: [0] }, 3);
  const waiting = (title: string, run: Run = EVENT_NODE): Run => waitingAt(title, run);

  it('an event waits for its choice, seeded by the run seed and the node', () => {
    expect(EVENT_NODE).toMatchObject({ path: [0, 3], fighting: false, event: true });
    expect(choices(ACT, EVENT_NODE)).toEqual([]);
    expect(EVENTS).toHaveLength(21);
    expect(EVENTS).toContain(eventOf(EVENT_NODE));
    expect(eventOf(EVENT_NODE)).toBe(eventOf({ ...EVENT_NODE }));
    const seen = new Set(Array.from({ length: 400 }, (_, seed) => eventOf({ ...EVENT_NODE, seed })));
    expect(seen.size).toBe(21); // every event shows up
    const nodes = [1, 2, 3, 4, 5, 6, 7, 8].filter((seed) => eventOf({ ...EVENT_NODE, seed }) !== eventOf({ ...EVENT_NODE, seed, path: [0, 7] }));
    expect(nodes.length).toBeGreaterThan(0);
    expect(new Set(EVENTS.map((e) => e.title)).size).toBe(21);
  });

  it('every event has a title, a line of lore, 2 or 3 choices ending on Leave, and about a third hold a gamble', () => {
    for (const e of EVENTS) {
      expect(e.title && e.text).toBeTruthy();
      expect([2, 3]).toContain(e.choices.length);
      expect(e.choices[e.choices.length - 1]!.verb).toBe('Leave');
      expect(e.choices.filter((c) => c.verb === 'Leave')).toHaveLength(1);
      for (const c of e.choices) expect(c.odds > 0 && c.odds <= 100).toBe(true);
    }
    expect(EVENTS.filter((e) => e.choices.some((c) => c.odds < 100)).length).toBeGreaterThanOrEqual(6);
    expect(EVENTS.slice(0, 10).map((e) => e.title)).toEqual(['Scrap forge', 'Mooring clamps', 'Live wiring', 'Salvage drone', 'Cryo pods', 'Field manual', 'Lodestone', 'Bulkhead', 'Unexploded charge', 'Sick bay']);
  });

  it('each trade gives marbles for special marbles or back, only when the army can pay and gains', () => {
    const [forge, clamps, wiring, drone, pods] = EVENTS;
    const full = newRun(1, 3, LEGACY_UNLOCKED);
    expect(takeEvent(full, forge!, 0)).toMatchObject({ army: 12, specials: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0], told: 'Scrap forge: +1 Heavy, -2 marbles' });
    expect(takeEvent(full, clamps!, 0)).toMatchObject({ army: 12, specials: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0] });
    expect(takeEvent(full, wiring!, 0)).toMatchObject({ army: 13, specials: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0], told: 'Live wiring: +1 Spark, -1 marble' });
    expect(takeEvent(full, drone!, 0)).toMatchObject({ army: 11, specials: [0, 0, 2, 0, 0, 0, 0, 0, 0, 0] });
    expect(takeEvent({ ...full, army: 10, specials: [1, 1, 1, 0, 0, 0, 0, 0, 0, 0] }, pods!, 0)).toMatchObject({ army: 13, specials: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0] }); // a Spark first
    expect(takeEvent({ ...full, army: 12, specials: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, pods!, 0)).toMatchObject({ army: 14, specials: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }); // up to 14
    expect(takeEvent({ ...full, army: 10, specials: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0] }, pods!, 0)).toMatchObject({ specials: [0, 0, 0, 0, 0, 1, 0, 0, 0, 0] }); // a plain one first
    expect(takeEvent({ ...full, army: 10, specials: [0, 0, 0, 1, 1, 0, 0, 0, 0, 0] }, pods!, 0)).toMatchObject({ specials: [0, 0, 0, 1, 0, 0, 0, 0, 0, 0] }); // then the Anchor+
    expect(takeEvent({ ...full, army: 10 }, pods!, 0)).toBeNull(); // no special marble to give
    expect(takeEvent({ ...full, specials: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, pods!, 0)).toBeNull(); // a full army gains nothing
    expect(takeEvent({ ...full, army: 5 }, forge!, 0)).toBeNull(); // 3 marbles left would end the run
    expect(takeEvent({ ...full, army: 6, specials: [2, 1, 1, 0, 0, 0, 0, 0, 0, 0] }, forge!, 0)).toBeNull(); // no plain marble left to make special
    expect(takeEvent(full, forge!, 2)).toBeNull(); // no such choice
  });

  it('Leave changes nothing and says nothing', () => {
    const run = { ...newRun(1, 3, LEGACY_UNLOCKED), army: 9, scrap: 12, told: 'old news' };
    for (const e of EVENTS) expect(takeEvent(run, e, e.choices.length - 1)).toEqual({ ...run, told: '' });
  });

  it('the new events: scrap, tactics, relics, healing and a special marble given away', () => {
    const rich = { ...EVENT_NODE, army: 10, specials: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0], scrap: 100, event: true };
    const take = (title: string, choice: number, run: Run = rich): Run => takeEvent(waiting(title, run), EVENTS.find((e) => e.title === title)!, choice)!;
    expect(take('Slag-glass vein', 1)).toMatchObject({ army: 9, scrap: 125, told: 'Slag-glass vein: +25 scrap, -1 marble' });
    expect(take('Ledger terminal', 0)).toMatchObject({ army: 9, tactics: [expect.any(Number)] });
    expect(take('Ledger terminal', 1)).toMatchObject({ army: 12, scrap: 80, told: 'Ledger terminal: +2 marbles, -20 scrap' });
    expect(take('Shelled crewmate', 0)).toMatchObject({ army: 11, scrap: 100 });
    expect(take('Shelled crewmate', 1)).toMatchObject({ army: 10, scrap: 130 });
    expect(take('Chapel box', 0)).toMatchObject({ specials: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], relics: [expect.any(Number)] });
    expect(take('Chapel box', 1)).toMatchObject({ scrap: 75, tactics: [expect.any(Number)] });
    expect(take('Furnace vent', 1)).toMatchObject({ army: 9, specials: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
    expect(take('Foreman crate', 1)).toMatchObject({ army: 10, scrap: 110 });
    expect(take('Ship relay', 0)).toMatchObject({ scrap: 120 });
    expect(take('Cold locker', 1)).toMatchObject({ scrap: 115 });
    expect(take('Airlock', 1)).toMatchObject({ scrap: 115 });
    // The scrap a trade asks, the relic and the tactic it gives: none of them without the means.
    expect(take('Ledger terminal', 1, { ...rich, scrap: 19 })).toBeNull();
    expect(take('Ledger terminal', 0, { ...rich, tactics: [1, 2, 3] })).toBeNull(); // a full hand gains nothing
    expect(take('Chapel box', 0, { ...rich, relics: RELICS.map((_, code) => code) })).toBeNull(); // no relic left
    expect(take('Chapel box', 0, { ...rich, specials: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] })).toBeNull(); // no special marble to give
    expect(take('Chapel box', 1, { ...rich, scrap: 24 })).toBeNull();
  });

  it('a relic given by an event is dealt by the run seed and the node, one the run does not hold', () => {
    const chapel = EVENTS.find((e) => e.title === 'Chapel box')!;
    const run = { ...EVENT_NODE, specials: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
    const relic = (seed: number, relics: number[] = []): number => takeEvent({ ...run, seed, relics }, chapel, 0)!.relics.at(-1)!;
    expect(relic(1)).toBe(relic(1));
    expect(new Set(Array.from({ length: 30 }, (_, seed) => relic(seed))).size).toBeGreaterThan(3);
    expect(relic(1, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(Relic.Quartermaster); // the only one left
  });

  it('a gamble is drawn from the run seed and the node: the same draw twice, both sides over seeds', () => {
    const vein = EVENTS.find((e) => e.title === 'Slag-glass vein')!;
    expect(vein.choices[0]).toMatchObject({ verb: 'Touch the vein', odds: 50 });
    const base = { ...EVENT_NODE, army: 12 };
    const results = Array.from({ length: 60 }, (_, seed) => takeEvent({ ...base, seed }, vein, 0)!);
    const won = results.filter((r) => r.specials[0] === 1);
    expect(won.length).toBeGreaterThan(15);
    expect(won.length).toBeLessThan(45);
    expect(won[0]).toMatchObject({ army: 12, told: 'Slag-glass vein: it paid off, +1 Heavy' });
    const lost = results.find((r) => r.specials[0] === 0)!;
    expect(lost).toMatchObject({ army: 10, told: 'Slag-glass vein: it went wrong, -2 marbles' });
    expect(takeEvent({ ...base, seed: 4 }, vein, 0)).toEqual(takeEvent({ ...base, seed: 4 }, vein, 0));
    const nodes = new Set(Array.from({ length: 30 }, (_, n) => takeEvent({ ...base, path: [0, n] }, vein, 0)!.army));
    expect(nodes.size).toBe(2); // another node, another draw
    // A gamble is taken only when both of its sides can be paid.
    expect(takeEvent({ ...base, army: 5 }, vein, 0)).toBeNull(); // losing 2 would end the run
    const dice = EVENTS.find((e) => e.title === 'Dice')!;
    expect(takeEvent({ ...base, scrap: 19 }, dice, 0)).toBeNull(); // the stake is 20
    expect(takeEvent({ ...base, scrap: 20 }, dice, 0)).not.toBeNull();
  });

  it('a locker heals, a vent warms, a crate pays: gambles on healing, marbles and scrap', () => {
    const run = { ...EVENT_NODE, army: 8, scrap: 5 };
    const outcomes = (title: string, choice: number): Run[] => {
      const e = EVENTS.find((x) => x.title === title)!;
      return Array.from({ length: 40 }, (_, seed) => takeEvent({ ...run, seed: seed + 1000 }, e, choice)!);
    };
    expect(new Set(outcomes('Cold locker', 0).map((r) => r.army))).toEqual(new Set([START_ARMY, 7]));
    expect(new Set(outcomes('Foreman crate', 0).map((r) => [r.army, r.scrap].join()))).toEqual(new Set(['9,35', '7,5']));
    const warm = { ...run, specials: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
    const sides = new Set(
      Array.from({ length: 40 }, (_, seed) => takeEvent({ ...warm, seed: seed + 1000 }, EVENTS.find((e) => e.title === 'Furnace vent')!, 0)!).map((r) => [r.army, r.specials[0]].join()),
    );
    expect(sides).toEqual(new Set(['12,1', '8,0'])); // warmed up, or the glass fused to a special marble
    expect(takeEvent(run, EVENTS.find((e) => e.title === 'Furnace vent')!, 0)).toBeNull(); // no special marble for the glass to fuse to
  });

  it('an event resolved: a choice pays and gains, Leave changes nothing but the event, and the map goes on', () => {
    const run = waiting('Scrap forge');
    const first = resolve(run, 0);
    expect(first).toEqual({ ...takeEvent(run, eventOf(run)!, 0)!, event: false });
    expect(first).toMatchObject({ army: 12, specials: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
    expect(choices(ACT, first)).toEqual([4]);
    expect(resolve(run, 1)).toEqual({ ...run, event: false });
    const poor = { ...run, army: MIN_ARMY };
    expect(resolve(poor, 0)).toBe(poor); // it cannot pay: the event waits
    expect(resolve(run, 9)).toBe(run); // no such choice
    expect(resolve(newRun(1, 3, LEGACY_UNLOCKED), 0)).toEqual(newRun(1, 3, LEGACY_UNLOCKED)); // no event
    expect(eventOf(newRun(1, 3, LEGACY_UNLOCKED))).toBeNull();
  });

  it('draws the event screen: its title, its text, a button per choice with what it gives, disabled when it cannot be paid', () => {
    const run = waiting('Slag-glass vein');
    const e = eventOf(run)!;
    const doc = parse(eventHtml(run));
    expect(doc.querySelector('.run-line')!.textContent).toBe('Event · Slag-glass vein');
    expect(doc.querySelector('.run-help')!.textContent).toBe(e.text);
    const buttons = [...doc.querySelectorAll<HTMLButtonElement>('button[data-choice]')];
    expect(buttons.map((b) => [b.dataset.choice, b.textContent, b.disabled])).toEqual([
      ['0', 'Touch the vein · 50 %: +1 Heavy, otherwise -2 marbles', false],
      ['1', 'Chip off a shard · +25 scrap, -1 marble', false],
      ['2', 'Leave', false],
    ]);
    const poor = [...parse(eventHtml({ ...run, army: 5 })).querySelectorAll<HTMLButtonElement>('button[data-choice]')];
    expect(poor.map((b) => b.disabled)).toEqual([true, false, false]); // 3 marbles left would end the run
    const forge = waiting('Scrap forge');
    expect(parse(eventHtml(waiting('Salvage drone'))).querySelector('button[data-choice="0"]')!.textContent).toBe('Arm 2 Sparks · +2 Sparks, -3 marbles');
    expect(parse(eventHtml({ ...forge, army: MIN_ARMY })).querySelector<HTMLButtonElement>('button[data-choice="0"]')!.disabled).toBe(true);
  });

  it('an Unknown node turns into an event most often, else a fight or a treasure, drawn from the run seed and the node', () => {
    const UNKNOWN = parseMap([0, 0, 0, 7, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0]);
    const entered = (seed: number, node = 0): Run => visit(UNKNOWN, { ...newRun(seed, 3, LEGACY_UNLOCKED), path: [] }, node);
    expect(entered(1)).toEqual(entered(1)); // deterministic
    const kinds = Array.from({ length: 300 }, (_, seed) => entered(seed)).map((r) => (r.event ? 'event' : r.fighting ? 'fight' : r.relic ? 'treasure' : 'none'));
    const count = (kind: string): number => kinds.filter((k) => k === kind).length;
    expect(count('event')).toBeGreaterThan(count('fight') * 2); // most often an event
    expect(count('fight')).toBeGreaterThan(count('treasure'));
    expect(count('treasure')).toBeGreaterThan(5);
    expect(count('none')).toBe(0);
    expect(entered(1).path).toEqual([0]);
    const MANY = parseMap(Array.from({ length: 40 }, () => [0, 0, 0, 7, 0, 0, 0]).flat());
    const byNode = new Set(Array.from({ length: 40 }, (_, node) => visit(MANY, newRun(2, 3, LEGACY_UNLOCKED), node)).map((r) => [r.event, r.fighting, r.relic].join()));
    expect(byNode.size).toBeGreaterThan(1); // another node, another draw
  });

  it('a fight an Unknown node turned into is a plain fight: 10 foes, scrap, the Jammer, and the run line says fight', () => {
    const UNKNOWN = parseMap([0, 1, 0, 7, 0, 0, 0]);
    const fight = Array.from({ length: 60 }, (_, seed) => visit(UNKNOWN, newRun(seed, 3, LEGACY_UNLOCKED), 0)).find((r) => r.fighting)!;
    expect(foesOf(UNKNOWN, fight)).toBe(FIGHT_FOES);
    expect(foesOf(UNKNOWN, { ...fight, relics: [Relic.Saboteur] })).toBe(FIGHT_FOES - 1);
    expect(fightBudget(UNKNOWN, fight, 1000)).toBe(1000);
    expect(fightBudget(UNKNOWN, { ...fight, relics: [Relic.Jammer] }, 1000)).toBe(1000);
    expect(runLine(UNKNOWN, fight)).toBe('Rogue-lite run · act 1 fight · army 14 marbles');
    expect(fightOver(UNKNOWN, fight, true, 1)).toMatchObject({ army: 13, scrap: SCRAP.fight, reward: true, relic: false });
    expect(foePlan(UNKNOWN, fight, (node, less) => [10 - less, node])).toEqual([10, 0]);
  });

  it('a treasure an Unknown node turned into offers one relic, and the path names what the node became', () => {
    const UNKNOWN = parseMap([0, 0, 0, 7, 0, 0, 0]);
    const chest = Array.from({ length: 80 }, (_, seed) => visit(UNKNOWN, newRun(seed, 3, LEGACY_UNLOCKED), 0)).find((r) => r.relic)!;
    expect(relicOffers(UNKNOWN, chest)).toHaveLength(1);
    expect(parse(relicHtml(UNKNOWN, chest)).querySelector('.run-line')!.textContent).toBe('Treasure · a chest holds a relic');
    expect(takeRelic(UNKNOWN, chest, relicOffers(UNKNOWN, chest)[0]!).relics).toHaveLength(1);
    const over = parse(mapHtml(UNKNOWN, { ...chest, relic: false, end: 'lost' as const }));
    expect(over.querySelector('.run-help')!.textContent).toBe('Path: act 1 Treasure');
    const fought = Array.from({ length: 60 }, (_, seed) => visit(UNKNOWN, newRun(seed, 3, LEGACY_UNLOCKED), 0)).find((r) => r.fighting)!;
    const lost = parse(mapHtml(UNKNOWN, { ...fought, fighting: false, end: 'lost' as const }));
    expect([...lost.querySelectorAll('.run-help')].map((p) => p.textContent).slice(0, 2)).toEqual(['Path: act 1 Fight', 'Fights: 0 won, 1 lost']);
  });

  it('draws an Unknown node as a ? that names itself unknown, and what an event told shows on the map until the next pick', () => {
    const UNKNOWN = parseMap([0, 0, 0, 7, 0, 0, 0]);
    const node = parse(mapHtml(UNKNOWN, newRun(1, 3, LEGACY_UNLOCKED))).querySelector<HTMLButtonElement>('button[data-node]')!;
    expect([node.textContent, node.className, node.getAttribute('aria-label')]).toEqual(['?', 'node unknown', 'Act 1, unknown']);
    const told = { ...newRun(1, 3, LEGACY_UNLOCKED), told: 'Scrap forge: +1 Heavy, -2 marbles' };
    expect(parse(mapHtml(UNKNOWN, told)).querySelector('.run-help')!.textContent).toBe('Scrap forge: +1 Heavy, -2 marbles');
    expect(parse(mapHtml(UNKNOWN, { ...newRun(1, 3, LEGACY_UNLOCKED), path: [0] })).querySelector('.run-help:not(.run-moves)')).toBeNull();
    expect(visit(UNKNOWN, told, 0).told).toBe('');
    expect(visit(ACT, { ...told, path: [0] }, 2).told).toBe(''); // a rest site too
    expect(pick(told, 0).told).toBe('');
  });

  it('draws elites, rests and events on the map', () => {
    const doc = parse(mapHtml(ACT, newRun(1, 3, LEGACY_UNLOCKED)));
    const nodes = [...doc.querySelectorAll<HTMLButtonElement>('button[data-node]')];
    expect(nodes.map((b) => b.textContent)).toEqual(['Fight', 'Elitekey', 'Rest', 'Event', 'Boss']);
    expect(nodes.map((b) => b.className)).toEqual(['node', 'node elite marked', 'node rest', 'node event', 'node boss']);
    expect(nodes[2]!.getAttribute('aria-label')).toBe('Act 1, rest');
  });

  it("the Meadow's act 1 deals no Echo, Hull, Choir or Chaplain (#1599): they leave act 1 for acts 2 and 3", () => {
    const ids = ['echo', 'hull', 'choir', 'chaplain', 'ballast', 'alien', 'overseer', 'dual', 'railyard', 'stalker', 'swarm', 'magnetizer', 'pulsar', 'assembly', 'core'];
    const first = new Set(Array.from({ length: 200 }, (_, seed) => actBoss(MAP, pick(at(newRun(seed + 1, 3, LEGACY_UNLOCKED), 0), 2), ids)!.id));
    expect(ACT_ONE_LEAVES).toEqual(['echo', 'hull', 'chaplain', 'choir']);
    expect([...first].sort()).toEqual(ids.filter((id) => !ACT_ONE_LEAVES.includes(id)).sort()); // the 11 others, each one dealt
    expect(ACT_ONE_LEAVES).toContain(actBoss(MAP, pick(at(newRun(1, 3, LEGACY_UNLOCKED), 0), 2), ['echo', 'hull', 'choir', 'chaplain'])!.id); // a roster of the four only: it is kept
  });

  it('a boss node is a roster boss picked by the run seed, at the act strength, a new one each act', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const boss = actBoss(MAP, pick(at(newRun(1, 3, LEGACY_UNLOCKED), 0), 2), ids)!;
    expect(ids).toContain(boss.id);
    expect(boss.percent).toBe(ACT_PERCENT[0]);
    expect(ACT_PERCENT).toEqual([50, 120, 200, 300]); // #1537: act 2 raised from 100 (docs/specs/roguelite.md section 30)
    expect(actBoss(MAP, pick(at(newRun(1, 3, LEGACY_UNLOCKED), 0), 2), ids)).toEqual(boss); // the same run: the same boss and seed
    const second = actBoss(MAP, pick(at(newRun(1, 3, LEGACY_UNLOCKED), 0, 2, 3), 5), ids)!;
    expect(second.percent).toBe(ACT_PERCENT[1]);
    expect(second.id).not.toBe(boss.id);
    expect(second.seed).not.toBe(boss.seed);
    const firsts = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => actBoss(MAP, pick(at({ ...newRun(seed, 3, LEGACY_UNLOCKED) }, 0), 2), ids)!.id));
    expect(firsts.size).toBeGreaterThan(1); // other seeds, other bosses
    expect(actBoss(MAP, pick(newRun(1, 3, LEGACY_UNLOCKED), 0), ids)).toBeNull(); // a fight
    expect(actBoss(MAP, at(newRun(1, 3, LEGACY_UNLOCKED), 0, 2), ids)).toBeNull(); // the boss beaten, no fight on
    expect(actBoss(MAP, newRun(1, 3, LEGACY_UNLOCKED), ids)).toBeNull();
  });

  it('a boss fight leaves the special marbles alone: none was placed', () => {
    const fight = pick({ ...at(newRun(1, 3, LEGACY_UNLOCKED), 0), specials: [1, 0, 1, 0, 0, 0, 0, 0, 0, 0] }, 2);
    expect(fightOver(MAP, fight, true, 2)).toMatchObject({ army: 12, specials: [1, 0, 1, 0, 0, 0, 0, 0, 0, 0], reward: true });
  });

  // Unlocks between runs and the run summary (#801): only variety carries over, never power.
  it('every commander starts a run with 14 marbles, a relic, some special marbles and a line, each unlocked by the acts won in one run', () => {
    expect(COMMANDERS.map((c) => c.name)).toEqual(['The Captain', 'The Warden', 'The Saboteur', 'The Juggernaut']);
    expect(COMMANDERS.map((c) => c.acts)).toEqual([0, 1, 2, 3]);
    expect(COMMANDERS.map((c) => c.relic)).toEqual([Relic.Gyroscope, Relic.HullPlating, Relic.Detonator, Relic.Bunks]);
    expect(COMMANDERS.map((c) => c.specials)).toEqual([[0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 2, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 2, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]]); // the Juggernaut starts plain: its Bunks make the Heavies (#1632)
    expect(new Set(COMMANDERS.map((c) => c.icon)).size).toBe(4); // a portrait each
    expect(COMMANDERS.every((c) => c.line.length > 10 && !/[<>&"]/.test(c.line))).toBe(true);
    expect(KIND_ACTS).toEqual([0, 1, 2, 0, 0, 0, 3, 1, 3, 2]); // Heavy from the start, Anchor and Shield after 1 act won, Spark and Medic after 2, Magnet and Bomb after a run won (#1461)
    expect(newRun(1, 3, LEGACY_UNLOCKED)).toMatchObject({ army: START_ARMY, specials: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], relics: [], commander: -1, best: 3 }); // no commander: the start of before (#1464)
    expect(newRun(1, 0, LEGACY_UNLOCKED).best).toBe(0);
  });

  it('the commander is picked on the map before the first node, only an unlocked one: its relic and its special marbles', () => {
    const run = newRun(1, 1, LEGACY_UNLOCKED);
    const warden = chooseCommander(run, 1);
    expect(warden).toEqual({ ...run, commander: 1, specials: [0, 2, 0, 0, 0, 0, 0, 0, 0, 0], relics: [Relic.HullPlating] });
    expect(relicMask(chooseCommander(newRun(1, 3, LEGACY_UNLOCKED), 2))).toBe(1 << Relic.Detonator); // the engine plays it
    expect(chooseCommander(warden, 0)).toEqual({ ...run, commander: 0, relics: [Relic.Gyroscope] }); // the pick is changed: nothing of the first stays
    expect(chooseCommander(run, 2)).toBe(run); // locked
    expect(chooseCommander(run, 9)).toBe(run); // no such commander
    expect(chooseCommander(at(newRun(1, 3, LEGACY_UNLOCKED), 0), 1).commander).toBe(-1); // the run is on
    expect(chooseCommander({ ...newRun(1, 3, LEGACY_UNLOCKED), end: 'lost' }, 1).commander).toBe(-1);
  });

  it('a special marble type is offered as a reward and by events only once unlocked', () => {
    const full = won(newRun(1, 0, LEGACY_UNLOCKED));
    expect(offers(full)).toEqual([1]); // only the Heavy
    expect(offers(won(newRun(1, 1, LEGACY_UNLOCKED))).sort()).toEqual([1, 2, 8]); // and the Shield (#1461)
    expect(offers(won({ ...newRun(1, 0, LEGACY_UNLOCKED), army: 12 })).sort()).toEqual([0, 1]);
    const gains = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].flatMap((seed) => {
        const e = eventOf({ ...at(newRun(seed, 0, LEGACY_UNLOCKED), 0), event: true })!;
        return grants(e);
      }),
    );
    expect([...gains]).toEqual([1]); // never an Anchor nor a Spark
    expect(EVENTS.filter((e) => grants(e).every((k) => k === 1))).toHaveLength(14); // the 3 old ones that give a Heavy or none, the 10 new and the cursed chest
  });

  it('counts the acts a run over won: its bosses beaten', () => {
    expect(actsWon(MAP, { ...at(newRun(1, 3, LEGACY_UNLOCKED), 0), end: 'lost' })).toBe(0);
    expect(actsWon(MAP, { ...at(newRun(1, 3, LEGACY_UNLOCKED), 0, 2), end: 'lost' })).toBe(0); // lost on the boss
    expect(actsWon(MAP, { ...at(newRun(1, 3, LEGACY_UNLOCKED), 0, 2, 3), end: 'lost' })).toBe(1);
    expect(actsWon(MAP, { ...at(newRun(1, 3, LEGACY_UNLOCKED), 0, 2, 3, 5), end: 'won' })).toBe(2);
    expect(actsWon(MAP, at(newRun(1, 3, LEGACY_UNLOCKED), 0, 2))).toBe(1); // the boss beaten, the run goes on
    expect(actsWon(MAP, pick(at(newRun(1, 3, LEGACY_UNLOCKED), 0), 2))).toBe(0); // the boss fight on
  });

  it('the unlocks a run earned: the types and commanders of the acts it won past the best before it', () => {
    expect(earned(MAP, { ...at(newRun(1, 0, LEGACY_UNLOCKED), 0, 2, 3), end: 'lost' })).toEqual(['Anchor marbles', 'Shield marbles', 'The Warden commander']);
    expect(earned(MAP, { ...at(newRun(1, 0, LEGACY_UNLOCKED), 0, 2, 3, 5), end: 'won' })).toEqual(['Anchor marbles', 'Spark marbles', 'Shield marbles', 'Medic marbles', 'The Warden commander', 'The Saboteur commander', 'Ascension 1']); // and the first level, a run won at level 0 (#1465)
    expect(earned(MAP, { ...at(newRun(1, 1, LEGACY_UNLOCKED), 0, 2, 3), end: 'lost' })).toEqual([]);
    expect(earned(MAP, { ...at(newRun(1, 2, LEGACY_UNLOCKED), 0), end: 'lost' })).toEqual([]);
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

  it('draws the start: what is unlocked, the commanders to pick, the locked ones with what unlocks them', () => {
    const doc = parse(mapHtml(MAP, chooseCommander(newRun(1, 1, LEGACY_UNLOCKED), 1)));
    const helps = [...doc.querySelectorAll('.run-help')].map((p) => p.textContent);
    expect(helps[0]).toBe(
      'Special marbles in rewards: Heavy, Anchor, Shield · Spark after 2 acts won in a run · Magnet after a run won · Bomb after a run won · Medic after 2 acts won in a run',
    );
    const commanders = [...doc.querySelectorAll<HTMLButtonElement>('button[data-commander]')];
    expect(commanders.map((b) => [b.dataset.commander, b.textContent, b.disabled, b.getAttribute('aria-pressed')])).toEqual([
      ['0', 'The Captain · 14 marbles · Gyroscope', false, 'false'],
      ['1', 'The Warden · 14 marbles, 2 Anchor · Hull plating', false, 'true'],
      ['2', 'The Saboteur · after 2 acts won in a run', true, 'false'],
      ['3', 'The Juggernaut · after a run won', true, 'false'],
    ]);
    expect(commanders.every((b) => b.querySelector('svg.glyph path'))).toBe(true); // the portrait
    expect(helps[1]).toBe(`The Warden: ${COMMANDERS[1]!.line} Starts with ${RELICS[Relic.HullPlating]!.name}, ${RELICS[Relic.HullPlating]!.help}.`);
    expect(parse(mapHtml(MAP, newRun(1, 3, LEGACY_UNLOCKED))).querySelector('.run-help')!.textContent).toBe('Special marbles in rewards: Heavy, Anchor, Spark, Magnet, Shield, Bomb, Medic');
    const fresh = parse(mapHtml(MAP, newRun(1, 0, LEGACY_UNLOCKED)));
    expect(fresh.querySelector('.run-help')!.textContent).toBe(
      'Special marbles in rewards: Heavy · Anchor after 1 act won in a run · Spark after 2 acts won in a run · Magnet after a run won · Shield after 1 act won in a run · Bomb after a run won · Medic after 2 acts won in a run',
    );
    expect([...fresh.querySelectorAll('button[data-commander]')].map((b) => b.textContent)).toEqual([
      'The Captain · 14 marbles · Gyroscope',
      'The Warden · after 1 act won in a run',
      'The Saboteur · after 2 acts won in a run',
      'The Juggernaut · after a run won',
    ]);
    expect(fresh.body.textContent).not.toContain('Starts with'); // no commander picked: no line
    expect(parse(mapHtml(MAP, at(newRun(1, 3, LEGACY_UNLOCKED), 0))).querySelector('button[data-commander]')).toBeNull(); // the run is on
  });

  it('draws the summary of a run over: the path, the fights, the army, the unlocks, and New run', () => {
    const over = { ...at(newRun(1, 0, LEGACY_UNLOCKED), 0, 2, 3), army: 3, specials: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0], end: 'lost' as const };
    const doc = parse(mapHtml(MAP, over));
    expect(doc.querySelector('.run-line')!.textContent).toBe('Run lost · 3 marbles left');
    expect([...doc.querySelectorAll('.run-help')].map((p) => p.textContent)).toEqual([
      'Path: act 1 Fight, Boss · act 2 Fight',
      'Fights: 2 won, 1 lost',
      'Army at the end: 3 marbles, 1 Heavy',
      'Unlocked: Anchor marbles, Shield marbles, The Warden commander',
    ]);
    expect(doc.querySelector('.run-graph')).toBeNull();
    expect(doc.getElementById('run-new')!.textContent).toBe('New run');
    expect(doc.querySelector('.run-tally')!.textContent).toBe('Run voided. Audit reopened.'); // Tally's audit (#1174)
    const none = parse(mapHtml(MAP, { ...at(newRun(1, 3, LEGACY_UNLOCKED, 1), 0, 2, 3, 5), end: 'won' })); // won at level 0, level 1 unlocked before
    expect([...none.querySelectorAll('.run-help')].map((p) => p.textContent).slice(1)).toEqual([
      'Fights: 4 won, 0 lost',
      'Army at the end: 14 marbles',
      'No new unlock',
    ]);
    expect(none.querySelector('.run-tally')!.textContent).toBe('Reconciled: 14.');
    expect(parse(mapHtml(MAP, newRun(1, 3, LEGACY_UNLOCKED))).querySelector('.run-tally')).toBeNull(); // only a run over
  });

  // #1587: after stage 5 the audit of a lost run speaks of the player's own line; below it, and for a won run, the text is as it was.
  it('shows the player their own ledger line on a lost run from stage 5, and the audit as before below it', () => {
    const over = { ...at(newRun(1, 0, LEGACY_UNLOCKED), 0, 2, 3), army: 3, end: 'lost' as const };
    const tally = (stage?: number): string => parse(mapHtml(MAP, over, '', undefined, true, stage)).querySelector('.run-tally')!.textContent!;
    for (const stage of [undefined, 1, 4]) expect(tally(stage)).toBe('Run voided. Audit reopened.');
    for (const stage of [5, 6, 7]) expect(tally(stage)).toBe('Run voided. Audit reopened. Line 0412 carries a mark from before. Entered without comment.');
    expect(auditLine(over, 5)).toBe(auditLine(over, 7));
    const won = { ...over, end: 'won' as const, army: 14 };
    for (const stage of [1, 5, 7]) expect(auditLine(won, stage)).toBe('Reconciled: 14.');
  });

  // #1587: after stage 4 the Shelled crewmate's second choice reads as what stage 4 teaches (the shell lets go), and gives the same.
  it('words "Crack its shell" as what stage 4 teaches from stage 4, with the same scrap, and nothing else of the event', () => {
    const shelled = EVENTS.find((e) => e.title === 'Shelled crewmate')!;
    const run = (): Run => ({ ...newRun(1, 3, LEGACY_UNLOCKED), path: [0] });
    const ACT = parseMap([0, 0, 0, 0, 0b1111, 0, 0, 0, 1, 0, 2, 1, 0, 0, 0, 1, 1, 3, 1, 0, 0, 0, 1, 2, 4, 1, 0, 0, 0, 1, 3, 5, 1, 0, 0, 0, 2, 0, 1, 0, 0, 0]);
    const event = (stage?: number): string[] => [...parse(eventHtml(waitingAt('Shelled crewmate', visit(ACT, run(), 3)), stage)).querySelectorAll('button')].map((b) => b.textContent!);
    for (const stage of [undefined, 1, 3]) expect(event(stage)).toEqual(['Take it along · +1 marble', 'Crack its shell · +30 scrap', 'Leave']);
    for (const stage of [4, 5, 7]) expect(event(stage)).toEqual(['Take it along · +1 marble', 'Cool it until the shell lets go · +30 scrap', 'Leave']);
    expect(choiceText(run(), shelled.choices[1]!)).toBe('Crack its shell · +30 scrap');
    expect(choiceText(run(), shelled.choices[1]!, 4)).toBe('Cool it until the shell lets go · +30 scrap');
    expect(choiceText(run(), shelled.choices[0]!, 4)).toBe('Take it along · +1 marble'); // no other choice has a verb of a later stage
    expect(takeEvent(run(), shelled, 1)).toEqual(takeEvent(run(), { ...shelled, choices: shelled.choices.map((c) => ({ ...c, later: undefined })) }, 1)); // the effect is the same
    expect(EVENTS.filter((e) => e.choices.some((c) => c.later)).map((e) => e.title)).toEqual(['Shelled crewmate']);
  });
});

// Relics (#1457, docs/specs/roguelite.md section 9): passive effects for the rest of the run.
describe('roguelite relics', () => {
  const parse = (html: string): Document => new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  // One act: a fight leads to an elite, a rest, an event and a treasure, each to the boss. Indices: 0 fight, 1 elite,
  // 2 rest, 3 event, 4 treasure, 5 boss.
  const ACT = parseMap([0, 0, 0, 0, 0b1111, 0, 0, 0, 1, 0, 2, 1, 0, 0, 0, 1, 1, 3, 1, 0, 0, 0, 1, 2, 4, 1, 0, 0, 0, 1, 3, 5, 1, 0, 0, 0, 2, 0, 1, 0, 0, 0]);
  const run = (state: Partial<Run> = {}): Run => ({ ...newRun(1, 3, LEGACY_UNLOCKED), path: [0], ...state });
  const ALL = RELICS.map((_, code) => code);
  const NONE = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  it('twelve relics, by their code on the bridge, each a name, a one-line rule and its own glyph', () => {
    expect(RELICS).toHaveLength(16);
    expect(Object.keys(Relic)).toEqual(RELICS.map((r) => r.name.replace(/ (\w)/g, (_, c: string) => c.toUpperCase())));
    expect(Object.values(Relic)).toEqual(ALL);
    expect(new Set(RELICS.map((r) => r.icon)).size).toBe(16);
    for (const r of RELICS) expect(r.help).toMatch(/^[^.]+$/); // one line, no full stop
    expect(relicMask(run({ relics: [Relic.Gyroscope, Relic.Detonator] }))).toBe(0b10001);
    expect(relicMask(run())).toBe(0);
  });

  it('the four reworked relics say what they change on their card, in the words of the game', () => {
    expect(relicText(Relic.SalvageMagnet)).toBe('Salvage magnet: a won elite turns a plain marble into its own: an Anchor from The Wall, a Spark from The Artificer, a Heavy from The Brute');
    expect(relicText(Relic.Jammer)).toBe('Jammer: a Freeze joins your tactics at the start of each fight and elite, but a win gives half the scrap');
    expect(relicText(Relic.LuckyCoin)).toBe('Lucky coin: an event shows how each of its gambles turns out before you take it');
    expect(relicText(Relic.Dampener)).toBe('Dampener: a Fall back joins your tactics at the start of each act boss fight, but act bosses play at 125 % of their strength');
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
    expect(fightOver(ACT, pick(newRun(1, 3, LEGACY_UNLOCKED), 0), true, 0).relic).toBe(false); // a fight
    const boss = fightOver(MAP, pick(at(newRun(1, 3, LEGACY_UNLOCKED), 0), 2), true, 0);
    expect(boss.relic).toBe(true);
    expect(new Set(relicOffers(MAP, boss)).size).toBe(3);
    expect(relicOffers(MAP, { ...boss, relics: ALL.slice(2) })).toEqual(expect.arrayContaining([0, 1])); // what is left
    expect(fightOver(MAP, pick(at(newRun(1, 3, LEGACY_UNLOCKED), 0, 2, 3), 5), true, 0)).toMatchObject({ end: 'won', relic: false });
    expect(fightOver(ACT, pick(run({ relics: ALL }), 1), true, 0).relic).toBe(false); // none left
  });

  it('draws the relic screen: a button per relic, its glyph, name and rule', () => {
    const titleOf = (state: Run, map: MapNode[] = ACT): string => parse(relicHtml(map, state)).querySelector('.run-line')!.textContent!;
    const chest = visit(ACT, run(), 4);
    expect(titleOf(chest)).toBe('Treasure · a chest holds a relic');
    expect(titleOf(fightOver(ACT, pick(run(), 1), true, 0))).toBe('Elite beaten · take its relic');
    const boss = fightOver(MAP, pick(at(newRun(1, 3, LEGACY_UNLOCKED), 0), 2), true, 0);
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
    expect(fightOver(ACT, { ...pick(newRun(1, 3, LEGACY_UNLOCKED), 0), relics: [Relic.HullPlating] }, true, 2).army).toBe(13);
    expect(fightOver(ACT, pick(newRun(1, 3, LEGACY_UNLOCKED), 0), true, 2).army).toBe(12);
    expect(fightOver(ACT, { ...pick(newRun(1, 3, LEGACY_UNLOCKED), 0), relics: [Relic.HullPlating] }, true, 0).army).toBe(14);
    expect(fightOver(ACT, { ...pick(newRun(1, 3, LEGACY_UNLOCKED), 0), army: 5, relics: [Relic.HullPlating] }, true, 2)).toMatchObject({ army: 4, end: '' }); // saved
    expect(fightOver(ACT, { ...pick(newRun(1, 3, LEGACY_UNLOCKED), 0), relics: [Relic.HullPlating] }, false, 3).end).toBe('lost');
  });

  // The elites' archetypes by the bridge's code (section 14): The Wall 1, The Artificer 2, The Brute 3. The test map's elite is archetype 0.
  const archetype = (code: number): MapNode[] => ACT.map((n) => (n.kind === 'elite' ? { ...n, elite: code } : n));

  it('Salvage magnet: a won elite turns a plain marble into its own, an Anchor from The Wall, a Spark from The Artificer, a Heavy from The Brute', () => {
    const magnet = run({ army: 10, enemies: true, relics: [Relic.SalvageMagnet] });
    const kept = (code: number, state: Partial<Run> = {}) => fightOver(archetype(code), pick({ ...magnet, ...state }, 1), true, 0);
    expect(kept(1)).toMatchObject({ army: 12, specials: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0] }); // the elite's 2 marbles, none more
    expect(kept(2).specials).toEqual([0, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
    expect(kept(3).specials).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(kept(1, { specials: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0] }).specials).toEqual([1, 2, 0, 0, 0, 0, 0, 0, 0, 0]); // on top of the ones it holds
    expect(kept(1, { army: 14, specials: [14, 0, 0, 0, 0, 0, 0, 0, 0, 0] }).specials).toEqual([14, 0, 0, 0, 0, 0, 0, 0, 0, 0]); // no plain marble left
    expect(kept(0).specials).toEqual(NONE); // an elite with no archetype
    expect(kept(1, { enemies: false }).specials).toEqual(NONE); // a run saved before the varied armies
    expect(kept(1, { relics: [] }).specials).toEqual(NONE);
    expect(fightOver(archetype(1), pick(magnet, 0), true, 0).specials).toEqual(NONE); // a fight
    expect(fightOver(archetype(1), pick(magnet, 1), false, 0).specials).toEqual(NONE); // lost
  });

  it('Jammer: a Freeze joins your tactics at the start of a fight or an elite, but a win gives half the scrap', () => {
    const jammer = run({ relics: [Relic.Jammer] });
    expect(visit(ACT, jammer, 0).tactics).toEqual([2]);
    expect(visit(ACT, jammer, 1).tactics).toEqual([2]);
    expect(visit(ACT, jammer, 5).tactics).toEqual([]); // Freeze is not played against an act boss
    expect(visit(ACT, jammer, 2).tactics).toEqual([]); // a rest
    expect(visit(ACT, { ...jammer, tactics: [1] }, 0).tactics).toEqual([1, 2]);
    expect(visit(ACT, { ...jammer, tactics: [2, 3] }, 0).tactics).toEqual([2, 3]); // one Freeze at a time
    expect(visit(ACT, { ...jammer, tactics: [1, 3, 4] }, 0).tactics).toEqual([1, 3, 4]); // the hand is full
    expect(visit(ACT, run(), 0).tactics).toEqual([]);
    const scrap = (state: Run, node: number): number => fightOver(ACT, pick(state, node), true, 0).scrap - state.scrap;
    expect([scrap(jammer, 0), scrap(jammer, 1), scrap(jammer, 5)]).toEqual([5, 10, 15]);
    expect([scrap(run(), 0), scrap(run(), 1), scrap(run(), 5)]).toEqual([10, 20, 30]);
    expect(scrap({ ...jammer, ascension: 5 }, 0)).toBe(3); // level 5's 7, half of it, down
    expect(fightBudget(ACT, pick(jammer, 0), 1000)).toBe(1000); // the search is no longer cut
    expect(fightBudget(ACT, pick(run({ relics: [Relic.Jammer], keys: [Key.Emerald] }), 1), 1000)).toBe(2000); // an elite's own
  });

  it('Bunks: a rest also makes a plain marble a Heavy, an upgrade does not', () => {
    expect(rest(visit(ACT, run({ army: 6, relics: [Relic.Bunks] }), 2))).toMatchObject({ army: START_ARMY, specials: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
    expect(rest(visit(ACT, run({ specials: [5, 5, 0, 0, 0, 4, 0, 0, 0, 0], relics: [Relic.Bunks] }), 2)).specials).toEqual([5, 5, 0, 0, 0, 4, 0, 0, 0, 0]); // no plain marble
    expect(upgrade(visit(ACT, run({ specials: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0], relics: [Relic.Bunks] }), 2), 2).specials).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0, 0]);
  });

  it('Lucky coin: an event shows how each of its gambles turns out before it is taken', () => {
    const coin = visit(ACT, run({ relics: [Relic.LuckyCoin] }), 3);
    const seeds = Array.from({ length: 600 }, (_, seed) => seed);
    const dice = (seed: number): Run => ({ ...coin, seed });
    const outcome = (state: Run): boolean => takeEvent(state, eventOf(state)!, 1)!.told.includes('it paid off');
    const [pays, fails] = [true, false].map((paid) => dice(seeds.find((seed) => eventOf(dice(seed))!.title === 'Dice' && outcome(dice(seed)) === paid)!));
    const label = (state: Run, choice: number): string => parse(eventHtml(state)).querySelector(`button[data-choice="${choice}"]`)!.textContent!;
    expect(outcome(pays!)).toBe(true);
    expect(outcome(fails!)).toBe(false);
    expect(label(pays!, 1)).toBe('Wager a marble · 40 %: +1 relic, otherwise -1 marble · Lucky coin: it will pay off');
    expect(label(fails!, 1)).toBe('Wager a marble · 40 %: +1 relic, otherwise -1 marble · Lucky coin: it will go wrong');
    expect(foretold(pays!, eventOf(pays!)!.choices[1]!, 1)).toBe(' · Lucky coin: it will pay off');
    expect(foretold(pays!, eventOf(pays!)!.choices[2]!, 2)).toBe(''); // a sure choice
    expect(label(pays!, 2)).not.toContain('Lucky coin');
    expect(label({ ...pays!, relics: [] }, 1)).toBe('Wager a marble · 40 %: +1 relic, otherwise -1 marble'); // without the coin
    expect(foretold({ ...pays!, relics: [] }, eventOf(pays!)!.choices[1]!, 1)).toBe('');
    const short = { ...run({ army: 12 }), reward: true };
    expect(offers({ ...short, relics: [Relic.LuckyCoin] })).toEqual(offers(short)); // a reward still offers 3
  });

  it('Bargain: an event trade costs a marble less', () => {
    const [forge, , wiring, , pods] = EVENTS;
    const cheap = run({ relics: [Relic.Bargain] });
    expect(takeEvent(cheap, forge!, 0)).toMatchObject({ army: 13, specials: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
    expect(takeEvent(cheap, wiring!, 0)).toMatchObject({ army: 14, specials: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0] }); // free
    expect(takeEvent({ ...cheap, army: 10, specials: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, pods!, 0)).toMatchObject({ army: 13 }); // a gain, no marble paid
    const vein = EVENTS.find((e) => e.title === 'Slag-glass vein')!;
    expect(takeEvent({ ...cheap, army: 5, seed: 1 }, vein, 0)).not.toBeNull(); // the loss of a gamble is a trade too: 2 less 1 leaves 4
    const event = waitingAt('Scrap forge', visit(ACT, cheap, 3));
    expect(parse(eventHtml(event)).querySelector('button[data-choice="0"]')!.textContent).toBe('Forge a Heavy · +1 Heavy, -2 marbles · Bargain: 1 marble less');
    expect(parse(eventHtml(waitingAt('Dice', visit(ACT, cheap, 3)))).querySelector('button[data-choice="1"]')!.textContent).toBe('Wager a marble · 40 %: +1 relic, otherwise -1 marble · Bargain: 1 marble less');
    expect(parse(eventHtml(waitingAt('Shelled crewmate', visit(ACT, cheap, 3)))).querySelector('button[data-choice="0"]')!.textContent).toBe('Take it along · +1 marble'); 
  });

  it('Saboteur: the bot has a marble fewer in fights and elites', () => {
    expect(foesOf(ACT, { ...pick(newRun(1, 3, LEGACY_UNLOCKED), 0), relics: [Relic.Saboteur] })).toBe(FIRST_FOES - 1);
    expect(foesOf(ACT, pick(run({ relics: [Relic.Saboteur] }), 1))).toBe(START_ARMY - 1);
  });

  it('Dampener: a Fall back joins your tactics at the start of an act boss fight, but the boss plays at 125 % of its strength', () => {
    const ids = ['a', 'b'];
    expect(actBoss(MAP, pick(at({ ...newRun(1, 3, LEGACY_UNLOCKED), relics: [Relic.Dampener] }, 0), 2), ids)!.percent).toBe(63);
    expect(actBoss(MAP, pick(at({ ...newRun(1, 3, LEGACY_UNLOCKED), relics: [Relic.Dampener] }, 0, 2, 3), 5), ids)!.percent).toBe(150);
    const damp = run({ relics: [Relic.Dampener], spent: [] }); // no count: no bonus room before the boss
    expect(visit(ACT, damp, 5).tactics).toEqual([4]);
    expect(visit(ACT, damp, 0).tactics).toEqual([]); // a fight, an elite
    expect(visit(ACT, damp, 1).tactics).toEqual([]);
    expect(visit(ACT, { ...damp, tactics: [2] }, 5).tactics).toEqual([2, 4]);
    expect(visit(ACT, { ...damp, tactics: [4, 1] }, 5).tactics).toEqual([4, 1]); // one Fall back at a time
    expect(visit(ACT, { ...damp, tactics: [1, 2, 3] }, 5).tactics).toEqual([1, 2, 3]); // the hand is full
    expect(takeBonus({ ...damp, bonus: true })).toMatchObject({ fighting: true, tactics: [4] }); // the boss behind the bonus room
    expect(takeBonus({ ...run(), bonus: true }).tactics).toEqual([]);
    expect(visit(ACT, run({ spent: [] }), 5).tactics).toEqual([]);
    expect(visit(ACT, run({ relics: [Relic.Dampener] }), 5)).toMatchObject({ bonus: true, fighting: false, tactics: [] }); // the room first
  });

  it('a run saved holding a reworked relic loads and plays on with the new rule', async () => {
    const store = memoryStore();
    const relics = [Relic.SalvageMagnet, Relic.Jammer, Relic.LuckyCoin, Relic.Dampener];
    const saved = { ...pick(run({ army: 9, enemies: true, relics }), 1), moves: [MV, [2, ...MV.slice(1)]] };
    await saveRun(store, saved);
    const loaded = (await loadRun(store, () => archetype(3), engine))!;
    expect(loaded.state).toEqual(saved);
    expect(loaded.engine).toMatchObject({ army: 9, played: [1, 2] });
    const won = fightOver(archetype(3), loaded.state, true, 1);
    expect(won).toMatchObject({ army: 10, end: '', reward: true, scrap: loaded.state.scrap + 10, specials: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
    expect(visit(archetype(3), { ...won, reward: false, path: [0], spent: [] }, 5)).toMatchObject({ fighting: true, tactics: [4] });
    expect(visit(archetype(3), { ...won, reward: false, path: [0] }, 0).tactics).toEqual([2]);
  });

  it('War chest: an act boss beaten gives 2 marbles back', () => {
    const boss = pick(at({ ...newRun(1, 3, LEGACY_UNLOCKED), army: 10, relics: [Relic.WarChest] }, 0), 2);
    expect(fightOver(MAP, boss, true, 1).army).toBe(11);
    expect(fightOver(MAP, { ...boss, army: 14 }, true, 1).army).toBe(START_ARMY);
    expect(fightOver(MAP, { ...pick(at(newRun(1, 3, LEGACY_UNLOCKED), 0, 2, 3), 5), army: 10, relics: [Relic.WarChest] }, true, 1)).toMatchObject({ army: 9, end: 'won' });
  });

  it('Quartermaster: a fight holds 4 of each special marble type', () => {
    const fight = pick({ ...newRun(1, 3, LEGACY_UNLOCKED), specials: [5, 0, 0, 0, 0, 0, 0, 0, 0, 0], relics: [Relic.Quartermaster] }, 0);
    expect(left(fight, 1)).toBe(FIGHT_CAP + 1);
    expect(left({ ...fight, relics: [] }, 1)).toBe(FIGHT_CAP);
  });

  it('only variety carries: a new run holds no relic', () => {
    expect(newRun(1, 3, LEGACY_UNLOCKED)).toMatchObject({ relics: [], relic: false });
  });

  it('draws the treasure on the map', () => {
    const nodes = [...parse(mapHtml(ACT, newRun(1, 3, LEGACY_UNLOCKED))).querySelectorAll<HTMLButtonElement>('button[data-node]')];
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
  const won = (state: Partial<Run> = {}): Run => fightOver(MAP, { ...pick(newRun(1, 3, LEGACY_UNLOCKED), 0), ...state }, true, 0);

  it('four tactics by their code on the bridge, each a name, a one-line rule and its own glyph', () => {
    expect(TACTICS.map((t) => t.name)).toEqual(['Reinforce', 'Freeze', 'Swap', 'Fall back']);
    expect(new Set(TACTICS.map((t) => t.icon)).size).toBe(4);
    for (const t of TACTICS) expect(t.help).toMatch(/^[^.]+$/);
    expect(MAX_TACTICS).toBe(3);
    expect(newRun(1, 3, LEGACY_UNLOCKED).tactics).toEqual([]); // only variety carries: a new run holds none
  });

  it('a tactic is a move record that starts with a 0, its cells for a Swap', () => {
    expect(tacticRecord(2)).toEqual([0, 2, 0, 0, 0, 0, 0, 0]);
    expect(tacticRecord(3, [0, 2], [1, 3])).toEqual([0, 3, 0, 2, 1, 3, 0, 0]);
  });

  it('a tactic used is gone, one of two alike leaves the other', () => {
    const held = { ...newRun(1, 3, LEGACY_UNLOCKED), tactics: [2, 4, 2] };
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
    const full = { ...newRun(1, 3, LEGACY_UNLOCKED), path: [0, 3] };
    expect(takeEvent(full, manual, 0)).toMatchObject({ army: 13, specials: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
    expect(takeEvent(full, manual, 0)!.tactics).toHaveLength(1);
    expect(takeEvent({ ...full, tactics: [1, 1, 1] }, manual, 0)).toBeNull();
    expect(takeEvent({ ...full, army: MIN_ARMY }, manual, 0)).toBeNull();
    const run = visit(ACT_EVENT, { ...newRun(1, 3, LEGACY_UNLOCKED), path: [0] }, 3);
    const event = waitingAt('Field manual', run);
    const code = takeEvent(event, eventOf(event)!, 0)!.tactics[0]!;
    expect(takeEvent({ ...event }, eventOf(event)!, 0)!.tactics).toEqual([code]); // deterministic
    expect(resolve(event, 0).tactics).toEqual([code]);
    const take = parse(eventHtml(event)).querySelector('button[data-choice="0"]')!;
    expect(take.textContent).toBe(`Learn from the manual · learn ${TACTICS[code - 1]!.name}, -1 marble`);
    expect(parse(eventHtml({ ...event, tactics: [1, 1, 1] })).querySelector<HTMLButtonElement>('button[data-choice="0"]')!.disabled).toBe(true);
    const codes = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => takeEvent({ ...run, seed: n }, manual, 0)!.tactics[0]));
    expect(codes.size).toBeGreaterThan(1); // other seeds, other tactics
  });

  it('draws the tactic bar: a glyph button per tactic held, disabled when the engine cannot, nothing when none', () => {
    const held = { ...newRun(1, 3, LEGACY_UNLOCKED), tactics: [2, 3, 1] };
    expect(tacticBarHtml(newRun(1, 3, LEGACY_UNLOCKED), 0b1111, false)).toBe('');
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

});

// The scrap and the shop (#1459, docs/specs/roguelite.md section 12): a currency earned in fights, spent at a Shop node.
describe('roguelite shop', () => {
  const parse = (html: string): Document => new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  // One act: a fight 0 leads to a shop 1 and an elite 2, each to the boss 3; a fight 4 opens the next act.
  const SHOP = parseMap([0, 0, 0, 0, 0b11, 0, 0, 0, 1, 0, 6, 1, 0, 0, 0, 1, 1, 2, 1, 0, 0, 0, 2, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
  const shop = (state: Partial<Run> = {}): Run => visit(SHOP, { ...newRun(1, 3, LEGACY_UNLOCKED), path: [0], scrap: 500, ...state }, 1);
  const kinds = (run: Run): string[] => shopStock(run).map((i) => i.kind);
  const item = (run: Run, kind: string) => shopStock(run).find((i) => i.kind === kind)!;

  it('a won fight earns scrap, more for an elite and most for a boss, none in a lost one', () => {
    expect(SCRAP).toEqual({ fight: 10, elite: 20, boss: 30 });
    expect(newRun(1, 3, LEGACY_UNLOCKED).scrap).toBe(0); // no carry-over: a new run starts with none
    const fight = fightOver(SHOP, pick({ ...newRun(1, 3, LEGACY_UNLOCKED), scrap: 5 }, 0), true, 1);
    expect(fight.scrap).toBe(15);
    expect(fightOver(SHOP, pick({ ...newRun(1, 3, LEGACY_UNLOCKED), path: [0] }, 2), true, 0).scrap).toBe(20);
    expect(fightOver(SHOP, pick({ ...newRun(1, 3, LEGACY_UNLOCKED), path: [0, 2] }, 3), true, 0).scrap).toBe(30);
    expect(fightOver(SHOP, pick({ ...newRun(1, 3, LEGACY_UNLOCKED), scrap: 5 }, 0), false, 0).scrap).toBe(5);
    expect(fightOver(SHOP, { ...pick(newRun(1, 3, LEGACY_UNLOCKED), 0), army: 5 }, true, 2).scrap).toBe(0); // lost below 4 marbles
  });

  it('a shop waits for the player, with no fight, and the map waits', () => {
    const run = shop();
    expect(run).toMatchObject({ path: [0, 1], fighting: false, shop: true, bought: [] });
    expect(choices(SHOP, run)).toEqual([]);
    expect(choices(SHOP, leaveShop(run))).toEqual([3]);
  });

  it('sells a marble, a special marble, a relic and a tactic at prices from the seed and the node', () => {
    const run = shop();
    expect(kinds(run)).toEqual(['marble', 'special', 'relic', 'tactic', 'flask']);
    expect(shopStock(run).map((i) => i.id)).toEqual([0, 1, 2, 3, 5]);
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
    expect(shopStock(newRun(1, 3, LEGACY_UNLOCKED))).toEqual([]); // no shop waits
  });

  it('sells only a relic the run does not hold, and a special marble type unlocked', () => {
    const run = shop();
    const found = item(run, 'relic').code;
    expect(item({ ...run, relics: [found] }, 'relic').code).not.toBe(found);
    expect(kinds({ ...run, relics: RELICS.map((_, c) => c) })).toEqual(['marble', 'special', 'tactic', 'flask']);
    for (const seed of [1, 2, 3, 4, 5, 6]) expect(item({ ...run, seed, best: 0 }, 'special').code).toBe(1); // only Heavy at first
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => item({ ...run, seed }, 'special').code)).size).toBeGreaterThan(1);
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => item({ ...run, seed }, 'tactic').code)).size).toBeGreaterThan(1);
  });

  it('buying a marble pays the price and adds a marble, only below 14 and with the scrap', () => {
    const run = shop({ army: 9, scrap: 100 });
    const price = item(run, 'marble').price;
    const bought = buy(run, 0);
    expect(bought).toMatchObject({ army: 10, scrap: 100 - price, bought: [0], shop: true });
    expect(kinds(bought)).toEqual(['special', 'relic', 'tactic', 'flask']); // sold, gone
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
    expect(kinds(buy(run, 2))).toEqual(['marble', 'special', 'tactic', 'flask']);
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
    const run = newRun(1, 3, LEGACY_UNLOCKED);
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
    expect(removeSpecial({ ...newRun(1, 3, LEGACY_UNLOCKED), specials: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0], scrap: 100 }, 1).specials[0]).toBe(1); // no shop
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
    expect(buys.map((b) => b.dataset.buy)).toEqual(['0', '1', '2', '3', '5']);
    expect(buys[0]!.textContent).toBe(`One more marble · ${stock[0]!.price} scrap`);
    expect(buys[1]!.textContent).toBe(`${SPECIAL_LOOKS[stock[1]!.code - 1]!.name}: ${SPECIAL_LOOKS[stock[1]!.code - 1]!.help} · ${stock[1]!.price} scrap`);
    expect(buys[2]!.textContent).toBe(`${RELICS[stock[2]!.code]!.name}: ${RELICS[stock[2]!.code]!.help} · ${stock[2]!.price} scrap`);
    expect(buys[3]!.textContent).toBe(`${TACTICS[stock[3]!.code - 1]!.name}: ${TACTICS[stock[3]!.code - 1]!.help} · ${stock[3]!.price} scrap`);
    expect(buys[4]!.textContent).toBe(`One more flask charge: ${FLASK_MARBLES} marbles back on the map · ${stock[4]!.price} scrap`);
    expect(buys.map((b) => b.querySelector('svg.glyph') !== null)).toEqual([true, true, true, true, true]);
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
    expect([...doc.querySelectorAll('button[data-buy]')].map((b) => (b as HTMLElement).dataset.buy)).toEqual(['1', '2', '3', '5']);
    expect(doc.querySelector('button[data-remove]')).toBeNull();
    expect(doc.querySelector('button[data-leave]')).not.toBeNull();
  });

  it('draws the shop on the map, the scrap in the run line and the scrap lost in the summary', () => {
    const nodes = [...parse(mapHtml(SHOP, at(newRun(1, 3, LEGACY_UNLOCKED), 0))).querySelectorAll<HTMLButtonElement>('button[data-node]')];
    expect(nodes[1]!.textContent).toBe('Shop');
    expect(nodes[1]!.className).toBe('node shop');
    expect(nodes[1]!.getAttribute('aria-label')).toBe('Act 1, shop');
    expect(runLine(SHOP, { ...newRun(1, 3, LEGACY_UNLOCKED), scrap: 25 })).toBe('Rogue-lite run · army 14 marbles · 25 scrap · pick a fight');
    expect(runLine(SHOP, { ...pick(newRun(1, 3, LEGACY_UNLOCKED), 0), scrap: 25 })).toBe('Rogue-lite run · act 1 fight · army 14 marbles · 25 scrap');
    expect(runLine(SHOP, newRun(1, 3, LEGACY_UNLOCKED))).toBe('Rogue-lite run · army 14 marbles · pick a fight'); // none yet: nothing shown
    const over = parse(mapHtml(SHOP, { ...at(newRun(1, 3, LEGACY_UNLOCKED), 0), army: 3, end: 'lost', scrap: 40 }));
    expect([...over.querySelectorAll('.run-help')].map((p) => p.textContent)).toContain('Scrap left: 40, lost with the run');
    const none = parse(mapHtml(SHOP, { ...at(newRun(1, 3, LEGACY_UNLOCKED), 0), army: 3, end: 'lost' }));
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

  it('looks: a shape of its own and a colour of its own, never the colour alone', () => {
    const plain = [0, 1, 2, 6, 7, 8, 9].map((k) => SPECIAL_LOOKS[k]!);
    expect(new Set(plain.map((l) => l.color)).size).toBe(7);
    expect(new Set(plain.map((l) => JSON.stringify(l.points))).size).toBe(7);
    expect(SPECIAL_LOOKS.slice(6).map((l) => [l.name, l.plus, l.help])).toEqual([
      ['Magnet', false, 'pulls an enemy two cells away one cell closer after it moves'],
      ['Shield', false, 'the first push that would move it fails'],
      ['Bomb', false, 'bursts after your third turn and is lost'],
      ['Medic', false, 'comes back once on your back row when ejected'],
    ]);
  });

  it('every event gains one count per special marble type, and four events give the new ones', () => {
    const [lodestone, bulkhead, charge, sickbay] = EVENTS.slice(6);
    expect([lodestone, bulkhead, charge, sickbay].map((e) => e!.title)).toEqual(['Lodestone', 'Bulkhead', 'Unexploded charge', 'Sick bay']);
    const full = newRun(1, 3, LEGACY_UNLOCKED);
    expect(takeEvent(full, lodestone!, 0)).toMatchObject({ army: 12, specials: counts(7) });
    expect(takeEvent(full, bulkhead!, 0)).toMatchObject({ army: 12, specials: counts(8) });
    expect(takeEvent(full, charge!, 0)).toMatchObject({ army: 13, specials: counts(9) });
    expect(takeEvent(full, sickbay!, 0)).toMatchObject({ army: 12, specials: counts(10) });
    expect(takeEvent({ ...full, army: 6, specials: counts(1, 1, 1, 1, 2, 2) }, charge!, 0)).toBeNull(); // no plain marble left
  });

  it('a type is dealt in events only once unlocked, and every one shows up at 3 acts', () => {
    const gains = (best: number): number[] => [
      ...new Set(
        Array.from({ length: 200 }, (_, seed) => eventOf({ ...at(newRun(seed, best, LEGACY_UNLOCKED), 0), event: true })!).flatMap((e) =>
          grants(e),
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
      [...new Set(Array.from({ length: 60 }, (_, seed) => offers(won(newRun(seed, best, LEGACY_UNLOCKED)))).flat())].sort((a, b) => a - b);
    expect(dealt(0)).toEqual([1]);
    expect(dealt(1)).toEqual([1, 2, 8]);
    expect(dealt(2)).toEqual([1, 2, 3, 8, 10]);
    expect(dealt(3)).toEqual([1, 2, 3, 7, 8, 9, 10]);
    const seed = Array.from({ length: 60 }, (_, s) => s).find((s) => offers(won(newRun(s, 3, LEGACY_UNLOCKED))).includes(7))!;
    const run = won(newRun(seed, 3, LEGACY_UNLOCKED));
    expect(claim(run, 7).specials).toEqual(counts(7));
    const button = parse(rewardHtml(MAP, run)).querySelector('button[data-offer="7"]')!;
    expect(button.textContent).toBe(`Magnet: ${SPECIAL_LOOKS[6]!.help}`);
    expect(button.querySelectorAll('svg.glyph polygon')).toHaveLength(1);
  });

  it('is placed, counted and listed like the others: at most 3 a fight, a button and a glyph each', () => {
    const fight = pick({ ...newRun(1, 3, LEGACY_UNLOCKED), specials: counts(7, 7, 7, 7, 8, 9, 10) }, 0);
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
    expect(runLine(MAP, { ...newRun(1, 3, LEGACY_UNLOCKED), specials: counts(7, 8, 9, 10) })).toBe('Rogue-lite run · army 14 marbles, 1 Magnet, 1 Shield, 1 Bomb, 1 Medic · pick a fight');
  });

  it('the rest site upgrades none of them: no upgraded form', () => {
    const site = visit(parseMap([0, 0, 0, 3, 0, 0, 0]), { ...newRun(1, 3, LEGACY_UNLOCKED), specials: counts(7, 8, 9, 10) }, 0);
    expect(upgradable(site)).toEqual([]);
    expect(upgrade(site, 7)).toBe(site);
    expect(parse(restHtml(site)).querySelector<HTMLButtonElement>('button[data-upgrade]')!.disabled).toBe(true);
  });

  it('a smaller army loses them first: the Medic, the Bomb, the Shield, then the Magnet, then the older types', () => {
    const fight = { ...pick({ ...newRun(1, 3, LEGACY_UNLOCKED), army: 10, specials: counts(1, 2, 3, 7, 8, 9, 10) }, 0), placed: [] };
    expect(fightOver(MAP, fight, true, 4).specials).toEqual(counts(1, 2, 3, 7, 8, 9)); // 6 marbles: the Medic goes
    expect(fightOver(MAP, fight, true, 6).specials).toEqual(counts(1, 2, 3, 7)); // 4 marbles: the Bomb and the Shield too
    const many = { ...pick({ ...newRun(1, 3, LEGACY_UNLOCKED), army: 10, specials: counts(1, 1, 2, 3, 7, 8, 9, 10) }, 0), placed: [] };
    expect(fightOver(MAP, many, true, 6).specials).toEqual(counts(1, 1, 2, 3)); // 4 marbles: the Magnet too, before any older type
    const bombed = { ...pick({ ...newRun(1, 3, LEGACY_UNLOCKED), army: 8, specials: counts(9) }, 0), placed: [[0, 4, 9]] };
    expect(fightOver(MAP, bombed, true, 1, counts()).specials).toEqual(counts()); // the Bomb burst: gone with its marble
    const medic = { ...pick({ ...newRun(1, 3, LEGACY_UNLOCKED), army: 8, specials: counts(10) }, 0), placed: [[0, 4, 10]] };
    expect(fightOver(MAP, medic, true, 0, counts())).toMatchObject({ army: 8, specials: counts() }); // back as a plain marble
  });

  it('the shop sells the unlocked ones and takes them back for scrap', () => {
    const shop = (state: Partial<Run> = {}): Run => ({ ...newRun(1, 3, LEGACY_UNLOCKED), army: 9, path: [0], shop: true, scrap: 500, ...state });
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
    const run = { ...pick({ ...newRun(1, 3, LEGACY_UNLOCKED), specials: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, 0), moves: [] as number[][] };
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
    expect(newRun(1, 3, LEGACY_UNLOCKED).enemies).toBe(true);
    expect(runLine(FOES, pick(newRun(1, 3, LEGACY_UNLOCKED), 0))).toBe('Rogue-lite run · act 1 fight · Snake · army 14 marbles');
    expect(runLine(FOES, pick({ ...newRun(1, 3, LEGACY_UNLOCKED), path: [0] }, 1))).toBe('Rogue-lite run · act 1 elite · The Artificer · Wedge · army 14 marbles');
    expect(runLine(FOES, pick({ ...newRun(1, 3, LEGACY_UNLOCKED), path: [0, 1] }, 2))).toBe('Rogue-lite run · act 1 boss · army 14 marbles');
    // The Standard formation is the layout of before: nothing to name.
    expect(runLine(MAP, pick(newRun(1, 3, LEGACY_UNLOCKED), 0))).toBe('Rogue-lite run · act 1 fight · army 14 marbles');
    // A run saved before them fights the plain army, and the HUD names nothing.
    expect(runLine(FOES, pick({ ...newRun(1, 3, LEGACY_UNLOCKED), enemies: false }, 0))).toBe('Rogue-lite run · act 1 fight · army 14 marbles');
  });

  it('the map names an elite by its archetype, and only for a run with the varied enemies', () => {
    const labels = (run: Run): string[] =>
      [...new DOMParser().parseFromString(mapHtml(FOES, run), 'text/html').querySelectorAll<HTMLButtonElement>('button[data-node]')].map((b) => `${b.textContent}|${b.getAttribute('aria-label')}`);
    const after = { ...newRun(1, 3, LEGACY_UNLOCKED), path: [0] };
    expect(labels(after)).toEqual(['Fight|Act 1, fight', 'EliteArtificer · key|Act 1, elite, The Artificer, marked: its key', 'Boss|Act 1, boss']);
    expect(labels({ ...after, enemies: false })).toEqual(['Fight|Act 1, fight', 'Elitekey|Act 1, elite, marked: its key', 'Boss|Act 1, boss']);
  });

  it('the bot\'s army of the fight is the bridge\'s plan for the node, a marble short with the Saboteur', () => {
    const seen: number[][] = [];
    const planOf = (node: number, less: number): ArrayLike<number> => {
      seen.push([node, less]);
      return Int32Array.from([10 - less, 3, 0, -4, 2]);
    };
    expect(foePlan(FOES, pick(newRun(1, 3, LEGACY_UNLOCKED), 0), planOf)).toEqual([10, 3, 0, -4, 2]);
    expect(foePlan(FOES, pick({ ...newRun(1, 3, LEGACY_UNLOCKED), path: [0], relics: [Relic.Saboteur] }, 1), planOf)).toEqual([9, 3, 0, -4, 2]);
    expect(seen).toEqual([[0, 0], [1, 1]]);
    // A run saved before them: the count alone, as before.
    expect(foePlan(FOES, pick({ ...newRun(1, 3, LEGACY_UNLOCKED), enemies: false }, 0), planOf)).toBe(FIRST_FOES);
    expect(seen).toHaveLength(2);
  });

  it('a saved run keeps the flag, and one saved before it fights the plain army', async () => {
    const store = memoryStore();
    const fight = pick(newRun(1, 3, LEGACY_UNLOCKED), 0);
    await saveRun(store, fight);
    expect((await loadRun(store, () => FOES, engine))!.state.enemies).toBe(true);
    await store.put(RUN_KEY, { ...fight, enemies: 'yes' });
    expect(await loadRun(store, () => FOES, engine)).toBeNull();
    await store.put(RUN_KEY, { ...fight, enemies: false });
    expect((await loadRun(store, () => FOES, engine))!.state.enemies).toBe(false);
  });
});

describe('roguelite Collector (#1470)', () => {
  const parse = (html: string): Document => new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  // Two acts. Act 1: a fight 0 leads to an elite 1, which leads to the boss 2. Act 2: a fight 3, an elite 4, the last boss 5.
  const TWO = parseMap([[0, 0, 0, 0, 1, 0, 0], [0, 1, 0, 2, 1, 0, 0], [0, 2, 0, 1, 0, 0, 0], [1, 0, 0, 0, 1, 0, 0], [1, 1, 0, 2, 1, 0, 0], [1, 2, 0, 1, 0, 0, 0]].flat());
  const fresh = (state: Partial<Run> = {}): Run => ({ ...newRun(1, 0, []), exits: false, ...state }); // the Collector alone, no exits (#1472)
  const fight = (path: number[], state: Partial<Run> = {}): Run => ({ ...pick(fresh(state), path[path.length - 1]!), path });
  const won = (path: number[], state: Partial<Run> = {}): Run => fightOver(TWO, fight(path, state), true, 0);

  it('a won fight earns cells, an elite and an act boss more, a lost fight none', () => {
    expect(won([0]).cells).toBe(CELLS.fight);
    expect(won([0, 1]).cells).toBe(CELLS.elite);
    expect(won([0, 1, 2]).cells).toBe(CELLS.boss);
    expect(won([0], { cells: 3 }).cells).toBe(3 + CELLS.fight);
    expect(fightOver(TWO, fight([0], { cells: 3 }), false, 0).cells).toBe(3);
  });

  it('a fight drops no blueprint', () => {
    expect(won([0])).toMatchObject({ drop: 0, carried: [], collector: false });
  });

  it('an elite drops one blueprint, dealt by the run seed and the node, kept until the Collector', () => {
    const after = won([0, 1]);
    expect(after.carried).toHaveLength(1);
    expect(after.drop).toBe(after.carried[0]! + 1);
    expect(after.collector).toBe(false); // the Collector is between acts
    expect(won([0, 1]).drop).toBe(after.drop); // the same seed and node: the same blueprint
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => won([0, 1], { seed }).drop)).size).toBeGreaterThan(1);
    const twice = won([0, 1], { carried: [after.carried[0]!] });
    expect(twice.carried).toHaveLength(2); // never the one already carried
    expect(new Set(twice.carried).size).toBe(2);
  });

  it('only a blueprint the run does not hold yet drops: not an unlocked one, not a banked one, not a special its acts unlocked', () => {
    const all = BLUEPRINTS.map((_, id) => id);
    expect(won([0, 1], { unlocked: all.filter((id) => id !== 3) }).carried).toEqual([3]);
    expect(won([0, 1], { unlocked: all.filter((id) => id !== 3), banked: [3] })).toMatchObject({ carried: [], drop: 0 });
    for (let seed = 0; seed < 30; seed++) expect(BLUEPRINTS[won([0, 1], { seed, best: 3 }).carried[0]!]!.type).not.toBe('special');
    expect(won([0, 1], { unlocked: all })).toMatchObject({ carried: [], drop: 0 });
  });

  it('an act boss drops one and opens the Collector when the run carries a blueprint; the last boss and the last act drop none', () => {
    const boss = won([0, 1, 2]);
    expect(boss.carried).toHaveLength(1);
    expect(boss).toMatchObject({ collector: true, end: '' });
    expect(won([0, 1, 2], { carried: [0] })).toMatchObject({ collector: true });
    expect(won([0, 1, 2], { unlocked: BLUEPRINTS.map((_, id) => id) })).toMatchObject({ collector: false, carried: [] }); // nothing to bank
    expect(won([0, 1, 2], { unlocked: BLUEPRINTS.map((_, id) => id), carried: [0] })).toMatchObject({ collector: true, drop: 0, carried: [0] });
    expect(won([0, 1, 2, 3, 4])).toMatchObject({ carried: [], drop: 0, collector: false }); // an elite of the last act
    expect(won([0, 1, 2, 3, 4, 5])).toMatchObject({ end: 'won', carried: [], drop: 0, collector: false });
  });

  it('a lost fight drops nothing and opens no Collector', () => {
    expect(fightOver(TWO, fight([0, 1, 2]), false, 0)).toMatchObject({ end: 'lost', carried: [], drop: 0, collector: false });
  });

  it('the map waits at the Collector', () => {
    const room = won([0, 1, 2], { reward: false });
    expect(choices(TWO, { ...room, reward: false, relic: false })).toEqual([]);
    expect(choices(TWO, { ...room, reward: false, relic: false, scroll: false, collector: false })).toEqual([3]);
  });

  it('banks a carried blueprint for cells, for good, leaving this run\'s pools as they were', () => {
    const room: Run = { ...fresh({ path: [0, 1, 2], cells: 12, carried: [0, 8], collector: true }) };
    const banked = collect(room, 8);
    expect(banked).toEqual({ ...room, cells: 12 - COLLECT_COST, carried: [0], banked: [8] });
    expect(banked.unlocked).toBe(room.unlocked); // later runs only
    expect(collect(banked, 8)).toBe(banked); // not carried any more
    expect(collect(banked, 3)).toBe(banked); // never carried
    const two = collect(banked, 0);
    expect(two).toMatchObject({ cells: 2, carried: [], banked: [8, 0] });
    expect(collect({ ...room, cells: COLLECT_COST - 1 }, 0)).toEqual({ ...room, cells: COLLECT_COST - 1 }); // not enough cells
    expect(collect({ ...room, collector: false }, 0)).toEqual({ ...room, collector: false }); // no Collector here
  });

  it('Leave closes the Collector; unbanked blueprints and cells wait for the next one', () => {
    const room = fresh({ path: [0, 1, 2], cells: 3, carried: [0], collector: true });
    expect(leaveCollector(room)).toEqual({ ...room, collector: false });
    expect(choices(TWO, leaveCollector(room))).toEqual([3]);
  });

  it('the pools hold the blueprints unlocked: relics, tactics and special marbles stay out until banked', () => {
    const treasure = (state: Partial<Run>, seed: number): number[] => relicOffers(TWO, { ...fresh({ seed, path: [0], relic: true, ...state }) });
    // a relic offer of node 0 is a fight here: the pool does not depend on the node's kind
    for (let seed = 0; seed < 20; seed++) expect(treasure({}, seed)[0]!).toBeLessThan(6);
    const heldSix = [0, 1, 2, 3, 4, 5];
    expect(treasure({ relics: heldSix }, 1)).toEqual([]); // the six others are locked
    expect(treasure({ relics: heldSix, unlocked: [blueprintId('relic', 9)] }, 1)).toEqual([9]);
    const seen = new Set<number>();
    for (let seed = 0; seed < 40; seed++) seen.add(tacticOffer(fresh({ seed, reward: true, path: [0] })));
    expect([...seen].sort()).toEqual([1, 2]);
    for (let seed = 0; seed < 40; seed++) seen.add(tacticOffer(fresh({ seed, reward: true, path: [0], unlocked: [blueprintId('tactic', 4)] })));
    expect([...seen].sort()).toEqual([1, 2, 4]);
    const dealt = new Set<number>();
    for (let seed = 0; seed < 60; seed++) for (const o of offers(fresh({ seed, army: 10, reward: true, path: [0] }))) dealt.add(o);
    expect([...dealt].sort((a, b) => a - b)).toEqual([0, 1]); // best 0: Heavy and a marble
    for (let seed = 0; seed < 60; seed++) for (const o of offers(fresh({ seed, army: 10, reward: true, path: [0], unlocked: [blueprintId('special', 8)] }))) dealt.add(o);
    expect(dealt.has(8)).toBe(true); // the Shield, banked
    expect(dealt.has(7)).toBe(false);
  });

  it('the shop and the events deal from the same pools', () => {
    for (let seed = 0; seed < 30; seed++) {
      const shop = shopStock(fresh({ seed, shop: true, path: [0] }));
      expect(shop.find((i) => i.kind === 'relic')!.code).toBeLessThan(6);
      expect([1, 2]).toContain(shop.find((i) => i.kind === 'tactic')!.code);
    }
    const titles = new Set<string>();
    for (let seed = 0; seed < 80; seed++) titles.add(eventOf(fresh({ seed, event: true, path: [0], unlocked: [blueprintId('special', 8)] }))!.title);
    expect(titles.has('Bulkhead')).toBe(true);
    expect(titles.has('Lodestone')).toBe(false);
  });

  it('the Collector room: a button per blueprint carried with its cost, the ones the cells cannot pay disabled, Leave', () => {
    const doc = parse(collectorHtml(fresh({ path: [0, 1, 2], cells: 6, carried: [0, 6, 9], banked: [1], collector: true })));
    expect(doc.querySelector('.run-line')!.textContent).toBe('Collector · 6 cells');
    const buttons = [...doc.querySelectorAll<HTMLButtonElement>('button[data-collect]')];
    expect(buttons.map((b) => b.dataset.collect)).toEqual(['0', '6', '9']);
    expect(buttons[0]!.textContent).toBe('Relic blueprint · Lucky coin: an event shows how each of its gambles turns out before you take it · 5 cells');
    expect(buttons[1]!.textContent).toMatch(/^Tactic blueprint · Swap: /);
    expect(buttons[2]!.textContent).toMatch(/^Special marble blueprint · Spark: /);
    expect(buttons.map((b) => b.disabled)).toEqual([false, false, false]);
    expect(buttons[0]!.querySelector('svg')).not.toBeNull();
    expect(doc.querySelector('.run-help')!.textContent).toContain('for good');
    expect(doc.body.textContent).toContain('Banked this run: Bargain');
    expect(doc.querySelector('button[data-depart]')!.textContent).toBe('Leave');
    const poor = [...parse(collectorHtml(fresh({ path: [0, 1, 2], cells: 4, carried: [0], collector: true }))).querySelectorAll<HTMLButtonElement>('button[data-collect]')];
    expect(poor[0]!.disabled).toBe(true);
    expect(poor[0]!.textContent).toBe('Relic blueprint · Lucky coin: an event shows how each of its gambles turns out before you take it · 5 cells · not enough cells');
  });

  it('the reward and relic screens of an elite or a boss say which blueprint it dropped', () => {
    const rest = BLUEPRINTS.map((_, id) => id).filter((id) => id !== 0);
    const elite = won([0, 1], { unlocked: rest, keys: [Key.Emerald] }); // only Lucky coin is left to drop
    const line = 'Blueprint found · Relic blueprint · Lucky coin: an event shows how each of its gambles turns out before you take it · kept for the Collector, lost if the run ends first';
    expect(parse(rewardHtml(TWO, elite)).querySelector('.run-help')!.textContent).toBe(line);
    expect(parse(relicHtml(TWO, { ...elite, relic: true })).querySelector('.run-help')!.textContent).toBe(line);
    expect(parse(rewardHtml(TWO, won([0]))).querySelector('.run-help')).toBeNull(); // a fight drops none
    expect(parse(rewardHtml(TWO, { ...elite, drop: 0 })).querySelector('.run-help')).toBeNull(); // nothing was left to drop
    const chest = parseMap([[0, 0, 0, 5, 0, 0, 0]].flat());
    expect(parse(relicHtml(chest, { ...elite, path: [0], relic: true })).querySelector('.run-help')).toBeNull(); // a treasure after an elite: the old drop is not shown
  });

  it('the run line counts the cells and the blueprints carried', () => {
    expect(runLine(TWO, fresh({ cells: 7 }))).toBe('Rogue-lite run · army 14 marbles · 7 cells · pick a fight');
    expect(runLine(TWO, fresh({ scrap: 20, cells: 7, carried: [2] }))).toBe('Rogue-lite run · army 14 marbles · 20 scrap · 7 cells · 1 blueprint · pick a fight');
    expect(runLine(TWO, fresh({ carried: [2, 3] }))).toBe('Rogue-lite run · army 14 marbles · 2 blueprints · pick a fight');
  });

  it('the summary says what was lost with the run, and what was banked', () => {
    const over = fresh({ path: [0, 1, 2], end: 'lost', cells: 9, carried: [0, 6, 8], banked: [1] });
    const helps = [...parse(mapHtml(TWO, over)).querySelectorAll('.run-help')].map((p) => p.textContent);
    expect(helps).toContain('Cells left: 9, lost with the run');
    expect(helps).toContain('Blueprints lost with the run: Lucky coin, Swap, Anchor');
    expect(helps.find((h) => h!.startsWith('Unlocked:'))).toContain('Bargain');
    const clean = [...parse(mapHtml(TWO, fresh({ path: [0], end: 'lost' }))).querySelectorAll('.run-help')].map((p) => p.textContent);
    expect(clean.join()).not.toMatch(/Cells|Blueprints/);
  });

  it('the start of a run says how many blueprints are left to bank', () => {
    const helps = (run: Run): (string | null)[] => [...parse(mapHtml(TWO, run)).querySelectorAll('.run-help')].map((p) => p.textContent);
    expect(helps(fresh())).toContain('Blueprints to bank: 14 · elites and act bosses drop them, the Collector between acts banks them for good');
    expect(helps(fresh({ unlocked: [0, 1], best: 1 }))).toContain('Blueprints to bank: 10 · elites and act bosses drop them, the Collector between acts banks them for good');
    expect(helps(fresh({ unlocked: BLUEPRINTS.map((_, id) => id) })).join()).not.toContain('Blueprints to bank');
  });

  it('a run saved before the Collector loads with the relics and tactics unlocked and nothing carried', async () => {
    const store = memoryStore();
    const saved: Record<string, unknown> = { ...fresh({ path: [0] }) };
    for (const key of ['unlocked', 'cells', 'carried', 'banked', 'drop', 'collector']) delete saved[key];
    await store.put(RUN_KEY, saved);
    expect((await loadRun(store, () => TWO, engine))!.state).toMatchObject({ unlocked: LEGACY_UNLOCKED, cells: 0, carried: [], banked: [], drop: 0, collector: false });
    const kept = fresh({ path: [0], unlocked: [3], cells: 7, carried: [1, 2], banked: [5], drop: 3, collector: true });
    await store.put(RUN_KEY, kept);
    expect((await loadRun(store, () => TWO, engine))!.state).toEqual(kept);
  });
});

describe('roguelite biomes (#1472)', () => {
  const parse = (html: string): Document => new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  // Three acts of a fight 0 that leads to the boss 1 (act 1), 2 and 3 (act 2), 4 and 5 (act 3).
  const THREE = parseMap([[0, 0, 0, 0, 1, 0, 0], [0, 1, 0, 1, 0, 0, 0], [1, 0, 0, 0, 1, 0, 0], [1, 1, 0, 1, 0, 0, 0], [2, 0, 0, 0, 1, 0, 0], [2, 1, 0, 1, 0, 0, 0]].flat());
  const fresh = (state: Partial<Run> = {}): Run => ({ ...newRun(1, 3, LEGACY_UNLOCKED), ...state });
  const fight = (path: number[], state: Partial<Run> = {}): Run => ({ ...pick(fresh(state), path[path.length - 1]!), path });
  const won = (path: number[], state: Partial<Run> = {}): Run => fightOver(THREE, fight(path, state), true, 0);
  const IDS = ['echo', 'hull', 'choir', 'chaplain', 'ballast', 'alien', 'railyard', 'magnetizer', 'pulsar', 'overseer', 'assembly', 'core', 'dual', 'stalker', 'swarm'];
  /** The exits of the bridge, standing in: act 2 offers the Tundra (2) and the Desert (3), act 3 the Badlands (4) and the Archipelago (5). */
  const exitsOf = (act: number, from: number): number[] => (act === 1 ? [2, 3] : from === 4 ? [1, 5] : [4, 5]);

  it('the biomes echo the Open world\'s, the Meadow first with no boss of its own, each other one a boss of the roster', () => {
    expect(BIOMES.map((b) => b.name)).toEqual(['Meadow', 'Forest', 'Tundra', 'Desert', 'Badlands', 'Archipelago']);
    expect(BIOMES.map((b) => b.id)).toEqual(['meadow', 'forest', 'tundra', 'desert', 'badlands', 'archipelago']);
    expect(BIOMES[0]!.boss).toBe('');
    const bosses = BIOMES.slice(1).map((b) => b.boss);
    expect(new Set(bosses).size).toBe(5);
    for (const boss of bosses) expect(IDS).toContain(boss);
    for (const b of BIOMES.slice(1)) expect(`${b.hazard}${b.foes}`).not.toBe('');
  });

  it('a new run offers exits and has no biome yet, one saved before has neither', () => {
    expect(newRun(5, 3, [])).toMatchObject({ exits: true, exit: false, biomes: [] });
    expect([biomeOf(fresh(), 0), biomeOf(fresh(), 1), biomeOf(fresh(), 2)]).toEqual([0, 0, 0]);
  });

  it('a boss node says before the fight whether its boss takes the army\'s build, once the biome of its act is known (#1495)', () => {
    const bosses = { ids: IDS, name: (id: string) => `The ${id}`, builds: (id: string) => id === 'hull' };
    const tips = (run: Run, given?: typeof bosses): string[][] =>
      [...parse(mapHtml(THREE, run, '', given)).querySelectorAll<HTMLButtonElement>('button[data-node-kind="boss"]')].map((b) => b.dataset.tip!.split('\n'));
    const far = { path: [0, 1, 2, 3, 4] };
    const [meadow, tundra, desert] = tips(fresh({ ...far, biomes: [2, 3] }), bosses);
    expect(meadow!.find((l) => l.startsWith('Boss: '))).toMatch(/^Boss: The \w+ · (takes your build|fights without your build)$/); // the one the run seed deals
    expect(tundra).toEqual(['Boss', 'Act 2 · Tundra', 'Boss: The hull · takes your build']);
    expect(desert).toEqual(['Boss', 'Act 3 · Desert', 'Boss: The pulsar · fights without your build']);
    expect(tips(fresh({ ...far, biomes: [2] }), bosses)[2]).toEqual(['Boss', 'Act 3']); // the exit of act 3 is not picked: its boss is not known
    expect(tips(fresh({ ...far, exits: false }), bosses)[1]!.join()).toMatch(/Boss: The \w+/); // a run without exits knows them all
    expect(tips(fresh({ ...far, biomes: [2, 3] }))[1]).toEqual(['Boss', 'Act 2 · Tundra']); // no roster given, no line
    const nodes = [...parse(mapHtml(THREE, fresh({ ...far, biomes: [2, 3] }), '', bosses)).querySelectorAll<HTMLButtonElement>('button[data-node-kind="fight"]')];
    expect(nodes.every((b) => !b.dataset.tip!.includes('Boss'))).toBe(true);
  });

  it('the biome of an act is the exit picked before it, the Meadow in act 1 and for a run without exits', () => {
    const run = fresh({ biomes: [2, 5] });
    expect([0, 1, 2].map((act) => biomeOf(run, act))).toEqual([0, 2, 5]);
    expect([0, 1, 2].map((act) => biomeOf({ ...run, exits: false }, act))).toEqual([0, 0, 0]);
    expect(biomeOf(fresh({ biomes: [2] }), 2)).toBe(0); // not picked yet
  });

  it('a run that began on a gate has the gate\'s biome in act 1, the exits after it, and the Meadow throughout without exits, #1597', () => {
    const run = fresh({ first: 3, biomes: [2, 5] });
    expect([0, 1, 2].map((act) => biomeOf(run, act))).toEqual([3, 2, 5]);
    expect([0, 1, 2].map((act) => biomeOf({ ...run, exits: false }, act))).toEqual([0, 0, 0]);
    expect(biomeOf(fresh({ first: 3 }), 0)).toBe(3);
  });

  it('a saved run keeps the biome it began in, and one saved before it began in the Meadow, #1597', async () => {
    const store = memoryStore();
    const kept = fresh({ path: [0, 1], first: 3, biomes: [2] });
    await store.put(RUN_KEY, kept);
    expect((await loadRun(store, () => THREE, engine))!.state).toEqual(kept);
    const older: Record<string, unknown> = { ...kept };
    delete older.first;
    await store.put(RUN_KEY, older);
    expect((await loadRun(store, () => THREE, engine))!.state).toEqual({ ...kept, first: 0 });
  });

  it('an act boss beaten opens the exits unless it is the last one or the run has none; nothing else does', () => {
    expect(won([0, 1])).toMatchObject({ exit: true, end: '' });
    expect(won([0, 1, 2, 3])).toMatchObject({ exit: true });
    expect(won([0, 1], { exits: false })).toMatchObject({ exit: false });
    expect(won([0, 1, 2, 3, 4, 5])).toMatchObject({ end: 'won', exit: false });
    expect(won([0])).toMatchObject({ exit: false });
    expect(fightOver(THREE, fight([0, 1]), false, 0)).toMatchObject({ end: 'lost', exit: false });
  });

  it('the map waits at the exits, and goes on to the next act once one is picked', () => {
    const waiting = won([0, 1], { reward: false });
    expect(choices(THREE, { ...waiting, reward: false, relic: false, scroll: false, collector: false })).toEqual([]);
    expect(choices(THREE, { ...waiting, reward: false, relic: false, scroll: false, collector: false, exit: false })).toEqual([2]);
  });

  it('the exits are the bridge\'s for the next act, from the biome the run is in', () => {
    const seen: number[][] = [];
    const spy = (act: number, from: number): number[] => {
      seen.push([act, from]);
      return exitsOf(act, from);
    };
    const room = fresh({ path: [0, 1], exit: true });
    expect(exitOffers(THREE, room, spy)).toEqual([2, 3]);
    expect(exitOffers(THREE, fresh({ path: [0, 1, 2, 3], exit: true, biomes: [4] }), spy)).toEqual([1, 5]);
    expect(seen).toEqual([[1, 0], [2, 4]]);
    expect(exitOffers(THREE, fresh({ path: [0, 1] }), spy)).toEqual([]); // no exit waits
    expect(seen).toHaveLength(2);
  });

  it('picks an exit once: the biome joins the run, the map goes on, a biome not offered changes nothing', () => {
    const room = fresh({ path: [0, 1], exit: true });
    const picked = chooseExit(THREE, room, 3, exitsOf);
    expect(picked).toEqual({ ...room, exit: false, biomes: [3] });
    expect(choices(THREE, picked)).toEqual([2]);
    expect(chooseExit(THREE, room, 4, exitsOf)).toBe(room); // not an exit of this act
    expect(chooseExit(THREE, room, 0, exitsOf)).toBe(room);
    expect(chooseExit(THREE, picked, 3, exitsOf)).toBe(picked); // none waits
    const second = chooseExit(THREE, fresh({ path: [0, 1, 2, 3], exit: true, biomes: [3] }), 5, exitsOf);
    expect(second.biomes).toEqual([3, 5]);
  });

  it('the biome in play follows the act: kept while the exits wait, the next act\'s once picked, none once over', () => {
    expect(currentBiome(THREE, fresh())).toBe(0);
    expect(currentBiome(THREE, fresh({ path: [0] }))).toBe(0);
    const room = fresh({ path: [0, 1], exit: true });
    expect(currentBiome(THREE, room)).toBe(0);
    const act2 = chooseExit(THREE, room, 3, exitsOf);
    expect(currentBiome(THREE, act2)).toBe(3);
    expect(currentBiome(THREE, { ...act2, path: [0, 1, 2] })).toBe(3);
    expect(currentBiome(THREE, { ...act2, path: [0, 1, 2, 3], exit: true })).toBe(3); // still in act 2 until it picks
    expect(currentBiome(THREE, { ...act2, path: [0, 1, 2, 3, 4, 5], biomes: [3, 5], end: 'won' })).toBe(0);
    expect(currentBiome(THREE, { ...act2, path: [0, 1, 2], fighting: true })).toBe(3);
    expect(currentBiome(THREE, { ...act2, exits: false })).toBe(0);
  });

  it('the run cue of the board follows the act of the last node, and an elite only while it is fought (#1554)', () => {
    expect(runCue(THREE, fresh())).toEqual({ act: 0, elite: false });
    expect(runCue(THREE, fresh({ fighting: true }))).toEqual({ act: 0, elite: false }); // no node picked yet
    expect(runCue(THREE, fresh({ path: [0, 1, 2] }))).toEqual({ act: THREE[2]!.act, elite: false });
    const elite = THREE.map((n, i) => (i === 2 ? { ...n, kind: 'elite' as const } : n));
    expect(runCue(elite, fresh({ path: [0, 1, 2], fighting: true }))).toEqual({ act: THREE[2]!.act, elite: true });
    expect(runCue(elite, fresh({ path: [0, 1, 2] }))).toEqual({ act: THREE[2]!.act, elite: false }); // back on the map
    expect(THREE[2]!.act).toBe(1);
  });

  it('the bot\'s army of a fight is asked in the biome of its act', () => {
    const seen: number[][] = [];
    const planOf = (node: number, less: number, biome: number): ArrayLike<number> => {
      seen.push([node, less, biome]);
      return Int32Array.from([10, 0, biome]);
    };
    foePlan(THREE, pick(fresh({ path: [0, 1], biomes: [3] }), 2), planOf);
    foePlan(THREE, pick(fresh(), 0), planOf);
    foePlan(THREE, pick(fresh({ path: [0, 1], biomes: [3], exits: false }), 2), planOf);
    expect(seen).toEqual([[2, 0, 3], [0, 0, 0], [2, 0, 0]]);
  });

  it('the act boss of a biome is the biome\'s, whatever the seed deals; the Meadow, an unknown boss or a run without exits keep the deal', () => {
    const boss = (state: Partial<Run>, node: number, ids = IDS): ReturnType<typeof actBoss> => actBoss(THREE, pick(fresh(state), node), ids);
    for (const [biome, id] of [[1, 'alien'], [2, 'hull'], [3, 'pulsar'], [4, 'core'], [5, 'ballast']] as const) {
      for (let seed = 1; seed < 6; seed++) expect(boss({ seed, path: [0, 1], biomes: [biome] }, 3)!.id).toBe(id);
    }
    const dealt = boss({ path: [0, 1], biomes: [1] }, 3)!;
    expect(dealt.percent).toBe(ACT_PERCENT[1]);
    expect(boss({ path: [0, 1], biomes: [1], relics: [Relic.Dampener] }, 3)!.percent).toBe(150);
    expect(dealt.seed).toBe(boss({ path: [0, 1], biomes: [5] }, 3)!.seed); // the fight's seed is the run\'s and the node\'s
    const deal = boss({ path: [0, 1], exits: false, biomes: [1] }, 3)!.id;
    expect(boss({ path: [0, 1] }, 3)!.id).toBe(deal); // the Meadow
    expect(boss({ path: [0, 1], biomes: [1] }, 3, IDS.filter((id) => id !== 'alien'))!.id).not.toBe('alien');
    expect(boss({ path: [0, 1], biomes: [1] }, 1)!.id).toBe(boss({}, 1)!.id); // act 1 is never a biome
  });

  it('the run line names the biome, in a fight and on the map, and not the Meadow', () => {
    const act2 = fresh({ path: [0, 1], biomes: [2] });
    expect(runLine(THREE, pick(act2, 2))).toBe('Rogue-lite run · act 2 fight · Tundra · army 14 marbles');
    expect(runLine(THREE, act2)).toBe('Rogue-lite run · Tundra · army 14 marbles · pick a fight');
    expect(runLine(THREE, pick(fresh(), 0))).toBe('Rogue-lite run · act 1 fight · army 14 marbles');
    expect(runLine(THREE, fresh({ path: [0, 1], biomes: [2], exits: false }))).toBe('Rogue-lite run · army 14 marbles · pick a fight');
  });

  it('the exit screen offers a button per exit with its biome, hazard, foes and boss, named by the bridge', () => {
    const doc = parse(exitHtml(THREE, fresh({ path: [0, 1], exit: true }), exitsOf, (id) => id.toUpperCase()));
    expect(doc.querySelector('.run-line')!.textContent).toBe('Act 1 done · pick the exit to act 2');
    const buttons = [...doc.querySelectorAll<HTMLButtonElement>('button[data-exit]')];
    expect(buttons.map((b) => b.dataset.exit)).toEqual(['2', '3']);
    expect(buttons.map((b) => b.dataset.biome)).toEqual(['tundra', 'desert']);
    expect(buttons[0]!.textContent).toBe(`Tundra · ${BIOMES[2]!.hazard} · foes: ${BIOMES[2]!.foes} · boss: HULL`);
    expect(buttons[1]!.textContent).toContain('boss: PULSAR');
    expect(buttons.every((b) => !b.disabled)).toBe(true);
    expect(doc.querySelector('.run-help')!.textContent).toContain('hole');
    const unknown = parse(exitHtml(THREE, fresh({ path: [0, 1], exit: true }), exitsOf, () => undefined));
    expect(unknown.querySelector('button[data-exit]')!.textContent).toContain('boss: unknown');
    const second = parse(exitHtml(THREE, fresh({ path: [0, 1, 2, 3], exit: true, biomes: [4] }), exitsOf, String));
    expect(second.querySelector('.run-line')!.textContent).toBe('Act 2 done · pick the exit to act 3');
    expect([...second.querySelectorAll<HTMLButtonElement>('button[data-exit]')].map((b) => b.dataset.exit)).toEqual(['1', '5']);
  });

  it('the summary lists the biomes of the acts played', () => {
    const helps = (run: Run): string[] => [...parse(mapHtml(THREE, run)).querySelectorAll('.run-help')].map((p) => p.textContent!);
    expect(helps(fresh({ path: [0, 1, 2], end: 'lost', biomes: [2] }))).toContain('Biomes: Meadow, Tundra');
    expect(helps(fresh({ path: [0, 1, 2, 3, 4], end: 'lost', biomes: [2, 5] }))).toContain('Biomes: Meadow, Tundra, Archipelago');
    expect(helps(fresh({ path: [0], end: 'lost' })).join()).not.toContain('Biomes');
  });

  it('a saved run keeps its biomes and a pending exit, and one saved before them offers none', async () => {
    const store = memoryStore();
    const kept = fresh({ path: [0, 1], exit: true, biomes: [2] });
    await store.put(RUN_KEY, kept);
    expect((await loadRun(store, () => THREE, engine))!.state).toEqual(kept);
    const older: Record<string, unknown> = { ...kept };
    for (const key of ['exits', 'exit', 'biomes']) delete older[key];
    await store.put(RUN_KEY, older);
    expect((await loadRun(store, () => THREE, engine))!.state).toEqual({ ...kept, exits: false, exit: false, biomes: [] });
  });

  it.each([
    ['a bad exits flag', { exits: 1 }],
    ['a bad exit flag', { exit: 'yes' }],
    ['biomes that are no list', { biomes: 2 }],
    ['the Meadow as a chosen biome', { biomes: [0] }],
    ['an unknown biome', { biomes: [6] }],
    ['a biome twice', { biomes: [2, 2] }],
    ['three biomes', { biomes: [1, 2, 3] }],
    ['an unknown first biome', { first: 6 }],
    ['a first biome that is no integer', { first: 'forest' }],
    ['the first biome chosen again by an exit', { first: 2, biomes: [2] }],
  ])('drops a saved run with %s', async (_, bad) => {
    const store = memoryStore();
    await store.put(RUN_KEY, { ...fresh({ path: [0] }), ...bad });
    expect(await loadRun(store, () => THREE, engine)).toBeNull();
    expect(store.data.has(RUN_KEY)).toBe(false);
  });
});

// Ascension (#1465, docs/specs/roguelite.md section 20): a run won at level N unlocks level N + 1, each level adds a handicap.
describe('roguelite ascension', () => {
  const parse = (html: string): Document => new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  // One act: a fight 0 leads to an elite 1, a rest 2 and an event 3, each to the boss 4; a fight 5 opens the next act, a boss 6 ends it.
  const ACT = parseMap([0, 0, 0, 0, 0b111, 0, 0, 0, 1, 0, 2, 1, 0, 0, 0, 1, 1, 3, 1, 0, 0, 0, 1, 2, 4, 1, 0, 0, 0, 2, 0, 1, 0, 0, 0]);
  // One act: a fight 0 leads to a shop 1 and an elite 2, each to the boss 3.
  const SHOP = parseMap([0, 0, 0, 0, 0b11, 0, 0, 0, 1, 0, 6, 1, 0, 0, 0, 1, 1, 2, 1, 0, 0, 0, 2, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
  const level = (n: number, state: Partial<Run> = {}): Run => ({ ...newRun(1, 3, LEGACY_UNLOCKED, 10), ascension: n, ...state });
  const memory = () => {
    const data = new Map<string, string>();
    return { data, getItem: (k: string): string | null => data.get(k) ?? null, setItem: (k: string, v: string): void => void data.set(k, v) };
  };

  it('lists ten levels, each with a name and a rule', () => {
    expect(MAX_ASCENSION).toBe(10);
    expect(ASCENSIONS).toHaveLength(10);
    expect(ASCENSIONS.every((a) => a.name && a.help)).toBe(true);
    expect(new Set(ASCENSIONS.map((a) => a.name)).size).toBe(10);
  });

  it('a new run is at level 0 with the levels unlocked before it', () => {
    expect(newRun(1, 3, LEGACY_UNLOCKED)).toMatchObject({ ascension: 0, top: 0 });
    expect(newRun(1, 3, LEGACY_UNLOCKED, 4)).toMatchObject({ ascension: 0, top: 4 });
  });

  it('the level is picked before the first node, only an unlocked one; level 6 starts with 12 marbles', () => {
    const run = newRun(1, 3, LEGACY_UNLOCKED, 7);
    expect(chooseAscension(run, 3)).toEqual({ ...run, ascension: 3 });
    expect(chooseAscension(run, 6)).toEqual({ ...run, ascension: 6, army: 12 });
    expect(chooseAscension(chooseAscension(run, 6), 2)).toEqual({ ...run, ascension: 2 }); // the pick is changed: the army is back to 14
    expect(chooseAscension(chooseAscension(run, 3), 0)).toEqual(run);
    expect(chooseAscension(run, 8)).toBe(run); // locked
    expect(chooseAscension(run, 11)).toBe(run);
    expect(chooseAscension(run, 1.5)).toBe(run);
    expect(chooseAscension(run, -1)).toBe(run);
    expect(chooseAscension({ ...run, path: [0] }, 3).ascension).toBe(0); // the run is on
    expect(chooseAscension({ ...run, end: 'lost' }, 3).ascension).toBe(0);
  });

  it('level 1: an elite searches 3 times a fight, not 2', () => {
    expect(fightBudget(ACT, pick({ ...level(0), path: [0], keys: [Key.Emerald] }, 1), 1000)).toBe(2000); // not the marked elite (#1467)
    expect(fightBudget(ACT, pick({ ...level(1), path: [0], keys: [Key.Emerald] }, 1), 1000)).toBe(3000);
    expect(fightBudget(ACT, pick(level(1), 0), 1000)).toBe(1000); // a fight
  });

  it('level 2: a rest brings the army back up to 12 only, and never lowers it', () => {
    const site = (n: number, army: number): Run => visit(ACT, level(n, { army, path: [0] }), 2);
    expect(rest(site(1, 6)).army).toBe(14);
    expect(rest(site(2, 6)).army).toBe(12);
    expect(rest(site(2, 13)).army).toBe(13);
    expect(restHtml(site(1, 6))).toContain('Rest: back up to 14 marbles');
    expect(restHtml(site(2, 6))).toContain('Rest: back up to 12 marbles');
  });

  it('levels 3 and 8: the bot has 1 then 2 special marbles more', () => {
    const calls: number[][] = [];
    const planOf = (node: number, less: number, _biome: number, more: number): number[] => (calls.push([node, less, more]), [10, 0]);
    for (const n of [0, 2, 3, 7, 8, 10]) foePlan(ACT, pick(level(n), 0), planOf);
    foePlan(ACT, pick(level(3, { relics: [Relic.Saboteur] }), 0), planOf);
    expect(calls).toEqual([[0, 0, 0], [0, 0, 0], [0, 0, 1], [0, 0, 1], [0, 0, 2], [0, 0, 2], [0, 1, 1]]);
  });

  it('level 4: the shop asks a quarter more, the removal too', () => {
    const shop = (n: number): Run => visit(SHOP, level(n, { path: [0], scrap: 500 }), 1);
    const plain = shopStock(shop(3)).map((i) => i.price);
    expect(shopStock(shop(4)).map((i) => i.price)).toEqual(plain.map((p) => Math.round(p * 1.25)));
    const run = level(0, { army: 9, specials: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
    const paid = (n: number): number => 500 - removeSpecial({ ...shop(n), army: 9, specials: run.specials }, 1).scrap;
    expect(paid(4)).toBe(Math.round(paid(3) * 1.25));
  });

  it('level 5: a won fight, elite and boss earn 30 % less scrap', () => {
    const scrap = (n: number, node: number, path: number[]): number => fightOver(SHOP, pick(level(n, { path }), node), true, 0).scrap;
    expect([scrap(4, 0, []), scrap(4, 2, [0]), scrap(4, 3, [0, 2])]).toEqual([10, 20, 30]);
    expect([scrap(5, 0, []), scrap(5, 2, [0]), scrap(5, 3, [0, 2])]).toEqual([7, 14, 21]);
  });

  it('level 7: an act boss plays at a quarter more strength', () => {
    const ids = ['echo', 'hull', 'anvil'];
    const boss = (n: number, relics: number[] = []): number => actBoss(ACT, pick(level(n, { path: [0], relics }), 4), ids)!.percent;
    expect(boss(6)).toBe(50);
    expect(boss(7)).toBe(63);
    expect(boss(7, [Relic.Dampener])).toBe(78);
  });

  it('level 9: a reward offers one choice fewer', () => {
    const short = { ...level(8, { army: 12 }), reward: true };
    expect(offers(short)).toHaveLength(3);
    expect(offers({ ...short, ascension: 9 })).toEqual(offers(short).slice(0, 2));
  });

  it('level 10: the bot searches a quarter more in fights and elites, not against a boss', () => {
    expect(fightBudget(ACT, pick(level(9), 0), 1000)).toBe(1000);
    expect(fightBudget(ACT, pick(level(10), 0), 1000)).toBe(1250);
    expect(fightBudget(ACT, pick(level(10, { path: [0], keys: [Key.Emerald] }), 1), 1000)).toBe(3750);
    expect(fightBudget(ACT, pick(level(10, { path: [0] }), 4), 1000)).toBe(1000);
  });

  it('a run won at level N unlocks level N + 1, up to 10, never lowers it', () => {
    const kept = memory();
    expect(readAscension(kept)).toBe(0);
    recordAscension(kept, level(0, { end: 'lost' }));
    recordAscension(kept, level(3));
    expect(readAscension(kept)).toBe(0);
    recordAscension(kept, level(0, { end: 'won' }));
    expect(readAscension(kept)).toBe(1);
    recordAscension(kept, level(0, { end: 'won' })); // a lower level won later
    expect(readAscension(kept)).toBe(1);
    recordAscension(kept, level(4, { end: 'won' }));
    expect(readAscension(kept)).toBe(5);
    recordAscension(kept, level(10, { end: 'won' }));
    expect(readAscension(kept)).toBe(10);
    kept.data.set('ab-alone.roguelite.ascension', '11');
    expect(readAscension(kept)).toBe(0); // not a level
    kept.data.set('ab-alone.roguelite.ascension', 'x');
    expect(readAscension(kept)).toBe(0);
  });

  it('the summary and the run line name the level, and a win at the top level says what it unlocked', () => {
    expect(runLine(ACT, level(0))).toBe('Rogue-lite run · army 14 marbles · pick a fight');
    expect(runLine(ACT, level(3))).toBe('Rogue-lite run · ascension 3 · army 14 marbles · pick a fight');
    expect(runLine(ACT, pick(level(3), 0))).toBe('Rogue-lite run · ascension 3 · act 1 fight · army 14 marbles');
    const helps = (run: Run): (string | null)[] => [...parse(mapHtml(ACT, run)).querySelectorAll('.run-help')].map((p) => p.textContent);
    const over = { path: [0, 1, 4], end: 'lost' as const, top: 3, ascension: 3 };
    expect(helps(level(3, over))).toContain('Ascension: 3');
    expect(helps(level(0, { ...over, ascension: 0 }))).not.toContain('Ascension: 0');
    expect(earned(ACT, level(3, { ...over, end: 'won' }))).toContain('Ascension 4');
    expect(earned(ACT, level(2, { ...over, end: 'won' }))).not.toContain('Ascension 3'); // unlocked before
    expect(earned(ACT, level(3, over))).not.toContain('Ascension 4'); // lost
    expect(earned(ACT, level(10, { ...over, top: 10, ascension: 10, end: 'won' }))).not.toContain('Ascension 11');
  });

  it('draws the picker on the start screen: a button per level, the locked ones off, the picked one pressed with its rule', () => {
    const start = (n: number, top: number): Document => parse(mapHtml(ACT, chooseAscension(newRun(1, 3, LEGACY_UNLOCKED, top), n)));
    const doc = start(2, 3);
    const buttons = [...doc.querySelectorAll<HTMLButtonElement>('button[data-ascension]')];
    expect(buttons.map((b) => b.dataset.ascension)).toEqual(Array.from({ length: 11 }, (_, n) => String(n)));
    expect(buttons.map((b) => b.disabled)).toEqual([false, false, false, false, true, true, true, true, true, true, true]);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true', ...Array<string>(8).fill('false')]);
    expect(buttons.map((b) => b.textContent).slice(0, 3)).toEqual(['0', '1', '2']);
    expect(doc.body.textContent).toContain(`Ascension 2: ${ASCENSIONS[1]!.name}`);
    expect(doc.body.textContent).toContain(ASCENSIONS[1]!.help);
    expect(start(0, 0).body.textContent).toContain('Ascension: win a run to unlock the first level');
    expect(parse(mapHtml(ACT, { ...newRun(1, 3, LEGACY_UNLOCKED, 3), path: [0] })).querySelector('button[data-ascension]')).toBeNull(); // the run is on
  });

  it('saves the level with the run, and a run saved before loads at level 0', async () => {
    const saved = memoryStore();
    const run = chooseAscension(newRun(1, 3, LEGACY_UNLOCKED, 7), 6);
    await saveRun(saved, run);
    expect((await loadRun(saved, () => ACT, engine))!.state).toEqual(run);
    const older: Record<string, unknown> = { ...run };
    delete older.ascension;
    delete older.top;
    await saved.put(RUN_KEY, older);
    expect((await loadRun(saved, () => ACT, engine))!.state).toMatchObject({ ascension: 0, top: 0 });
    for (const bad of [{ ascension: 11 }, { ascension: -1 }, { ascension: 1.5 }, { top: 11 }, { top: 'x' }]) {
      await saved.put(RUN_KEY, { ...run, ...bad });
      expect(await loadRun(saved, () => ACT, engine)).toBeNull();
    }
  });
});

describe('roguelite score and daily run (#1466)', () => {
  const parse = (html: string): Document => new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  // Act 1: a fight 0 leads to an elite 1, then the boss 2. Act 2: a fight 3, then the boss 4.
  const TWO = parseMap([[0, 0, 0, 0, 1, 0, 0], [0, 1, 0, 2, 1, 0, 1], [0, 2, 0, 1, 0, 0, 0], [1, 0, 0, 0, 1, 0, 0], [1, 1, 0, 1, 0, 0, 0]].flat());
  const fresh = (state: Partial<Run> = {}): Run => ({ ...newRun(1, 3, LEGACY_UNLOCKED), ...state });

  it('a new run has no flawless fight and is no daily run', () => {
    expect(newRun(1, 3, [])).toMatchObject({ flawless: 0, daily: '' });
  });

  it('a fight, an elite or a boss won with no marble lost is flawless, a loss or a lost marble is not', () => {
    const fight = pick(fresh(), 0);
    expect(fightOver(TWO, fight, true, 0).flawless).toBe(1);
    expect(fightOver(TWO, { ...fight, flawless: 2 }, true, 0).flawless).toBe(3);
    expect(fightOver(TWO, fight, true, 1).flawless).toBe(0);
    expect(fightOver(TWO, pick(fresh({ relics: [Relic.HullPlating] }), 0), true, 1).flawless).toBe(0); // Hull plating brings the marble back, the fight was not flawless
    expect(fightOver(TWO, fight, false, 0).flawless).toBe(0);
  });

  it('the score is 100 per act won, 25 per elite beaten, 10 per marble left, 15 per flawless fight', () => {
    expect(SCORE).toEqual({ act: 100, elite: 25, marble: 10, flawless: 15, ascension: 50 });
    expect(runScore(TWO, fresh({ path: [0, 1, 2], army: 10, flawless: 2 }))).toBe(100 + 25 + 100 + 30);
    expect(runScore(TWO, fresh({ path: [0, 1, 2, 3, 4], army: 12, flawless: 3, end: 'won' }))).toBe(200 + 25 + 120 + 45);
  });

  it('an elite or a boss still fought, or lost to, does not count', () => {
    expect(runScore(TWO, fresh({ path: [0, 1], fighting: true, army: 14 }))).toBe(140);
    expect(runScore(TWO, fresh({ path: [0, 1], end: 'lost', army: 3 }))).toBe(30);
    expect(runScore(TWO, fresh({ path: [0, 1, 2], fighting: true, army: 8 }))).toBe(25 + 80);
    expect(runScore(TWO, fresh({ path: [0, 1, 2, 3, 4], end: 'lost', army: 3 }))).toBe(100 + 25 + 30);
  });

  it('the ascension level of the run is worth 50 points a level, none at level 0', () => {
    expect(scoreParts(TWO, fresh({ path: [0], army: 5, ascension: 3 }))).toContainEqual(['ascension', 3, 50]);
    expect(runScore(TWO, fresh({ path: [0], army: 5, ascension: 3 }))).toBe(50 + 150);
    expect(scoreParts(TWO, fresh({ path: [0], army: 5 })).map(([label]) => label)).not.toContain('ascension');
  });

  it('the summary of a run over shows its score and where it comes from', () => {
    const over = fresh({ path: [0, 1, 2, 3], army: 3, flawless: 1, end: 'lost' });
    const doc = parse(mapHtml(TWO, over));
    expect(doc.querySelector('.run-score')!.textContent).toBe('Score: 170 (acts 1 × 100, elites 1 × 25, marbles 3 × 10, flawless fights 1 × 15)');
    expect([...doc.querySelectorAll('.run-help')].map((p) => p.textContent)[0]).toBe('Path: act 1 Fight, Elite, Boss · act 2 Fight');
    expect(parse(mapHtml(TWO, fresh({ path: [0], army: 3, end: 'lost' }))).querySelector('.run-score')!.textContent).toBe('Score: 30 (marbles 3 × 10)');
    expect(parse(mapHtml(TWO, fresh({ path: [0], army: 0, end: 'lost' }))).querySelector('.run-score')!.textContent).toBe('Score: 0'); // nothing left
    expect(parse(mapHtml(TWO, fresh({ path: [0] }))).querySelector('.run-score')).toBeNull(); // only a run over
  });

  it('a daily run plays the seed of the day with everything unlocked, the same for everyone', () => {
    const daily = dailyRun('2026-11-03', 77);
    expect(daily).toMatchObject({ seed: 77, daily: '2026-11-03', best: 3, army: START_ARMY, commander: 0, relics: [Relic.Gyroscope] });
    expect(daily.unlocked).toEqual(BLUEPRINTS.map((_, id) => id));
    expect(runLine(TWO, daily)).toBe('Daily run 2026-11-03 · army 14 marbles · pick a fight');
    expect(runLine(TWO, pick(daily, 0))).toBe('Daily run 2026-11-03 · act 1 fight · army 14 marbles');
    expect(runLine(TWO, { ...daily, end: 'won' })).toBe('Run won with 14 marbles');
  });

  it('the start screen holds the book buttons it is given, and only before the first pick', () => {
    const book = '<div class="run-book"><button type="button" data-book="history">Run history</button></div>';
    expect(parse(mapHtml(TWO, fresh(), book)).querySelector('.run-book button')!.textContent).toBe('Run history');
    expect(parse(mapHtml(TWO, fresh())).querySelector('.run-book')).toBeNull();
    expect(parse(mapHtml(TWO, fresh({ path: [0] }), book)).querySelector('.run-book')).toBeNull();
    expect(parse(mapHtml(TWO, fresh({ path: [0], end: 'lost' }), book)).querySelector('.run-book')).toBeNull();
  });

  it('a run saved with a daily day or a flawless count loads, a bad one is dropped', async () => {
    const store = memoryStore();
    const mapOf = (): MapNode[] => TWO;
    await saveRun(store, fresh({ daily: '2026-11-03', flawless: 4 }));
    expect((await loadRun(store, mapOf, engine))!.state).toMatchObject({ daily: '2026-11-03', flawless: 4 });
    for (const bad of [{ daily: '3 Nov' }, { daily: 3 }, { flawless: -1 }, { flawless: 1.5 }, { flawless: 99999 }]) {
      await store.put(RUN_KEY, { ...fresh(), ...bad });
      expect(await loadRun(store, mapOf, engine)).toBeNull();
    }
  });
});

describe('roguelite Auto-play mark (#1542)', () => {
  const TWO = parseMap([[0, 0, 0, 0, 1, 0, 0], [0, 1, 0, 2, 1, 0, 1], [0, 2, 0, 1, 0, 0, 0], [1, 0, 0, 0, 1, 0, 0], [1, 1, 0, 1, 0, 0, 0]].flat());
  const fresh = (state: Partial<Run> = {}): Run => ({ ...newRun(1, 3, LEGACY_UNLOCKED), ...state });
  const parse = (html: string): Document => new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');

  it('a run played by hand has no mark, a run that used Auto-play says so in its score line and its summary', () => {
    const hand = parse(mapHtml(TWO, fresh({ path: [0], army: 3, end: 'lost' })));
    expect(hand.querySelector('.run-score')!.textContent).toBe('Score: 30 (marbles 3 × 10)');
    expect(hand.body.textContent).not.toContain('Auto-play used');
    const auto = parse(mapHtml(TWO, fresh({ path: [0], army: 3, end: 'lost', auto: true })));
    expect(auto.querySelector('.run-score')!.textContent).toBe('Score: 30 (marbles 3 × 10) · Auto-play used');
    expect([...auto.querySelectorAll('.run-help')].map((p) => p.textContent)).toContain('Auto-play used');
  });

  it('the mark is saved with the run, an older run loads as played by hand and a bad one is dropped', async () => {
    const store = memoryStore();
    const mapOf = (): MapNode[] => TWO;
    await saveRun(store, fresh({ auto: true }));
    expect((await loadRun(store, mapOf, engine))!.state.auto).toBe(true);
    const { auto: _auto, ...older } = fresh();
    await store.put(RUN_KEY, older);
    expect((await loadRun(store, mapOf, engine))!.state.auto).toBe(false);
    await store.put(RUN_KEY, { ...fresh(), auto: 1 });
    expect(await loadRun(store, mapOf, engine)).toBeNull();
  });
});

describe('roguelite cursed chest (#1474)', () => {
  const chest = EVENTS.find((e) => e.title === 'Cursed chest')!;
  const fresh = newRun(1, 3, LEGACY_UNLOCKED);
  const waiting = (run: Run = fresh): Run => ({ ...waitingAt('Cursed chest', { ...run, path: [0, 3], event: true }) });

  it('is an event with two strong openings and Leave, dealt like the others', () => {
    expect(chest.choices.map((c) => c.verb)).toEqual(['Open it for its relic', 'Open it for its arms', 'Leave']);
    expect(CURSE_FIGHTS).toBe(2);
    expect(eventOf(waiting())).toBe(chest);
    expect(eventHtml(waiting())).toContain('Open it for its relic · +1 relic, cursed: marbles lost cost 2 for the next 2 fights');
  });

  it('opening it gives a relic or 3 Heavies and a curse of 2 fights, saved with the run', () => {
    const relic = takeEvent(waiting(), chest, 0)!;
    expect(relic).toMatchObject({ curse: 2, relics: [expect.any(Number)], army: 14, told: 'Cursed chest: +1 relic, cursed: marbles lost cost 2 for the next 2 fights' });
    expect(takeEvent(waiting(), chest, 1)).toMatchObject({ curse: 2, specials: [3, 0, 0, 0, 0, 0, 0, 0, 0, 0], relics: [] });
    expect(takeEvent(waiting(), chest, 0)).toEqual(relic); // deterministic
    expect(resolve(waiting(), 0)).toMatchObject({ curse: 2, event: false });
  });

  it('Leave is always offered and takes no curse', () => {
    expect(takeEvent(waiting(), chest, 2)).toEqual({ ...waiting(), told: '' });
    expect(takeEvent({ ...waiting(), curse: 1 }, chest, 2)!.curse).toBe(1);
    expect(eventHtml({ ...waiting(), relics: RELICS.map((_, code) => code) })).toContain('data-choice="0" disabled'); // no relic left: that opening cannot be taken
    expect(eventHtml({ ...waiting(), relics: RELICS.map((_, code) => code) })).not.toContain('data-choice="2" disabled');
  });

  it('a second chest renews the curse, it does not stack', () => {
    expect(takeEvent({ ...waiting(), curse: 1 }, chest, 1)!.curse).toBe(2);
  });

  it('each marble lost in the next 2 fights costs 2, then fights cost 1 again', () => {
    const cursed = { ...pick(fresh, 0), curse: 2 };
    const first = fightOver(MAP, cursed, true, 2);
    expect(first).toMatchObject({ army: 10, curse: 1 });
    const second = fightOver(MAP, pick({ ...first, reward: false }, 1), true, 1);
    expect(second).toMatchObject({ army: 8, curse: 0 });
    expect(fightOver(MAP, pick({ ...second, reward: false }, 1), true, 1)).toMatchObject({ army: 7, curse: 0 });
    expect(fightOver(MAP, cursed, true, 0)).toMatchObject({ army: 14, curse: 1 }); // a clean fight still spends a fight of the curse
  });

  it('the curse doubles what is lost after Hull plating, and can end the run', () => {
    expect(fightOver(MAP, { ...cursedFight(), relics: [Relic.HullPlating] }, true, 2)).toMatchObject({ army: 12 }); // 1 lost after the plating, costs 2
    expect(fightOver(MAP, { ...cursedFight(), army: 6 }, true, 2)).toMatchObject({ army: 2, end: 'lost' });
  });

  it('shows on the map and in the fight HUD line with its fights left', () => {
    expect(runLine(MAP, { ...cursedFight(), curse: 2 })).toBe('Rogue-lite run · act 1 fight · army 14 marbles · cursed: marbles lost cost 2, 2 fights left');
    expect(runLine(MAP, { ...fresh, curse: 1 })).toBe('Rogue-lite run · army 14 marbles · cursed: marbles lost cost 2, 1 fight left · pick a fight');
    expect(runLine(MAP, fresh)).not.toContain('cursed');
    expect(mapHtml(MAP, { ...fresh, curse: 2 })).toContain('cursed: marbles lost cost 2, 2 fights left');
  });

  it('is saved and loaded, a run saved before it has no curse, a bad curse does not load', async () => {
    const store = memoryStore();
    const mapOf = (): MapNode[] => MAP;
    await saveRun(store, { ...fresh, curse: 1 });
    expect((await loadRun(store, mapOf, engine))!.state.curse).toBe(1);
    const { curse: _gone, ...older } = { ...fresh, curse: 1 };
    await store.put(RUN_KEY, older);
    expect((await loadRun(store, mapOf, engine))!.state.curse).toBe(0);
    for (const bad of [3, -1, 1.5, 'x']) {
      await store.put(RUN_KEY, { ...fresh, curse: bad });
      expect(await loadRun(store, mapOf, engine)).toBeNull();
    }
  });

  function cursedFight(): Run {
    return { ...pick(fresh, 0), curse: 2 };
  }
});

// Flasks (#1475, docs/specs/roguelite.md section 25): 2 charges an act, 3 marbles back each, drunk on the map.
describe('roguelite flasks (#1475)', () => {
  const parse = (html: string): Document => new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const fresh = (state: Partial<Run> = {}): Run => ({ ...newRun(1, 3, LEGACY_UNLOCKED), path: [0], ...state });
  const flask = (run: Run): HTMLButtonElement => parse(mapHtml(MAP, run)).querySelector<HTMLButtonElement>('button[data-flask]')!;
  // The shop of the shop tests: a fight 0, a shop 1 and an elite 2, a boss 3, then a fight 4 of the next act.
  const SHOP = parseMap([0, 0, 0, 0, 0b11, 0, 0, 0, 1, 0, 6, 1, 0, 0, 0, 1, 1, 2, 1, 0, 0, 0, 2, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);

  it('a new run carries 2 flasks that give 3 marbles each', () => {
    expect([FLASKS, FLASK_MARBLES, MAX_FLASKS]).toEqual([2, 3, 4]);
    expect(newRun(1, 3, LEGACY_UNLOCKED).flasks).toBe(2);
  });

  it('a flask gives 3 marbles back, never above 14, and is spent', () => {
    expect(drink(fresh({ army: 8 }))).toMatchObject({ army: 11, flasks: 1 });
    expect(drink(drink(fresh({ army: 8 })))).toMatchObject({ army: 14, flasks: 0 });
    expect(drink(fresh({ army: 12 }))).toMatchObject({ army: 14, flasks: 1 }); // the surplus is lost
  });

  it('a flask is refused with the army full or no charge left, and nothing changes', () => {
    const full = fresh({ army: 14 });
    expect(drink(full)).toBe(full);
    const empty = fresh({ army: 8, flasks: 0 });
    expect(drink(empty)).toBe(empty);
  });

  it('a flask is drunk on the map only: not in a fight, a choice, or once the run is over', () => {
    for (const busy of [{ fighting: true }, { reward: true }, { event: true }, { relic: true }, { rest: true }, { shop: true }, { collector: true }, { exit: true }, { end: 'lost' as const }]) {
      const run = fresh({ army: 8, ...busy });
      expect(drink(run)).toBe(run);
    }
  });

  it('the next act refills the flasks to 2 at its first node, never lowering the ones the shop sold', () => {
    const boss = fresh({ path: [0, 2], army: 8, flasks: 0 });
    expect(visit(MAP, boss, 3).flasks).toBe(2);
    expect(visit(MAP, { ...boss, flasks: 1 }, 4).flasks).toBe(2);
    expect(visit(MAP, { ...boss, flasks: 3 }, 3).flasks).toBe(3);
    expect(visit(MAP, { ...boss, flasks: 4 }, 3).flasks).toBe(4);
  });

  it('a node inside an act, the first node of the run and a drink before the first node refill nothing', () => {
    expect(visit(MAP, fresh({ path: [0], flasks: 0 }), 2).flasks).toBe(0);
    expect(visit(MAP, { ...newRun(1, 3, LEGACY_UNLOCKED), flasks: 0 }, 0).flasks).toBe(0);
    expect(visit(MAP, drink(drink({ ...newRun(1, 3, LEGACY_UNLOCKED), army: 8 })), 0).flasks).toBe(0);
  });

  it('the map has a button that drinks a flask, with the marbles it gives and the charges left', () => {
    expect(flask(fresh({ army: 8 })).textContent).toBe('Drink a flask: 3 marbles back · 2 left');
    expect(flask(fresh({ army: 8 })).disabled).toBe(false);
    expect(flask(drink(fresh({ army: 8 }))).textContent).toBe('Drink a flask: 3 marbles back · 1 left');
    expect(flask(newRun(1, 3, LEGACY_UNLOCKED)).textContent).toBe('Drink a flask: 3 marbles back · 2 left · army full'); // also before the first pick
  });

  it('the button says why it is disabled: the army full, no charge left', () => {
    expect([flask(fresh({ army: 14 })).disabled, flask(fresh({ army: 14 })).textContent!.endsWith(' · army full')]).toEqual([true, true]);
    const empty = flask(fresh({ army: 8, flasks: 0 }));
    expect([empty.disabled, empty.textContent]).toEqual([true, 'Drink a flask: 3 marbles back · 0 left · no flask left']);
    expect(flask(fresh({ army: 14, flasks: 0 })).textContent!.endsWith(' · no flask left')).toBe(true);
  });

  it('the map of a run over has no flask button', () => {
    expect(parse(mapHtml(MAP, fresh({ end: 'lost' }))).querySelector('button[data-flask]')).toBeNull();
  });

  it('the shop sells one more charge for 20 to 30 scrap, up to 4 held', () => {
    const run = visit(SHOP, { ...newRun(1, 3, LEGACY_UNLOCKED), path: [0], scrap: 100 }, 1);
    const item = shopStock(run).find((i) => i.kind === 'flask')!;
    expect(item).toMatchObject({ id: 5, code: 0 });
    expect(item.price).toBeGreaterThanOrEqual(20);
    expect(item.price).toBeLessThanOrEqual(30);
    const bought = buy(run, 5);
    expect(bought).toMatchObject({ flasks: 3, scrap: 100 - item.price, bought: [5], shop: true });
    expect(shopStock(bought).some((i) => i.id === 5)).toBe(false); // once per shop
    expect(buy(bought, 5)).toBe(bought);
    const full = { ...run, flasks: 4 };
    expect(buy(full, 5)).toBe(full);
    const dear = parse(shopHtml({ ...full, scrap: 0 })).querySelector<HTMLButtonElement>('button[data-buy="5"]')!;
    expect([dear.disabled, dear.textContent!.endsWith(' · flasks full')]).toEqual([true, true]);
    expect(buy({ ...run, scrap: item.price - 1 }, 5).flasks).toBe(2); // too dear
  });

  it('saves the flasks with the run, an older save loads with 2 and a bad count is dropped', async () => {
    const store = memoryStore();
    const mapOf = (): MapNode[] => MAP;
    await saveRun(store, fresh({ flasks: 1, army: 9 }));
    expect((await loadRun(store, mapOf, engine))!.state).toMatchObject({ flasks: 1, army: 9 });
    await saveRun(store, fresh({ flasks: 0 }));
    expect((await loadRun(store, mapOf, engine))!.state.flasks).toBe(0);
    const older: Record<string, unknown> = { ...fresh({ army: 9 }) };
    delete older.flasks;
    await store.put(RUN_KEY, older);
    expect((await loadRun(store, mapOf, engine))!.state.flasks).toBe(2);
    for (const flasks of [-1, 5, 1.5, '2']) {
      await store.put(RUN_KEY, { ...fresh(), flasks });
      expect(await loadRun(store, mapOf, engine)).toBeNull();
    }
    await store.put(RUN_KEY, { ...fresh(), bought: [5] }); // the flask in a shop's sold list
    expect((await loadRun(store, mapOf, engine))!.state.bought).toEqual([5]);
  });
});

describe('roguelite bonus room (#1473)', () => {
  const fresh = newRun(1, 3, LEGACY_UNLOCKED);
  const budget = MOVE_BUDGET[0]!;
  const reached = (spent: number[]): Run => ({ ...at(fresh, 0), spent }); // the last node of act 1 before its boss picked
  const TURN = [1, 0, 0, 0, 0, 0, 0, 0];

  it('gives each of the four acts a budget of moves, growing over the first three (the fourth has an elite only)', () => {
    expect(MOVE_BUDGET).toHaveLength(4);
    expect(MOVE_BUDGET[1]! > MOVE_BUDGET[0]! && MOVE_BUDGET[2]! > MOVE_BUDGET[1]!).toBe(true);
  });

  it('counts a move as one round: the army moves and the bot answers, a tactic is not a move', () => {
    expect(rounds([])).toBe(0);
    expect(rounds([TURN])).toBe(1);
    expect(rounds([TURN, TURN])).toBe(1);
    expect(rounds([TURN, TURN, TURN])).toBe(2);
    expect(rounds([tacticRecord(2), TURN, TURN])).toBe(1);
  });

  it('adds the moves of a fight to its act when it ends, even a lost one, and counts nothing for an older run', () => {
    const fight = { ...pick(fresh, 0), moves: [TURN, TURN, TURN] };
    expect(fightOver(MAP, fight, true, 0).spent).toEqual([2, 0, 0, 0]);
    expect(fightOver(MAP, { ...fight, spent: [5, 0, 0, 0] }, true, 0).spent).toEqual([7, 0, 0, 0]);
    expect(fightOver(MAP, fight, false, 0).spent).toEqual([2, 0, 0, 0]);
    expect(fightOver(MAP, { ...pick({ ...fresh, spent: [0, 4, 0, 0] }, 3), moves: [TURN] }, true, 0).spent).toEqual([0, 5, 0, 0]);
    expect(fightOver(MAP, { ...fight, spent: [] }, true, 0).spent).toEqual([]);
  });

  it('opens a bonus room on the way to the act boss when the act was won within its budget', () => {
    expect(visit(MAP, reached([budget, 0, 0, 0]), 2)).toMatchObject({ bonus: true, fighting: false, path: [0, 2] });
    expect(visit(MAP, reached([0, 0, 0, 0]), 2)).toMatchObject({ bonus: true });
    expect(visit(MAP, reached([budget + 1, 0, 0, 0]), 2)).toMatchObject({ bonus: false, fighting: true, path: [0, 2] });
    expect(visit(MAP, reached([]), 2)).toMatchObject({ bonus: false, fighting: true }); // a run saved before it has no count, no room
    expect(visit(MAP, at({ ...fresh, spent: [0, 0, 0, 0] }, 0), 2).bonus).toBe(true);
    expect(visit(MAP, at(fresh, 1), 2).bonus).toBe(true);
  });

  it('opens no room before a node that is not a boss', () => {
    expect(visit(MAP, fresh, 0).bonus).toBe(false);
  });

  it('shows the room as a screen: no node to pick while it waits', () => {
    const waiting = visit(MAP, reached([1, 0, 0, 0]), 2);
    expect(choices(MAP, waiting)).toEqual([]);
  });

  it('the room holds a relic the run lacks, dealt by the run seed and the node, and scrap', () => {
    const waiting = visit(MAP, reached([1, 0, 0, 0]), 2);
    const relic = bonusRelic(waiting);
    expect(relic).toBeGreaterThanOrEqual(0);
    expect(relic).toBeLessThan(12); // an ordinary relic, never a boss relic
    expect(bonusRelic(waiting)).toBe(relic);
    expect(new Set(Array.from({ length: 30 }, (_, seed) => bonusRelic({ ...waiting, seed })!)).size).toBeGreaterThan(3);
    expect(bonusRelic({ ...waiting, relics: [relic] })).not.toBe(relic);
    expect(bonusRelic({ ...waiting, relics: RELICS.map((_, code) => code) })).toBe(-1);
    expect(bonusRelic(reached([1, 0, 0, 0]))).toBe(-1); // none waits
  });

  it('taking it gives the relic and the scrap once, then the boss fight starts', () => {
    const waiting = visit(MAP, reached([1, 0, 0, 0]), 2);
    const taken = takeBonus(waiting);
    expect(taken).toMatchObject({ bonus: false, fighting: true, moves: [], placed: [], path: [0, 2], scrap: BONUS_SCRAP, relics: [bonusRelic(waiting)] });
    expect(takeBonus(taken)).toBe(taken);
    expect(takeBonus(reached([1, 0, 0, 0]))).toEqual(reached([1, 0, 0, 0]));
    const none = takeBonus({ ...waiting, relics: RELICS.map((_, code) => code) });
    expect(none).toMatchObject({ fighting: true, scrap: BONUS_SCRAP });
    expect(none.relics).toHaveLength(RELICS.length);
  });

  it('the screen names the relic and the scrap, and says how fast the act was won', () => {
    const waiting = visit(MAP, reached([7, 0, 0, 0]), 2);
    const html = bonusHtml(MAP, waiting);
    expect(html).toContain('Bonus room');
    expect(html).toContain(`Act 1 won in 7 of ${budget} moves`);
    expect(html).toContain(RELICS[bonusRelic(waiting)]!.name);
    expect(html).toContain(`+${BONUS_SCRAP} scrap`);
    expect(html).toContain('data-bonus');
    const empty = bonusHtml(MAP, { ...waiting, relics: RELICS.map((_, code) => code) });
    expect(empty).toContain(`+${BONUS_SCRAP} scrap`);
    expect(empty).not.toContain('data-relic');
  });

  it('shows the budget and the count on the map and in the fights, while the room is open or shut', () => {
    const map = (spent: number[]): string => movesLine(MAP, { ...fresh, spent });
    expect(map([3, 0, 0, 0])).toBe(`moves 3 of ${budget} · bonus room open`);
    expect(map([budget, 0, 0, 0])).toBe(`moves ${budget} of ${budget} · bonus room open`);
    expect(map([budget + 1, 0, 0, 0])).toBe(`moves ${budget + 1} of ${budget} · bonus room closed`);
    expect(mapHtml(MAP, { ...fresh, spent: [3, 0, 0, 0] })).toContain(`<p class="run-help run-moves">moves 3 of ${budget} · bonus room open</p>`);
    expect(runLine(MAP, { ...fresh, spent: [3, 0, 0, 0] })).not.toContain('moves'); // the run line is the same as before
    const fight = { ...pick({ ...fresh, spent: [3, 0, 0, 0] }, 0), moves: [TURN, TURN, TURN] };
    expect(movesLine(MAP, fight)).toBe(`moves 5 of ${budget} · bonus room open`); // the fight on counts too
    expect(movesLine(MAP, { ...fight, spent: [budget, 0, 0, 0] })).toBe(`moves ${budget + 2} of ${budget} · bonus room closed`);
    expect(movesLine(MAP, { ...at({ ...fresh, spent: [3, 2, 0, 0] }, 0, 2) })).toBe(`moves 2 of ${MOVE_BUDGET[1]} · bonus room open`); // after the boss, the next act's
  });

  it('shows nothing for a run saved before it, in the boss fight, once the room waits or the run is over', () => {
    const fight = pick({ ...fresh, spent: [3, 0, 0, 0] }, 0);
    expect(movesLine(MAP, { ...fight, spent: [] })).toBe('');
    expect(mapHtml(MAP, { ...fresh, spent: [] })).not.toContain('run-moves');
    expect(movesLine(MAP, { ...fight, path: [0, 2] })).toBe(''); // the boss fight itself
    expect(movesLine(MAP, visit(MAP, reached([1, 0, 0, 0]), 2))).toBe('');
    expect(movesLine(MAP, { ...fresh, end: 'lost' })).toBe('');
  });

  it('is saved and loaded, a run saved before it has no count and no room, a bad one does not load', async () => {
    const store = memoryStore();
    const mapOf = (): MapNode[] => MAP;
    const waiting = visit(MAP, reached([4, 0, 0, 0]), 2);
    await saveRun(store, waiting);
    expect((await loadRun(store, mapOf, engine))!.state).toEqual(waiting);
    await saveRun(store, { ...fresh, spent: [1, 2, 3, 4] });
    expect((await loadRun(store, mapOf, engine))!.state.spent).toEqual([1, 2, 3, 4]);
    const { spent: _s, bonus: _b, ...older } = fresh;
    await store.put(RUN_KEY, older);
    expect((await loadRun(store, mapOf, engine))!.state).toMatchObject({ spent: [], bonus: false });
    for (const bad of [{ spent: [1, 2, 3] }, { spent: [0, 0, 0, -1] }, { spent: [0, 0, 0, 10000] }, { spent: [0, 0, 0, 1.5] }, { spent: 'x' }, { bonus: 'x' }]) {
      await store.put(RUN_KEY, { ...fresh, ...bad });
      expect(await loadRun(store, mapOf, engine)).toBeNull();
    }
  });
});

describe('roguelite scrolls of power (#1471)', () => {
  const parse = (html: string): Document => new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  // The two-act map of the Collector tests: a fight 0, an elite 1, the boss 2; then a fight 3, an elite 4, the last boss 5.
  const TWO = parseMap([[0, 0, 0, 0, 1, 0, 0], [0, 1, 0, 2, 1, 0, 0], [0, 2, 0, 1, 0, 0, 0], [1, 0, 0, 0, 1, 0, 0], [1, 1, 0, 2, 1, 0, 0], [1, 2, 0, 1, 0, 0, 0]].flat());
  const fresh = (state: Partial<Run> = {}): Run => ({ ...newRun(1, 0, []), exits: false, ...state });
  const won = (path: number[], state: Partial<Run> = {}): Run => fightOver(TWO, { ...pick(fresh(state), path[path.length - 1]!), path }, true, 0);

  it('names three affinities, each with the rule of its two levels', () => {
    expect(AFFINITIES.map((a) => a.name)).toEqual(['Force', 'Tactics', 'Chaos']);
    expect(AFFINITIES.map((a) => a.kinds)).toEqual(['Heavy, Heavy+', 'Anchor, Anchor+, Shield', 'Spark, Spark+, Bomb']);
    expect(AFFINITIES.every((a) => a.levels.length === MAX_AFFINITY)).toBe(true);
    expect(AFFINITIES[0]!.levels).toEqual(['Heavy and Heavy+ weigh 1 more in a push', 'Heavy and Heavy+ weigh 2 more in a push']);
  });

  it('an act boss beaten opens the scroll, an elite, a fight, the last boss and a lost fight do not', () => {
    expect(won([0, 1, 2])).toMatchObject({ scroll: true, end: '' });
    expect(won([0, 1])).toMatchObject({ scroll: false });
    expect(won([0])).toMatchObject({ scroll: false });
    expect(won([0, 1, 2, 3, 4])).toMatchObject({ scroll: false });
    expect(won([0, 1, 2, 3, 4, 5])).toMatchObject({ scroll: false, end: 'won' });
    expect(fightOver(TWO, { ...pick(fresh(), 2), path: [0, 1, 2] }, false, 0)).toMatchObject({ scroll: false, end: 'lost' });
    expect(won([0, 1, 2], { affinities: [2, 2, 2] }).scroll).toBe(false); // nothing left to grow
  });

  it('offers the affinities below their top level, in order, only while a scroll waits', () => {
    expect(scrollOffers(fresh())).toEqual([]);
    expect(scrollOffers(fresh({ scroll: true }))).toEqual([0, 1, 2]);
    expect(scrollOffers(fresh({ scroll: true, affinities: [2, 1, 0] }))).toEqual([1, 2]);
    expect(scrollOffers(fresh({ scroll: true, affinities: [2, 2, 2] }))).toEqual([]);
  });

  it('a scroll taken grows its affinity by one level and closes the offer', () => {
    const room = fresh({ scroll: true, affinities: [0, 1, 0] });
    expect(takeScroll(room, 1)).toEqual({ ...room, affinities: [0, 2, 0], scroll: false });
    expect(takeScroll(room, 0).affinities).toEqual([1, 1, 0]);
    expect(takeScroll({ ...room, affinities: [0, 2, 0] }, 1)).toEqual({ ...room, affinities: [0, 2, 0] }); // at its top
    expect(takeScroll(room, 3)).toBe(room); // no such affinity
    expect(takeScroll({ ...room, scroll: false }, 0)).toEqual({ ...room, scroll: false }); // no scroll waits
  });

  it('the map waits for the scroll', () => {
    const room = won([0, 1, 2], { reward: false });
    const clear = { ...room, reward: false, relic: false, collector: false };
    expect(choices(TWO, clear)).toEqual([]);
    expect(choices(TWO, { ...clear, scroll: false })).toEqual([3]);
  });

  it('the engine gets the levels with the relics, 2 bits each from bit 16', () => {
    expect(relicMask(fresh())).toBe(0);
    expect(relicMask(fresh({ affinities: [1, 2, 0] }))).toBe((1 << 16) | (2 << 18));
    expect(relicMask(fresh({ relics: [Relic.Gyroscope], affinities: [0, 0, 2] }))).toBe(1 | (2 << 20));
  });

  it('the scroll screen: a button per scroll with the rule of the next level, the kinds it grows and its glyph', () => {
    const doc = parse(scrollHtml(TWO, fresh({ scroll: true, affinities: [1, 0, 0], path: [0, 1, 2] })));
    expect(doc.querySelector('.run-line')!.textContent).toBe('Act 1 done · pick a scroll of power');
    const buttons = [...doc.querySelectorAll<HTMLButtonElement>('button[data-scroll]')];
    expect(buttons.map((b) => b.dataset.scroll)).toEqual(['0', '1', '2']);
    expect(buttons[0]!.textContent).toBe('Force 2 (Heavy, Heavy+): Heavy and Heavy+ weigh 2 more in a push');
    expect(buttons[1]!.textContent).toBe('Tactics 1 (Anchor, Anchor+, Shield): the Anchor keeps the marble in front of it on the board, like an Anchor+');
    expect(buttons[2]!.textContent).toBe('Chaos 1 (Spark, Spark+, Bomb): the burst of a Spark or a Bomb pushes 1 cell further');
    expect(buttons.every((b) => b.querySelector('svg') !== null)).toBe(true);
    const topped = parse(scrollHtml(TWO, fresh({ scroll: true, affinities: [2, 0, 2], path: [0, 1, 2] })));
    expect([...topped.querySelectorAll<HTMLButtonElement>('button[data-scroll]')].map((b) => b.dataset.scroll)).toEqual(['1']);
  });

  it('the affinity bar: nothing before the first scroll, then a glyph and level per affinity grown, its rule as its tooltip', () => {
    expect(affinityBarHtml(fresh())).toBe('');
    const bar = parse(affinityBarHtml(fresh({ affinities: [2, 0, 1] })));
    const chips = [...bar.querySelectorAll<HTMLElement>('.affinity')];
    expect(chips.map((c) => c.textContent)).toEqual(['2', '1']);
    expect(chips.map((c) => c.title)).toEqual([
      'Force 2: Heavy and Heavy+ weigh 2 more in a push',
      'Chaos 1: the burst of a Spark or a Bomb pushes 1 cell further',
    ]);
    expect(chips[0]!.getAttribute('aria-label')).toBe(chips[0]!.title);
    expect(chips[0]!.querySelector('svg')).not.toBeNull();
    expect(bar.querySelector('[role="group"]')!.getAttribute('aria-label')).toBe('Affinities');
  });
});

// The start screen (#1524, docs/specs/roguelite.md section 29): what a run is and how it ends, one Start button, and the rest behind More.
describe('the start screen (#1524)', () => {
  const parse = (html: string): Document => new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const book = '<div class="run-book"><button type="button" data-daily="1">Daily run</button></div>';
  const screen = (run: Run, more: boolean): Document => parse(mapHtml(MAP, run, book, undefined, more));
  const start = (): Run => chooseCommander(newRun(1, 1, LEGACY_UNLOCKED, 3), 0);
  const DETAILS = ['button[data-commander]', 'button[data-ascension]', '.run-book', '.run-ascension', '.run-commanders'];

  it('says in two sentences what a run is and how it is won and lost, above one Start button and a More button', () => {
    const doc = screen(start(), false);
    expect(doc.querySelector('.run-intro')!.textContent).toBe(
      'A run is a climb through 3 acts of fights with the army you keep: marbles lost stay lost. Beat the act 3 boss to win; lose a fight, or fall below 4 marbles, and the run is over.',
    );
    expect(doc.querySelectorAll('#run-start')).toHaveLength(1);
    expect(doc.querySelector('#run-start')!.textContent).toBe('Start');
    const more = doc.querySelector<HTMLButtonElement>('button[data-more]')!;
    expect([more.textContent, more.getAttribute('aria-expanded')]).toEqual(['More', 'false']);
    const html = mapHtml(MAP, start(), book, undefined, false);
    expect(html.indexOf('run-intro')).toBeLessThan(html.indexOf('id="run-start"'));
    expect(html.indexOf('id="run-start"')).toBeLessThan(html.indexOf('data-flask'));
    expect(html.indexOf('data-flask')).toBeLessThan(html.indexOf('run-graph'));
  });

  it('keeps the commander, ascension, runes, blueprints, unlocks and the book behind More, and the flask and the map out', () => {
    const doc = screen(start(), false);
    for (const detail of DETAILS) expect(doc.querySelector(detail), detail).toBeNull();
    for (const text of ['Special marbles in rewards', 'Runes to find', 'Blueprints to bank', 'Starts with']) expect(doc.body.textContent).not.toContain(text);
    expect(doc.querySelector('button[data-flask]')).not.toBeNull();
    expect(doc.querySelectorAll('button[data-node]').length).toBeGreaterThan(5);
    expect(doc.querySelector('.run-picks')!.textContent).toBe('Commander: The Captain'); // the choices the Start takes
  });

  it('shows all of it once More is open, and the button says so', () => {
    const doc = screen(start(), true);
    const more = doc.querySelector<HTMLButtonElement>('button[data-more]')!;
    expect([more.textContent, more.getAttribute('aria-expanded')]).toEqual(['Less', 'true']);
    for (const detail of DETAILS) expect(doc.querySelector(detail), detail).not.toBeNull();
    expect(doc.querySelectorAll('button[data-ascension]')).toHaveLength(MAX_ASCENSION + 1);
    for (const text of ['Special marbles in rewards', 'Runes to find', 'Blueprints to bank', 'Starts with']) expect(doc.body.textContent).toContain(text);
    expect(doc.querySelector('.run-more')!.contains(doc.querySelector('.run-book'))).toBe(true);
    expect(doc.querySelector('.run-more')!.contains(doc.querySelector('button[data-flask]'))).toBe(false);
    expect(doc.querySelector('#run-start')).not.toBeNull(); // Start stays in reach
  });

  it('names the choices a run has already, the level too, and nothing when none is made', () => {
    expect(screen(chooseAscension(chooseCommander(newRun(1, 1, LEGACY_UNLOCKED, 3), 1), 2), false).querySelector('.run-picks')!.textContent).toBe('Commander: The Warden · Ascension 2');
    expect(screen(newRun(1, 0, LEGACY_UNLOCKED), false).querySelector('.run-picks')).toBeNull();
    expect(screen(dailyRun('2026-11-06', 5), false).querySelector('.run-picks')!.textContent).toBe('Commander: The Captain'); // a daily run plays with the Captain
  });

  it('is the start only: a run on, or over, has no intro, no Start and no More', () => {
    for (const run of [at(start(), 0), { ...start(), end: 'lost' as const }]) {
      const doc = screen(run, false);
      for (const selector of ['.run-intro', '#run-start', 'button[data-more]', '.run-more']) expect(doc.querySelector(selector), selector).toBeNull();
    }
  });
});

describe('the town line of the banked blueprints (#1622)', () => {
  it('says no blueprint when the last dungeon banked none', () => {
    expect(bankedTownLine([])).toBe('No blueprint banked yet.');
  });

  it('lists each blueprint the last dungeon banked on its own line, with its type and rule', () => {
    expect(bankedTownLine([1, 6])).toBe(`Banked by the last dungeon:<br>${blueprintText(1)}<br>${blueprintText(6)}`);
  });
});

describe('nearestGap (#1543)', () => {
  it('takes the gap nearest the link, the first of two as near', () => {
    expect(nearestGap([33, 66], 70)).toBe(66);
    expect(nearestGap([33, 66], 30)).toBe(33);
    expect(nearestGap([25, 75], 50)).toBe(25);
  });
});
