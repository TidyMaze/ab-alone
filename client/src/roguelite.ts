// Rogue-lite run (#798, docs/specs/roguelite.md). Pure functions and the save: main.ts feeds them the map of the
// bridge (run_map) and the result of each fight, and draws the map they describe.

import { MOVE_STRIDE } from './board';
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
 * moves, and how it ended. */
export interface Run {
  seed: number;
  army: number;
  path: number[];
  fighting: boolean;
  moves: number[][];
  end: '' | 'won' | 'lost';
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

export const newRun = (seed: number): Run => ({ seed, army: START_ARMY, path: [], fighting: false, moves: [], end: '' });

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
export const choices = (map: MapNode[], run: Run): number[] => (run.fighting || run.end ? [] : next(map, run.path));

/** The run once `node` is picked: its fight starts. */
export const pick = (run: Run, node: number): Run => ({ ...run, path: [...run.path, node], fighting: true, moves: [] });

/** The run after the fight of its last node, `won` or not, the army having lost `lost` marbles: a loss or an army below
 * MIN_ARMY ends it, the boss of the last act wins it. */
export function fightOver(map: MapNode[], run: Run, won: boolean, lost: number): Run {
  const army = run.army - lost;
  const node = map[run.path[run.path.length - 1]!]!;
  const end = !won || army < MIN_ARMY ? 'lost' : node.boss && node.act === lastAct(map) ? 'won' : '';
  return { ...run, army, fighting: false, moves: [], end };
}

/** The line that says where the run stands, on the map and in the HUD of its fights. */
export function runLine(map: MapNode[], run: Run): string {
  if (run.end === 'won') return `Run won with ${run.army} marbles`;
  if (run.end === 'lost') return `Run lost · ${run.army} marbles left`;
  const node = run.fighting ? map[run.path[run.path.length - 1]!]! : null;
  const where = node ? `act ${node.act + 1} ${node.boss ? 'boss' : 'fight'}` : '';
  return node ? `Rogue-lite run · ${where} · army ${run.army} marbles` : `Rogue-lite run · army ${run.army} marbles · pick a fight`;
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

/** The run in `raw`, or null when it is not a saved run. */
function decodeRun(raw: unknown): Run | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { seed, army, path, fighting, moves, end } = raw as Record<keyof Run, unknown>;
  const ok =
    isInt(seed, 0xffffffff) &&
    isInt(army, START_ARMY) &&
    Array.isArray(path) &&
    typeof fighting === 'boolean' &&
    Array.isArray(moves) &&
    moves.every(isRecord) &&
    (end === '' || end === 'won' || end === 'lost');
  return ok ? { seed, army, path: [...(path as number[])], fighting, moves: moves as number[][], end } : null;
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

/** The saved run with its map (`mapOf` its seed) and, during a fight, the fight replayed on `make` of its army. A save
 * that does not decode, walks off its map or does not replay is deleted. */
export async function loadRun<E extends ReplayEngine>(
  store: KeyStore,
  mapOf: (seed: number) => MapNode[],
  make: (army: number) => E,
): Promise<{ state: Run; map: MapNode[]; engine: E | null } | null> {
  try {
    const raw = await store.get(RUN_KEY);
    if (raw === undefined) return null;
    const state = decodeRun(raw);
    const map = state ? mapOf(state.seed) : [];
    const walked = state !== null && state.path.every((n, i) => next(map, state.path.slice(0, i)).includes(n));
    const engine = walked && state.fighting && state.path.length ? replay(state.moves, () => make(state.army)) : null;
    if (walked && (engine || !state.fighting)) return { state, map, engine };
    await store.delete(RUN_KEY);
  } catch {
    // Storage blocked: no run to resume.
  }
  return null;
}
