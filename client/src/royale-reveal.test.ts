// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { VANISHED, cellIndex, type Axial } from './board';
import { EJECT_MS } from './eject';
import { ARENA, parseLog, roundOrders, seatAt, type RoundLog } from './royale';
import { BREACH_MS, MARK_MS, STEP_MS, applyOrder, buildReveal, outward, shownAt, sinkAt } from './royale-reveal';
import { SLIDE_MS } from './slide';

// The reveal of a battle royale round played out (#612): each order in initiative order, then the breach. Checked by
// hand on small arenas, then against the real engine through its wasm binding.
vi.mock('abalone-wasm', async (importOriginal) => (await import('./test/wasm')).nodeWasm(importOriginal));
const { default: init, Royale } = await import('abalone-wasm');
await init();

const CRACKED = 8;
const arena = (cells: Array<[number, number, number]>): number[] => {
  const b = new Array<number>(ARENA.length).fill(0);
  for (const [q, r, code] of cells) b[cellIndex(q, r, ARENA)] = code;
  return b;
};
const at = (board: readonly number[], q: number, r: number): number => board[cellIndex(q, r, ARENA)]!;
const NW = 4;
// Seat 0's pair (0, -6) (0, -7) pushes seat 2's marble (0, -8) NW, off the arena; (0, -8) is cracked.
const PUSH_OFF = arena([[0, -6, 1], [0, -7, 1], [0, -8, 4 + CRACKED]]);
const pushOff = { cells: [[0, -7], [0, -6]] as Axial[], dir: NW };

describe('an order applied to the arena', () => {
  it('moves the group and pushes the line ahead, the last marble off the arena, a cell keeping its crack', () => {
    const { board, ejected } = applyOrder(PUSH_OFF, pushOff);
    expect(ejected).toEqual([0, -8]);
    expect(at(board, 0, -8)).toBe(1 + CRACKED);
    expect(at(board, 0, -7)).toBe(1);
    expect(at(board, 0, -6)).toBe(0);
    expect(board.filter((c) => seatAt(c) >= 0)).toHaveLength(2);
  });

  it('a marble pushed onto a void cell is ejected too, and a line ending on an empty cell ejects none', () => {
    const before = arena([[0, 2, 1], [0, 1, 1], [0, 0, 2], [0, -1, VANISHED]]);
    const { board, ejected } = applyOrder(before, { cells: [[0, 1], [0, 2]], dir: NW });
    expect(ejected).toEqual([0, 0]);
    expect(at(board, 0, -1)).toBe(VANISHED);
    expect([at(board, 0, 0), at(board, 0, 1), at(board, 0, 2)]).toEqual([1, 1, 0]);
    const free = applyOrder(arena([[0, 2, 1], [0, 1, 2]]), { cells: [[0, 2]], dir: NW });
    expect(free.ejected).toBeNull();
    expect([at(free.board, 0, 0), at(free.board, 0, 1)]).toEqual([2, 1]);
  });

  it('a broadside move pushes nothing', () => {
    const before = arena([[0, 2, 1], [1, 2, 1], [0, 1, 4]]);
    const { board } = applyOrder(before, { cells: [[0, 2], [1, 2]], dir: 5 });
    expect([at(board, 0, 3), at(board, 1, 3), at(board, 0, 1)]).toEqual([1, 1, 4]);
  });
});

describe('the outward direction of a cell', () => {
  it('is the direction that leads away from the centre the most', () => {
    expect(outward([8, 0])).toBe(0); // E
    expect(outward([-8, 0])).toBe(1); // W
    expect(outward([0, -8])).toBe(NW);
    expect(outward([0, 0])).toBe(0);
  });
});

const turns = (...list: Array<[number, RoundLog['turns'][number]['outcome'], number?]>): RoundLog => ({
  round: 1,
  turns: list.map(([seat, outcome, ejected = -1]) => ({ seat, outcome, ejected })),
});

