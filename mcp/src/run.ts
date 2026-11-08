// The rogue-lite run tools of docs/specs/mcp.md section 5 (#1469): start a run from a seed, read it, pick a node, place the
// special marbles, play the fight with the game tools, take the reward, relic, event, rest, shop and Collector choices, use a
// tactic. Every rule is the client's own (client/src/roguelite.ts, collector.ts: pure functions of the run seed) or the bridge's
// (`run_map`, `run_foes`, the army's `Engine`, the act boss), called in the order main.ts calls them, so the same seed and the
// same choices give the client's run, and `save_run` is the client's save. This holds the run, its map and the fight on, and
// turns the screens of the page into lists of options.
import { cellIndex } from '../../client/src/board';
import { COLLECT_COST } from '../../client/src/collector';
import {
  actBoss,
  AFFINITIES,
  scrollOffers,
  takeScroll,
  actsWon,
  BIOMES,
  chooseCommander,
  chooseExit,
  currentBiome,
  exitOffers,
  blueprintName,
  blueprintText,
  bonusRelic,
  BONUS_SCRAP,
  buy,
  choiceText,
  choices,
  claim,
  claimTactic,
  collect,
  earned,
  ELITES,
  eventOf,
  fightBudget,
  runNodes,
  foretold,
  fightOver,
  foePlan,
  keyOffers,
  KEYS,
  lastAct,
  FORMATIONS,
  leaveCollector,
  CHARGE_TEXT,
  drink,
  leaveShop,
  left,
  loadRun,
  moveCount,
  MAP_VERSION,
  newRun,
  offers,
  parseMap,
  parseSpecials,
  place,
  placing,
  relicMask,
  relicOffers,
  RELICS,
  RUNES,
  relicText,
  removable,
  removalPrice,
  resolve,
  rest,
  RUN_KEY,
  runLine,
  shopStock,
  SPECIAL_LOOKS,
  START_ARMY,
  tacticOffer,
  tacticRecord,
  TACTICS,
  tacticText,
  takeBonus,
  takeKey,
  takeRelic,
  upgrade,
  upgradable,
  useTactic,
  visit,
  removeSpecial,
  restLabel,
  type MapNode,
  type Run,
  type ShopItem,
} from '../../client/src/roguelite';
import { memoryStore } from '../../client/src/savegame';
import { BOT_NODES, type EncounterLike, type EngineLike, type ErrorCode, type Result, type ToolError } from './game';
import type { Session, State } from './game';

/** The bot's search in the run's fight: the peak `nodes` along the run's curve (#1611), then the elite and relic factors, as the page's. */
const budgetOf = (map: MapNode[], state: Run, nodes: number): number => fightBudget(map, state, runNodes(map, state, nodes));

/** What a run uses of the army's `Engine` in edgefall-wasm: a game against the bot and the special marbles still on its board. */
export interface RunEngine extends EngineLike {
  specials(): Int32Array;
}

/** What a run uses of an act boss `Encounter`: whether it takes the army's build (#1494) and the special marbles still on its board. */
export interface RunBoss extends EncounterLike {
  takes_build(): boolean;
  specials(): Int32Array;
}

/** What a run uses of edgefall-wasm. */
export interface RunRules {
  /** The map of a run seed of a player who owns the runes `runes` (default none): records of `[act, row, col, kind, links, formation, elite]`. */
  run_map(seed: number, runes?: number, version?: number): Int32Array;
  /** The bot's army at a node, `less` marbles short, in a biome: `[count, formation, biome, ...]` then `[q, r, kind]` per special marble. */
  run_foes(seed: number, node: number, less: number, biome: number, more?: number, version?: number): Int32Array;
  /** The codes of the two biomes the exits lead to for act `act` (1 or 2) of a run that left the biome `from`, a third with the rune of the exit. */
  run_exits(seed: number, act: number, from: number, runes?: number): Uint8Array;
  /** The army's fight: `army` marbles, the bot's `foes` (a count, or a plan of `run_foes`), the special marbles `placed` as `[q, r, kind]`, the relics as a bit mask. */
  fight(army: number, foes: number | number[], placed: number[][], relics: number): RunEngine;
  /** The act boss `id` of fight seed `seed`, at `percent` of its strength, with the special marbles `placed` and the relics of the army as a bit mask when it takes them. */
  boss(id: string, seed: number, percent: number, placed: number[][], relics: number): RunBoss;
}

