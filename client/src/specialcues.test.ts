import { describe, expect, it } from 'vitest';
import { BOARD_CELLS, axialTo3D, cellIndex, type Axial, type Move } from './board';
import type { Special } from './roguelite';
import { SLIDE_MS } from './slide';
import { fuseDigit, fuseNote, parseFuses, pullTrack, specialCues, type Fuse } from './specialcues';

// The Bomb's fuse on screen (#1490, docs/specs/roguelite.md section 13): the bridge's records, the HUD line and the digit
// drawn on the Bomb.
describe('the Bomb fuse', () => {
  it('parseFuses splits the bridge records into cells and turns left', () => {
    expect(parseFuses([])).toEqual([]);
    expect(parseFuses([0, 4, 3, -2, 1, 1])).toEqual([
      { cell: [0, 4], turns: 3 },
      { cell: [-2, 1], turns: 1 },
    ]);
  });

  it('fuseNote says the turns left of one Bomb or of several, nothing without a Bomb', () => {
    expect(fuseNote([])).toBe('');
    expect(fuseNote([{ cell: [0, 4], turns: 3 }])).toBe(' · Bomb: 3 turns left');
    expect(fuseNote([{ cell: [0, 4], turns: 1 }])).toBe(' · Bomb: 1 turn left');
    expect(fuseNote([{ cell: [0, 4], turns: 3 }, { cell: [1, 4], turns: 1 }])).toBe(' · Bombs: 3, 1 turns left');
  });

  it('fuseDigit draws 1, 2 and 3 in seven bar segments inside the Bomb glyph, a 1 with two bars, the others with five', () => {
    expect([1, 2, 3].map((n) => fuseDigit(n).length)).toEqual([2, 5, 5]);
    for (const n of [1, 2, 3]) {
      for (const [x, y, w, h] of fuseDigit(n)) {
        expect(Math.hypot(Math.max(Math.abs(x), Math.abs(x + w)), Math.max(Math.abs(y), Math.abs(y + h)))).toBeLessThan(0.8);
      }
    }
  });
});

