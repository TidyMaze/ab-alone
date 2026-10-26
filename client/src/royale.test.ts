// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { cellIndex } from './board';
import {
  ARENA,
  BOTS,
  initiative,
  loadRoyale,
  nextRound,
  orderText,
  parseLog,
  roundOrders,
  royaleHtml,
  seatAt,
  seatName,
  YOU,
} from './royale';

// The offline battle royale (#502, rules.md section 10.4): 1 player against 5 bots on the radius 8 arena, on the real
// engine through its wasm binding, and the HUD plate read back under jsdom.
vi.mock('abalone-wasm', async (importOriginal) => (await import('./test/wasm')).nodeWasm(importOriginal));
const { default: init, Royale } = await import('abalone-wasm');
await init();

const make = (seats: number, seed: number) => new Royale(seats, seed);
// Seat 0 orders (-6, 3) E, a marble of seat 1: illegal from the start, it fizzles.
const FIZZLE = [YOU, 1, 0, -6, 3, 0, 0, 0, 0];

describe('the arena and its seats', () => {
  it('the arena is the 217 cells of radius 8, 1 player and 5 bots', () => {
    expect(ARENA).toHaveLength(217);
    expect(YOU).toBe(0);
    expect(BOTS).toEqual([1, 2, 3, 4, 5]);
  });

  it('a cell code gives its seat, a cracked cell keeps it, an empty or void cell has none', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(seatAt)).toEqual([-1, 0, 1, -1, 2, 3, 4, 5]);
    expect([8, 9, 10, 12, 15].map(seatAt)).toEqual([-1, 0, 1, 2, 5]);
  });

  it('the player is You, the others are bots by seat', () => {
    expect([0, 1, 5].map(seatName)).toEqual(['You', 'Bot 1', 'Bot 5']);
  });

  it('the start puts 10 marbles per seat, the player on the bottom wedge', () => {
    const board = make(6, 7).board();
    for (let seat = 0; seat < 6; seat++) expect(Array.from(board).filter((c) => seatAt(c) === seat)).toHaveLength(10);
    expect(seatAt(board[cellIndex(-5, 8, ARENA)]!)).toBe(YOU);
  });
});

describe('initiative (rules.md 10.4)', () => {
  it('round k starts at seat (k - 1) mod 6 and goes round the list', () => {
    expect(initiative(1)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(initiative(2)).toEqual([1, 2, 3, 4, 5, 0]);
    expect(initiative(6)).toEqual([5, 0, 1, 2, 3, 4]);
    expect(initiative(7)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('a round', () => {
  it('no log before the first round, which is round 1', () => {
    const game = make(6, 7);
    expect(parseLog(game.round_log())).toBeNull();
    expect(nextRound(null)).toBe(1);
  });

  it("the orders are the player's then each bot's, a hold left out", () => {
    const game = make(6, 7);
    const mine = Array.from(game.legal_orders(YOU).slice(0, 8));
    const orders = Array.from(roundOrders(game, mine));
    expect(orders.slice(0, 9)).toEqual([YOU, ...mine]);
    expect(orders.length % 9).toBe(0);
    for (const bot of BOTS) {
      const order = Array.from(game.bot_order(bot));
      const at = orders.findIndex((v, i) => i % 9 === 0 && v === bot);
      if (order.length) expect(orders.slice(at + 1, at + 9)).toEqual(order);
      else expect(at).toBe(-1);
    }
    expect(Array.from(roundOrders(game, [])).filter((v, i) => i % 9 === 0 && v === YOU)).toEqual([]);
  });

  it('a bot that holds sends no order', () => {
    const holds = { resolve: () => {}, round_log: () => [], bot_order: (seat: number) => (seat === 2 ? [1, 0, 5, 5, 0, 0, 0, 0] : []) };
    expect(Array.from(roundOrders(holds, []))).toEqual([2, 1, 0, 5, 5, 0, 0, 0, 0]);
  });

  it('the log lists each seat in initiative order with its outcome and who it ejected', () => {
    const log = parseLog([3, 2, 0, -1, 3, 1, -1, 4, 2, -1, 5, 3, -1, 0, 0, 4, 1, 2, -1])!;
    expect(log.round).toBe(3);
    expect(log.turns).toEqual([
      { seat: 2, outcome: 'moved', ejected: -1 },
      { seat: 3, outcome: 'fizzled', ejected: -1 },
      { seat: 4, outcome: 'held', ejected: -1 },
      { seat: 5, outcome: 'out', ejected: -1 },
      { seat: 0, outcome: 'moved', ejected: 4 },
      { seat: 1, outcome: 'held', ejected: -1 },
    ]);
    expect(nextRound(log)).toBe(4);
  });
});

describe('a royale game file', () => {
  it('replays its rounds on a new game of its seed', () => {
    const game = loadRoyale({ seed: 7, rounds: [FIZZLE, []] }, make);
    const log = parseLog(game.round_log())!;
    expect(log.round).toBe(2);
    expect(log.turns.map((t) => t.seat)).toEqual(initiative(2));
    const first = loadRoyale({ seed: 7, rounds: [FIZZLE] }, make);
    expect(parseLog(first.round_log())!.turns[0]).toEqual({ seat: YOU, outcome: 'fizzled', ejected: -1 });
    expect(loadRoyale({ seed: 7, rounds: [] }, make).state_hash()).toBe(make(6, 7).state_hash());
  });
});

describe('the HUD plate', () => {
  it('names the order to lock, or none', () => {
    expect(orderText([])).toBe('none');
    expect(orderText([1, 4, -2, 6, 0, 0, 0, 0])).toBe('1 marble NW');
    expect(orderText([3, 0, -4, 6, -3, 6, -2, 6])).toBe('3 marbles E');
  });

  it('shows the round and its initiative order before the reveal, and no log before round 1', () => {
    const html = royaleHtml(null, []);
    document.body.innerHTML = html;
    expect(document.querySelector('.turn')!.textContent).toBe('Battle royale · Round 1');
    expect([...document.querySelectorAll('.initiative li')].map((li) => li.textContent)).toEqual([
      'You',
      'Bot 1',
      'Bot 2',
      'Bot 3',
      'Bot 4',
      'Bot 5',
    ]);
    expect(document.body.textContent).toContain('Your order: none');
    expect(document.querySelector('.reveal')).toBeNull();
  });

  it('marks a fizzled order in the reveal log, in initiative order, each seat with its tint', () => {
    const log = parseLog([2, 1, 0, 3, 2, 1, -1, 3, 2, -1, 4, 3, -1, 5, 2, -1, 0, 1, -1])!;
    document.body.innerHTML = royaleHtml(log, [1, 4, -2, 6, 0, 0, 0, 0]);
    expect(document.querySelector('.turn')!.textContent).toBe('Battle royale · Round 3');
    expect(document.querySelector('.initiative li')!.textContent).toBe('Bot 2');
    expect(document.body.textContent).toContain('Your order: 1 marble NW');
    expect(document.querySelector('.reveal')!.getAttribute('aria-label')).toBe('Round 2 reveal');
    const items = [...document.querySelectorAll('.reveal li')];
    expect(items.map((li) => li.textContent)).toEqual([
      'Bot 1: moved, ejected Bot 3',
      'Bot 2: fizzled',
      'Bot 3: held',
      'Bot 4: out',
      'Bot 5: held',
      'You: fizzled',
    ]);
    expect(items.map((li) => li.className)).toEqual(['moved', 'fizzled', 'held', 'out', 'held', 'fizzled']);
    expect((items[5]!.querySelector('.seat') as HTMLElement).style.background).toBe('rgb(230, 159, 0)');
  });
});