type Cell = [q: number, r: number];

export type Screen = 'map' | 'place' | 'fight' | 'reward' | 'relic' | 'event' | 'rest' | 'shop' | 'scroll' | 'collector' | 'exit' | 'bonus' | 'won' | 'lost';

export interface NewRunInput {
  seed?: number;
  /** The most acts won in one run before this one: it unlocks special marble types (the browser keeps it), default 0. */
  best?: number;
  /** The blueprints banked in earlier runs, by id (`banked` of a run over): they widen the pools, default none. */
  unlocked?: number[];
  /** The runes the player owns, a bit mask (1 Rune of Stone, 2 Rune of Spark, 4 Rune of Might; the browser keeps them): they open a secret room, a shortcut and a secret exit on the map, default none. */
  runes?: number;
  /** The commander of the run, an index of COMMANDERS (0 the Captain), unlocked by `best` acts won: its special marbles and its relic. */
  commander?: number;
  /** Positions the bot searches per move in a fight (an elite twice that), default 20000. */
  bot_nodes?: number;
  /** Resume this run instead, the output of `save_run` or a save of the client: its fight replayed. */
  save?: unknown;
}

export interface StateInput {
  map?: boolean;
}

export interface PickInput {
  node: number;
}

export interface PlaceInput {
  q: number;
  r: number;
  kind: string;
}

export interface ChooseInput {
  choice: number;
}

export interface TacticInput {
  tactic: string;
  a?: Cell;
  b?: Cell;
}

/** One thing the screen offers: `ok` is false when it cannot be taken now (choosing it is refused). */
export interface Option {
  choice: number;
  text: string;
  ok: boolean;
}

export interface FightInfo {
  kind: 'fight' | 'elite' | 'boss';
  /** The bot's elite and formation, when it has any. */
  foes?: string;
  /** An act boss: its id and its strength in percent. */
  boss?: { id: string; strength: number };
  /** Positions the bot searches per move, not for a boss. */
  bot_nodes?: number;
  /** The id of the game of the fight: `get_state`, `legal_moves` and `play_move` play it. */
  game: string;
  /** The special marbles placed on the army, `(q,r) Heavy`. */
  placed: string[];
  /** While placing: the special marbles of each type still to place. */
  left?: Record<string, number>;
}

export interface RunState {
  screen: Screen;
  line: string;
  seed: number;
  army: number;
  /** The special marbles of the army by type. */
  specials: Record<string, number>;
  /** The biome of the act, none in the Meadow. */
  biome?: string;
  relics: string[];
  /** The levels of the affinities grown by scrolls (Force, Tactics, Chaos), none before the first scroll: the engine plays them in the army's fights. */
  affinities?: Record<string, number>;
  /** The runes owned (Rune of Stone, Spark, Might), none without one: a secret room, a shortcut and a secret exit on this run's map (#1476). */
  runes?: string[];
  /** The keys taken (Ruby, Sapphire, Emerald), none before the first: the three open act 4 (#1467). */
  keys?: string[];
  /** The fights left of a cursed chest's curse, none without it: each marble lost costs 2 (#1474). */
  curse?: number;
  /** The army's moves counted in the act (the fight on included) and the act's budget, for the bonus room before its boss (#1473); none
   * in a run saved before it, in a boss fight and once the room waits. */
  moves?: number;
  budget?: number;
  tactics: string[];
  /** The flask charges left: `run_flask` drinks one on the map (#1475). */
  flasks: number;
  scrap: number;
  cells: number;
  /** Blueprints dropped, not yet banked, by id. */
  carried: number[];
  /** Blueprints banked this run, by id: pass them as `unlocked` to the next run. */
  banked: number[];
  /** What the last event gave or cost, on the map until the next node. */
  told?: string;
  /** The nodes to pick, on the map. */
  nodes?: { node: number; kind: string }[];
  fight?: FightInfo;
  /** The event waiting: its title and text. */
  title?: string;
  options?: Option[];
  /** Once the run is over: the acts won in it and what it unlocked. */
  acts_won?: number;
  unlocked?: string[];
  /** With `map`: every node, `5: act 1 row 3 elite (The Wall · Wedge) -> 9,10`. */
  map?: string[];
}

