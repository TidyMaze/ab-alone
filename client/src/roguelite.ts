// Rogue-lite run (#798, docs/specs/roguelite.md). Pure functions and the save: main.ts feeds them the map of the
// bridge (run_map) and the result of each fight, and draws the map, placement and reward screens they describe.

import { cellIndex, DIRECTIONS, isMarble, MOVE_STRIDE, RADIUS, type Axial, type Move } from './board';
import { SEAT_GLYPHS } from './marbles';
import { replay, type KeyStore, type ReplayEngine } from './savegame';

/** Marbles of the army at the start of a run: the standard layout. */
export const START_ARMY = 14;
/** Below this many marbles the run is over. */
export const MIN_ARMY = 4;
/** Integers per node of the bridge's map (crates/abalone-wasm/src/lib.rs). */
const NODE_STRIDE = 5;
/** Key of the run in the game store, next to the local game (savegame.ts). */
export const RUN_KEY = 'run';

/** One node of the map: a fight, or the boss that ends its act. `links` are the columns of the next row it leads to. */
export interface MapNode {
  act: number;
  row: number;
  col: number;
  boss: boolean;
  links: number[];
}

/** A run: its seed, its army, the nodes picked (indices in the map), the fight of the last one while it is on and its
 * moves, and how it ended. `specials` counts the army's Heavy, Anchor and Spark marbles (#961), `placed` the ones on
 * the fight's board `[q, r, kind]`, and `reward` is on while the reward of a won fight waits to be picked. */
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
}

/** At most this many special marbles of each type on the board of a fight (#961). */
export const FIGHT_CAP = 3;

/** The looks of the special marbles, by the bridge's kind less 1 (#961): a flat glyph over the marble, its own shape
 * and a colour 3:1 on both marbles, never the colour alone. Its outline in units of its radius, y up. */
export const SPECIAL_LOOKS: readonly { name: string; color: number; points: readonly [number, number][]; help: string }[] = [
  { name: 'Heavy', color: 0xc8ccd0, points: SEAT_GLYPHS[2]!.points, help: 'weighs 2 in a push' }, // a block
  { name: 'Anchor', color: 0x56b4e9, points: [[0, -1], [0.866, 0.5], [-0.866, 0.5]], help: 'never pushed off' }, // pointing down
  { name: 'Spark', color: 0xf0e442, points: SEAT_GLYPHS[4]!.points, help: 'bursts when pushed off' }, // a star
];

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

/** The map of the bridge's records `[act, row, col, kind, links]`. */
export function parseMap(flat: ArrayLike<number>): MapNode[] {
  const nodes: MapNode[] = [];
  for (let i = 0; i < flat.length; i += NODE_STRIDE) {
    const mask = flat[i + 4]!;
    const links = [0, 1, 2, 3, 4, 5].filter((c) => mask & (1 << c));
    nodes.push({ act: flat[i]!, row: flat[i + 1]!, col: flat[i + 2]!, boss: flat[i + 3] === 1, links });
  }
  return nodes;
}

export const newRun = (seed: number): Run => ({
  seed,
  army: START_ARMY,
  path: [],
  fighting: false,
  moves: [],
  end: '',
  specials: [0, 0, 0],
  placed: [],
  reward: false,
});

const sum = (counts: number[]): number => counts.reduce((a, b) => a + b, 0);
/** The special marbles of each type in `placed`. */
const countOf = (placed: number[][]): number[] => [1, 2, 3].map((k) => placed.filter((p) => p[2] === k).length);

const lastAct = (map: MapNode[]): number => map[map.length - 1]!.act;

/** The nodes reachable after `path`: the first row of act 1, the links of a fight, the first row of the next act after a
 * boss. */
function next(map: MapNode[], path: number[]): number[] {
  const last = path.length ? map[path[path.length - 1]!]! : null;
  const open = (n: MapNode): boolean =>
    !last
      ? n.act === 0 && n.row === 0
      : last.boss
        ? n.act === last.act + 1 && n.row === 0
        : n.act === last.act && n.row === last.row + 1 && last.links.includes(n.col);
  return map.flatMap((n, i) => (open(n) ? [i] : []));
}

