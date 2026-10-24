import { describe, expect, it } from 'vitest';
import { Hint, type Spot } from './hint';

describe('Hint', () => {
  /** An ask whose answers the test gives by hand, in any order. */
  function setup() {
    const calls: { history: number[][]; answer: (move: number[]) => void }[] = [];
    let changes = 0;
    const hint = new Hint(
      (history) => new Promise<number[]>((answer) => calls.push({ history, answer })),
      () => changes++,
    );
    return { calls, hint, changes: () => changes };
  }
  const flush = () => new Promise((done) => setTimeout(done, 0));
  const game = { name: 'the game on the board' };
  const other = { name: 'a new game, an import' };
  const moves = (n: number) => Array.from({ length: n }, (_, i) => [1, 4, 0, i, 0, 0, 0, 0]);
  const at = (g: object, ply: number): Spot => ({ game: g, ply });
  const BEST = [1, 4, 0, 2, 0, 0, 0, 0];
  const NEXT = [1, 5, 0, -2, 0, 0, 0, 0];

  it('is off until pressed, asks the best move of the position on a press, then shows it', async () => {
    const { calls, hint, changes } = setup();
    expect(hint.state(at(game, 2))).toBe('off');
    expect(hint.shown(at(game, 2))).toBeNull();

    hint.press(game, moves(2));
    expect(calls.map((c) => c.history)).toEqual([moves(2)]);
    expect(hint.state(at(game, 2))).toBe('asking');
    expect(hint.shown(at(game, 2))).toBeNull(); // nothing to draw before the engine answers
    expect(changes()).toBe(1);

    calls[0]!.answer(BEST);
    await flush();
    expect(hint.state(at(game, 2))).toBe('shown');
    expect(hint.shown(at(game, 2))).toEqual(BEST);
    expect(changes()).toBe(2);
  });

  it('marks the marbles its move takes while it is shown, none while asked, off or on another position, #301', async () => {
    const { calls, hint } = setup();
    const INLINE = [3, 2, -4, 4, -3, 3, -2, 2]; // three Black marbles, (-4, 4) (-3, 3) (-2, 2), one step NE
    expect(hint.marked(at(game, 0))).toEqual([]);
    hint.press(game, moves(0));
    expect(hint.marked(at(game, 0))).toEqual([]); // nothing to mark before the engine answers
    calls[0]!.answer(INLINE);
    await flush();
    expect(hint.marked(at(game, 0))).toEqual([
      [-4, 4],
      [-3, 3],
      [-2, 2],
    ]);
    expect(hint.marked(at(game, 1))).toEqual([]); // the next move
    expect(hint.marked(at(other, 0))).toEqual([]);
    hint.clear();
    expect(hint.marked(at(game, 0))).toEqual([]);
  });

  it('asks with a copy of the history: a move played after the press never reaches the request', () => {
    const { calls, hint } = setup();
    const history = moves(1);
    hint.press(game, history);
    history.push(NEXT);
    expect(calls[0]!.history).toEqual(moves(1));
  });

  it('is cleared by a second press, shown or still asked, and an answer after it stays off', async () => {
    const { calls, hint } = setup();
    hint.press(game, moves(0));
    calls[0]!.answer(BEST);
    await flush();
    hint.press(game, moves(0));
    expect(hint.state(at(game, 0))).toBe('off');
    expect(hint.shown(at(game, 0))).toBeNull();

    hint.press(game, moves(1));
    hint.press(game, moves(1)); // pressed again before the engine answered
    expect(hint.state(at(game, 1))).toBe('off');
    calls[1]!.answer(NEXT);
    await flush();
    expect(hint.state(at(game, 1))).toBe('off');
    expect(hint.shown(at(game, 1))).toBeNull();
  });

  it('is cleared by clear (a new selection); clearing a hint that is off changes nothing', async () => {
    const { calls, hint, changes } = setup();
    hint.clear();
    expect(changes()).toBe(0);

    hint.press(game, moves(3));
    calls[0]!.answer(BEST);
    await flush();
    expect(changes()).toBe(2);
    hint.clear();
    expect(hint.state(at(game, 3))).toBe('off');
    expect(hint.shown(at(game, 3))).toBeNull();
    expect(changes()).toBe(3);
    hint.clear();
    expect(changes()).toBe(3);
  });

  it('belongs to its position: after the next move or in another game it is off, and a late answer is never shown there', async () => {
    const { calls, hint } = setup();
    hint.press(game, moves(2));
    // The game moved on before the engine answered: the next ply, or a new game at the same ply.
    expect(hint.state(at(game, 3))).toBe('off');
    expect(hint.state(at(other, 2))).toBe('off');
    calls[0]!.answer(BEST);
    await flush();
    expect(hint.shown(at(game, 3))).toBeNull();
    expect(hint.state(at(game, 3))).toBe('off');
    expect(hint.shown(at(other, 2))).toBeNull();
    expect(hint.state(at(other, 2))).toBe('off');
  });

  it('asks again on a new position, and shows only the answer for that one', async () => {
    const { calls, hint } = setup();
    hint.press(game, moves(0));
    hint.press(game, moves(1)); // the hint of ply 0 is off on ply 1: this press asks for ply 1
    expect(calls.map((c) => c.history)).toEqual([moves(0), moves(1)]);
    expect(hint.state(at(game, 1))).toBe('asking');

    calls[0]!.answer(BEST); // the answer for ply 0 lands first
    await flush();
    expect(hint.state(at(game, 1))).toBe('asking');
    expect(hint.shown(at(game, 1))).toBeNull();
    calls[1]!.answer(NEXT);
    await flush();
    expect(hint.shown(at(game, 1))).toEqual(NEXT);

    hint.press(other, moves(1)); // another game at the same ply asks too
    expect(calls).toHaveLength(3);
  });
});