export interface Tactic {
  played: string;
  /** The bot's reply when the tactic costs the move, else `null`. */
  reply: string | null;
  state: RunState;
}

/** The fight on: the engine, the moves played on it (both sides, tactics too) and the id of its game. */
interface Fight {
  engine: RunEngine | RunBoss;
  moves: number[][];
  game: string;
  boss: boolean;
  nodes: number;
}

interface Active {
  map: MapNode[];
  state: Run;
  /** The fight on, `null` between fights. */
  fight: Fight | null;
  /** The bot's search budget before the elite and the Jammer. */
  nodes: number;
}

/** A thing a screen offers, and the run after it is taken (the run itself when it cannot). */
interface Choice {
  text: string;
  apply: () => Run;
}

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (code: ErrorCode, message: string): Result<never> => ({ ok: false, error: { code, message } });
const text = ([q, r]: Cell): string => `(${q},${r})`;

/** The special marbles of the army on the board (the bot's own are not the army's, #1492), by type: the bridge's kind less 1. */
function kinds(engine: RunEngine | RunBoss): number[] {
  const board = engine.board();
  const mine = parseSpecials(engine.specials()).filter((s) => board[cellIndex(s.cell[0], s.cell[1])] === 1);
  return SPECIAL_LOOKS.map((_, k) => mine.filter((s) => s.kind === k + 1).length);
}

/** `engine`, every move played on it recorded in `moves` (the run's move list: the bot's replies and the tactics too), then
 * `played` told. */
function recording<T extends { play(mv: Int32Array): void }>(engine: T, moves: number[][], played: () => void): T {
  const play = (mv: Int32Array): void => {
    engine.play(mv);
    moves.push(Array.from(mv));
    played();
  };
  return new Proxy(engine, { get: (target, key) => (key === 'play' ? play : Reflect.get(target, key)) });
}

/** The special marbles of `counts` by name, none left out. */
const named = (counts: number[]): Record<string, number> =>
  Object.fromEntries(SPECIAL_LOOKS.flatMap((look, k) => (counts[k] ? [[look.name, counts[k]]] : [])));

const specialText = (kind: number): string => `${SPECIAL_LOOKS[kind - 1]!.name}: ${SPECIAL_LOOKS[kind - 1]!.help}`;

/** The one rogue-lite run of the server. */
export class RogueRun {
  private active: Active | null = null;

  constructor(
    private readonly rules: RunRules,
    private readonly session: Session,
    private readonly bossIds: () => string[],
  ) {}

  /** Starts the run of `seed`, or resumes `save`, and drops the run in progress. A bad save keeps it. */
  async newRun({ seed = 0, best = 0, unlocked = [], runes = 0, commander = 0, bot_nodes = BOT_NODES, save }: NewRunInput): Promise<Result<RunState>> {
    if (save === undefined) {
      const state = chooseCommander(newRun(seed, best, unlocked, 0, runes, MAP_VERSION), commander);
      if (state.commander !== commander) return fail('bad_choice', `commander ${commander} is not unlocked: best is ${best}`);
      this.active = { map: this.mapOf(seed, runes, MAP_VERSION), state, fight: null, nodes: bot_nodes };
      return ok(this.describe(this.active));
    }
    const store = memoryStore();
    await store.put(RUN_KEY, save);
    const loaded = await loadRun(store, (s, owned, version) => this.mapOf(s, owned, version), (state, map) => this.engineFor(state, map));
    if (!loaded) return fail('bad_save', 'not a run of the client, or it does not walk its map, or its fight does not replay');
    const active: Active = { map: loaded.map, state: loaded.state, fight: null, nodes: bot_nodes };
    if (loaded.engine) this.begin(active, loaded.engine, loaded.state.moves.map((mv) => [...mv]));
    this.active = active;
    return ok(this.describe(active));
  }

