// The `boss` object of `get_state` (docs/specs/mcp.md section 4.3): one generic shape for every boss. The engine's
// per-boss getters map into `tell` and `marks` here, as in the spec's mapping table, so an agent never sees a getter.

/** What the boss state reads of `Encounter` in abalone-wasm. */
export interface BossLike {
  name(): string;
  phase(): number;
  phases(): number;
  /** Id of the board special that fires after the next ply, `-1` when none. */
  tell(): number;
  /** `[q, r, plies_left]` records. */
  cracks(): Int32Array;
  /** `[q, r]` pairs. */
  flips(): Int32Array;
  /** `[q, r]` pairs. */
  converted(): Int32Array;
  /** `[q, r, army]` records. */
  armies(): Int32Array;
  /** Army code, `-1` when none. */
  next_army(): number;
  result(): number;
}

export type BossResult = 'playing' | 'won' | 'lost';

export interface Tell {
  kind: string;
  cells: string[];
  text: string;
}

export interface Mark {
  kind: string;
  cell: string;
  value?: number;
}

export interface BossState {
  id: string;
  name: string;
  phase: number;
  phases: number;
  tell: Tell | null;
  marks: Mark[];
  result: BossResult;
}

const RESULTS: BossResult[] = ['playing', 'won', 'lost'];
/** Army codes of the Choir, the order of its cycle. */
const ARMIES = ['Alto', 'Tenor', 'Bass'];

export function resultName(code: number): BossResult {
  return RESULTS[code]!;
}

/** Records of `size` integers back to back, as abalone-wasm returns them. */
function records(flat: Int32Array, size: number): number[][] {
  return Array.from({ length: flat.length / size }, (_, i) => Array.from(flat.subarray(i * size, (i + 1) * size)));
}

/** The cell of a record that starts with `q, r`, in notation. */
const cell = ([q, r]: number[]) => `(${q},${r})`;

export function bossState(id: string, boss: BossLike): BossState {
  const armies = records(boss.armies(), 3);
  const marks: Mark[] = [
    ...records(boss.cracks(), 3).map((record) => ({ kind: 'crack', cell: cell(record), value: record[2]! })),
    ...records(boss.converted(), 2).map((record) => ({ kind: 'converted', cell: cell(record) })),
    ...armies.map((record) => ({ kind: 'army', cell: cell(record), value: record[2]! })),
  ];
  return {
    id,
    name: boss.name(),
    phase: boss.phase(),
    phases: boss.phases(),
    tell: tell(boss, armies),
    marks,
    result: resultName(boss.result()),
  };
}

/** The most specific kind wins: the next army, then the marbles that flip, then the bare special id. */
function tell(boss: BossLike, armies: number[][]): Tell | null {
  const army = boss.next_army();
  if (army >= 0) {
    const cells = armies.filter((record) => record[2] === army).map(cell);
    return { kind: 'next_army', cells, text: `the ${ARMIES[army]} army moves next` };
  }
  const flips = records(boss.flips(), 2);
  if (flips.length > 0) {
    const text = 'these marbles of yours become boss marbles after the boss turn unless they move';
    return { kind: 'flip', cells: flips.map(cell), text };
  }
  const special = boss.tell();
  return special < 0 ? null : { kind: 'special', cells: [], text: `board special ${special} fires after the next ply` };
}
