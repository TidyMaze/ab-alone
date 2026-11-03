// Rogue-lite run (#798, docs/specs/roguelite.md). Pure functions and the save: main.ts feeds them the map of the
// bridge (run_map) and the result of each fight, and draws the map, placement and reward screens they describe.

import { cellIndex, DIRECTIONS, isMarble, MOVE_STRIDE, RADIUS, type Axial, type Move } from './board';
import { BLUEPRINTS, blueprintId, CELLS, COLLECT_COST, LEGACY_UNLOCKED, type BlueprintType } from './collector';
import { SEAT_GLYPHS, SHELL } from './marbles';
import { read, write, type Store } from './quality';
import { replay, type KeyStore, type ReplayEngine } from './savegame';

/** Marbles of the army at the start of a run: the standard layout. */
export const START_ARMY = 14;
/** Below this many marbles the run is over. */
export const MIN_ARMY = 4;
/** Integers per node of the bridge's map (crates/abalone-wasm/src/lib.rs). */
const NODE_STRIDE = 7;
/** Key of the run in the game store, next to the local game (savegame.ts). */
export const RUN_KEY = 'run';

/** What a node holds, by the bridge's kind code (#800, the treasure #1457, the shop #1459). An `unknown` node (#1463, drawn
 * as a "?") turns into an event, a fight or a treasure when it is entered; the bridge no longer draws an `event` node. */
const KINDS = ['fight', 'boss', 'elite', 'rest', 'event', 'treasure', 'shop', 'unknown'] as const;
export type NodeKind = (typeof KINDS)[number];

/** How the bot's marbles stand in a fight or an elite (#1462, docs/specs/roguelite.md section 14), by the bridge's code. */
export const FORMATIONS: readonly string[] = ['Standard', 'Belgian daisy', 'German daisy', 'Snake', 'Wedge'];
/** The named elites by the bridge's code less 1: a name and the special marbles of its army. */
export const ELITES: readonly { name: string; help: string }[] = [
  { name: 'The Wall', help: 'Anchors' },
  { name: 'The Artificer', help: 'Sparks and Bombs' },
  { name: 'The Brute', help: 'Heavies' },
];

/** A biome of an act (#1472, docs/specs/roguelite.md section 18), by the bridge's code, the Open world's: its look id (the tint is
 * in ui.css), its name, the roster boss that ends its act (`boss_ids`; none for the Meadow, whose act 1 boss is dealt as before), the
 * hole pattern its fights open on the board and the special marble every one of its fights holds. */
export const BIOMES: readonly { id: string; name: string; boss: string; hazard: string; foes: string }[] = [
  { id: 'meadow', name: 'Meadow', boss: '', hazard: 'no hazard', foes: 'as dealt' },
  { id: 'forest', name: 'Forest', boss: 'alien', hazard: '2 ponds', foes: 'Anchors' },
  { id: 'tundra', name: 'Tundra', boss: 'hull', hazard: 'a crevasse across the board', foes: 'Shields' },
  { id: 'desert', name: 'Desert', boss: 'pulsar', hazard: '2 sinkholes in the middle row', foes: 'Sparks' },
  { id: 'badlands', name: 'Badlands', boss: 'core', hazard: '4 canyon holes on the flanks', foes: 'Heavies' },
  { id: 'archipelago', name: 'Archipelago', boss: 'ballast', hazard: '5 water holes around the centre', foes: 'Magnets' },
];

/** One node of the map: a fight, an elite, a rest, an event, a treasure, a shop, an unknown "?", or the boss that ends its act. `links` are the columns of
 * the next row it leads to. A fight or an elite has the bridge's `formation` of the bot's army, an elite its archetype
 * (`elite`, `0` for none). */
export interface MapNode {
  act: number;
  row: number;
  col: number;
  kind: NodeKind;
  links: number[];
  formation: number;
  elite: number;
}

/** A run: its seed, its army, the nodes picked (indices in the map), the fight of the last one while it is on and its
 * moves, and how it ended. `specials` counts the army's Heavy, Anchor and Spark marbles (#961), then its Heavy+, Anchor+
 * and Spark+ (#1458), then its Magnet, Shield, Bomb and Medic (#1461), by the bridge's kind less 1, `placed` the ones on
 * the fight's board `[q, r, kind]`, `reward` is on while the reward of a won fight waits to be picked, and `event` while
 * the choice of an event node waits (#800). `best` is the most acts won in one run before this one, which unlocks its
 * special marble types and starting armies (#801). `relics` are the codes of the relics it holds, in the order taken, and
 * `relic` is on while a relic offer waits to be taken (#1457). `rest` is on while a rest site's choice waits (#1458).
 * `commander` is the one picked at the start, an index of COMMANDERS, -1 for none: a run saved before them has none (#1464).
 * `tactics` are the codes of the tactics it holds, up to MAX_TACTICS, in the order gained (#1460). `scrap` is what it can
 * spend at a shop (#1459), `shop` is on while the shop's screen waits and `bought` are the ids of what that shop sold.
 * `enemies` is on for a run that fights the varied armies of #1462; a run saved before them has it off and fights the plain
 * army, so its fight in progress replays. `told` is the line of what the last event gave or cost, on the map until the next node is picked (#1463). `unlocked` are the blueprints banked before this run (#1470), which widen its pools
 * (a run keeps the ones it started with, so its offers replay); `cells` are what it can spend at the Collector, `carried`
 * the blueprints dropped and not yet banked, `banked` the ones it banked, `drop` the blueprint (id + 1) the last fight
 * dropped, 0 for none, and `collector` is on while the Collector's room waits between two acts. `exits` is on for a run that
 * offers a biome at the end of each act but the last (#1472); a run saved before has it off and stays in the Meadow. `exit` is on
 * while the choice between the two exits waits, and `biomes` are the codes picked for act 2 then act 3. */
export interface Run {
  seed: number;
  army: number;
  path: number[];
  fighting: boolean;
  moves: number[][];
  end: '' | 'won' | 'lost';
  specials: number[];
  placed: number[][];
  reward: boolean;
  event: boolean;
  best: number;
  relics: number[];
  commander: number;
  relic: boolean;
  rest: boolean;
  tactics: number[];
  scrap: number;
  shop: boolean;
  bought: number[];
  enemies: boolean;
  unlocked: number[];
  cells: number;
  carried: number[];
  banked: number[];
  drop: number;
  collector: boolean;
  told: string;
  exits: boolean;
  exit: boolean;
  biomes: number[];
}

/** At most this many special marbles of each type on the board of a fight (#961). */
export const FIGHT_CAP = 3;