  /** The run's screen: what waits, the army, the relics and the tactics, and what to pick or choose. */
  state({ map = false }: StateInput): Result<RunState> {
    return this.withRun((active) => ok({ ...this.describe(active), ...(map ? { map: this.rows(active.map, active.state) } : {}) }));
  }

  /** The run in the client's save format (`saveRun` of client/src/roguelite.ts): `new_run` resumes it, the client loads it. */
  save(): Result<Run> {
    return this.withRun((active) => ok(active.state));
  }

  /** Picks a node of the map (`visit` of the client): its screen waits, or its fight starts as the session's game. */
  pick({ node }: PickInput): Result<RunState> {
    return this.withRun((active) => {
      if (this.screen(active) !== 'map') return fail('not_now', `the run is on its ${this.screen(active)} screen, not on the map`);
      if (!choices(active.map, active.state).includes(node)) return fail('bad_choice', `node ${node} is not one to pick now`);
      active.state = visit(active.map, active.state, node);
      if (active.state.fighting) this.begin(active, this.engineFor(active.state, active.map), []);
      return ok(this.describe(active));
    });
  }

  /** Places a special marble of type `kind` on the army's marble at `(q, r)` before the first move, or takes it back. */
  place({ q, r, kind }: PlaceInput): Result<RunState> {
    return this.withRun((active) => {
      if (this.screen(active) !== 'place') return fail('not_now', 'special marbles are placed before the first move of an army fight');
      const code = SPECIAL_LOOKS.findIndex((look) => look.name === kind) + 1;
      const mine = (active.fight!.engine as RunEngine).board()[cellIndex(q, r)] === 1;
      const next = code > 0 && mine ? place(active.state, [q, r], code) : active.state;
      if (next === active.state) return fail('bad_choice', `no ${kind} to place on ${text([q, r])}: a type the army holds and has left, on a marble of the army`);
      active.state = next;
      this.begin(active, this.engineFor(next, active.map), []);
      return ok(this.describe(active));
    });
  }

  /** Takes choice `choice` of the screen's options: a reward, a relic, an event choice, the rest site, the shop, the scroll of power, the Collector. */
  choose({ choice }: ChooseInput): Result<RunState> {
    return this.withRun((active) => {
      const menu = this.menu(active);
      if (!menu) return fail('not_now', `the ${this.screen(active)} screen has nothing to choose: see run_state`);
      const picked = menu[choice];
      const next = picked?.apply();
      if (!next || next === active.state) return fail('bad_choice', `choice ${choice} cannot be taken now`);
      active.state = next;
      if (next.fighting) this.begin(active, this.engineFor(next, active.map), []); // the bonus room's boss fight
      return ok(this.describe(active));
    });
  }

  /** Plays a tactic the run holds (`useTactic`): the engine judges it and keeps the tactic when it refuses. */
  tactic({ tactic, a, b }: TacticInput): Result<Tactic> {
    return this.withRun((active) => {
      const screen = this.screen(active);
      if (screen !== 'fight') return fail('not_now', 'tactics are played in a fight, after the special marbles are placed');
      const code = TACTICS.findIndex((t) => t.name === tactic) + 1;
      if (code === 0 || !active.state.tactics.includes(code)) return fail('bad_choice', `the run holds no tactic ${tactic}`);
      if (code === 3 && !(a && b)) return fail('bad_choice', 'a Swap names two cells of the army: a and b');
      const name = code === 3 ? `Swap ${text(a!)}${text(b!)}` : tactic;
      const played = this.session.playTactic(Int32Array.from(tacticRecord(code, a, b)), name);
      if (!played.ok) return played;
      active.state = useTactic(active.state, code);
      return ok({ played: name, reply: played.value.reply, state: this.describe(active) });
    });
  }

