// The move notation of abalone-cli (`parse_move` in crates/abalone-cli/src/lib.rs, docs/specs/mcp.md section 3):
// the selected cells, then `>`, then the direction, `(-1,2)(0,2)>E`. Converted to the 8-integer move record of
// abalone-wasm at the edge, nothing else converts. The engine judges the move, this only reads it.

/** Direction names, the index is the abalone-wasm direction code. */
export const DIRECTIONS = ['E', 'W', 'NE', 'SW', 'NW', 'SE'] as const;

/** Integers per move record, `MOVE_STRIDE` of abalone-wasm. */
export const MOVE_STRIDE = 8;

export type Cell = [q: number, r: number];

/** A move as written: its cells in the given order and a direction code. */
export interface Move {
  cells: Cell[];
  dir: number;
}

export type Parsed = { ok: true; move: Move } | { ok: false; message: string };

/** The `ParseError` messages of abalone-cli, word for word. */
const EMPTY = 'empty input';
const MISSING_ARROW = "missing '>' before the direction";
const NO_CELL = "no cell before '>'";
const BAD_CELL = 'cell must look like (q,r), for example (0,0)';
const BAD_DIRECTION = 'direction must be E, W, NE, SW, NW or SE';

const fail = (message: string): Parsed => ({ ok: false, message });

/** Parses `(q,r)(q,r)>E`, with the checks of abalone-cli in the same order. */
export function parseMove(input: string): Parsed {
  const text = input.trim();
  if (text === '') return fail(EMPTY);
  const arrow = text.indexOf('>');
  if (arrow < 0) return fail(MISSING_ARROW);
  const dir = (DIRECTIONS as readonly string[]).indexOf(text.slice(arrow + 1));
  if (dir < 0) return fail(BAD_DIRECTION);
  const cells = parseCells(text.slice(0, arrow));
  return typeof cells === 'string' ? fail(cells) : { ok: true, move: { cells, dir } };
}

function parseCells(text: string): Cell[] | string {
  if (text === '') return NO_CELL;
  const cells: Cell[] = [];
  let rest = text;
  while (rest !== '') {
    if (!rest.startsWith('(')) return BAD_CELL;
    const close = rest.indexOf(')');
    if (close < 0) return BAD_CELL;
    const pair = rest.slice(1, close);
    const comma = pair.indexOf(',');
    if (comma < 0) return BAD_CELL;
    const q = parseI32(pair.slice(0, comma));
    const r = parseI32(pair.slice(comma + 1));
    if (q === null || r === null) return BAD_CELL;
    cells.push([q, r]);
    rest = rest.slice(close + 1);
  }
  return cells;
}

/** A Rust `i32` from text: an optional sign then ASCII digits, in range. */
function parseI32(text: string): number | null {
  if (!/^[+-]?\d+$/.test(text)) return null;
  const n = Number(text);
  return n >= -2147483648 && n <= 2147483647 ? n : null;
}

export function formatMove(move: Move): string {
  return `${move.cells.map(([q, r]) => `(${q},${r})`).join('')}>${DIRECTIONS[move.dir]}`;
}

/**
 * The record `[n, dir, q0, r0, q1, r1, q2, r2]` of a move, unused coordinates `0`. A move of more than 3 cells keeps
 * its count and its first 3 cells: the engine refuses it.
 */
export function toRecord(move: Move): Int32Array {
  const record = new Int32Array(MOVE_STRIDE);
  record[0] = move.cells.length;
  record[1] = move.dir;
  move.cells.slice(0, 3).forEach(([q, r], i) => {
    record[2 + 2 * i] = q;
    record[3 + 2 * i] = r;
  });
  return record;
}

/** The move of one record. */
export function fromRecord(record: ArrayLike<number>): Move {
  const values = Array.from(record);
  const cells = Array.from({ length: values[0]! }, (_, i): Cell => [values[2 + 2 * i]!, values[3 + 2 * i]!]);
  return { cells, dir: values[1]! };
}

/** The moves of records back to back, as `legal_moves` returns them. */
export function fromRecords(records: Int32Array): Move[] {
  return Array.from({ length: records.length / MOVE_STRIDE }, (_, i) =>
    fromRecord(records.subarray(i * MOVE_STRIDE, (i + 1) * MOVE_STRIDE)),
  );
}