/** The nodes the player may pick now: none during a fight or once the run is over. */
export const choices = (map: MapNode[], run: Run): number[] => (run.fighting || run.end || run.reward ? [] : next(map, run.path));

/** The run once `node` is picked: its fight starts, no special marble on its board yet. */
export const pick = (run: Run, node: number): Run => ({ ...run, path: [...run.path, node], fighting: true, moves: [], placed: [] });

/** The run after the fight of its last node, `won` or not, the army having lost `lost` marbles and kept `kept` of each
 * special marble type placed (all by default): a loss or an army below MIN_ARMY ends it, the boss of the last act wins
 * it, any other win offers a reward. The army never holds more special marbles than marbles: past that, the Sparks go
 * first, then the Anchors, then the Heavies. */
export function fightOver(map: MapNode[], run: Run, won: boolean, lost: number, kept = countOf(run.placed)): Run {
  const army = run.army - lost;
  const node = map[run.path[run.path.length - 1]!]!;
  const end = !won || army < MIN_ARMY ? 'lost' : node.boss && node.act === lastAct(map) ? 'won' : '';
  const placed = countOf(run.placed);
  const specials = run.specials.map((n, k) => n - placed[k]! + kept[k]!);
  for (let k = 2, over = sum(specials) - army; k >= 0 && over > 0; k--) {
    const drop = Math.min(specials[k]!, over);
    specials[k]! -= drop;
    over -= drop;
  }
  const after: Run = { ...run, army, specials, fighting: false, moves: [], placed: [], end, reward: end === '' };
  return { ...after, reward: offers(after).length > 0 };
}

/** A 32-bit hash of two integers (murmur3's finaliser): the reward offers' only randomness. */
function hash(a: number, b: number): number {
  let h = Math.imul(a ^ Math.imul(b + 1, 0x9e3779b9), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** The reward offers after a won fight, seeded by the run seed and the node: 3 of a marble (`0`, only below
 * START_ARMY) and the three special marbles (their kind, only while the army has plain marbles to make special). */
export function offers(run: Run): number[] {
  if (!run.reward) return [];
  const pool = [...(run.army < START_ARMY ? [0] : []), ...(sum(run.specials) < run.army ? [1, 2, 3] : [])];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = hash(run.seed, run.path[run.path.length - 1]! * 8 + i) % (i + 1); // the node won, an index of the map
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, 3);
}

/** The run once the reward `offer` is picked: a marble more, or one of the army's marbles made special. */
export function claim(run: Run, offer: number): Run {
  if (!offers(run).includes(offer)) return run;
  const specials = run.specials.map((n, k) => n + Number(offer === k + 1));
  return { ...run, army: run.army + Number(offer === 0), specials, reward: false };
}

/** Before the first move of a fight, the army's special marbles are placed on its board. */
export const placing = (run: Run): boolean => run.fighting && run.moves.length === 0 && sum(run.specials) > 0;

/** The special marbles of type `kind` left to place: the army's, at most FIGHT_CAP, less those placed. */
export const left = (run: Run, kind: number): number => Math.min(run.specials[kind - 1]!, FIGHT_CAP) - countOf(run.placed)[kind - 1]!;

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
  return specials.some((s) => s.kind === 3 && s.cell[0] === lq && s.cell[1] === lr) ? last : null;
}

/** The line that says where the run stands, on the map and in the HUD of its fights. */
export function runLine(map: MapNode[], run: Run): string {
  if (run.end === 'won') return `Run won with ${run.army} marbles`;
  if (run.end === 'lost') return `Run lost · ${run.army} marbles left`;
  const node = run.fighting ? map[run.path[run.path.length - 1]!]! : null;
  const where = node ? `act ${node.act + 1} ${node.boss ? 'boss' : 'fight'}` : '';
  const owned = SPECIAL_LOOKS.flatMap((l, k) => (run.specials[k] ? [`, ${run.specials[k]} ${l.name}`] : [])).join('');
  const army = `army ${run.army} marbles${owned}`;
  return node ? `Rogue-lite run · ${where} · ${army}` : `Rogue-lite run · ${army} · pick a fight`;
}