  /** Drinks a flask on the map (`drink`): 3 marbles back, a charge spent (#1475). */
  flask(): Result<RunState> {
    return this.withRun((active) => {
      if (this.screen(active) !== 'map') return fail('not_now', `a flask is drunk on the map, the run is on its ${this.screen(active)} screen`);
      const next = drink(active.state);
      if (next === active.state) return fail('bad_choice', active.state.flasks <= 0 ? 'no flask left' : 'army full');
      active.state = next;
      return ok(this.describe(active));
    });
  }

  /** The run, or the error when there is none. A fight resigned is lost; a fight whose game another game replaced leaves the run. */
  private withRun<T>(use: (active: Active) => Result<T>): Result<T> {
    const active = this.active;
    if (!active) return fail('no_run', 'no run started: call new_run first');
    if (active.fight) {
      const game = (this.session.getState() as { ok: true; value: State }).value;
      if (game.game_id !== active.fight.game) {
        this.active = null; // as the client's mode switch leaves the run
        return fail('no_run', 'the run was left: another game replaced its fight. Call new_run');
      }
      if (game.resigned) this.settle(active, false); // the engine has no resign
    }
    return use(active);
  }

  /** After a move of the fight (the agent's, the bot's, a tactic): its moves are kept, and once it is over it is folded into
   * the run as main.ts `runMoved` does. */
  private played(active: Active): void {
    const { engine, boss, moves } = active.fight!;
    const result = boss ? (engine as RunBoss).result() : (engine as RunEngine).status(); // 1 won, 2 lost: a draw is a loss
    if (result === 0) active.state = { ...active.state, moves: moves.map((mv) => [...mv]) };
    else this.settle(active, result === 1);
  }

  /** The run once its fight is over, `won` or not (`fightOver`): the marbles the bot ejected are lost, the special marbles kept
   * are those still on the board. */
  private settle(active: Active, won: boolean): void {
    const { engine, boss, moves } = active.fight!;
    active.state = fightOver(active.map, { ...active.state, moves: moves.map((mv) => [...mv]) }, won, engine.ejected(2), kinds(engine)); // its last move counts (#1473)
    active.fight = null;
  }

  private mapOf(seed: number, runes: number, version: number): MapNode[] {
    return parseMap(this.rules.run_map(seed, runes, version));
  }

  /** The fight of the run's last node, as main.ts `runEngine` stands it: the act's boss, or the army against the bot's plan. */
  private engineFor(state: Run, map: MapNode[]): RunEngine | RunBoss {
    const boss = actBoss(map, state, this.bossIds());
    if (boss) return this.rules.boss(boss.id, boss.seed, boss.percent, state.placed, relicMask(state));
    const plan = foePlan(map, state, (node, less, biome) => this.rules.run_foes(state.seed, node, less, biome, undefined, state.map));
    return this.rules.fight(state.army, plan, state.placed, relicMask(state));
  }

  /** Starts the fight of `engine` as the session's game, `moves` already played on it. */
  private begin(active: Active, engine: RunEngine | RunBoss, moves: number[][]): void {
    const boss = actBoss(active.map, active.state, this.bossIds());
    const recorded = recording(engine, moves, () => this.played(active));
    const started = boss ? this.session.runBoss(boss.id, recorded as EncounterLike) : this.session.runFight(recorded as RunEngine, budgetOf(active.map, active.state, active.nodes));
    active.fight = { engine, moves, game: started.game_id, boss: boss !== null, nodes: active.nodes };
  }

  /** The screen of the run, as main.ts `showRun` picks it. */
  private screen({ state, fight }: Active): Screen {
    if (state.end) return state.end;
    if (state.bonus) return 'bonus';
    if (state.relic) return 'relic';
    if (state.reward) return 'reward';
    if (state.event) return 'event';
    if (state.rest) return 'rest';
    if (state.shop) return 'shop';
    if (state.scroll) return 'scroll';
    if (state.collector) return 'collector';
    if (state.exit) return 'exit';
    if (placing(state) && (!fight!.boss || (fight!.engine as RunBoss).takes_build())) return 'place';
    return state.fighting ? 'fight' : 'map';
  }

