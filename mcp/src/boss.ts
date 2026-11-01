// The `boss` object of `get_state` (docs/specs/mcp.md section 4.3): one generic shape for every boss. The engine's
// per-boss getters map into `tell` and `marks` here, as in the spec's mapping table, so an agent never sees a getter.

import { BOARD_CELLS } from './board';

/** What the boss state reads of `Encounter` in abalone-wasm. */
export interface BossLike {
  name(): string;
  phase(): number;
  phases(): number;
  /** Id of the board special that fires after the next ply, `-1` when none. */
  tell(): number;
  /** `[q, r, plies_left]` records. */
  cracks(): Int32Array;
  /** `[q, r, player_turns_left]` records. */
  eggs(): Int32Array;
  /** `[line, player_turns_left, entry_q, entry_r, exit_q, exit_r]` records. */
  trains(): Int32Array;
  /** One polarity per cell in the board order: `0` none, `1` +, `-1` −. */
  polarities(): Int32Array;
  /** `[q, r, charges]` records of The Unstable Core's charged marbles. */
  charges(): Int32Array;
  /** `[core, collapsing, wedge, shock_in]` of The Unstable Core's next events, `-1` for none; empty otherwise. */
  unstable(): Int32Array;
  /** `[bridged, side, q, r, room]` of The Dual Room's bridge, announced return and room to play (`0` south, `1` north,
   * `-1` once the bridge is up), side `0` when none; empty otherwise. */
  dual(): Int32Array;
  /** `[pulsar, player_turns_left, force]` of The Pulsar's next pulse, force `0` for infinite; empty otherwise. */
  pulsar(): Int32Array;
  /** `[sight, ejections before it narrows]` of The Stalker, the second `-1` in its last phase; empty otherwise. */
  stalker(): Int32Array;
  /** `[turns_left, passed, jump, q, r, ...]` of The Swarm: turns left on the evac clock, `1` after a pass, the turns the player's last move took off it, the next wave's cells; empty otherwise. */
  swarm(): Int32Array;
  /** `[turns_left, ...]` then `[row, q0, len, dir, shift, strike]` per belt of The Assembly Line; empty otherwise. */
  belts(): Int32Array;
  /** `[q, r]` pairs. */
  incinerators(): Int32Array;
  /** Player turns before the boss wins on the clock, `-1` with no clock. */
  turns_left(): number;
  /** `[q, r]` pairs. */
  flips(): Int32Array;
  /** `[q, r]` pairs. */
  converted(): Int32Array;
  /** `[q, r, army]` records. */
  armies(): Int32Array;
  /** Army code, `-1` when none. */
  next_army(): number;
  /** The effect The Ballast Mind borrows at the end of this turn: `0` crack, `1` pulse, `2` polarity, `3` conversion, `4` the Swarm's wave; `-1` when none. */
  ballast_next(): number;
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
/** Move direction codes, the way a pulsar pushes. */
const DIRECTIONS = ['E', 'W', 'NE', 'SW', 'NW', 'SE'];
/** Army codes of the Choir, the order of its cycle. */
const ARMIES = ['Alto', 'Tenor', 'Bass'];
/** The Dual Room's rooms, south then north (#992). */
const ROOMS = ['south room (r >= 1)', 'north room (r <= -1)'];
const BORROWED = ["the Hull's crack", "the Pulsar's pulse", "the Magnetizer's polarity", "the Chaplain's conversion check", "the Swarm's wave"];

export function resultName(code: number): BossResult {
  return RESULTS[code]!;
}

/** Records of `size` integers back to back, as abalone-wasm returns them. */
function records(flat: Int32Array, size: number): number[][] {
  return Array.from({ length: flat.length / size }, (_, i) => Array.from(flat.subarray(i * size, (i + 1) * size)));
}

/** The cell of a record that starts with `q, r`, in notation. */
const cell = ([q, r]: number[]) => `(${q},${r})`;

/** A train's marks: one per cell of its line, from the entry to the exit, with the player turns left before it passes. */
function trainMarks([, left, q, r, toQ, toR]: number[]): Mark[] {
  const length = Math.max(Math.abs(toQ! - q!), Math.abs(toR! - r!));
  return Array.from({ length: length + 1 }, (_, i) => ({
    kind: 'train',
    cell: cell([q! + (i * (toQ! - q!)) / length, r! + (i * (toR! - r!)) / length]),
    value: left!,
  }));
}

/** The marks of the belts: a mark on every cell of a running belt with its direction (1 toward +q), and one on the cell
 * of an announced strike slot. */
function beltMarks(belts: Int32Array): Mark[] {
  return records(belts.subarray(1), 6).flatMap(([row, q0, len, dir, , strike]) => [
    ...(dir === 0 ? [] : Array.from({ length: len! }, (_, i) => ({ kind: 'belt', cell: cell([q0! + i, row!]), value: dir! }))),
    ...(strike! < 0 ? [] : [{ kind: 'strike', cell: cell([q0! + strike!, row!]) }]),
  ]);
}

/** The Dual Room's announced return: a mark on its landing cell with the side of the coming marble. */
function returnMark([, side, q, r]: Int32Array): Mark[] {
  return side ? [{ kind: 'return', cell: cell([q!, r!]), value: side }] : [];
}

export function bossState(id: string, boss: BossLike): BossState {
  const armies = records(boss.armies(), 3);
  const marks: Mark[] = [
    ...records(boss.cracks(), 3).map((record) => ({ kind: 'crack', cell: cell(record), value: record[2]! })),
    ...records(boss.eggs(), 3).map((record) => ({ kind: 'egg', cell: cell(record), value: record[2]! })),
    ...records(boss.trains(), 6).flatMap(trainMarks),
    ...beltMarks(boss.belts()),
    ...Array.from(boss.polarities()).flatMap((sign, i) =>
      sign === 0 ? [] : [{ kind: 'polarity', cell: cell(BOARD_CELLS[i]!), value: sign }],
    ),
    ...records(boss.charges(), 3).map((record) => ({ kind: 'charge', cell: cell(record), value: record[2]! })),
    ...records(boss.incinerators(), 2).map((record) => ({ kind: 'incinerator', cell: cell(record) })),
    ...records(boss.converted(), 2).map((record) => ({ kind: 'converted', cell: cell(record) })),
    ...armies.map((record) => ({ kind: 'army', cell: cell(record), value: record[2]! })),
    ...returnMark(boss.dual()),
    ...records(boss.swarm().subarray(3), 2).map((record) => ({ kind: 'arrival', cell: cell(record) })),
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

/** The most specific kind wins: the next army, then the marbles that flip, then the next pulse, then the belts, then the core's next event, then
 * The Dual Room's return or bridge, then the clock, then
 * the effect The Ballast Mind borrows, then the bare special id. */
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
  const [pulsar, left, force] = Array.from(boss.pulsar());
  if (pulsar !== undefined) {
    const text = `a pulse pushes every line ${DIRECTIONS[pulsar]} after ${left} of your turns, force ${force || 'infinite'}: groups smaller than the force move one cell, the first group as big resists and shields the rest`;
    return { kind: 'pulse', cells: [], text };
  }
  const reverse = boss.belts()[0];
  if (reverse !== undefined) {
    return { kind: 'belt_reverse', cells: [], text: `the centre belt reverses after ${reverse} of your turns` };
  }
  const [, collapsing, wedge, shockIn] = Array.from(boss.unstable());
  if (collapsing === 1) {
    return { kind: 'core', cells: [], text: 'the core collapses after your move: the marbles on the 7 centre cells are ejected' };
  }
  if (wedge !== undefined && wedge >= 0) {
    return { kind: 'core', cells: [], text: `a shockwave shoves every marble of wedge ${wedge} one cell outward after your move` };
  }
  if (shockIn !== undefined && shockIn >= 0) {
    return { kind: 'core', cells: [], text: `a shockwave hits the busiest wedge after ${shockIn} of your turns` };
  }
  const [bridged, side, q, r, room] = Array.from(boss.dual());
  // The rooms are played in turn until the bridge (#992): the legal moves are those of that room.
  const turn = room! >= 0 ? `; this move is played in the ${ROOMS[room!]}, the rooms take turns by pairs of moves until the bridge` : '';
  if (side) {
    const who = side === 1 ? 'one of your marbles' : 'a boss marble';
    return { kind: 'return', cells: [cell([q!, r!])], text: `${who} comes back on ${cell([q!, r!])} at the end of the next move${turn}` };
  }
  if (bridged !== undefined) {
    const text = bridged
      ? 'the bridge is up: ejected marbles are gone'
      : `a marble ejected over the rim or into the void comes back in the other room one turn later; a bridge fills the void at 5 ejections${turn}`;
    return { kind: 'bridge', cells: [], text };
  }
  const turns = boss.turns_left();
  if (turns >= 0) {
    const text = `the boss wins at the end of your turn in ${turns} turns unless you win first; an empty vent pulls in a core next to it at the end of every ply`;
    return { kind: 'neurotoxin', cells: [], text };
  }
  const borrowed = boss.ballast_next();
  if (borrowed >= 0) {
    return { kind: 'borrowed', cells: [], text: `the boss borrows ${BORROWED[borrowed]} at the end of this turn, seen on your next turn` };
  }
  const [sight, narrows] = Array.from(boss.stalker());
  if (sight !== undefined) {
    const range = `you see the boss marbles only within ${sight} ${sight === 1 ? 'cell' : 'cells'} of your own`;
    return { kind: 'sight', cells: [], text: narrows! < 0 ? range : `${range}; the sight narrows after ${narrows} more ejections` };
  }
  const swarm = boss.swarm();
  if (swarm.length > 0) return arrivalTell(swarm);
  const special = boss.tell();
  return special < 0 ? null : { kind: 'special', cells: [], text: `board special ${special} fires after the next ply` };
}

/** The Swarm's tell: where its next wave lands, the turns left on the evac clock and its last jump, and its last pass. */
function arrivalTell(swarm: Int32Array): Tell {
  const [left, passed, jump] = swarm;
  const cells = records(swarm.subarray(3), 2).map(cell);
  if (left === 0) return { kind: 'arrival', cells, text: 'the evac has come' };
  const lands = cells.length === 1 ? `a swarm marble lands on ${cells[0]} after your move` : `swarm marbles land on ${cells.join(', ')} after your move`;
  const clock = `the evac comes in ${left} ${left === 1 ? 'turn' : 'turns'}, 2 sooner per swarm marble you eject`;
  const jumped = jump! > 0 ? `your ejection brought it ${jump} turns closer` : '';
  const text = [cells.length > 0 ? lands : '', clock, jumped, passed ? 'the swarm passed its last turn' : '']
    .filter((part) => part !== '')
    .join('; ');
  return { kind: 'arrival', cells, text };
}