// What a ply of a rogue-lite fight did that the board alone does not show (#1490): read from the board before the ply, the
// move, and the engine's board and marks after it, by the rules of section 13.
describe('specialCues', () => {
  const BLACK = 1;
  const WHITE = 2;
  const board = (marbles: [Axial, number][]): number[] => {
    const out = BOARD_CELLS.slice(0, 61).map(() => 0);
    for (const [[q, r], side] of marbles) out[cellIndex(q, r)] = side;
    return out;
  };
  const MAGNET = 7;
  const SHIELD = 8;
  const MEDIC = 10;
  const mark = (cell: Axial, kind: number): Special => ({ cell, kind });
  const fuse = (cell: Axial, turns: number): Fuse => ({ cell, turns });
  const none = { bursts: [], flashes: [], pulls: [], returns: [] };
  // The cues of `move` played on `before`, the engine's own result being `after` (the board and its marks).
  const cues = (before: [Axial, number][], marks: Special[], fuses: Fuse[], move: Move, after: [Axial, number][] = [], afterMarks: Special[] = []) =>
    specialCues(board(before), marks, fuses, move, board(after), afterMarks);

  it('shows nothing for a move that touches no special marble', () => {
    expect(cues([[[0, 2], BLACK]], [], [], { cells: [[0, 2]], dir: 4 })).toEqual(none);
  });

  it('a Bomb on its last turn bursts where its marble stands after the move, one of the mover\'s only', () => {
    const before: [Axial, number][] = [[[0, 4], BLACK], [[0, 2], BLACK], [[2, -2], WHITE]];
    const move = { cells: [[0, 4]] as Axial[], dir: 4 };
    expect(cues(before, [mark([0, 4], 9)], [fuse([0, 4], 1)], move).bursts).toEqual([[0, 3]]);
    expect(cues(before, [mark([0, 4], 9)], [fuse([0, 4], 2)], move).bursts).toEqual([]); // the fuse is not out
    expect(cues(before, [mark([0, 2], 9)], [fuse([0, 2], 1)], move).bursts).toEqual([[0, 2]]); // another marble moved: it stays
    expect(cues(before, [mark([2, -2], 9)], [fuse([2, -2], 1)], move).bursts).toEqual([]); // the other side's Bomb: its turn is not this one
  });

  it('a push into a Shield flashes it and moves nothing, the Bomb of the pushing group stays where it stands', () => {
    const before: [Axial, number][] = [[[0, 1], BLACK], [[0, 2], BLACK], [[0, 0], WHITE]];
    const move = { cells: [[0, 2], [0, 1]] as Axial[], dir: 4 };
    const marks = [mark([0, 0], SHIELD), mark([0, 1], 9)];
    const fuses = [fuse([0, 1], 1)];
    expect(cues(before, marks, fuses, move)).toEqual({ ...none, flashes: [[0, 0]], bursts: [[0, 1]] });
    const open = cues(before, [mark([0, 1], 9)], fuses, move); // no Shield: the Bomb walks, pushing the marble
    expect(open.flashes).toEqual([]);
    expect(open.bursts).toEqual([[0, 0]]);
    // A Shield in the pushing group, or one beside the line, flashes nothing.
    expect(cues(before, [mark([0, 2], SHIELD), mark([0, 0], 10)], [], move).flashes).toEqual([]);
  });

  it('a Magnet that moved pulls the first enemy two cells away in line, the cell between free, one cell closer', () => {
    const before: [Axial, number][] = [[[0, -1], BLACK], [[-2, 0], WHITE], [[2, 0], WHITE]];
    const move = { cells: [[0, -1]] as Axial[], dir: 5 };
    const after: [Axial, number][] = [[[0, 0], BLACK], [[-1, 0], WHITE], [[2, 0], WHITE]];
    // Of the directions in cell order, west comes first: the marble on (-2, 0) is the one pulled, east (0) stays.
    expect(cues(before, [mark([0, -1], MAGNET)], [], move, after).pulls).toEqual([{ from: [-2, 0], to: [-1, 0], dir: 0 }]);
    expect(cues(before, [], [], move, after).pulls).toEqual([]); // no Magnet
    expect(cues(before, [mark([2, 0], MAGNET)], [], move, after).pulls).toEqual([]); // a Magnet that did not move
    // A pull the engine's board does not show (the marble was thrown off by a burst after it) draws nothing.
    expect(cues(before, [mark([0, -1], MAGNET)], [], move, [[[0, 0], BLACK], [[2, 0], WHITE]]).pulls).toEqual([]);
    // A friendly marble, a marble one cell away, a marble with a marble between, a cell off the board: no pull.
    const own: [Axial, number][] = [[[0, -1], BLACK], [[-2, 0], BLACK]];
    expect(cues(own, [mark([0, -1], MAGNET)], [], move, [[[0, 0], BLACK], [[-1, 0], BLACK]]).pulls).toEqual([]);
    const next: [Axial, number][] = [[[0, -1], BLACK], [[-1, 0], WHITE]];
    expect(cues(next, [mark([0, -1], MAGNET)], [], move, [[[0, 0], BLACK], [[-1, 0], WHITE]]).pulls).toEqual([]);
    const between: [Axial, number][] = [[[0, -1], BLACK], [[-2, 0], WHITE], [[-1, 0], BLACK]];
    expect(cues(between, [mark([0, -1], MAGNET)], [], move, [[[0, 0], BLACK], [[-2, 0], WHITE], [[-1, 0], BLACK]]).pulls).toEqual([]);
    const rim: [Axial, number][] = [[[4, -3], BLACK]];
    expect(cues(rim, [mark([4, -3], MAGNET)], [], { cells: [[4, -3]], dir: 5 }, [[[4, -2], BLACK]]).pulls).toEqual([]);
  });

  it('a pushed Magnet of the other side pulls too', () => {
    // Black pushes the white Magnet on (0, 0) to (0, -1); it pulls the black marble on (-2, -1) to (-1, -1).
    const before: [Axial, number][] = [[[0, 2], BLACK], [[0, 1], BLACK], [[0, 0], WHITE], [[-2, -1], BLACK]];
    const move = { cells: [[0, 2], [0, 1]] as Axial[], dir: 4 };
    const after: [Axial, number][] = [[[0, 1], BLACK], [[0, 0], BLACK], [[0, -1], WHITE], [[-1, -1], BLACK]];
    expect(cues(before, [mark([0, 0], MAGNET)], [], move, after).pulls).toEqual([{ from: [-2, -1], to: [-1, -1], dir: 0 }]);
  });

  it('a Medic thrown off comes back on the first back row cell that was free and holds a marble of its side now', () => {
    const lost: Special[] = [mark([1, 3], MEDIC)];
    const away: Move = { cells: [[3, -4]], dir: 5 };
    const back = (extra: [Axial, number][]): [Axial, number][] => [[[3, -4], WHITE], ...extra];
    const before = back([[[-3, 4], BLACK]]);
    // Black's Medic left the board: it is back on (-4, 4), the first cell of Black's row.
    expect(cues([...before, [[1, 3], BLACK]], lost, [], away, back([[[-3, 4], BLACK], [[-4, 4], BLACK]]), []).returns).toEqual([[-4, 4]]);
    // With that cell taken, on the next one.
    const taken = [[[-4, 4], BLACK], ...before] as [Axial, number][];
    expect(cues([...taken, [[1, 3], BLACK]], lost, [], away, [...taken, [[-2, 4], BLACK]], []).returns).toEqual([[-2, 4]]);
    // White's Medic returns on White's row, the opposite cells.
    expect(cues([[[0, -3], WHITE], [[3, -4], WHITE]], [mark([0, -3], MEDIC)], [], away, [[[3, -4], WHITE], [[4, -4], WHITE]], []).returns).toEqual([[4, -4]]);
    // The Medic still on the board, or the row full: nothing comes back.
    expect(cues([...before, [[1, 3], BLACK]], lost, [], away, [...before, [[1, 3], BLACK]], lost).returns).toEqual([]);
    const full = [-4, -3, -2, -1, 0].map((q): [Axial, number] => [[q, 4], BLACK]);
    expect(cues([...full, [[1, 3], BLACK]], lost, [], away, full, []).returns).toEqual([]);
  });

  it('pullTrack slides the marble from its cell to the near one in the slide\'s time, at once with reduced motion', () => {
    const pull = { from: [-2, 0] as Axial, to: [-1, 0] as Axial, dir: 0 };
    const track = pullTrack(pull, false);
    expect(track.cell).toEqual([-1, 0]);
    expect(track.durationMs).toBe(SLIDE_MS);
    expect(track.from).toEqual({ x: axialTo3D(-2, 0).x, z: axialTo3D(-2, 0).z });
    expect(track.to).toEqual({ x: axialTo3D(-1, 0).x, z: axialTo3D(-1, 0).z });
    expect(pullTrack(pull, true).durationMs).toBe(0);
  });
});
