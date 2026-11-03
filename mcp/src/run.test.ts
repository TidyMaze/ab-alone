import { describe, expect, test } from 'vitest';
import {
  actBoss,
  choices,
  claim,
  fightOver,
  foePlan,
  loadRun,
  newRun,
  offers,
  parseMap,
  RUN_KEY,
  tacticOffer,
  visit,
  type MapNode,
  type Run,
} from '../../client/src/roguelite';
import { memoryStore } from '../../client/src/savegame';
import { bossIds, newEncounter, newEngine, runRules } from './engine';
import { Session, type Result, type ToolError } from './game';
import { RogueRun, type RunRules, type RunState } from './run';

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`expected a value, got ${JSON.stringify(result.error)}`);
  return result.value;
}

function failure(result: Result<unknown>): ToolError {
  if (result.ok) throw new Error(`expected an error, got ${JSON.stringify(result.value)}`);
  return result.error;
}

function noNetwork(): never {
  throw new Error('no network in a local game');
}

/** Small so the suite stays fast: the bot searches this many positions in a fight. */
const CHEAP = 30;

/** `engine` that reports a win once a move is played, `lost` marbles ejected from the army. */
function wonOnFirstMove<T extends object>(engine: T, lost = 0): T {
  let played = false;
  return new Proxy(engine, {
    get(target, key) {
      const member = Reflect.get(target, key) as unknown;
      if (key === 'play') {
        return (mv: Int32Array) => {
          (member as (mv: Int32Array) => void).call(target, mv);
          played = true;
        };
      }
      if (played && (key === 'status' || key === 'result')) return () => 1;
      if (key === 'ejected') return (side: number) => (side === 2 ? lost : (member as (side: number) => number).call(target, side));
      return typeof member === 'function' ? member.bind(target) : member;
    },
  });
}

/** The real rules of the engine; with `won`, every fight is won by the first move. `calls` records what the run asked for. */
function rules(won = true, lost = 0) {
  const real = runRules();
  const calls = { fights: [] as unknown[][], bosses: [] as unknown[][], nodes: [] as number[] };
  const made: RunRules = {
    ...real,
    fight: (...args) => {
      calls.fights.push(args);
      const engine = real.fight(...args);
      const spied = new Proxy(engine, {
        get(target, key) {
          if (key === 'best_move') {
            return (nodes: number) => {
              calls.nodes.push(nodes);
              return target.best_move(nodes);
            };
          }
          const member = Reflect.get(target, key) as unknown;
          return typeof member === 'function' ? member.bind(target) : member;
        },
      });
      return won ? wonOnFirstMove(spied, lost) : spied;
    },
    boss: (...args) => {
      calls.bosses.push(args);
      const boss = real.boss(...args);
      return won ? wonOnFirstMove(boss, lost) : boss;
    },
  };
  return { made, calls };
}

function setup(won = true, lost = 0) {
  const session = new Session(newEngine, newEncounter, noNetwork);
  const { made, calls } = rules(won, lost);
  return { session, run: new RogueRun(made, session, bossIds), calls };
}

const FIRST_MOVE = '(1,3)>NE';
const mapOf = (seed: number): MapNode[] => parseMap(runRules().run_map(seed));
const SEEDS = Array.from({ length: 40 }, (_, seed) => seed);

/** The nodes picked to reach the first node `target` says yes to, or null. */
function pathTo(map: MapNode[], target: (node: MapNode, index: number) => boolean, from: number[] = []): number[] | null {
  for (const n of choices(map, { ...newRun(0, 0, []), path: from })) {
    if (target(map[n]!, n)) return [...from, n];
    const deeper = pathTo(map, target, [...from, n]);
    if (deeper) return deeper;
  }
  return null;
}

/** A run of the first seed that has a node of `kind`, standing on that node with `patch` (the node's own screen waiting). */
function at(kind: MapNode['kind'], patch: Partial<Run> = {}): Run {
  for (const seed of SEEDS) {
    const path = pathTo(mapOf(seed), (n) => n.kind === kind);
    if (path) return { ...newRun(seed, 3, []), path, ...patch };
  }
  throw new Error(`no seed has a ${kind} node`);
}