/** The glyph of a special marble type (`0` a plain marble), drawn in its colour, outlined in the text's colour. */
function glyph(kind: number): string {
  const look = SPECIAL_LOOKS[kind - 1];
  const shape = look
    ? `<polygon points="${look.points.map(([x, y]) => `${x},${-y}`).join(' ')}" fill="#${look.color.toString(16)}" stroke="currentColor" stroke-width="0.15"/>`
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

/** The reward screen after a won fight: a button per offer. */
export function rewardHtml(run: Run): string {
  const label = (offer: number): string => (offer ? `${SPECIAL_LOOKS[offer - 1]!.name}: ${SPECIAL_LOOKS[offer - 1]!.help}` : 'One more marble');
  const buttons = offers(run).map((o) => `<button type="button" data-offer="${o}">${glyph(o)}${label(o)}</button>`);
  return `<p class="run-line">Fight won · pick a reward</p><div class="run-kinds">${buttons.join('')}</div>`;
}

/** The map screen: the run line, the nodes act by act from the top, each placed on its row, the links between them
 * (the path taken marked), the nodes to pick enabled, and New run once the run is over. */
export function mapHtml(map: MapNode[], run: Run): string {
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
    const kind = n.boss ? 'boss' : 'fight';
    return (
      `<button type="button" class="node${n.boss ? ' boss' : ''}${mark}" data-node="${i}" style="left:${x}%;top:${y}%" ` +
      `aria-label="Act ${n.act + 1}, ${kind}"${open.includes(i) ? '' : ' disabled'}>${n.boss ? 'Boss' : 'Fight'}</button>`
    );
  });
  const svg = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines.join('')}</svg>`;
  const again = run.end ? '<button type="button" id="run-new">New run</button>' : '';
  return `<p class="run-line">${runLine(map, run)}</p><div class="run-graph">${svg}${nodes.join('')}</div>${again}`;
}

const isInt = (v: unknown, max: number): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max;
const isRecord = (mv: unknown): boolean => Array.isArray(mv) && mv.length === MOVE_STRIDE && mv.every((v) => Number.isInteger(v));

const isInts = (v: unknown, n: number): v is number[] => Array.isArray(v) && v.length === n && v.every((x) => isInt(x, START_ARMY));

/** The run in `raw`, or null when it is not a saved run. A run saved before the special marbles (#961) has none. */
function decodeRun(raw: unknown): Run | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { seed, army, path, fighting, moves, end, specials = [0, 0, 0], placed = [], reward = false } = raw as Record<keyof Run, unknown>;
  const ok =
    isInt(seed, 0xffffffff) &&
    isInt(army, START_ARMY) &&
    Array.isArray(path) &&
    typeof fighting === 'boolean' &&
    Array.isArray(moves) &&
    moves.every(isRecord) &&
    (end === '' || end === 'won' || end === 'lost') &&
    isInts(specials, 3) &&
    Array.isArray(placed) &&
    placed.every((p) => Array.isArray(p) && p.length === 3 && p.every((v) => Number.isInteger(v))) &&
    typeof reward === 'boolean';
  return ok
    ? { seed, army, path: [...(path as number[])], fighting, moves: moves as number[][], end, specials, placed: placed as number[][], reward }
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

/** The saved run with its map (`mapOf` its seed) and, during a fight, the fight replayed on `make` of its army and its
 * special marbles placed. A save that does not decode, walks off its map or does not replay is deleted. */
export async function loadRun<E extends ReplayEngine>(
  store: KeyStore,
  mapOf: (seed: number) => MapNode[],
  make: (army: number, placed: number[][]) => E,
): Promise<{ state: Run; map: MapNode[]; engine: E | null } | null> {
  try {
    const raw = await store.get(RUN_KEY);
    if (raw === undefined) return null;
    const state = decodeRun(raw);
    const map = state ? mapOf(state.seed) : [];
    const walked = state !== null && state.path.every((n, i) => next(map, state.path.slice(0, i)).includes(n));
    const engine = walked && state.fighting && state.path.length ? replay(state.moves, () => make(state.army, state.placed)) : null;
    if (walked && (engine || !state.fighting)) return { state, map, engine };
    await store.delete(RUN_KEY);
  } catch {
    // Storage blocked: no run to resume.
  }
  return null;
}