describe('the reveal of a round', () => {
  it('plays each turn in initiative order: a move slides then the next one starts, a fizzle or a hold is a short mark, out takes no time', () => {
    const orders = [0, 2, NW, 0, -7, 0, -6, 0, 0, 1, 1, 0, -6, 3, 0, 0, 0, 0];
    const log = turns([0, 'moved', 2], [1, 'fizzled'], [2, 'held'], [3, 'out'], [4, 'out'], [5, 'held']);
    const after = applyOrder(PUSH_OFF, pushOff).board;
    const reveal = buildReveal(PUSH_OFF, orders, log, after);
    expect(STEP_MS).toBeGreaterThan(SLIDE_MS);
    expect(MARK_MS).toBeLessThan(STEP_MS);
    expect(reveal.steps.map((s) => [s.seat, s.start, s.ms])).toEqual([
      [0, 0, STEP_MS],
      [1, STEP_MS, MARK_MS],
      [2, STEP_MS + MARK_MS, MARK_MS],
      [3, STEP_MS + 2 * MARK_MS, 0],
      [4, STEP_MS + 2 * MARK_MS, 0],
      [5, STEP_MS + 2 * MARK_MS, MARK_MS],
    ]);
    const [moved, fizzled] = reveal.steps;
    expect(moved!.board).toEqual(after);
    expect(moved!.tracks.map((t) => t.cell)).toEqual([[0, -8], [0, -7]]);
    expect(moved!.ejected).toEqual({ cell: [0, -8], seat: 2, dir: NW });
    expect(fizzled!.board).toEqual(after);
    expect(fizzled!.tracks).toEqual([]);
    expect(fizzled!.ejected).toBeNull();
    expect(reveal.breach).toEqual({ board: after, voids: [], falls: [], start: STEP_MS + 3 * MARK_MS, ms: 0 });
    expect(reveal.total).toBe(STEP_MS + 3 * MARK_MS);
  });

  it('shows the log lines of the turns started, a turn out with the next one', () => {
    const log = turns([0, 'held'], [1, 'out'], [2, 'held']);
    const reveal = buildReveal(PUSH_OFF, [], log, PUSH_OFF);
    expect([0, MARK_MS - 1, MARK_MS, 2 * MARK_MS].map((ms) => shownAt(reveal, ms))).toEqual([1, 1, 3, 3]);
  });

  it('then the breach: the cracked cells go void, the marbles on them fall outward', () => {
    const before = arena([[0, -8, 1 + CRACKED], [1, -8, CRACKED], [0, 0, 2]]);
    const after = arena([[0, -8, VANISHED], [1, -8, VANISHED], [0, 0, 2]]);
    const reveal = buildReveal(before, [], turns([0, 'held'], [1, 'held']), after);
    expect(reveal.breach.start).toBe(2 * MARK_MS);
    expect(reveal.breach.ms).toBe(BREACH_MS);
    expect(BREACH_MS).toBe(EJECT_MS);
    expect(reveal.breach.voids).toEqual([cellIndex(0, -8, ARENA), cellIndex(1, -8, ARENA)]);
    expect(reveal.breach.falls).toEqual([{ cell: [0, -8], seat: 0, dir: outward([0, -8]) }]);
    expect(at(reveal.breach.board, 0, -8)).toBe(CRACKED); // the disc still there, its marble falling
    expect(at(reveal.breach.board, 0, 0)).toBe(2);
    expect(reveal.total).toBe(2 * MARK_MS + BREACH_MS);
  });

  it('a voided disc sinks faster and faster, a spacing by the end of the breach', () => {
    expect(sinkAt(0)).toBe(0);
    expect(sinkAt(BREACH_MS / 2)).toBe(0.25);
    expect(sinkAt(BREACH_MS)).toBe(1);
    expect(sinkAt(2 * BREACH_MS)).toBe(1);
  });
});

describe('the reveal against the engine', () => {
  it('each turn played out ends on the board the engine gives, ejections and the breach included', () => {
    // Seed 1, the player holding: the bots eject each other from round 26, the breach takes marbles from round 13.
    const game = new Royale(6, 1);
    let ejections = 0;
    let falls = 0;
    for (let round = 0; !game.placement().length; round++) {
      const before = Array.from(game.board());
      const orders = roundOrders(game, []);
      game.resolve(orders);
      const after = Array.from(game.board());
      const log = parseLog(game.round_log())!;
      const reveal = buildReveal(before, orders, log, after);
      ejections += reveal.steps.filter((s) => s.ejected).length;
      falls += reveal.breach.falls.length;
      expect(reveal.steps.filter((s) => s.ejected).map((s) => s.ejected!.seat)).toEqual(
        log.turns.filter((t) => t.ejected >= 0).map((t) => t.ejected),
      );
      expect(reveal.breach.board.map(seatAt), `round ${round + 1}`).toEqual(after.map(seatAt));
      expect(reveal.breach.board.map((c) => c === VANISHED)).toEqual(before.map((c) => c === VANISHED));
    }
    expect(ejections).toBeGreaterThan(0);
    expect(falls).toBeGreaterThan(0);
  });
});