/** A run standing before the first node of `kind`, and that node. */
function before(kind: MapNode['kind'], patch: Partial<Run> = {}): { save: Run; node: number } {
  const full = at(kind);
  return { save: { ...full, path: full.path.slice(0, -1), ...patch }, node: full.path[full.path.length - 1]! };
}

/** A run of seed 0 with the last act's boss to fight. */
function lastBoss(): Run {
  const map = mapOf(0);
  return { ...newRun(0, 3, []), path: pathTo(map, (_, i) => i === map.length - 1)!, fighting: true };
}

describe('before a run is started', () => {
  test('every tool says there is no run', () => {
    const { run } = setup();
    const refused = [
      run.state({}),
      run.pick({ node: 0 }),
      run.place({ q: 0, r: 2, kind: 'Heavy' }),
      run.choose({ choice: 0 }),
      run.tactic({ tactic: 'Freeze' }),
      run.save(),
    ];
    for (const result of refused) expect(failure(result).code).toBe('no_run');
  });
});

describe('new_run', () => {
  test('starts the run of a seed on its map: 14 marbles, the first row of fights to pick', () => {
    const { run } = setup();
    const state = value(run.newRun({ seed: 0 }));
    expect(state).toMatchObject({
      screen: 'map',
      seed: 0,
      army: 14,
      specials: {},
      relics: [],
      tactics: [],
      scrap: 0,
      cells: 0,
      carried: [],
      banked: [],
      nodes: [
        { node: 0, kind: 'fight' },
        { node: 1, kind: 'fight' },
        { node: 2, kind: 'fight' },
      ],
    });
    expect(state.line).toBe('Rogue-lite run · army 14 marbles · pick a fight');
  });

  test('best and unlocked are what the run starts with, as the browser would have banked them', () => {
    const { run } = setup();
    value(run.newRun({ seed: 5, best: 2, unlocked: [0, 6] }));
    expect(value(run.save())).toMatchObject({ seed: 5, best: 2, unlocked: [0, 6] });
    value(run.newRun({}));
    expect(value(run.save())).toMatchObject({ seed: 0, best: 0, unlocked: [] });
  });

  test('state with map lists every node, its kind and the nodes it leads to', () => {
    const { run } = setup();
    value(run.newRun({ seed: 0 }));
    const map = value(run.state({ map: true })).map!;
    expect(map).toHaveLength(mapOf(0).length);
    expect(map[0]).toBe('0: act 1 row 1 fight -> 3,4');
    expect(map[3]).toBe('3: act 1 row 2 rest -> 5');
    expect(map[7]).toBe('7: act 1 row 4 boss -> 8,9,10');
    expect(map[mapOf(0).length - 1]).toMatch(/boss -> end$/);
    expect(value(run.state({})).map).toBeUndefined();
  });

  test('an elite and a formation are named on the map', () => {
    const { run } = setup();
    const seed = SEEDS.find((s) => mapOf(s).some((n) => n.elite))!;
    value(run.newRun({ seed }));
    const rows = value(run.state({ map: true })).map!;
    expect(rows.find((row) => row.includes(' elite '))).toMatch(/elite \(The (Wall|Artificer|Brute)/);
    expect(rows.some((row) => /fight \(.* · .*\)/.test(row) || /fight \(\w/.test(row))).toBe(true);
  });
});

describe('the same seed and the same choices give the same run as the client', () => {
  test('a scripted path: a fight won, its reward, the next fight', async () => {
    const { run, session } = setup();
    const map = mapOf(0);
    value(run.newRun({ seed: 0, best: 3 }));
    let expected = newRun(0, 3, []);

    // pick a fight: the army and the bot's plan are the bridge's
    value(run.pick({ node: 0 }));
    expected = visit(map, expected, 0);
    expect(session.getState()).toMatchObject({ ok: true, value: { mode: 'bot' } });

    // win it, with two marbles lost
    const lost = setup(true, 2);
    value(lost.run.newRun({ seed: 0, best: 3 }));
    value(lost.run.pick({ node: 0 }));
    value(lost.session.playMove({ move: FIRST_MOVE }));
    const state = value(lost.run.state({}));
    expect(state.screen).toBe('reward');
    expect(state.army).toBe(12);
    expected = fightOver(map, expected, true, 2);
    expect(value(lost.run.save())).toEqual(expected);

    // take the first reward, then pick the next node
    const offered = offers(expected);
    expect(state.options!.map((o) => o.choice)).toEqual(Array.from({ length: offered.length + Number(tacticOffer(expected) > 0) }, (_, i) => i));
    value(lost.run.choose({ choice: 0 }));
    expected = claim(expected, offered[0]!);
    expect(value(lost.run.save())).toEqual(expected);
    const next = choices(map, expected);
    expect(value(lost.run.state({})).nodes!.map((n) => n.node)).toEqual(next);
    value(lost.run.pick({ node: next[0]! }));
    expected = visit(map, expected, next[0]!);
    expect(value(lost.run.save())).toEqual(expected);

    // the save is the client's: it loads it back, the map walked
    const store = memoryStore();
    await store.put(RUN_KEY, value(lost.run.save()));
    const loaded = await loadRun(store, (seed) => mapOf(seed), () => newEngine());
    expect(loaded?.state).toEqual(expected);
  });

  test('the bot of a fight is the bridge plan of the node, one marble less with the Saboteur', () => {
    const { run, calls } = setup();
    const seed = 3;
    const map = mapOf(seed);
    value(run.newRun({ seed, save: undefined }));
    value(run.pick({ node: 0 }));
    const plan = foePlan(map, { ...newRun(seed, 0, []), path: [0] }, (node, less) => runRules().run_foes(seed, node, less));
    expect(calls.fights[0]).toEqual([14, plan, [], 0]);
    const saboteur = { ...newRun(seed, 0, []), relics: [8] };
    value(run.newRun({ save: saboteur }));
    value(run.pick({ node: 0 }));
    expect(calls.fights[1]![1]).toEqual(foePlan(map, { ...saboteur, path: [0] }, (node, less) => runRules().run_foes(seed, node, less)));
    expect(calls.fights[1]![3]).toBe(1 << 8);
  });
});

describe('pick', () => {
  test('refuses a node that is not on the map to pick now', () => {
    const { run } = setup();
    value(run.newRun({ seed: 0 }));
    expect(failure(run.pick({ node: 3 })).code).toBe('bad_choice');
    expect(failure(run.pick({ node: 999 })).code).toBe('bad_choice');
  });

  test('a fight starts as the session game: the agent is Black against the bot, 10 marbles for a fight node', () => {
    const { run, session } = setup();
    value(run.newRun({ seed: 0 }));
    const state = value(run.pick({ node: 0 }));
    expect(state.screen).toBe('fight');
    expect(state.fight).toMatchObject({ kind: 'fight', bot_nodes: 20000, placed: [] });
    expect(state.nodes).toBeUndefined();
    const game = value(session.getState());
    expect(game.mode).toBe('bot');
    expect(game.game_id).toBe(state.fight!.game);
    expect(game.board.split('W')).toHaveLength(11);
    expect(state.line).toContain('act 1 fight');
    expect(failure(run.pick({ node: 1 })).code).toBe('not_now');
  });

  test('an elite has 14 marbles and a search twice as long, a quarter less with the Jammer', () => {
    const elite = at('elite', { fighting: false, path: before('elite').save.path });
    const { run, calls, session } = setup(false);
    value(run.newRun({ save: elite, bot_nodes: 100 }));
    const node = before('elite').node;
    const state = value(run.pick({ node }));
    expect(state.fight).toMatchObject({ kind: 'elite', bot_nodes: 200 });
    expect(state.fight!.foes).toMatch(/The (Wall|Artificer|Brute)/);
    expect(value(session.getState()).board.split('W').length).toBeGreaterThan(11);
    value(session.playMove({ move: FIRST_MOVE }));
    expect(calls.nodes).toEqual([200]);
    value(run.newRun({ save: { ...elite, relics: [3] }, bot_nodes: 100 }));
    expect(value(run.pick({ node })).fight!.bot_nodes).toBe(150);
  });

  test('a boss node is the act boss of the run at its act strength, with no placement', () => {
    const { save, node } = before('boss', { specials: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
    const { run, calls, session } = setup(false);
    value(run.newRun({ save }));
    const state = value(run.pick({ node }));
    const boss = actBoss(mapOf(save.seed), { ...save, path: [...save.path, node], fighting: true }, bossIds())!;
    expect(state.screen).toBe('fight');
    expect(state.fight).toMatchObject({ kind: 'boss', boss: { id: boss.id, strength: boss.percent } });
    expect(calls.bosses).toEqual([[boss.id, boss.seed, boss.percent]]);
    expect(value(session.getState())).toMatchObject({ mode: 'boss', boss: { id: boss.id } });
    expect(failure(run.place({ q: 0, r: 2, kind: 'Heavy' })).code).toBe('not_now');
    expect(failure(run.tactic({ tactic: 'Freeze' })).code).toBe('not_now');
  });

  test.each([
    ['rest', 'rest'],
    ['shop', 'shop'],
    ['treasure', 'relic'],
  ] as const)('a %s node waits for its choice on the %s screen', (kind, screen) => {
    const { save, node } = before(kind);
    const { run } = setup();
    value(run.newRun({ save }));
    const state = value(run.pick({ node }));
    expect(state.screen).toBe(screen);
    expect(state.options!.length).toBeGreaterThan(0);
    expect(state.nodes).toBeUndefined();
  });

  test('an unknown node turns into the event, fight or treasure the client draws for it', () => {
    const { save, node } = before('unknown');
    const { run } = setup();
    value(run.newRun({ save }));
    const state = value(run.pick({ node }));
    const expected = visit(mapOf(save.seed), save, node);
    const screen = expected.event ? 'event' : expected.fighting ? 'fight' : expected.relic ? 'relic' : 'map';
    expect(state.screen).toBe(screen);
  });
});

describe('the screens that wait for a choice', () => {
  test('a reward: the marble and special marbles offered, the tactic after them', () => {
    const save = at('fight', { reward: true, army: 12 });
    const { run } = setup();
    const state = value(run.newRun({ save }));
    expect(state.screen).toBe('reward');
    expect(state.options![0]).toEqual({ choice: 0, text: expect.any(String), ok: true });
    const tactic = tacticOffer(save);
    expect(state.options).toHaveLength(offers(save).length + Number(tactic > 0));
    if (tactic) expect(state.options!.at(-1)!.text).toMatch(/^(Reinforce|Freeze|Swap|Fall back):/);
    const marble = offers(save).indexOf(0);
    expect(state.options![marble]!.text).toBe('One more marble');
    expect(value(run.choose({ choice: marble })).army).toBe(13);
    expect(value(run.state({})).screen).toBe('map');
  });

  test('the tactic offer is taken in place of the other rewards', () => {
    const save = at('fight', { reward: true, army: 12 });
    const { run } = setup();
    value(run.newRun({ save }));
    const state = value(run.choose({ choice: offers(save).length }));
    expect(state.tactics).toHaveLength(1);
    expect(state.screen).toBe('map');
  });

  test('a relic offer: the relics to pick from are named with their rule', () => {
    const save = at('elite', { relic: true });
    const { run } = setup();
    const state = value(run.newRun({ save }));
    expect(state.screen).toBe('relic');
    expect(state.options).toHaveLength(1);
    expect(state.options![0]!.text).toMatch(/^[A-Z][\w ]+: /);
    const after = value(run.choose({ choice: 0 }));
    expect(after.relics).toHaveLength(1);
    expect(after.screen).toBe('map');
  });

  test('an event: its title, its choices with what they give, an unpayable one refused', () => {
    const save = at('fight', { event: true, army: 4 });
    const { run } = setup();
    const state = value(run.newRun({ save }));
    expect(state.screen).toBe('event');
    expect(state.title).toMatch(/^[A-Z][\w' -]+: /);
    expect(state.options!.at(-1)).toMatchObject({ text: 'Leave', ok: true });
    const costly = state.options!.findIndex((o) => !o.ok);
    expect(costly).toBeGreaterThanOrEqual(0);
    expect(failure(run.choose({ choice: costly })).code).toBe('bad_choice');
    expect(value(run.state({})).screen).toBe('event');
    const left = value(run.choose({ choice: state.options!.length - 1 }));
    expect(left.screen).toBe('map');
    expect(left.title).toBeUndefined();
  });

  test('an event choice that is taken is told on the map until the next node', () => {
    const save = at('fight', { event: true });
    const { run } = setup();
    const state = value(run.newRun({ save }));
    const sure = state.options!.findIndex((o, i) => o.ok && i < state.options!.length - 1);
    const after = value(run.choose({ choice: sure }));
    expect(after.told).toMatch(/^[A-Z]/);
    expect(after.screen).toBe('map');
  });

  test('a rest site: rest back to 14 marbles, or upgrade a plain special marble', () => {
    const save = at('rest', { rest: true, army: 9, specials: [1, 0, 2, 0, 0, 0, 0, 0, 0, 0] });
    const { run } = setup();
    const state = value(run.newRun({ save }));
    expect(state.screen).toBe('rest');
    expect(state.options!.map((o) => o.text)).toEqual([
      expect.stringMatching(/^Rest: back up to 14 marbles/),
      expect.stringMatching(/^Upgrade a Heavy: Heavy\+/),
      expect.stringMatching(/^Upgrade a Spark: Spark\+/),
    ]);
    const upgraded = value(run.choose({ choice: 2 }));
    expect(upgraded.specials).toEqual({ Heavy: 1, 'Spark+': 1, Spark: 1 });
    expect(upgraded.army).toBe(9);
    const again = setup();
    value(again.run.newRun({ save }));
    expect(value(again.run.choose({ choice: 0 })).army).toBe(14);
  });

  test('a shop: what it sells with the price, a purchase, the removal, Leave', () => {
    const save = at('shop', { shop: true, scrap: 500, army: 10, specials: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
    const { run } = setup();
    const state = value(run.newRun({ save }));
    expect(state.screen).toBe('shop');
    const texts = state.options!.map((o) => o.text);
    expect(texts[0]).toMatch(/^One more marble · \d+ scrap$/);
    expect(texts.some((t) => t.startsWith('Remove a Heavy: back to a plain marble · '))).toBe(true);
    expect(texts.at(-1)).toBe('Leave');
    const bought = value(run.choose({ choice: 0 }));
    expect(bought.army).toBe(11);
    expect(bought.scrap).toBeLessThan(500);
    expect(bought.options).toHaveLength(state.options!.length - 1);
    const removeAt = bought.options!.findIndex((o) => o.text.startsWith('Remove'));
    expect(value(run.choose({ choice: removeAt })).specials).toEqual({});
    const left = value(run.choose({ choice: value(run.state({})).options!.length - 1 }));
    expect(left.screen).toBe('map');
  });

  test('a shop with no scrap refuses what it sells', () => {
    const save = at('shop', { shop: true, scrap: 0, army: 10 });
    const { run } = setup();
    const state = value(run.newRun({ save }));
    expect(state.options![0]!.ok).toBe(false);
    expect(failure(run.choose({ choice: 0 })).code).toBe('bad_choice');
    expect(state.options!.some((o) => o.text.startsWith('Remove a special marble: none'))).toBe(false);
  });

  test('the Collector: bank a blueprint for the cells, or leave', () => {
    const save = at('boss', { collector: true, cells: 7, carried: [0, 6] });
    const { run } = setup();
    const state = value(run.newRun({ save }));
    expect(state.screen).toBe('collector');
    expect(state.carried).toEqual([0, 6]);
    expect(state.options![0]!.text).toMatch(/^Relic blueprint · /);
    expect(state.options![0]!.text).toContain('5 cells');
    expect(state.options!.at(-1)!.text).toBe('Leave');
    const banked = value(run.choose({ choice: 0 }));
    expect(banked).toMatchObject({ cells: 2, carried: [6], banked: [0], screen: 'collector' });
    expect(value(run.state({})).options![0]!.ok).toBe(false); // 2 cells left
    const left = value(run.choose({ choice: 1 }));
    expect(left.screen).toBe('map');
  });

  test('a choice that does not exist is refused, the screen stays', () => {
    const save = at('rest', { rest: true });
    const { run } = setup();
    value(run.newRun({ save }));
    expect(failure(run.choose({ choice: 9 })).code).toBe('bad_choice');
    expect(value(run.state({})).screen).toBe('rest');
  });

  test('choose on the map or in a fight says there is nothing to choose', () => {
    const { run } = setup();
    value(run.newRun({ seed: 0 }));
    expect(failure(run.choose({ choice: 0 })).code).toBe('not_now');
    value(run.pick({ node: 0 }));
    expect(failure(run.choose({ choice: 0 })).code).toBe('not_now');
  });
});

describe('the special marbles of a fight', () => {
  const heavies = (n: number, army = 14) => ({ ...at('fight', { fighting: true, army }), specials: [n, 0, 0, 0, 0, 0, 0, 0, 0, 0] });

  test('are placed on the army before the first move, taken back by a second press, and the first move starts the fight', () => {
    const { run, session } = setup(false);
    const state = value(run.newRun({ save: heavies(2), bot_nodes: CHEAP }));
    expect(state.screen).toBe('place');
    expect(state.fight).toMatchObject({ placed: [], left: { Heavy: 2 } });
    const first = value(run.place({ q: 0, r: 2, kind: 'Heavy' }));
    expect(first.fight).toMatchObject({ placed: ['(0,2) Heavy'], left: { Heavy: 1 } });
    expect(value(session.getState()).game_id).toBe(first.fight!.game);
    expect(value(run.place({ q: 0, r: 2, kind: 'Heavy' })).fight).toMatchObject({ placed: [], left: { Heavy: 2 } });
    value(run.place({ q: 0, r: 2, kind: 'Heavy' }));
    value(run.place({ q: -1, r: 2, kind: 'Heavy' }));
    expect(failure(run.place({ q: -2, r: 2, kind: 'Heavy' })).code).toBe('bad_choice'); // none left
    value(session.playMove({ move: FIRST_MOVE }));
    const fighting = value(run.state({}));
    expect(fighting.screen).toBe('fight');
    expect(fighting.fight!.placed).toEqual(['(-1,2) Heavy', '(0,2) Heavy']);
    expect(fighting.fight!.left).toBeUndefined();
    expect(failure(run.place({ q: 0, r: 2, kind: 'Heavy' })).code).toBe('not_now');
  });

  test('only on a marble of the army, of a type the army holds', () => {
    const { run } = setup(false);
    value(run.newRun({ save: heavies(1) }));
    expect(failure(run.place({ q: 0, r: 0, kind: 'Heavy' })).code).toBe('bad_choice'); // an empty cell
    expect(failure(run.place({ q: 0, r: -4, kind: 'Heavy' })).code).toBe('bad_choice'); // the bot's marble
    expect(failure(run.place({ q: 0, r: 2, kind: 'Spark' })).code).toBe('bad_choice');
    expect(failure(run.place({ q: 0, r: 2, kind: 'Gizmo' })).code).toBe('bad_choice');
  });

  test('the placement of a fight with no special marble is not asked', () => {
    const { run } = setup();
    value(run.newRun({ seed: 0 }));
    value(run.pick({ node: 0 }));
    expect(failure(run.place({ q: 0, r: 2, kind: 'Heavy' })).code).toBe('not_now');
  });

  test('the specials kept at the end of a won fight are those still on the board', () => {
    const { run, session } = setup(true);
    value(run.newRun({ save: heavies(2) }));
    value(run.place({ q: 0, r: 2, kind: 'Heavy' }));
    value(session.playMove({ move: FIRST_MOVE }));
    expect(value(run.state({})).specials).toEqual({ Heavy: 2 });
    expect(value(run.save()).placed).toEqual([]);
  });
});

describe('a fight ends the run or the node', () => {
  test('a lost fight ends the run: the end screen has the line and the unlocks', () => {
    const { run, session } = setup(false);
    value(run.newRun({ seed: 0 }));
    value(run.pick({ node: 0 }));
    value(session.resign());
    const state = value(run.state({}));
    expect(state.screen).toBe('lost');
    expect(state.line).toBe('Run lost · 14 marbles left');
    expect(state.summary).toContain('Fights: 0 won, 1 lost');
    expect(state.nodes).toBeUndefined();
    expect(failure(run.pick({ node: 3 })).code).toBe('not_now');
    expect(value(run.save()).end).toBe('lost');
  });

  test('the last boss won wins the run', () => {
    const { run, session } = setup(true);
    value(run.newRun({ save: lastBoss() }));
    expect(value(run.state({})).screen).toBe('fight');
    value(session.playMove({ move: FIRST_MOVE }));
    const state = value(run.state({}));
    expect(state.screen).toBe('won');
    expect(state.line).toMatch(/^Run won with 14 marbles/);
    expect(state.summary!.some((line) => line.startsWith('Fights: 12 won, 0 lost') || line.startsWith('Fights: '))).toBe(true);
  });

  test('a boss beaten before the last act goes on to the next act', () => {
    const map = mapOf(0);
    const path = pathTo(map, (n) => n.kind === 'boss')!;
    const { run, session } = setup(true);
    value(run.newRun({ save: { ...newRun(0, 3, []), path: path.slice(0, -1) } }));
    value(run.pick({ node: path.at(-1)! }));
    value(session.playMove({ move: FIRST_MOVE }));
    const state = value(run.state({}));
    expect(['relic', 'reward', 'collector', 'map']).toContain(state.screen);
    expect(state.army).toBe(14);
  });

  test('a new game while a fight is on drops the run, as leaving the mode does in the client', () => {
    const { run, session } = setup(false);
    value(run.newRun({ seed: 0 }));
    value(run.pick({ node: 0 }));
    value(session.newGame({}));
    expect(failure(run.state({})).code).toBe('no_run');
    expect(failure(run.save()).code).toBe('no_run');
    expect(failure(run.pick({ node: 3 })).code).toBe('no_run');
  });

  test('a new game after a fight, on the map, leaves the run alone', () => {
    const { run, session } = setup(true);
    value(run.newRun({ seed: 0 }));
    value(run.pick({ node: 0 }));
    value(session.playMove({ move: FIRST_MOVE }));
    value(session.newGame({}));
    expect(value(run.state({})).screen).toBe('reward');
  });
});

describe('tactics', () => {
  const holding = (tactics: number[], patch: Partial<Run> = {}): Run => at('fight', { fighting: true, tactics, army: 12, ...patch });

  test('Reinforce joins a marble and is spent; the turn stays with the agent', () => {
    const { run } = setup(false);
    value(run.newRun({ save: holding([1, 2]), bot_nodes: CHEAP }));
    const played = value(run.tactic({ tactic: 'Reinforce' }));
    expect(played.played).toBe('Reinforce');
    expect(played.reply).toBeNull();
    expect(played.state.tactics).toEqual(['Freeze']);
    expect(value(run.save()).tactics).toEqual([2]);
    expect(value(run.save()).moves).toEqual([[0, 1, 0, 0, 0, 0, 0, 0]]);
  });

  test('a Swap names two cells and costs the move: the bot replies', () => {
    const { run, session } = setup(false);
    value(run.newRun({ save: holding([3], { army: 14, specials: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0], placed: [[0, 2, 1]] }), bot_nodes: CHEAP }));
    expect(failure(run.tactic({ tactic: 'Swap' })).code).toBe('bad_choice'); // no cells
    value(session.playMove({ move: FIRST_MOVE }));
    const played = value(run.tactic({ tactic: 'Swap', a: [0, 2], b: [-1, 2] }));
    expect(played.played).toBe('Swap (0,2)(-1,2)');
    expect(played.reply).not.toBeNull();
    expect(played.state.tactics).toEqual([]);
  });

  test('a tactic the engine refuses is kept; one not held, or unknown, is a bad choice', () => {
    const { run } = setup(false);
    value(run.newRun({ save: holding([4]), bot_nodes: CHEAP }));
    expect(failure(run.tactic({ tactic: 'Fall back' })).code).toBe('illegal_move'); // nothing to undo yet
    expect(value(run.state({})).tactics).toEqual(['Fall back']);
    expect(failure(run.tactic({ tactic: 'Freeze' })).code).toBe('bad_choice');
    expect(failure(run.tactic({ tactic: 'Teleport' })).code).toBe('bad_choice');
  });

  test('none during the placement of special marbles', () => {
    const { run } = setup(false);
    value(run.newRun({ save: holding([1], { army: 14, specials: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] }) }));
    expect(failure(run.tactic({ tactic: 'Reinforce' })).code).toBe('not_now');
  });

  test('none on the map', () => {
    const { run } = setup();
    value(run.newRun({ seed: 0 }));
    expect(failure(run.tactic({ tactic: 'Reinforce' })).code).toBe('not_now');
  });
});

describe('save and resume', () => {
  test('a fight in progress resumes on its board, its moves replayed', () => {
    const first = setup(false);
    value(first.run.newRun({ seed: 0, best: 3, bot_nodes: CHEAP }));
    value(first.run.pick({ node: 0 }));
    value(first.session.playMove({ move: FIRST_MOVE }));
    const save = value(first.run.save());
    expect(save.fighting).toBe(true);
    expect(save.moves).toHaveLength(2); // the agent's move and the bot's reply
    const before = value(first.session.getState());

    const second = setup(false);
    const resumed = value(second.run.newRun({ save, bot_nodes: CHEAP }));
    expect(resumed.screen).toBe('fight');
    const after = value(second.session.getState());
    expect(after.board).toBe(before.board);
    expect(after.to_move).toBe('black');
    expect(value(second.run.save())).toEqual(save);
  });

  test('a save of the client with a boss fight in progress starts the boss fight over', () => {
    const { save } = before('boss');
    const full = { ...save, path: [...save.path, before('boss').node], fighting: true };
    const { run, session } = setup(false);
    expect(value(run.newRun({ save: full })).screen).toBe('fight');
    expect(value(session.getState()).mode).toBe('boss');
  });

  test('a save that is not a run of the client, or walks off its map, is bad_save and the run is kept', () => {
    const { run } = setup();
    value(run.newRun({ seed: 4 }));
    expect(failure(run.newRun({ save: { seed: 1 } })).code).toBe('bad_save');
    expect(failure(run.newRun({ save: { ...newRun(1, 0, []), path: [5] } })).code).toBe('bad_save');
    expect(value(run.state({})).seed).toBe(4);
  });

  test('a save from before the Collector still loads, with its relics and tactics unlocked', () => {
    const old: Record<string, unknown> = { ...newRun(2, 0, []) };
    for (const key of ['unlocked', 'cells', 'carried', 'banked', 'drop', 'collector', 'told']) delete old[key];
    const { run } = setup();
    expect(value(run.newRun({ save: old })).screen).toBe('map');
    expect(value(run.save()).unlocked.length).toBeGreaterThan(0);
  });
});