/** The relics (#1457, docs/specs/roguelite.md section 9) by their code on the bridge (crates/abalone-core run::Relic). */
export const Relic = {
  Gyroscope: 0,
  HullPlating: 1,
  SalvageMagnet: 2,
  Jammer: 3,
  Detonator: 4,
  Bunks: 5,
  LuckyCoin: 6,
  Bargain: 7,
  Saboteur: 8,
  Dampener: 9,
  WarChest: 10,
  Quartermaster: 11,
} as const;
/** Each relic by its code: its name, its rule in one line, and its glyph, an SVG path in a 24 unit square drawn as a line. */
export const RELICS: readonly { name: string; help: string; icon: string }[] = [
  { name: 'Gyroscope', help: 'once per fight, your first push of a tie goes through', icon: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M3 12h18M12 3c4 3 4 15 0 18' },
  { name: 'Hull plating', help: 'the first marble you lose in each fight comes back after it', icon: 'M12 3l8 3v6c0 5-4 8-8 9c-4-1-8-4-8-9V6z' },
  { name: 'Salvage magnet', help: 'a won elite gives 1 more marble back', icon: 'M6 4h4v8a2 2 0 0 0 4 0V4h4v8a6 6 0 0 1-12 0z' },
  { name: 'Jammer', help: 'the bot searches 25 % fewer positions in fights and elites', icon: 'M4 8q4-4 8 0t8 0M4 16q4-4 8 0t8 0M5 5l14 14' },
  { name: 'Detonator', help: 'your Sparks burst 2 cells', icon: 'M12 2l2 6 6-2-4 5 6 3-7 1 1 7-4-5-4 5 1-7-7-1 6-3-4-5 6 2z' },
  { name: 'Bunks', help: 'a rest also makes a plain marble a Heavy', icon: 'M3 18V6M3 14h18v4M21 14v-3a3 3 0 0 0-3-3h-7v6M7 10h1' },
  { name: 'Lucky coin', help: 'rewards offer 4 choices', icon: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7v10M15 9c-1-2-6-2-6 0s6 2 6 4-5 2-6 0' },
  { name: 'Bargain', help: 'an event trade costs 1 marble less', icon: 'M3 12V3h9l9 9-9 9zM8 8h.01' },
  { name: 'Saboteur', help: 'the bot has 1 marble fewer in fights and elites', icon: 'M14 6a4 4 0 1 0 4 4l-9 9a2 2 0 0 1-3-3l9-9' },
  { name: 'Dampener', help: 'act bosses play at 75 % of their strength', icon: 'M4 9h4l5-4v14l-5-4H4zM16 9l5 6M21 9l-5 6' },
  { name: 'War chest', help: 'an act boss beaten gives 2 marbles back', icon: 'M3 9h18v11H3zM3 9l2-5h14l2 5M10 13h4' },
  { name: 'Quartermaster', help: 'a fight holds 4 of each special marble type', icon: 'M8 3h8v3H8zM6 4H4v17h16V4h-2M8 11h8M8 16h8' },
];
const has = (run: Run, relic: number): boolean => run.relics.includes(relic);
/** The run's relics as the bridge's bit mask (Engine.set_relics): the engine plays the Gyroscope and the Detonator. */
export const relicMask = (run: Run): number => run.relics.reduce((mask, r) => mask | (1 << r), 0);
/** The relics the run does not hold yet and its pools hold (#1470), by code: no relic twice in a run. */
const unheld = (run: Run): number[] => RELICS.flatMap((_, code) => (has(run, code) || !isOn(run, 'relic', code) ? [] : [code]));

/** At most this many tactics held at once (#1460). */
export const MAX_TACTICS = 3;
/** The tactics (#1460, docs/specs/roguelite.md section 11) by their code less 1 on the bridge (Engine.play's tactic
 * records): a name, a one-line rule and a glyph, an SVG path in a 24 unit square drawn as a line. */
export const TACTICS: readonly { name: string; help: string; icon: string }[] = [
  { name: 'Reinforce', help: 'a marble joins the first free cell of your back row', icon: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 8v8M8 12h8' },
  { name: 'Freeze', help: 'the bot skips its next turn', icon: 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9' },
  { name: 'Swap', help: 'two of your marbles trade places, it costs your move', icon: 'M4 8h13M13 4l4 4-4 4M20 16H7M11 12l-4 4 4 4' },
  { name: 'Fall back', help: 'undo your last move and the bot\'s answer', icon: 'M9 5L4 10l5 5M4 10h10a6 6 0 0 1 0 12h-3' },
];
/** The move record of tactic `code`; a Swap names its two cells. It starts with a 0, where a move has its marble count. */
export const tacticRecord = (code: number, a: Axial = [0, 0], b: Axial = [0, 0]): number[] => [0, code, a[0], a[1], b[0], b[1], 0, 0];
/** The run once one tactic `code` is used: it is gone. Unchanged when the run holds none. */
export function useTactic(run: Run, code: number): Run {
  const i = run.tactics.indexOf(code);
  return i < 0 ? run : { ...run, tactics: run.tactics.filter((_, k) => k !== i) };
}

/** The `+` of an upgraded type's glyph (#1458): the shell's near-black, 3:1 on every glyph colour as they are on it. */
export const PLUS_INK = SHELL.color;
/** The `+`'s outline in units of the glyph's radius, inside every glyph's shape. */
export const PLUS_POINTS: readonly [number, number][] = [
  [0.1, 0.35], [0.1, 0.1], [0.35, 0.1], [0.35, -0.1], [0.1, -0.1], [0.1, -0.35],
  [-0.1, -0.35], [-0.1, -0.1], [-0.35, -0.1], [-0.35, 0.1], [-0.1, 0.1], [-0.1, 0.35],
];
const anchorPoints: readonly [number, number][] = [[0, -1], [0.866, 0.5], [-0.866, 0.5]]; // pointing down
const magnetPoints: readonly [number, number][] = [
  [-0.8, 0.9], [-0.3, 0.9], [-0.3, -0.1], [0.3, -0.1], [0.3, 0.9], [0.8, 0.9], [0.8, -0.3], [0.45, -0.85], [-0.45, -0.85], [-0.8, -0.3],
]; // a horseshoe, its poles up
const shieldPoints: readonly [number, number][] = [[-0.8, 0.8], [0.8, 0.8], [0.8, -0.1], [0, -0.95], [-0.8, -0.1]]; // flat top, pointed foot
/** The looks of the special marbles, by the bridge's kind less 1 (#961): a flat glyph over the marble, its own shape
 * and a colour 3:1 on both marbles, never the colour alone. Its outline in units of its radius, y up. An upgraded type
 * (#1458) has its type's glyph with a `+` on it. */
export const SPECIAL_LOOKS: readonly { name: string; color: number; points: readonly [number, number][]; help: string; plus: boolean }[] = [
  { name: 'Heavy', color: 0xc8ccd0, points: SEAT_GLYPHS[2]!.points, help: 'weighs 2 in a push', plus: false }, // a block
  { name: 'Anchor', color: 0x56b4e9, points: anchorPoints, help: 'never pushed off', plus: false },
  { name: 'Spark', color: 0xf0e442, points: SEAT_GLYPHS[4]!.points, help: 'bursts when pushed off', plus: false }, // a star
  { name: 'Heavy+', color: 0xc8ccd0, points: SEAT_GLYPHS[2]!.points, help: 'weighs 3 in a push', plus: true },
  { name: 'Anchor+', color: 0x56b4e9, points: anchorPoints, help: 'never pushed off, nor the marble in front of it', plus: true },
  { name: 'Spark+', color: 0xf0e442, points: SEAT_GLYPHS[4]!.points, help: 'bursts 2 cells', plus: true },
  // The four of #1461, no upgraded form: a vermillion horseshoe, an orange shield, a pink round bomb and a green cross.
  { name: 'Magnet', color: 0xd55e00, points: magnetPoints, help: 'pulls an enemy two cells away one cell closer after it moves', plus: false },
  { name: 'Shield', color: 0xe69f00, points: shieldPoints, help: 'the first push that would move it fails', plus: false },
  { name: 'Bomb', color: 0xcc79a7, points: SEAT_GLYPHS[0]!.points, help: 'bursts after your third turn and is lost', plus: false }, // a disc
  { name: 'Medic', color: 0x009e73, points: SEAT_GLYPHS[3]!.points, help: 'comes back once on your back row when ejected', plus: false }, // a cross
];
/** The special marble types a rest site can upgrade, by the bridge's kind: Heavy, Anchor, Spark; kind + 3 is the upgraded one. */
const PLAIN = [1, 2, 3];
/** The special marble types rewards, events, the shop and the unlocks deal, by the bridge's kind: the three above, then
 * Magnet, Shield, Bomb and Medic (#1461). */
const DEALT = [...PLAIN, 7, 8, 9, 10];
/** The order the special marbles go in when the army falls below their count or pays one: the Medics, Bombs, Shields and
 * Magnets first (#1461), then the plain Sparks, Anchors and Heavies, then the upgraded ones in the same order (indices
 * of `Run.specials`). */
const FALL = [9, 8, 7, 6, 2, 1, 0, 5, 4, 3];

/** A special marble of the bridge's records `[q, r, kind]`. */
export interface Special {
  cell: Axial;
  kind: number;
}
export function parseSpecials(flat: ArrayLike<number>): Special[] {
  const specials: Special[] = [];
  for (let i = 0; i < flat.length; i += 3) specials.push({ cell: [flat[i]!, flat[i + 1]!], kind: flat[i + 2]! });
  return specials;
}

/** The army's special marbles still on `board` (code 1, the army's side), by type: the bridge's kind less 1. The bot's own
 * special marbles are not the army's (#1492). */
export function armyKept(board: ArrayLike<number>, flat: ArrayLike<number>): number[] {
  const mine = parseSpecials(flat).filter((s) => board[cellIndex(s.cell[0], s.cell[1])] === 1);
  return SPECIAL_LOOKS.map((_, k) => mine.filter((s) => s.kind === k + 1).length);
}

/** The map of the bridge's records `[act, row, col, kind, links, formation, elite]`. */
export function parseMap(flat: ArrayLike<number>): MapNode[] {
  const nodes: MapNode[] = [];
  for (let i = 0; i < flat.length; i += NODE_STRIDE) {
    const mask = flat[i + 4]!;
    const links = [0, 1, 2, 3, 4, 5].filter((c) => mask & (1 << c));
    nodes.push({ act: flat[i]!, row: flat[i + 1]!, col: flat[i + 2]!, kind: KINDS[flat[i + 3]!]!, links, formation: flat[i + 5]!, elite: flat[i + 6]! });
  }
  return nodes;
}

/** `n` special marbles of the bridge's kind `kind` and none of the other types. */
const only = (kind: number, n: number): number[] => SPECIAL_LOOKS.map((_, k) => (k === kind - 1 ? n : 0));
/** No special marble. */
const noSpecials = (): number[] => only(0, 0);

/** The commanders (#1464, docs/specs/roguelite.md section 17), the starting armies of #801: each starts a run with 14 marbles,
 * a style (some special marbles, never more than 2) and a relic of the first six (always in the pools), never more power
 * than another (Decision #934); `acts` is the most acts won in one run that unlocks it. A line, and a portrait: an SVG
 * path in a 24 unit square drawn as a line. */
export const COMMANDERS: readonly { name: string; line: string; relic: number; specials: number[]; acts: number; icon: string }[] = [
  { name: 'The Captain', line: 'Keeps a steady hand on the bridge and a plain army behind it.', relic: Relic.Gyroscope, specials: noSpecials(), acts: 0, icon: 'M4 17h16M5 17l-1-9 5 4 3-6 3 6 5-4-1 9' },
  { name: 'The Warden', line: 'Holds the line with Anchors and mends what the fight takes.', relic: Relic.HullPlating, specials: only(2, 2), acts: 1, icon: 'M5 21V9l2-2V4h3v3h4V4h3v3l2 2v12zM10 21v-5h4v5' },
  { name: 'The Saboteur', line: 'Packs Sparks and wants every burst to reach further.', relic: Relic.Detonator, specials: only(3, 2), acts: 2, icon: 'M11 9a6 6 0 1 0 0 12a6 6 0 1 0 0-12M15 9l3-3M17 4l3 2' },
  { name: 'The Juggernaut', line: 'Leads Heavies and turns every rest into more weight.', relic: Relic.Bunks, specials: only(1, 2), acts: 3, icon: 'M4 6h16v6H4zM8 12v8M16 12v8M6 20h4M14 20h4' },
];
/** The most acts won in one run that brings each special marble type into the rewards, events and the shop, by the bridge's
 * kind less 1: Heavy 0, Anchor 1, Spark 2 (the upgraded types are never dealt), Magnet 3, Shield 1, Bomb 3, Medic 2 (#1461). */
export const KIND_ACTS = [0, 1, 2, 0, 0, 0, 3, 1, 3, 2];
/** The most acts won in a run. */
const ALL_ACTS = 3;
/** Whether the run's pools hold the relic, tactic or special marble type `code` (#1470): all but the blueprints not banked
 * yet, and a special marble type also once the acts won in one run unlock it (#801). */
function isOn(run: Run, type: BlueprintType, code: number): boolean {
  const id = blueprintId(type, code);
  return id < 0 || run.unlocked.includes(id) || (type === 'special' && KIND_ACTS[code - 1]! <= run.best);
}
const kindOn = (run: Run, kind: number): boolean => isOn(run, 'special', kind);
/** The tactics the run's pools hold, by code. */
const tacticPool = (run: Run): number[] => TACTICS.flatMap((_, k) => (isOn(run, 'tactic', k + 1) ? [k + 1] : []));

/** A new run of `seed`, with what `best` acts won in one run unlocked and the blueprints `unlocked` (readUnlocked), no
 * commander yet (chooseCommander): the standard army and no relic. */
export const newRun = (seed: number, best: number, unlocked: readonly number[]): Run => ({
  seed,
  army: START_ARMY,
  path: [],
  fighting: false,
  moves: [],
  end: '',
  specials: noSpecials(),
  placed: [],
  reward: false,
  event: false,
  best,
  relics: [],
  commander: -1,
  relic: false,
  rest: false,
  tactics: [],
  scrap: 0,
  shop: false,
  bought: [],
  enemies: true,
  unlocked: [...unlocked],
  cells: 0,
  carried: [],
  banked: [],
  drop: 0,
  collector: false,
  told: '',
  exits: true,
  exit: false,
  biomes: [],
});

/** The run with the commander `commander` (an index of COMMANDERS): its special marbles and its relic, before the first pick
 * and only once unlocked. Picking another commander drops the first one's. */
export function chooseCommander(run: Run, commander: number): Run {
  const c = COMMANDERS[commander];
  return c && c.acts <= run.best && !run.path.length && !run.end ? { ...run, commander, specials: [...c.specials], relics: [c.relic] } : run;
}

const sum = (counts: number[]): number => counts.reduce((a, b) => a + b, 0);
/** The special marbles of each type in `placed`. */
const countOf = (placed: number[][]): number[] => SPECIAL_LOOKS.map((_, k) => placed.filter((p) => p[2] === k + 1).length);

const lastAct = (map: MapNode[]): number => map[map.length - 1]!.act;

/** The nodes reachable after `path`: the first row of act 1, the links of a fight, the first row of the next act after a
 * boss. */
function next(map: MapNode[], path: number[]): number[] {
  const last = path.length ? map[path[path.length - 1]!]! : null;
  const open = (n: MapNode): boolean =>
    !last
      ? n.act === 0 && n.row === 0
      : last.kind === 'boss'
        ? n.act === last.act + 1 && n.row === 0
        : n.act === last.act && n.row === last.row + 1 && last.links.includes(n.col);
  return map.flatMap((n, i) => (open(n) ? [i] : []));
}

/** The nodes the player may pick now: none during a fight or once the run is over. */
export const choices = (map: MapNode[], run: Run): number[] =>
  run.fighting || run.end || run.reward || run.event || run.relic || run.rest || run.shop || run.collector || run.exit ? [] : next(map, run.path);

/** The run once `node` is picked: its fight starts, no special marble on its board yet. */
export const pick = (run: Run, node: number): Run => ({ ...run, path: [...run.path, node], fighting: true, moves: [], placed: [], told: '' });

/** What an unknown node turns into when entered (#1463, docs/specs/roguelite.md section 16): an event 7 times in 10, a
 * fight twice, a treasure once, drawn from the run seed and the node. */
function became(run: Run, node: number): 'event' | 'fight' | 'treasure' {
  const draw = hash(hash(run.seed, node * 8 + 3), 9) % 10;
  return draw < 7 ? 'event' : draw < 9 ? 'fight' : 'treasure';
}
/** The kind of node `node` of `map` for `run`: what an unknown node turned into, else its own. */
const kindOf = (map: MapNode[], run: Run, node: number): NodeKind => (map[node]!.kind === 'unknown' ? became(run, node) : map[node]!.kind);

/** The run once `node` of `map` is visited (#800): a rest site waits for its choice (#1458), an event for its own, a
 * treasure for its relic (#1457), a shop for its purchases (#1459), any other node starts its fight. An unknown node
 * (#1463) is the event, fight or treasure it turns into. What the last event told is gone. */
export function visit(map: MapNode[], run: Run, node: number): Run {
  const from = { ...run, told: '' };
  const path = [...run.path, node];
  const kind = kindOf(map, run, node);
  if (kind === 'rest') return { ...from, path, rest: true };
  if (kind === 'treasure') return { ...from, path, relic: unheld(run).length > 0 };
  if (kind === 'shop') return { ...from, path, shop: true };
  return kind === 'event' ? { ...from, path, event: true } : pick(from, node);
}

/** The run once Rest is picked at its rest site: the army back up to START_ARMY (with Bunks, a plain marble becomes a
 * Heavy). Unchanged when no rest site waits. */
export function rest(run: Run): Run {
  if (!run.rest) return run;
  const bunk = Number(has(run, Relic.Bunks) && sum(run.specials) < START_ARMY);
  return { ...run, army: START_ARMY, specials: [run.specials[0]! + bunk, ...run.specials.slice(1)], rest: false };
}

/** The plain special marble types the army holds, which its rest site may upgrade. */
export const upgradable = (run: Run): number[] => PLAIN.filter((k) => run.specials[k - 1]! > 0);

/** The run once Upgrade is picked at its rest site for one of its special marbles of the plain type `kind`: it becomes
 * that type's upgraded one (kind + 3). Unchanged when no rest site waits or the army holds none of `kind`. */
export function upgrade(run: Run, kind: number): Run {
  if (!run.rest || !upgradable(run).includes(kind)) return run;
  const specials = run.specials.map((n, k) => n - Number(k === kind - 1) + Number(k === kind + 2));
  return { ...run, specials, rest: false };
}

/** The node of the run's last pick, if any, with the kind an unknown node turned into (#1463). */
function lastNode(map: MapNode[], run: Run): MapNode | undefined {
  const node = run.path[run.path.length - 1]!;
  return map[node] && { ...map[node]!, kind: kindOf(map, run, node) };
}

/** The biome of act `act` (0 for the first) of the run (#1472): the Meadow in act 1, the exit picked before it later, and the
 * Meadow throughout for a run saved before the exits. */
export const biomeOf = (run: Run, act: number): number => (run.exits && act > 0 ? (run.biomes[act - 1] ?? 0) : 0);

/** The biome the run is in: its last node's act, or the next act's once that node is a boss beaten and the exit picked; the
 * Meadow once the run is over. */
export function currentBiome(map: MapNode[], run: Run): number {
  const node = lastNode(map, run);
  if (!node || run.end) return 0;
  return biomeOf(run, node.act + Number(node.kind === 'boss' && !run.fighting && !run.exit));
}

/** The biomes of the two exits that wait at the end of an act, from `exitsOf(act, from)` (`run_exits`) for the act after the last
 * node's, none when no exit waits. */
export function exitOffers(map: MapNode[], run: Run, exitsOf: (act: number, from: number) => ArrayLike<number>): number[] {
  const node = lastNode(map, run);
  return run.exit && node ? Array.from(exitsOf(node.act + 1, biomeOf(run, node.act))) : [];
}

/** The run once the exit to `biome` is taken: it is the next act's, and the map goes on. Unchanged when it is not one of the exits
 * that wait. */
export function chooseExit(map: MapNode[], run: Run, biome: number, exitsOf: (act: number, from: number) => ArrayLike<number>): Run {
  return exitOffers(map, run, exitsOf).includes(biome) ? { ...run, biomes: [...run.biomes, biome], exit: false } : run;
}

/** The marbles of a fight node's bot (#1145): its standard layout less the 4 of its front row. */
export const FIGHT_FOES = 10;

/** The marbles of the bot in the run's fight: FIGHT_FOES against a fight node, the full START_ARMY against an elite, one
 * fewer with the Saboteur. */
export const foesOf = (map: MapNode[], run: Run): number =>
  (lastNode(map, run)?.kind === 'fight' ? FIGHT_FOES : START_ARMY) - Number(has(run, Relic.Saboteur));

/** The bot's army in the run's fight as `Engine.with_foes` takes it (#1462): the bridge's plan for the node, `planOf(node,
 * less, biome)` (`run_foes`), `less` being 1 with the Saboteur and `biome` the one of the node's act (#1472); the count alone
 * (`foesOf`) for a run saved before. */
export const foePlan = (map: MapNode[], run: Run, planOf: (node: number, less: number, biome: number) => ArrayLike<number>): number | number[] =>
  run.enemies ? Array.from(planOf(run.path[run.path.length - 1]!, Number(has(run, Relic.Saboteur)), biomeOf(run, lastNode(map, run)!.act))) : foesOf(map, run);

/** An elite's bot searches this many times the positions of a fight's (#800). */
export const ELITE_BUDGET = 2;
/** Marbles back after a won elite, up to START_ARMY: its better reward (#800). */
const ELITE_MARBLES = 2;

/** What the Jammer and the Dampener leave of the bot's search budget, and of an act boss's strength (#1457). */
const JAMMED = 0.75;

/** The bot's search budget in the run's fight: `nodes`, or ELITE_BUDGET times it against an elite, a quarter less in a
 * fight or an elite with the Jammer. */
export function fightBudget(map: MapNode[], run: Run, nodes: number): number {
  const kind = run.fighting ? lastNode(map, run)!.kind : null;
  const budget = kind === 'elite' ? nodes * ELITE_BUDGET : nodes;
  return (kind === 'fight' || kind === 'elite') && has(run, Relic.Jammer) ? Math.round(budget * JAMMED) : budget;
}

/** The boss fight's strength by act, as the difficulty setting's budget percent (difficulty.ts): easy, normal, hard. */
export const ACT_PERCENT = [50, 100, 200];

/** The roster boss of the run's fight when its node is a boss (#800), one of `ids` (the bridge's boss_ids): the run seed
 * deals them, a new one each act, the act's strength, and the fight's seed from the run seed and the node. The boss of an act
 * in a biome is the biome's (#1472), when the roster has it. */
export function actBoss(map: MapNode[], run: Run, ids: string[]): { id: string; seed: number; percent: number } | null {
  const node = lastNode(map, run);
  if (!run.fighting || node?.kind !== 'boss') return null;
  const dealt = [...ids];
  for (let i = dealt.length - 1; i > 0; i--) {
    const j = hash(run.seed, i) % (i + 1);
    [dealt[i], dealt[j]] = [dealt[j]!, dealt[i]!];
  }
  const percent = ACT_PERCENT[node.act]! * (has(run, Relic.Dampener) ? JAMMED : 1);
  const own = BIOMES[biomeOf(run, node.act)]!.boss;
  return { id: ids.includes(own) ? own : dealt[node.act % dealt.length]!, seed: hash(run.seed, run.path[run.path.length - 1]! * 8 + 5), percent: Math.round(percent) };
}

/** What one side of an event choice gives and costs (#1463): `army` marbles more or less (up to START_ARMY), `count`
 * special marbles of the type `special` (the bridge's kind, 0 for none), `lose` one special marble (in the order FALL), `tactic` one
 * tactic and `relic` one relic the run does not hold (each dealt by the run seed and the node), `scrap` more or less, and
 * `heal` the army back up to START_ARMY. */
export interface Outcome {
  army: number;
  special: number;
  count: number;
  lose: boolean;
  tactic: boolean;
  relic: boolean;
  scrap: number;
  heal: boolean;
}
const NOTHING: Outcome = { army: 0, special: 0, count: 1, lose: false, tactic: false, relic: false, scrap: 0, heal: false };
const outcome = (o: Partial<Outcome>): Outcome => ({ ...NOTHING, ...o });

/** One choice of an event: its `verb`, and what it gives, `win`, with `odds` chances in 100 (a gamble when under 100,
 * drawn from the run seed and the node); otherwise it gives `fail`. */
export interface EventChoice {
  verb: string;
  odds: number;
  win: Outcome;
  fail: Outcome;
}
const deal = (verb: string, win: Partial<Outcome>): EventChoice => ({ verb, odds: 100, win: outcome(win), fail: NOTHING });
const gamble = (verb: string, odds: number, win: Partial<Outcome>, fail: Partial<Outcome>): EventChoice => ({ verb, odds, win: outcome(win), fail: outcome(fail) });
const LEAVE = deal('Leave', {});

/** An event (#800, #1463): its title, a line of lore, and its 2 or 3 choices, the last one Leave. */
export interface RunEvent {
  title: string;
  text: string;
  choices: EventChoice[];
}
export const EVENTS: readonly RunEvent[] = [
  { title: 'Scrap forge', text: 'A forge still glows in a wrecked bay.', choices: [deal('Forge a Heavy', { army: -2, special: 1 }), LEAVE] },
  { title: 'Mooring clamps', text: 'Docking clamps that never let go.', choices: [deal('Fit an Anchor', { army: -2, special: 2 }), LEAVE] },
  { title: 'Live wiring', text: 'A cable spits sparks across the deck.', choices: [deal('Charge a Spark', { army: -1, special: 3 }), LEAVE] },
  { title: 'Salvage drone', text: 'A drone offers its last two cells.', choices: [deal('Arm 2 Sparks', { army: -3, special: 3, count: 2 }), LEAVE] },
  { title: 'Cryo pods', text: 'Crew asleep in the pods, ready to wake.', choices: [deal('Wake 3 marbles', { army: 3, lose: true }), LEAVE] },
  { title: 'Field manual', text: 'A battered manual of old tricks lies open.', choices: [deal('Learn from the manual', { army: -1, tactic: true }), LEAVE] },
  { title: 'Lodestone', text: 'A lodestone hums in a split crate.', choices: [deal('Fit a Magnet', { army: -2, special: 7 }), LEAVE] },
  { title: 'Bulkhead', text: 'A spare bulkhead plate leans on the wall.', choices: [deal('Plate a Shield', { army: -2, special: 8 }), LEAVE] },
  { title: 'Unexploded charge', text: 'A live charge ticks in the rubble.', choices: [deal('Arm a Bomb', { army: -1, special: 9 }), LEAVE] },
  { title: 'Sick bay', text: 'A cot and a medic kit, still stocked.', choices: [deal('Staff a Medic', { army: -2, special: 10 }), LEAVE] },
  { title: 'Slag-glass vein', text: 'A vein of slag-glass glows in the hull. It remembers heat, and it is warm.', choices: [gamble('Touch the vein', 50, { special: 1 }, { army: -2 }), deal('Chip off a shard', { army: -1, scrap: 25 }), LEAVE] },
  { title: 'Ledger terminal', text: 'A ledger terminal lists the crew, one line each. Yours is the last without a mark.', choices: [deal('Read the ledger', { army: -1, tactic: true }), deal('Call the shelled crew back', { army: 2, scrap: -20 }), LEAVE] },
  { title: 'Shelled crewmate', text: 'A shelled crewmate rocks in a corner, rounding off a little more each hour.', choices: [deal('Take it along', { army: 1 }), deal('Crack its shell', { scrap: 30 }), LEAVE] },
  { title: 'Dice', text: 'Three marbles and a worn board on a mess table. The house is long dead, the odds are not.', choices: [gamble('Wager 20 scrap', 50, { scrap: 40 }, { scrap: -20 }), gamble('Wager a marble', 40, { relic: true }, { army: -1 }), LEAVE] },
  { title: 'Cold locker', text: 'A cold locker, frost thick on the latch. Something hums behind the door.', choices: [gamble('Force the latch', 60, { heal: true }, { army: -1 }), deal('Strip the compressor', { scrap: 15 }), LEAVE] },
  { title: 'Airlock', text: "An airlock cycles on its own, the outer door open on Hollow's dust.", choices: [gamble('Step out', 50, { relic: true }, { army: -2 }), deal('Strip the hatch', { scrap: 15 }), LEAVE] },
  { title: 'Chapel box', text: 'Candles and wire around a box for what the crew could spare.', choices: [deal('Give a special marble', { lose: true, relic: true }), deal('Give 25 scrap', { scrap: -25, tactic: true }), LEAVE] },
  { title: 'Furnace vent', text: 'A vent breathes orange heat across the deck. Slag-glass fuses to anything warm.', choices: [gamble('Warm yourselves', 70, { army: 4 }, { lose: true }), deal('Cast a Heavy in the heat', { army: -1, special: 1 }), LEAVE] },
  { title: 'Foreman crate', text: "A crate sealed with a dead foreman's ledger stamp.", choices: [gamble('Pry it open', 60, { scrap: 30, army: 1 }, { army: -1 }), deal('Sell it sealed', { scrap: 10 }), LEAVE] },
  { title: 'Ship relay', text: 'A relay on the bridge murmurs your ledger number back, over and over.', choices: [deal('Cut the line', { scrap: 20 }), gamble('Ask it for the way', 50, { tactic: true }, { army: -1 }), LEAVE] },
];

/** The event of the run's last node while its choice waits, seeded by the run seed and the node, else null. */
export function eventOf(run: Run): RunEvent | null {
  const needs = (e: RunEvent): number[] => e.choices.flatMap((c) => [c.win.special, c.fail.special]).filter(Boolean);
  const pool = EVENTS.filter((e) => needs(e).every((k) => kindOn(run, k))); // the unlocked types only (#801)
  return run.event ? pool[hash(run.seed, run.path[run.path.length - 1]! * 8 + 4) % pool.length]! : null;
}

/** The draw `salt` of the run's last node: a 32-bit hash of the run seed and the node, as the reward offers. */
const nodeDraw = (run: Run, salt: number): number => hash(hash(run.seed, run.path[run.path.length - 1]! * 8 + 4), salt);

/** The tactic an event teaches at the run's last node: a code of the run's pool (#1470), dealt by the run seed and the node. */
const taught = (run: Run): number => {
  const pool = tacticPool(run);
  return pool[hash(hash(run.seed, run.path[run.path.length - 1]! * 8 + 7), 2) % pool.length]!;
};

/** The relic an event gives at the run's last node, `salt` apart per choice: one the run does not hold, or -1 when it holds
 * them all. */
function dealtRelic(run: Run, salt: number): number {
  const pool = unheld(run);
  return pool.length ? pool[nodeDraw(run, 200 + salt) % pool.length]! : -1;
}

/** The run once `o` is given to it, or null when the army cannot pay it (below MIN_ARMY, no special marble to lose, more
 * special marbles than marbles, short of scrap) or it asks for a gain and none can be had. `salt` tells the choices apart
 * for the relic dealt. */
function give(run: Run, o: Outcome, salt: number): Run | null {
  const cost = o.army < 0 ? o.army + Number(has(run, Relic.Bargain)) : o.army;
  const army = o.heal ? START_ARMY : Math.min(START_ARMY, run.army + cost);
  const specials = run.specials.map((n, k) => n + (k === o.special - 1 ? o.count : 0));
  const lost = FALL.find((k) => o.lose && specials[k]! > 0);
  if (lost !== undefined) specials[lost]! -= 1;
  const scrap = Math.min(MAX_SCRAP, run.scrap + o.scrap);
  const room = o.tactic && run.tactics.length < MAX_TACTICS;
  const relic = o.relic ? dealtRelic(run, salt) : -1;
  const asked = o.heal || o.army > 0 || o.special > 0 || o.tactic || o.relic || o.scrap > 0;
  const gained = army > run.army || sum(specials) > sum(run.specials) || room || relic >= 0 || scrap > run.scrap;
  const paid = (!o.lose || lost !== undefined) && scrap >= 0;
  if (!paid || !(gained || !asked) || army < MIN_ARMY || sum(specials) > army) return null;
  return { ...run, army, specials, scrap, tactics: room ? [...run.tactics, taught(run)] : run.tactics, relics: relic >= 0 ? [...run.relics, relic] : run.relics };
}

const marbles = (n: number): string => `${Math.abs(n)} marble${Math.abs(n) === 1 ? '' : 's'}`;
/** What an outcome gives and costs in a line: the gains first, then the costs. */
function describe(run: Run, o: Outcome): string {
  return [
    o.heal ? `back to ${START_ARMY} marbles` : '',
    o.army > 0 ? `+${marbles(o.army)}` : '',
    o.special ? `+${o.count} ${SPECIAL_LOOKS[o.special - 1]!.name}${o.count > 1 ? 's' : ''}` : '',
    o.tactic ? `learn ${TACTICS[taught(run) - 1]!.name}` : '',
    o.relic ? '+1 relic' : '',
    o.scrap > 0 ? `+${o.scrap} scrap` : '',
    o.army < 0 ? `-${marbles(o.army)}` : '',
    o.lose ? '-1 special marble' : '',
    o.scrap < 0 ? `${o.scrap} scrap` : '',
  ]
    .filter(Boolean)
    .join(', ');
}

/** The label of choice `c`: its verb and what it gives, with the odds of a gamble. */
export function choiceText(run: Run, c: EventChoice): string {
  const effects = c.odds < 100 ? `${c.odds} %: ${describe(run, c.win)}, otherwise ${describe(run, c.fail)}` : describe(run, c.win);
  return effects ? `${c.verb} · ${effects}` : c.verb;
}

/** The run once choice `choice` of `e` is taken, or null when it does not exist or cannot be paid: both sides of a
 * gamble must be payable. A gamble is drawn from the run seed and the node. `told` says what it gave or cost. */
export function takeEvent(run: Run, e: RunEvent, choice: number): Run | null {
  const c = e.choices[choice];
  if (!c) return null;
  const [win, fail] = [give(run, c.win, choice), give(run, c.fail, choice)];
  if (!win || (c.odds < 100 && !fail)) return null;
  const won = c.odds >= 100 || nodeDraw(run, 100 + choice) % 100 < c.odds;
  const after = won ? win : fail!;
  const gist = describe(run, won ? c.win : c.fail);
  const luck = c.odds < 100 ? `${won ? 'it paid off' : 'it went wrong'}, ` : '';
  return { ...after, told: gist ? `${e.title}: ${luck}${gist}` : '' };
}

/** The run once choice `choice` of its event is taken (unchanged when it cannot be paid) or Leave: the event is over. */
export function resolve(run: Run, choice: number): Run {
  const e = eventOf(run);
  const after = e && takeEvent(run, e, choice);
  return after ? { ...after, event: false } : run;
}

/** Scrap earned by a won fight, a won elite and a beaten act boss (#1459). */
export const SCRAP = { fight: 10, elite: 20, boss: 30 } as const;

/** Marbles back after an act boss beaten with the War chest (#1457). */
const CHEST_MARBLES = 2;

/** The run after the fight of its last node, `won` or not, the army having lost `lost` marbles and kept `kept` of each
 * special marble type placed (all by default): a loss or an army below MIN_ARMY ends it, the boss of the last act wins
 * it, any other win offers a reward, and an elite or an act boss a relic first (#1457). The army never holds more special
 * marbles than marbles: past that, they go in the order FALL. A win earns scrap (#1459). The relics act here: Hull
 * plating brings one lost marble back, the Salvage magnet and the War chest more marbles after an elite and a boss. */
export function fightOver(map: MapNode[], run: Run, won: boolean, lost: number, kept = countOf(run.placed)): Run {
  const node = lastNode(map, run)!;
  const left = run.army - Math.max(0, lost - Number(has(run, Relic.HullPlating)));
  const end = !won || left < MIN_ARMY ? 'lost' : node.kind === 'boss' && node.act === lastAct(map) ? 'won' : '';
  const back =
    node.kind === 'elite'
      ? ELITE_MARBLES + Number(has(run, Relic.SalvageMagnet))
      : node.kind === 'boss' && has(run, Relic.WarChest)
        ? CHEST_MARBLES
        : 0;
  const army = end === '' ? Math.min(START_ARMY, left + back) : left;
  const placed = countOf(run.placed);
  const specials = run.specials.map((n, k) => n - placed[k]! + kept[k]!);
  let over = sum(specials) - army;
  for (const k of FALL) {
    const drop = Math.max(0, Math.min(specials[k]!, over));
    specials[k]! -= drop;
    over -= drop;
  }
  const tier = node.kind === 'boss' ? 'boss' : node.kind === 'elite' ? 'elite' : 'fight';
  const earns = end !== 'lost';
  const scrap = run.scrap + (earns ? SCRAP[tier] : 0);
  const cells = run.cells + (earns ? CELLS[tier] : 0);
  const found = earns && tier !== 'fight' && node.act < lastAct(map) ? dropOf(run) : -1; // no Collector follows the last act
  const carried = found < 0 ? run.carried : [...run.carried, found];
  const collector = earns && tier === 'boss' && node.act < lastAct(map) && carried.length > 0;
  const exit = run.exits && earns && tier === 'boss' && node.act < lastAct(map); // the exits wait after the Collector (#1472)
  const after: Run = { ...run, army, specials, fighting: false, moves: [], placed: [], end, reward: end === '', scrap, cells, carried, drop: found + 1, collector, exit };
  const relic = end === '' && (node.kind === 'elite' || node.kind === 'boss');
  return { ...after, relic: relic && unheld(after).length > 0, reward: offers(after).length > 0 || tacticOffer(after) > 0 };
}

/** The blueprint a won elite or act boss drops at the run's last node (#1470): one the run's pools do not hold, that it does
 * not carry and has not banked, dealt by the run seed and the node, as the reward offers; -1 when none is left. */
function dropOf(run: Run): number {
  const pool = BLUEPRINTS.flatMap((b, id) => (isOn(run, b.type, b.code) || run.carried.includes(id) || run.banked.includes(id) ? [] : [id]));
  return pool.length ? pool[hash(hash(run.seed, run.path[run.path.length - 1]! * 8 + 3), 11) % pool.length]! : -1;
}

/** The run once the blueprint `id` it carries is banked at the Collector (#1470): `COLLECT_COST` cells paid, unlocked for
 * the next runs (main.ts keeps it), not for this one. Unchanged when no Collector waits, the blueprint is not carried or the
 * cells fall short. */
export function collect(run: Run, id: number): Run {
  if (!run.collector || !run.carried.includes(id) || run.cells < COLLECT_COST) return run;
  return { ...run, cells: run.cells - COLLECT_COST, carried: run.carried.filter((c) => c !== id), banked: [...run.banked, id] };
}

/** The run once it leaves the Collector: the map goes on; the blueprints not banked wait for the next one. */
export const leaveCollector = (run: Run): Run => ({ ...run, collector: false });

/** A 32-bit hash of two integers (murmur3's finaliser): the reward offers' only randomness. */
function hash(a: number, b: number): number {
  let h = Math.imul(a ^ Math.imul(b + 1, 0x9e3779b9), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** The reward offers after a won fight, seeded by the run seed and the node: 3 of a marble (`0`, only below
 * START_ARMY) and the three special marbles (their kind, only while the army has plain marbles to make special, and once
 * unlocked). */
export function offers(run: Run): number[] {
  if (!run.reward) return [];
  const pool = [...(run.army < START_ARMY ? [0] : []), ...(sum(run.specials) < run.army ? DEALT.filter((k) => kindOn(run, k)) : [])];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = hash(run.seed, run.path[run.path.length - 1]! * 8 + i) % (i + 1); // the node won, an index of the map
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, has(run, Relic.LuckyCoin) ? 4 : 3);
}

/** The tactic a won fight also offers (#1460): its code, dealt by the run seed and the node, or 0 when no reward waits or
 * the hand is full. The other offers are the same as before it. */
export function tacticOffer(run: Run): number {
  const pool = tacticPool(run);
  return run.reward && run.tactics.length < MAX_TACTICS ? pool[hash(run.seed, run.path[run.path.length - 1]! * 8 + 7) % pool.length]! : 0;
}

/** The run once the tactic offered is taken in place of the other rewards. */
export function claimTactic(run: Run): Run {
  const code = tacticOffer(run);
  return code ? { ...run, tactics: [...run.tactics, code], reward: false } : run;
}

/** The relics a waiting offer holds (#1457): 3 after an act boss, 1 after an elite or in a treasure, of those the run
 * does not hold, dealt by the run seed and the node, as the reward offers. */
export function relicOffers(map: MapNode[], run: Run): number[] {
  if (!run.relic) return [];
  const node = run.path[run.path.length - 1]!;
  const pool = unheld(run);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = hash(hash(run.seed, node * 8 + 6), i) % (i + 1);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, map[node]!.kind === 'boss' ? 3 : 1);
}

/** The run once the offered relic `relic` is taken: it holds it for the rest of the run. */
export function takeRelic(map: MapNode[], run: Run, relic: number): Run {
  return relicOffers(map, run).includes(relic) ? { ...run, relics: [...run.relics, relic], relic: false } : run;
}

/** The run once the reward `offer` is picked: a marble more, or one of the army's marbles made special. */
export function claim(run: Run, offer: number): Run {
  if (!offers(run).includes(offer)) return run;
  const specials = run.specials.map((n, k) => n + Number(offer === k + 1));
  return { ...run, army: run.army + Number(offer === 0), specials, reward: false };
}

/** One thing the shop sells (#1459): its id (0 to 3), its kind, its code (a special marble type, a relic or a tactic; 0 for a
 * marble) and its price in scrap. */
export interface ShopItem {
  id: number;
  kind: 'marble' | 'special' | 'relic' | 'tactic';
  code: number;
  price: number;
}
/** The id of the shop's removal of a special marble in `Run.bought`: once per shop. */
const REMOVAL = 4;
/** The shop's draw `id` of the run's last node: the run seed and the node, as the reward offers. */
const shopDraw = (run: Run, id: number): number => hash(run.seed, run.path[run.path.length - 1]! * 8 + id);
/** A price from `base` up to `spread - 1` more, dealt by the run seed and the node. */
const priced = (run: Run, id: number, base: number, spread: number): number => base + (shopDraw(run, id) % spread);
/** What the shop asks to make a special marble plain again. */
export const removalPrice = (run: Run): number => priced(run, REMOVAL, 20, 11);

/** What the shop at the run's last node still sells, dealt by the run seed and the node: a marble, a special marble of an
 * unlocked type, a relic the run does not hold (none when it holds them all) and a tactic. Nothing when no shop waits. */
export function shopStock(run: Run): ShopItem[] {
  if (!run.shop) return [];
  const types = DEALT.filter((k) => kindOn(run, k));
  const relics = unheld(run);
  const deal = (id: number, n: number): number => hash(shopDraw(run, id), 1) % n;
  const items: ShopItem[] = [
    { id: 0, kind: 'marble', code: 0, price: priced(run, 0, 15, 6) },
    { id: 1, kind: 'special', code: types[deal(1, types.length)]!, price: priced(run, 1, 25, 11) },
    ...(relics.length ? [{ id: 2, kind: 'relic' as const, code: relics[deal(2, relics.length)]!, price: priced(run, 2, 60, 21) }] : []),
    { id: 3, kind: 'tactic', code: tacticPool(run)[deal(3, tacticPool(run).length)]!, price: priced(run, 3, 30, 11) },
  ];
  return items.filter((i) => !run.bought.includes(i.id));
}

/** Why the run cannot take `item` whatever its scrap, or '' (#1459). */
function blocked(run: Run, item: ShopItem): string {
  if (item.kind === 'marble') return run.army >= START_ARMY ? 'army full' : '';
  if (item.kind === 'special') return sum(run.specials) >= run.army ? 'no plain marble left' : '';
  return item.kind === 'tactic' && run.tactics.length >= MAX_TACTICS ? 'hand full' : '';
}

/** The run once the shop's item `id` is bought: its price paid, its marble, special marble, relic or tactic gained and the
 * item sold. Unchanged when no such item is for sale, it cannot be taken or the scrap falls short. */
export function buy(run: Run, id: number): Run {
  const item = shopStock(run).find((i) => i.id === id);
  if (!item || blocked(run, item) || run.scrap < item.price) return run;
  const paid = { ...run, scrap: run.scrap - item.price, bought: [...run.bought, id] };
  if (item.kind === 'marble') return { ...paid, army: run.army + 1 };
  if (item.kind === 'special') return { ...paid, specials: run.specials.map((n, k) => n + Number(k === item.code - 1)) };
  return item.kind === 'relic' ? { ...paid, relics: [...run.relics, item.code] } : { ...paid, tactics: [...run.tactics, item.code] };
}

/** The special marble types the shop may take back to a plain marble: those the army holds, until it has done it once. */
export const removable = (run: Run): number[] =>
  run.shop && !run.bought.includes(REMOVAL) ? SPECIAL_LOOKS.flatMap((_, k) => (run.specials[k]! > 0 ? [k + 1] : [])) : [];

/** The run once the shop makes one of its special marbles of the type `kind` a plain marble for scrap, once per shop.
 * Unchanged when the army holds none of `kind`, it was done or the scrap falls short. */
export function removeSpecial(run: Run, kind: number): Run {
  const price = removalPrice(run);
  if (!removable(run).includes(kind) || run.scrap < price) return run;
  return { ...run, scrap: run.scrap - price, bought: [...run.bought, REMOVAL], specials: run.specials.map((n, k) => n - Number(k === kind - 1)) };
}

/** The run once it leaves the shop: the map goes on, the next shop sells afresh. */
export const leaveShop = (run: Run): Run => ({ ...run, shop: false, bought: [] });

/** Before the first move of a fight, the army's special marbles are placed on its board. */
export const placing = (run: Run): boolean => run.fighting && run.moves.length === 0 && sum(run.specials) > 0;

/** The special marbles of type `kind` left to place: the army's, at most FIGHT_CAP (one more with the Quartermaster), less
 * those placed. */
export const left = (run: Run, kind: number): number =>
  Math.min(run.specials[kind - 1]!, FIGHT_CAP + Number(has(run, Relic.Quartermaster))) - countOf(run.placed)[kind - 1]!;

/** The run once a special marble of type `kind` is placed on the marble at `cell` (it replaces another type there), or
 * taken back when that marble is already one. Unchanged when none is left or the fight is on. */
export function place(run: Run, [q, r]: Axial, kind: number): Run {
  if (!placing(run)) return run;
  const rest = run.placed.filter((p) => p[0] !== q || p[1] !== r);
  if (rest.length < run.placed.length && run.placed.find((p) => p[0] === q && p[1] === r)![2] === kind) return { ...run, placed: rest };
  return left({ ...run, placed: rest }, kind) > 0 ? { ...run, placed: [...rest, [q, r, kind]] } : run;
}

/** The Spark the push `move` throws off the board `before` it, or null: the last marble of the pushed line, at the
 * rim. Its burst (docs/specs/roguelite.md section 5) is drawn from that cell. */
export function sparkBurst(before: ArrayLike<number>, specials: Special[], move: Move): Axial | null {
  const [dq, dr] = DIRECTIONS[move.dir]!;
  const inGroup = ([q, r]: Axial): boolean => move.cells.some((c) => c[0] === q && c[1] === r);
  const leads = move.cells.filter(([q, r]) => !inGroup([q + dq, r + dr]));
  if (leads.length !== 1) return null; // a broadside move pushes nothing
  const on = ([q, r]: Axial): boolean => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= RADIUS;
  let [q, r] = leads[0]!;
  let last: Axial | null = null;
  for (q += dq, r += dr; on([q, r]) && isMarble(before[cellIndex(q, r)]); q += dq, r += dr) last = [q, r];
  if (on([q, r]) || !last) return null; // a free cell stops the push, or nothing is pushed
  const [lq, lr] = last;
  return specials.some((s) => (s.kind === 3 || s.kind === 6) && s.cell[0] === lq && s.cell[1] === lr) ? last : null;
}

/** An army of `army` marbles, `specials` of them special. */
const owned = (army: number, specials: number[]): string =>
  `${army} marbles${SPECIAL_LOOKS.flatMap((l, k) => (specials[k] ? [`, ${specials[k]} ${l.name}`] : [])).join('')}`;

/** The acts a run won so far: its bosses beaten, not the one it fights or lost to (#801). */
export function actsWon(map: MapNode[], run: Run): number {
  const bosses = run.path.filter((n) => map[n]!.kind === 'boss').length;
  return bosses - Number((run.fighting || run.end === 'lost') && lastNode(map, run)?.kind === 'boss');
}

/** The unlocks of a run over: the special marble types and commanders of the acts it won past its `best`. */
export function earned(map: MapNode[], run: Run): string[] {
  const won = actsWon(map, run);
  const fresh = (acts: number): boolean => acts > run.best && acts <= won;
  return [
    ...DEALT.flatMap((k) => (fresh(KIND_ACTS[k - 1]!) ? [`${SPECIAL_LOOKS[k - 1]!.name} marbles`] : [])),
    ...COMMANDERS.flatMap((c) => (fresh(c.acts) ? [`${c.name} commander`] : [])),
  ];
}

/** Where the most acts won in one run is kept, next to the other progress (medals.ts). */
const BEST_KEY = 'ab-alone.roguelite';

/** The most acts won in one run, 0 when none is saved or the storage is blocked. */
export function readBest(store: Store): number {
  const best = Number(read(store, BEST_KEY));
  return isInt(best, ALL_ACTS) ? best : 0;
}

/** Keeps `acts` won in a run when it is the most yet. */
export function recordBest(store: Store, acts: number): void {
  if (acts > readBest(store)) write(store, BEST_KEY, String(acts));
}

/** What the start of a run unlocked shows: the special marble types in its rewards, the locked ones with what unlocks
 * them, a button per commander with its portrait, the one picked pressed, the picked one's line and relic. */
function startHtml(run: Run): string {
  const after = (acts: number): string => (acts === ALL_ACTS ? 'after a run won' : `after ${acts} act${acts === 1 ? '' : 's'} won in a run`);
  const on = DEALT.filter((k) => kindOn(run, k)).map((k) => SPECIAL_LOOKS[k - 1]!.name);
  const off = DEALT.filter((k) => !kindOn(run, k)).map((k) => ` · ${SPECIAL_LOOKS[k - 1]!.name} ${after(KIND_ACTS[k - 1]!)}`);
  const commanders = COMMANDERS.map((c, i) => {
    const locked = c.acts > run.best;
    return (
      `<button type="button" data-commander="${i}" aria-pressed="${i === run.commander}"${locked ? ' disabled' : ''}>` +
      `${lineGlyph(c.icon)}${c.name} · ${locked ? after(c.acts) : `${owned(START_ARMY, c.specials)} · ${RELICS[c.relic]!.name}`}</button>`
    );
  });
  const picked = COMMANDERS[run.commander];
  const line = picked ? `<p class="run-help">${picked.name}: ${picked.line} Starts with ${RELICS[picked.relic]!.name}, ${RELICS[picked.relic]!.help}.</p>` : '';
  const left = BLUEPRINTS.filter((b) => !isOn(run, b.type, b.code)).length;
  const bank = left ? `<p class="run-help">Blueprints to bank: ${left} · elites and act bosses drop them, the Collector between acts banks them for good</p>` : '';
  return `<p class="run-help">Special marbles in rewards: ${on.join(', ')}${off.join('')}</p><div class="run-commanders">${commanders.join('')}</div>${line}${bank}`;
}

/** The summary of a run over (#801): the path act by act, the fights won and lost, the army at the end, the unlocks. */
function summaryHtml(map: MapNode[], run: Run): string {
  const kind = (n: number): NodeKind => kindOf(map, run, n); // what an unknown node turned into (#1463)
  const label = (n: number): string => kind(n)[0]!.toUpperCase() + kind(n).slice(1);
  const acts = [...new Set(run.path.map((n) => map[n]!.act))].map(
    (act) => `act ${act + 1} ${run.path.flatMap((n) => (map[n]!.act === act ? [label(n)] : [])).join(', ')}`,
  );
  const fights = run.path.filter((n) => ['fight', 'elite', 'boss'].includes(kind(n))).length;
  const lost = Number(run.end === 'lost');
  const unlocks = [...earned(map, run), ...run.banked.map(blueprintName)];
  return [
    `Path: ${acts.join(' · ')}`,
    ...(run.biomes.length ? [`Biomes: ${['Meadow', ...run.biomes.slice(0, new Set(run.path.map((n) => map[n]!.act)).size - 1).map((b) => BIOMES[b]!.name)].join(', ')}`] : []),
    `Fights: ${fights - lost} won, ${lost} lost`,
    `Army at the end: ${owned(run.army, run.specials)}`,
    ...(run.scrap ? [`Scrap left: ${run.scrap}, lost with the run`] : []),
    ...(run.cells ? [`Cells left: ${run.cells}, lost with the run`] : []),
    ...(run.carried.length ? [`Blueprints lost with the run: ${run.carried.map(blueprintName).join(', ')}`] : []),
    unlocks.length ? `Unlocked: ${unlocks.join(', ')}` : 'No new unlock',
  ]
    .map((line) => `<p class="run-help">${line}</p>`)
    .join('');
}

/** Tally's closing line of a run over (#1174): the audit reconciled with the army left, or voided. Optional flavour. */
export const auditLine = (run: Run): string => (run.end === 'won' ? `Reconciled: ${run.army}.` : 'Run voided. Audit reopened.');

/** The line that says where the run stands, on the map and in the HUD of its fights. */
export function runLine(map: MapNode[], run: Run): string {
  if (run.end === 'won') return `Run won with ${run.army} marbles`;
  if (run.end === 'lost') return `Run lost · ${run.army} marbles left`;
  const node = run.fighting ? lastNode(map, run)! : null;
  const foes = node && run.enemies ? [...(node.elite ? [ELITES[node.elite - 1]!.name] : []), ...(node.formation ? [FORMATIONS[node.formation]!] : [])] : [];
  const biome = currentBiome(map, run);
  const place = biome ? [BIOMES[biome]!.name] : [];
  const where = node ? [`act ${node.act + 1} ${node.kind}`, ...place, ...foes].join(' · ') : '';
  const bag = [run.scrap && `${run.scrap} scrap`, run.cells && `${run.cells} cells`, run.carried.length && `${run.carried.length} blueprint${run.carried.length === 1 ? '' : 's'}`];
  const army = `army ${owned(run.army, run.specials)}${bag.flatMap((b) => (b ? [` · ${b}`] : [])).join('')}`;
  const rested = lastNode(map, run)?.kind === 'rest' && !run.rest ? 'rested · ' : '';
  return node ? `Rogue-lite run · ${where} · ${army}` : `Rogue-lite run · ${rested}${place.map((p) => `${p} · `).join('')}${army} · pick a fight`;
}

const polygon = (points: readonly [number, number][]): string => points.map(([x, y]) => `${x},${-y}`).join(' ');
/** The glyph of a special marble type (`0` a plain marble), drawn in its colour, outlined in the text's colour; an
 * upgraded type's with its `+` (#1458). */
function glyph(kind: number): string {
  const look = SPECIAL_LOOKS[kind - 1];
  const plus = look?.plus ? `<polygon class="plus" points="${polygon(PLUS_POINTS)}" fill="#${PLUS_INK.toString(16).padStart(6, '0')}"/>` : '';
  const shape = look
    ? `<polygon points="${polygon(look.points)}" fill="#${look.color.toString(16)}" stroke="currentColor" stroke-width="0.15"/>${plus}`
    : '<circle r="0.8" fill="currentColor"/>';
  return `<svg class="glyph" viewBox="-1 -1 2 2" aria-hidden="true">${shape}</svg>`;
}

/** The placement screen before the first move of a fight: a button per type the army holds, with what is left of it,
 * the type `armed` pressed; a press on one of the army's marbles places it. */
export function placeHtml(run: Run, armed: number): string {
  const kinds = SPECIAL_LOOKS.flatMap(({ name }, k) =>
    run.specials[k]
      ? [`<button type="button" data-kind="${k + 1}" aria-pressed="${armed === k + 1}">${glyph(k + 1)}${name} · ${left(run, k + 1)} left</button>`]
      : [],
  );
  return (
    `<p class="run-line">Place your special marbles</p><div class="run-kinds">${kinds.join('')}</div>` +
    '<p class="run-help">Pick a type, then one of your marbles; press it again to take it back. Your first move starts the fight.</p>'
  );
}

/** The reward screen after a won fight: a button per offer, and the marbles an elite gave back. */
export function rewardHtml(map: MapNode[], run: Run): string {
  const label = (offer: number): string => (offer ? `${SPECIAL_LOOKS[offer - 1]!.name}: ${SPECIAL_LOOKS[offer - 1]!.help}` : 'One more marble');
  const buttons = offers(run).map((o) => `<button type="button" data-offer="${o}">${glyph(o)}${label(o)}</button>`);
  const tactic = tacticOffer(run);
  if (tactic) buttons.push(`<button type="button" data-tactic-offer="${tactic}">${lineGlyph(TACTICS[tactic - 1]!.icon)}${tacticText(tactic)}</button>`);
  const title = lastNode(map, run)?.kind === 'elite' ? `Elite beaten · up to ${ELITE_MARBLES} marbles back` : 'Fight won';
  return `<p class="run-line">${title} · pick a reward</p>${dropHtml(map, run)}<div class="run-kinds">${buttons.join('')}</div>`;
}

/** The rest site's screen (#1458): Rest, and an Upgrade per plain special marble type the army holds, or Upgrade
 * disabled with its reason when it holds none. */
export function restHtml(run: Run): string {
  const bunks = has(run, Relic.Bunks) ? ' · Bunks: a plain marble becomes a Heavy' : '';
  const a = (name: string): string => (/^[AEIOU]/.test(name) ? 'an' : 'a');
  const ups = upgradable(run).map((k) => {
    const [from, to] = [SPECIAL_LOOKS[k - 1]!, SPECIAL_LOOKS[k + 2]!];
    return `<button type="button" data-upgrade="${k}">${glyph(k + 3)}Upgrade ${a(from.name)} ${from.name}: ${to.name} ${to.help}</button>`;
  });
  const none = '<button type="button" data-upgrade="0" disabled>Upgrade: no special marble left to upgrade</button>';
  return (
    `<p class="run-line">Rest site · rest or upgrade</p>` +
    `<div class="run-kinds"><button type="button" data-rest="1">Rest: back up to ${START_ARMY} marbles${bunks}</button>${ups.join('') || none}</div>`
  );
}

/** The event screen: its title and text, a button per choice with what it gives (disabled when it cannot be paid), the
 * last one Leave. */
export function eventHtml(run: Run): string {
  const e = eventOf(run)!;
  const buttons = e.choices.map((c, i) => {
    const bargain = (c.win.army < 0 || c.fail.army < 0) && has(run, Relic.Bargain) ? ' · Bargain: 1 marble less' : '';
    return `<button type="button" data-choice="${i}"${takeEvent(run, e, i) ? '' : ' disabled'}>${choiceText(run, c)}${bargain}</button>`;
  });
  return `<p class="run-line">Event · ${e.title}</p><p class="run-help">${e.text}</p><div class="run-kinds">${buttons.join('')}</div>`;
}

/** A relic's glyph: its icon drawn as a line in the text's colour. */
const lineGlyph = (icon: string): string =>
  `<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="${icon}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const relicGlyph = (code: number): string => lineGlyph(RELICS[code]!.icon);
export const tacticText = (code: number): string => `${TACTICS[code - 1]!.name}: ${TACTICS[code - 1]!.help}`;
export const relicText = (code: number): string => `${RELICS[code]!.name}: ${RELICS[code]!.help}`;

const BLUEPRINT_LABELS = { relic: 'Relic', tactic: 'Tactic', special: 'Special marble' } as const;
/** A blueprint's name, its line (type, name and rule) and its glyph (#1470). */
export function blueprintName(id: number): string {
  const { type, code } = BLUEPRINTS[id]!;
  return type === 'relic' ? RELICS[code]!.name : type === 'tactic' ? TACTICS[code - 1]!.name : SPECIAL_LOOKS[code - 1]!.name;
}
export function blueprintText(id: number): string {
  const { type, code } = BLUEPRINTS[id]!;
  const rule = type === 'relic' ? relicText(code) : type === 'tactic' ? tacticText(code) : `${SPECIAL_LOOKS[code - 1]!.name}: ${SPECIAL_LOOKS[code - 1]!.help}`;
  return `${BLUEPRINT_LABELS[type]} blueprint · ${rule}`;
}
function blueprintGlyph(id: number): string {
  const { type, code } = BLUEPRINTS[id]!;
  return type === 'relic' ? relicGlyph(code) : type === 'tactic' ? lineGlyph(TACTICS[code - 1]!.icon) : glyph(code);
}

/** The line that names the blueprint an elite or an act boss just dropped, on its reward and relic screens (#1470). */
function dropHtml(map: MapNode[], run: Run): string {
  const kind = lastNode(map, run)?.kind;
  return run.drop && (kind === 'elite' || kind === 'boss')
    ? `<p class="run-help">Blueprint found · ${blueprintText(run.drop - 1)} · kept for the Collector, lost if the run ends first</p>`
    : '';
}

/** The Collector's room between two acts (#1470): a button per blueprint carried with its cost in cells (disabled when the
 * cells fall short), what this run banked, and Leave. */
export function collectorHtml(run: Run): string {
  const buttons = run.carried.map((id) => {
    const short = run.cells < COLLECT_COST;
    return `<button type="button" data-collect="${id}"${short ? ' disabled' : ''}>${blueprintGlyph(id)}${blueprintText(id)} · ${COLLECT_COST} cells${short ? ' · not enough cells' : ''}</button>`;
  });
  const banked = run.banked.length ? `<p class="run-help">Banked this run: ${run.banked.map(blueprintName).join(', ')}</p>` : '';
  return (
    `<p class="run-line">Collector · ${run.cells} cells</p>` +
    '<p class="run-help">Bank a blueprint: it joins the pools of your next runs for good. Blueprints and cells left here wait for the next Collector, and are lost if the run ends first.</p>' +
    `${banked}<div class="run-kinds">${buttons.join('')}<button type="button" data-depart="1">Leave</button></div>`
  );
}

/** The exit screen between two acts (#1472): a button per exit with its biome, the holes its fights open, the special marble they
 * hold and the boss that ends its act (`bossName` is the bridge's boss_name; unknown when it has none), each wearing its tint. */
export function exitHtml(map: MapNode[], run: Run, exitsOf: (act: number, from: number) => ArrayLike<number>, bossName: (id: string) => string | undefined): string {
  const act = lastNode(map, run)!.act + 1;
  const buttons = exitOffers(map, run, exitsOf).map((code) => {
    const biome = BIOMES[code]!;
    return `<button type="button" data-exit="${code}" data-biome="${biome.id}">${biome.name} · ${biome.hazard} · foes: ${biome.foes} · boss: ${bossName(biome.boss) ?? 'unknown'}</button>`;
  });
  return (
    `<p class="run-line">Act ${act} done · pick the exit to act ${act + 1}</p>` +
    '<p class="run-help">Each exit leads to a biome for the next act: its fights open holes in the board, where a marble pushed in is lost, hold its special marble, and its boss ends the act.</p>' +
    `<div class="run-kinds run-exits">${buttons.join('')}</div>`
  );
}

/** The relic screen (#1457): a treasure's relic, an elite's, or the act boss's 3 to pick from, a button each. */
export function relicHtml(map: MapNode[], run: Run): string {
  const kind = lastNode(map, run)!.kind;
  const title = kind === 'treasure' ? 'Treasure · a chest holds a relic' : kind === 'elite' ? 'Elite beaten · take its relic' : 'Boss beaten · pick a relic';
  const buttons = relicOffers(map, run).map((r) => `<button type="button" data-relic="${r}">${relicGlyph(r)}${relicText(r)}</button>`);
  return `<p class="run-line">${title}</p>${dropHtml(map, run)}<div class="run-kinds">${buttons.join('')}</div>`;
}

/** The relic bar (#1457), in the HUD on the map and in the fights: a glyph per relic the run holds, its name and rule
 * as its tooltip; nothing before the first relic. */
export function relicBarHtml(run: Run): string {
  const glyphs = run.relics.map((r) => `<span class="relic" role="img" tabindex="0" title="${relicText(r)}" aria-label="${relicText(r)}">${relicGlyph(r)}</span>`);
  return glyphs.length ? `<div class="relics" role="group" aria-label="Relics">${glyphs.join('')}</div>` : '';
}

/** The tactic bar (#1460), in the HUD of a fight: a glyph button per tactic held, its name and rule as its tooltip, disabled
 * when `mask` (Engine.tactics, bit code - 1) says the engine cannot play it now; the Swap pressed while its cells are being
 * picked (`swapping`). Nothing when none is held. */
export function tacticBarHtml(run: Run, mask: number, swapping: boolean): string {
  const buttons = run.tactics.map(
    (code) =>
      `<button type="button" class="tactic" data-tactic="${code}" title="${tacticText(code)}" aria-label="${tacticText(code)}" aria-pressed="${swapping && code === 3}"` +
      `${mask & (1 << (code - 1)) ? '' : ' disabled'}>${lineGlyph(TACTICS[code - 1]!.icon)}</button>`,
  );
  return buttons.length ? `<div class="tactics" role="group" aria-label="Tactics">${buttons.join('')}</div>` : '';
}

/** The shop's screen (#1459): the scrap, a button per item for sale with its price (disabled with its reason when it cannot
 * be taken or paid), a button per special marble type to make plain again, and Leave. */
export function shopHtml(run: Run): string {
  const text = (item: ShopItem): string =>
    item.kind === 'marble'
      ? 'One more marble'
      : item.kind === 'special'
        ? `${SPECIAL_LOOKS[item.code - 1]!.name}: ${SPECIAL_LOOKS[item.code - 1]!.help}`
        : item.kind === 'relic'
          ? relicText(item.code)
          : tacticText(item.code);
  const icon = (item: ShopItem): string =>
    item.kind === 'marble' || item.kind === 'special' ? glyph(item.code) : item.kind === 'relic' ? relicGlyph(item.code) : lineGlyph(TACTICS[item.code - 1]!.icon);
  const button = (data: string, glyphs: string, label: string, price: number, block = ''): string => {
    const why = block || (run.scrap < price ? 'not enough scrap' : '');
    return `<button type="button" ${data}${why ? ' disabled' : ''}>${glyphs}${label} · ${price} scrap${why ? ` · ${why}` : ''}</button>`;
  };
  const items = shopStock(run).map((i) => button(`data-buy="${i.id}"`, icon(i), text(i), i.price, blocked(run, i)));
  const removes = removable(run).map((k) =>
    button(`data-remove="${k}"`, glyph(k), `Remove a ${SPECIAL_LOOKS[k - 1]!.name}: back to a plain marble`, removalPrice(run)),
  );
  const none = '<button type="button" data-remove="0" disabled>Remove a special marble: none to remove</button>';
  const removal = run.bought.includes(REMOVAL) ? [] : removes.length ? removes : [none];
  return (
    `<p class="run-line">Shop · ${run.scrap} scrap</p>` +
    `<div class="run-kinds">${[...items, ...removal].join('')}<button type="button" data-leave="1">Leave</button></div>`
  );
}

/** The map screen: the run line, the unlocks and commanders before the first pick, the nodes act by act from the
 * top, each placed on its row, the links between them (the path taken marked), the nodes to pick enabled; once the run
 * is over, its summary and New run. */
export function mapHtml(map: MapNode[], run: Run): string {
  const head = `<p class="run-line">${runLine(map, run)}</p>`;
  if (run.end) return `${head}${summaryHtml(map, run)}<p class="run-tally">${auditLine(run)}</p><button type="button" id="run-new">New run</button>`;
  const open = choices(map, run);
  const rows = Math.max(...map.map((n) => n.row)) + 1;
  const total = (lastAct(map) + 1) * rows;
  const spot = (n: MapNode): [number, number] => {
    const width = map.filter((o) => o.act === n.act && o.row === n.row).length;
    return [((n.col + 0.5) / width) * 100, ((n.act * rows + n.row + 0.5) / total) * 100];
  };
  const here = run.path[run.path.length - 1];
  const taken = (i: number, j: number): boolean => run.path.some((p, k) => p === i && run.path[k + 1] === j);
  const lines = map.flatMap((n, i) =>
    next(map, [i]).map((j) => {
      const [[x1, y1], [x2, y2]] = [spot(n), spot(map[j]!)];
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${taken(i, j) ? ' class="taken"' : ''}/>`;
    }),
  );
  const nodes = map.map((n, i) => {
    const [x, y] = spot(n);
    const mark = i === here ? ' here' : run.path.includes(i) ? ' taken' : '';
    const kind = n.kind === 'unknown' ? '?' : n.kind[0]!.toUpperCase() + n.kind.slice(1);
    const elite = run.enemies && n.elite ? ELITES[n.elite - 1]!.name : '';
    return (
      `<button type="button" class="node${n.kind === 'fight' ? '' : ` ${n.kind}`}${mark}" data-node="${i}" style="left:${x}%;top:${y}%" ` +
      `aria-label="Act ${n.act + 1}, ${n.kind}${elite && `, ${elite}`}"${open.includes(i) ? '' : ' disabled'}>${kind}${elite && `<small>${elite.replace('The ', '')}</small>`}</button>`
    );
  });
  const svg = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines.join('')}</svg>`;
  const told = run.told ? `<p class="run-help">${run.told}</p>` : '';
  return `${head}${told}${run.path.length ? '' : startHtml(run)}<div class="run-graph">${svg}${nodes.join('')}</div>`;
}

/** The most scrap a saved run may hold. */
const MAX_SCRAP = 99999;
/** The longest line of what an event told that a saved run may hold: the line is drawn as HTML, so it holds no markup. */
const MAX_TOLD = 200;
const isInt = (v: unknown, max: number): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max;
const isRecord = (mv: unknown): boolean => Array.isArray(mv) && mv.length === MOVE_STRIDE && mv.every((v) => Number.isInteger(v));

/** Blueprint ids of a save: each of a blueprint, none twice. */
const isIds = (v: unknown): v is number[] => Array.isArray(v) && v.every((id, i) => isInt(id, BLUEPRINTS.length - 1) && v.indexOf(id) === i);
const isInts = (v: unknown, n: number): v is number[] => Array.isArray(v) && v.length === n && v.every((x) => isInt(x, START_ARMY));
/** Special marble counts of a save: 3 (before the upgrades), 6 (before the new four, #1461) or one per type. */
const isCounts = (v: unknown): v is number[] => [PLAIN.length, 2 * PLAIN.length, SPECIAL_LOOKS.length].some((n) => isInts(v, n));

/** The run in `raw`, or null when it is not a saved run. A run saved before the special marbles (#961) has none, one
 * saved before the unlocks (#801) everything unlocked, one saved before the relics (#1457) none, one saved before the
 * upgrades (#1458) no upgraded special marble and no rest site waiting, one saved before the shop (#1459) no scrap and no
 * shop waiting, one saved before the Magnet, Shield, Bomb and Medic (#1461) none of them, one saved before the varied enemies (#1462)
 * the plain army, one saved before the Collector (#1470) the relics and tactics unlocked and no cells, blueprint or room, one saved before the events told (#1463) none, one saved before the biomes (#1472) no exit to offer and the Meadow in every act, one saved before the commanders (#1464) none. */
function decodeRun(raw: unknown): Run | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { seed, army, path, fighting, moves, end, specials = [0, 0, 0], placed = [], reward = false, event = false, best = ALL_ACTS, relics = [], commander = -1, relic = false, rest = false, tactics = [], scrap = 0, shop = false, bought = [], enemies = false, unlocked = LEGACY_UNLOCKED, cells = 0, carried = [], banked = [], drop = 0, collector = false, told = '', exits = false, exit = false, biomes = [] } =
    raw as Record<keyof Run, unknown>;
  const ok =
    isInt(seed, 0xffffffff) &&
    isInt(army, START_ARMY) &&
    Array.isArray(path) &&
    typeof fighting === 'boolean' &&
    Array.isArray(moves) &&
    moves.every(isRecord) &&
    (end === '' || end === 'won' || end === 'lost') &&
    isCounts(specials) &&
    Array.isArray(placed) &&
    placed.every((p) => Array.isArray(p) && p.length === 3 && p.every((v) => Number.isInteger(v))) &&
    typeof reward === 'boolean' &&
    typeof event === 'boolean' &&
    isInt(best, ALL_ACTS) &&
    Array.isArray(relics) &&
    relics.every((r, i) => isInt(r, RELICS.length - 1) && relics.indexOf(r) === i) &&
    Number.isInteger(commander) &&
    (commander as number) >= -1 &&
    (commander as number) < COMMANDERS.length &&
    typeof relic === 'boolean' &&
    typeof rest === 'boolean' &&
    Array.isArray(tactics) &&
    tactics.length <= MAX_TACTICS &&
    tactics.every((t) => isInt(t, TACTICS.length) && t > 0) &&
    isInt(scrap, MAX_SCRAP) &&
    typeof shop === 'boolean' &&
    Array.isArray(bought) &&
    bought.every((b, i) => isInt(b, REMOVAL) && bought.indexOf(b) === i) &&
    typeof enemies === 'boolean' &&
    isIds(unlocked) &&
    isInt(cells, MAX_SCRAP) &&
    isIds(carried) &&
    isIds(banked) &&
    isInt(drop, BLUEPRINTS.length) &&
    typeof collector === 'boolean' &&
    typeof told === 'string' &&
    told.length <= MAX_TOLD &&
    !/[<>&"]/.test(told) &&
    typeof exits === 'boolean' &&
    typeof exit === 'boolean' &&
    Array.isArray(biomes) &&
    biomes.length < ALL_ACTS &&
    biomes.every((b, i) => isInt(b, BIOMES.length - 1) && b > 0 && biomes.indexOf(b) === i);
  return ok
    ? { seed, army, path: [...(path as number[])], fighting, moves: moves as number[][], end, specials: SPECIAL_LOOKS.map((_, k) => specials[k] ?? 0), placed: placed as number[][], reward, event, best, relics, commander: commander as number, relic, rest, tactics, scrap, shop, bought, enemies, unlocked: [...unlocked], cells, carried, banked, drop, collector, told, exits, exit, biomes }
    : null;
}

/** Saves the run after a pick or a move, or deletes it once the run is over. A storage error loses the save, never the
 * run: it just does not survive the next reload. */
export async function saveRun(store: KeyStore, run: Run): Promise<void> {
  try {
    await (run.end ? store.delete(RUN_KEY) : store.put(RUN_KEY, run));
  } catch {
    // Storage blocked or full.
  }
}

/** Deletes the saved run: leaving the run for another mode abandons it. */
export async function clearRun(store: KeyStore): Promise<void> {
  try {
    await store.delete(RUN_KEY);
  } catch {
    // Storage blocked: nothing more can be done.
  }
}

/** The saved run with its map (`mapOf` its seed) and, during a fight, the fight replayed on `make` of the run and its
 * map (the army and its special marbles placed, or the act's boss). A save that does not decode, walks off its map or
 * does not replay is deleted, but a boss fight that does not replay starts over. */
export async function loadRun<E extends ReplayEngine>(
  store: KeyStore,
  mapOf: (seed: number) => MapNode[],
  make: (run: Run, map: MapNode[]) => E,
): Promise<{ state: Run; map: MapNode[]; engine: E | null } | null> {
  try {
    const raw = await store.get(RUN_KEY);
    if (raw === undefined) return null;
    const state = decodeRun(raw);
    const map = state ? mapOf(state.seed) : [];
    const walked = state !== null && state.path.every((n, i) => next(map, state.path.slice(0, i)).includes(n));
    const fight = walked && state.fighting && state.path.length ? replay(state.moves, () => make(state, map)) : null;
    // A boss node's fight saved when it was an army fight (before #800) does not replay on the boss's board: it starts over.
    if (!fight && walked && state.fighting && lastNode(map, state)?.kind === 'boss') {
      const over = { ...state, moves: [] };
      return { state: over, map, engine: make(over, map) };
    }
    if (walked && (fight || !state.fighting)) return { state, map, engine: fight };
    await store.delete(RUN_KEY);
  } catch {
    // Storage blocked: no run to resume.
  }
  return null;
}