  /** What the screen offers, `null` on a screen with nothing to choose. */
  private menu({ state, map }: Active): Choice[] | null {
    const keys = keyOffers(map, state).map((k) => ({ text: KEYS[k]!.offer, apply: () => takeKey(map, state, k) })); // a key in place of the rest or the relic (#1467)
    if (state.bonus) {
      const relic = bonusRelic(state);
      return [{ text: `${relic >= 0 ? `${relicText(relic)} · ` : ''}+${BONUS_SCRAP} scrap, then the boss`, apply: () => takeBonus(state) }];
    }
    if (state.relic) return [...relicOffers(map, state).map((r) => ({ text: relicText(r), apply: () => takeRelic(map, state, r) })), ...keys];
    if (state.reward) {
      const tactic = tacticOffer(state);
      return [
        ...offers(state).map((o) => ({ text: o ? specialText(o) : 'One more marble', apply: () => claim(state, o) })),
        ...(tactic ? [{ text: tacticText(tactic), apply: () => claimTactic(state) }] : []),
      ];
    }
    if (state.event) return eventOf(state)!.choices.map((c, i) => ({ text: choiceText(state, c) + foretold(state, c, i), apply: () => resolve(state, i) }));
    if (state.rest) {
      const upgrades = upgradable(state).map((k) => ({
        text: `Upgrade ${SPECIAL_LOOKS[k - 1]!.name}: ${SPECIAL_LOOKS[k + 2]!.name} ${SPECIAL_LOOKS[k + 2]!.help}`,
        apply: () => upgrade(state, k),
      }));
      return [{ text: restLabel(state), apply: () => rest(state) }, ...upgrades, ...keys];
    }
    if (state.shop) {
      const sold = (i: ShopItem): string => (i.kind === 'marble' ? 'One more marble' : i.kind === 'special' ? specialText(i.code) : i.kind === 'relic' ? relicText(i.code) : i.kind === 'flask' ? CHARGE_TEXT : tacticText(i.code));
      return [
        ...shopStock(state).map((i) => ({ text: `${sold(i)} · ${i.price} scrap`, apply: () => buy(state, i.id) })),
        ...removable(state).map((k) => ({
          text: `Remove a ${SPECIAL_LOOKS[k - 1]!.name}: back to a plain marble · ${removalPrice(state)} scrap`,
          apply: () => removeSpecial(state, k),
        })),
        { text: 'Leave', apply: () => leaveShop(state) },
      ];
    }
    if (state.scroll) {
      return scrollOffers(state).map((k) => ({
        text: `${AFFINITIES[k]!.name} ${state.affinities[k]! + 1} (${AFFINITIES[k]!.kinds}): ${AFFINITIES[k]!.levels[state.affinities[k]!]!}`,
        apply: () => takeScroll(state, k),
      }));
    }
    if (state.collector) {
      return [
        ...state.carried.map((id) => ({ text: `${blueprintText(id)} · ${COLLECT_COST} cells`, apply: () => collect(state, id) })),
        { text: 'Leave', apply: () => leaveCollector(state) },
      ];
    }
    if (state.exit) {
      return exitOffers(map, state, this.exitsOf(state)).map((code, i) => {
        const biome = BIOMES[code]!;
        return { text: `${i === 2 ? 'Secret exit · ' : ''}${biome.name} · ${biome.hazard} · foes: ${biome.foes} · boss: ${biome.boss}`, apply: () => chooseExit(map, state, code, this.exitsOf(state)) };
      });
    }
    return null;
  }

  /** The exits at the end of an act of the run (`exitsFor` of main.ts). */
  private exitsOf(state: Run): (act: number, from: number) => ArrayLike<number> {
    return (act, from) => this.rules.run_exits(state.seed, act, from, state.runes);
  }

