// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  BOARD_VISIT_STORAGE_KEY,
  RIVALS_STORAGE_KEY,
  MAX_RIVALS,
  boardHtml,
  buildBoard,
  loadLastRank,
  loadRivals,
  ratingHistory,
  recordRival,
  visitBoard,
} from './leaderboard';

describe('local 1v1 leaderboard (#1287)', () => {
  beforeEach(() => localStorage.clear());

  it('starts empty, and survives bad or blocked storage', () => {
    expect(loadRivals(localStorage)).toEqual([]);
    expect(loadRivals(null)).toEqual([]);
    localStorage.setItem(RIVALS_STORAGE_KEY, 'nope{');
    expect(loadRivals(localStorage)).toEqual([]);
    localStorage.setItem(RIVALS_STORAGE_KEY, JSON.stringify({ version: 2, rivals: [] }));
    expect(loadRivals(localStorage)).toEqual([]);
    localStorage.setItem(RIVALS_STORAGE_KEY, JSON.stringify({ version: 1, rivals: 'x' }));
    expect(loadRivals(localStorage)).toEqual([]);
    const bad = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadRivals(bad)).toEqual([]);
    expect(() => recordRival(bad, 'k', 1200, 1)).not.toThrow();
    expect(() => recordRival(null, 'k', 1200, 1)).not.toThrow();
  });

  it('keeps only well-formed rows from storage', () => {
    localStorage.setItem(
      RIVALS_STORAGE_KEY,
      JSON.stringify({ version: 1, rivals: [{ pub: 'a', rating: 1300, timestamp: 5 }, { pub: 1 }, null] }),
    );
    expect(loadRivals(localStorage)).toEqual([{ pub: 'a', rating: 1300, timestamp: 5 }]);
  });

  it('records an opponent once and keeps their latest signed rating', () => {
    recordRival(localStorage, 'a', 1300, 1);
    recordRival(localStorage, 'b', 1100, 2);
    recordRival(localStorage, 'a', 1350, 3);
    expect(loadRivals(localStorage)).toEqual([
      { pub: 'b', rating: 1100, timestamp: 2 },
      { pub: 'a', rating: 1350, timestamp: 3 },
    ]);
  });

  it('keeps the most recent opponents only', () => {
    for (let i = 0; i < MAX_RIVALS + 5; i++) recordRival(localStorage, `k${i}`, 1200, i);
    const rivals = loadRivals(localStorage);
    expect(rivals).toHaveLength(MAX_RIVALS);
    expect(rivals[0]!.pub).toBe('k5');
  });

  it('ranks you among the opponents you met, highest rating first, ties to you', () => {
    const rows = buildBoard(1250, [
      { pub: 'abcdef123', rating: 1400, timestamp: 1 },
      { pub: 'zzzzzz999', rating: 1250, timestamp: 2 },
      { pub: 'low000000', rating: 1000, timestamp: 3 },
    ]);
    expect(rows.map((r) => [r.rank, r.name, r.rating, r.me])).toEqual([
      [1, 'Player abcdef', 1400, false],
      [2, 'You', 1250, true],
      [3, 'Player zzzzzz', 1250, false],
      [4, 'Player low000', 1000, false],
    ]);
  });

  it('shows only you when nobody was met', () => {
    const rows = buildBoard(1200, []);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rank: 1, name: 'You', rating: 1200, me: true });
  });

  it('renders a table with the own row highlighted and the position', () => {
    const html = boardHtml(buildBoard(1250, [{ pub: 'abcdef123', rating: 1400, timestamp: 1 }]));
    expect(html).toContain('Your position: 2 of 2');
    expect(html).toContain('<tr data-me="true" aria-current="true">');
    expect(html).toContain('Player abcdef');
    expect(boardHtml(buildBoard(1200, []))).toContain('Play a ranked match to meet opponents');
  });

  it('takes the ratings after your last 1v1 matches, oldest first, ten at most', () => {
    const matches = [
      { mode: 'royale' as const, newRating: 900 },
      ...Array.from({ length: 12 }, (_, i) => ({ mode: '1v1' as const, newRating: 1200 + i })),
    ];
    expect(ratingHistory(matches)).toEqual([1202, 1203, 1204, 1205, 1206, 1207, 1208, 1209, 1210, 1211]);
    expect(ratingHistory([{ mode: 'royale', newRating: 900 }])).toEqual([]);
    expect(ratingHistory([])).toEqual([]);
  });

  it('lists the rating history in the board, and not when there is none', () => {
    const html = boardHtml(buildBoard(1250, []), [1200, 1250]);
    expect(html).toContain('<ol id="board-history" aria-label="Your rating over your last matches"><li>1200</li><li>1250</li></ol>');
    expect(boardHtml(buildBoard(1250, []), [])).not.toContain('board-history');
  });

  it('remembers your position at the last visit, and nothing when storage is bad', () => {
    expect(loadLastRank(localStorage)).toBeNull();
    localStorage.setItem(BOARD_VISIT_STORAGE_KEY, 'nope{');
    expect(loadLastRank(localStorage)).toBeNull();
    localStorage.setItem(BOARD_VISIT_STORAGE_KEY, JSON.stringify({ version: 2, rank: 1 }));
    expect(loadLastRank(localStorage)).toBeNull();
    localStorage.setItem(BOARD_VISIT_STORAGE_KEY, JSON.stringify({ version: 1, rank: 'x' }));
    expect(loadLastRank(localStorage)).toBeNull();
    localStorage.setItem(BOARD_VISIT_STORAGE_KEY, JSON.stringify({ version: 1, rank: 4 }));
    expect(loadLastRank(localStorage)).toBe(4);
    const bad = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadLastRank(bad)).toBeNull();
    expect(loadLastRank(null)).toBeNull();
    expect(() => visitBoard(bad, buildBoard(1200, []))).not.toThrow();
    expect(() => visitBoard(null, buildBoard(1200, []))).not.toThrow();
  });

  it('says how your position moved since your last visit, and saves the new one', () => {
    const rowsAt = (rank: number) => buildBoard(1200, Array.from({ length: 4 }, (_, i) => ({ pub: `k${i}`, rating: i < rank - 1 ? 1500 : 1000, timestamp: i })));
    expect(visitBoard(localStorage, rowsAt(3))).toBeNull(); // first visit: nothing to compare with
    expect(loadLastRank(localStorage)).toBe(3);
    expect(visitBoard(localStorage, rowsAt(1))).toEqual({ move: 'up', places: 2 });
    expect(visitBoard(localStorage, rowsAt(1))).toEqual({ move: 'same', places: 0 });
    expect(visitBoard(localStorage, rowsAt(2))).toEqual({ move: 'down', places: 1 });
    expect(loadLastRank(localStorage)).toBe(2);
  });

  it('writes your move in the board, and nothing on a first visit', () => {
    const rows = buildBoard(1250, [{ pub: 'abcdef123', rating: 1400, timestamp: 1 }]);
    expect(boardHtml(rows, [], null)).not.toContain('board-move');
    expect(boardHtml(rows, [], { move: 'up', places: 1 })).toContain('<p id="board-move" data-move="up">Up 1 place since your last visit</p>');
    expect(boardHtml(rows, [], { move: 'down', places: 3 })).toContain('Down 3 places since your last visit');
    expect(boardHtml(rows, [], { move: 'same', places: 0 })).toContain('Unchanged since your last visit');
  });
});