  private foes(node: MapNode): string {
    return [...(node.elite ? [ELITES[node.elite - 1]!.name] : []), ...(node.formation ? [FORMATIONS[node.formation]!] : [])].join(' · ');
  }

  /** Every node of the map, the nodes it leads to by index. */
  private rows(map: MapNode[], state: Run): string[] {
    const last = lastAct(map, state);
    return map.flatMap((n, i) => {
      if (n.act > last) return []; // the fourth act is hidden until the three keys (#1467)
      const next = map.flatMap((m, j) =>
        n.kind === 'boss'
          ? m.act === n.act + 1 && m.row === 0 ? [j] : []
          : m.act === n.act && ((m.row === n.row + 1 && n.links.includes(m.col)) || (m.row === n.row + 2 && n.skips.includes(m.col))) ? [j] : [],
      );
      const foes = (n.kind === 'fight' || n.kind === 'elite') && this.foes(n);
      return [`${i}: act ${n.act + 1} row ${n.row + 1} ${n.kind}${foes ? ` (${foes})` : ''} -> ${n.act === last && n.kind === 'boss' ? 'end' : next.join(',')}`];
    });
  }

  private describe(active: Active): RunState {
    const { state, map, fight } = active;
    const screen = this.screen(active);
    const menu = this.menu(active);
    const node = state.fighting ? map[state.path[state.path.length - 1]!]! : null;
    const bossFight = node ? actBoss(map, state, this.bossIds()) : null;
    const event = state.event ? eventOf(state) : null;
    const counted = moveCount(map, state);
    return {
      screen,
      line: runLine(map, state),
      seed: state.seed,
      army: state.army,
      specials: named(state.specials),
      ...(currentBiome(map, state) ? { biome: BIOMES[currentBiome(map, state)]!.name } : {}),
      relics: state.relics.map((r) => RELICS[r]!.name),
      ...(state.affinities.some(Boolean) ? { affinities: Object.fromEntries(AFFINITIES.map((a, k) => [a.name, state.affinities[k]!])) } : {}),
      ...(state.runes ? { runes: RUNES.flatMap((r, k) => (state.runes & (1 << k) ? [r.name] : [])) } : {}),
      ...(state.keys.length ? { keys: state.keys.map((k) => KEYS[k]!.name) } : {}),
      ...(state.curse ? { curse: state.curse } : {}),
      ...(counted ? { moves: counted.count, budget: counted.budget } : {}),
      tactics: state.tactics.map((t) => TACTICS[t - 1]!.name),
      flasks: state.flasks,
      scrap: state.scrap,
      cells: state.cells,
      carried: state.carried,
      banked: state.banked,
      ...(state.told ? { told: state.told } : {}),
      ...(screen === 'map' ? { nodes: choices(map, state).map((n) => ({ node: n, kind: map[n]!.kind })) } : {}),
      ...(fight
        ? {
            fight: {
              kind: node!.kind === 'elite' ? 'elite' : bossFight ? 'boss' : 'fight',
              ...(this.foes(node!) && !bossFight ? { foes: this.foes(node!) } : {}),
              ...(bossFight ? { boss: { id: bossFight.id, strength: bossFight.percent } } : { bot_nodes: budgetOf(map, state, fight.nodes) }),
              game: fight.game,
              placed: state.placed.map(([q, r, kind]) => `${text([q!, r!])} ${SPECIAL_LOOKS[kind! - 1]!.name}`),
              ...(screen === 'place' ? { left: named(SPECIAL_LOOKS.map((_, k) => (state.specials[k] ? left(state, k + 1) : 0))) } : {}),
            } satisfies FightInfo,
          }
        : {}),
      ...(event ? { title: `${event.title}: ${event.text}` } : {}),
      ...(menu ? { options: menu.map((c, choice) => ({ choice, text: c.text, ok: c.apply() !== state })) } : {}),
      ...(state.end ? { acts_won: actsWon(map, state), unlocked: [...earned(map, state), ...state.banked.map(blueprintName)] } : {}),
    };
  }
}
