// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { type Axial, DIRECTIONS } from './board';
import { boot, type Game } from './test/harness';

// The drag play of main.ts on the harness (#794): press on a marble of the player, pass over in-line neighbours, release
// toward a direction. A drag that starts anywhere else is the camera orbit.

type Move = { cells: Axial[]; dir: number };
const legal = (game: Game): Move[] => game.hook<Move[]>('__legal');
const rings = (game: Game): Axial[] => game.hook<Axial[]>('__rings');
const plies = (game: Game): number => game.hook<number>('__plies');
const screen = (game: Game, q: number, r: number): { x: number; y: number } => game.hook('__cellToScreen', q, r);
const canvas = (): HTMLCanvasElement => document.querySelector('canvas')!;
function pointer(type: string, at: { x: number; y: number }, pointerId = 1): void {
  canvas().dispatchEvent(new PointerEvent(type, { clientX: at.x, clientY: at.y, pointerId, bubbles: true }));
}
/** The centre of a group plus 1.5 steps toward a direction, as a point of the window. */
function past(game: Game, cells: Axial[], dir: number): { x: number; y: number } {
  const q = cells.reduce((s, c) => s + c[0], 0) / cells.length + 1.5 * DIRECTIONS[dir]![0];
  const r = cells.reduce((s, c) => s + c[1], 0) / cells.length + 1.5 * DIRECTIONS[dir]![1];
  return screen(game, q, r);
}
/** Presses the first marble and passes over the others of the group, the pointer ends on the last one. */
function pass(game: Game, cells: Axial[]): void {
  pointer('pointerdown', screen(game, ...cells[0]!));
  for (const cell of cells.slice(1)) pointer('pointermove', screen(game, ...cell));
}
const pair = (game: Game): Move => legal(game).find((m) => m.cells.length === 2)!;

describe('the drag play', () => {
  it('selects the marbles it passes over, then plays the move released toward its direction', async () => {
    const game = await boot('?bot=off');
    const mv = legal(game).find((m) => m.cells.length === 3)!;
    pass(game, mv.cells);
    expect(rings(game).length).toBe(3);
    expect(plies(game)).toBe(0);
    pointer('pointermove', past(game, mv.cells, mv.dir));
    pointer('pointerup', past(game, mv.cells, mv.dir));
    expect(plies(game)).toBe(1);
    expect(rings(game)).toEqual([]);
  });

  it('plays a single marble moved toward a direction', async () => {
    const game = await boot('?bot=off');
    const mv = legal(game).find((m) => m.cells.length === 1)!;
    pass(game, mv.cells);
    pointer('pointermove', past(game, mv.cells, mv.dir));
    pointer('pointerup', past(game, mv.cells, mv.dir));
    expect(plies(game)).toBe(1);
  });

  it('keeps the selection and plays nothing when the release is toward an illegal direction', async () => {
    const game = await boot('?bot=off');
    const mv = pair(game);
    const open = new Set(legal(game).filter((m) => m.cells.join() === mv.cells.join()).map((m) => m.dir));
    const dir = [0, 1, 2, 3, 4, 5].find((d) => !open.has(d))!;
    pass(game, mv.cells);
    pointer('pointerup', past(game, mv.cells, dir));
    expect(plies(game)).toBe(0);
    expect(rings(game).length).toBe(2);
  });

  it('plays nothing when released on the group itself, and the selection stays', async () => {
    const game = await boot('?bot=off');
    const mv = pair(game);
    pass(game, mv.cells);
    pointer('pointerup', screen(game, ...mv.cells[1]!));
    expect(plies(game)).toBe(0);
    expect(rings(game).length).toBe(2);
  });

  it('ignores the marbles off the line, the opponent and the empty cells it passes over', async () => {
    const game = await boot('?bot=off');
    const mv = legal(game).find((m) => m.cells.length === 1)!;
    pointer('pointerdown', screen(game, ...mv.cells[0]!));
    pointer('pointermove', screen(game, 0, -4)); // a White marble
    pointer('pointermove', screen(game, 0, 0)); // an empty cell
    pointer('pointermove', { x: 1, y: 1 }); // no cell
    expect(rings(game)).toEqual([mv.cells[0]]);
    pointer('pointerup', { x: 1, y: 1 });
    expect(plies(game)).toBe(0);
    expect(rings(game)).toEqual([mv.cells[0]]);
  });

  it('does not orbit the camera while it selects', async () => {
    const game = await boot('?bot=off');
    const corner = screen(game, 4, -4);
    const mv = pair(game);
    pass(game, mv.cells);
    pointer('pointermove', past(game, mv.cells, 0));
    expect(screen(game, 4, -4)).toEqual(corner);
  });

  it('orbits when the press is on an opponent marble, on an empty cell or during a slide', async () => {
    const game = await boot('?bot=off');
    const corner = screen(game, 4, -4);
    const white = screen(game, 0, -4);
    pointer('pointerdown', white);
    pointer('pointermove', { x: white.x + 40, y: white.y });
    pointer('pointerup', { x: white.x + 40, y: white.y });
    expect(screen(game, 4, -4)).not.toEqual(corner);
    expect(rings(game)).toEqual([]);
    const mv = legal(game).find((m) => m.cells.length === 1)!;
    game.click(...mv.cells[0]!);
    game.click(mv.cells[0]![0] + DIRECTIONS[mv.dir]![0], mv.cells[0]![1] + DIRECTIONS[mv.dir]![1]);
    expect(document.body.dataset.sliding).toBe('1');
    const turned = screen(game, 4, -4);
    const black = legal(game).find((m) => m.cells.length === 1)!.cells[0]!; // White to move: its marble
    const at = screen(game, ...black);
    pointer('pointerdown', at);
    pointer('pointermove', { x: at.x + 40, y: at.y });
    pointer('pointerup', { x: at.x + 40, y: at.y });
    expect(screen(game, 4, -4)).not.toEqual(turned);
    expect(rings(game)).toEqual([]);
  });

  it('a second finger turns the drag into a pinch, and a cancelled drag keeps its selection', async () => {
    const game = await boot('?bot=off');
    const mv = pair(game);
    pass(game, mv.cells);
    pointer('pointerdown', { x: 5, y: 5 }, 2);
    pointer('pointermove', { x: 60, y: 60 }, 2);
    pointer('pointerup', { x: 60, y: 60 }, 2);
    pointer('pointerup', past(game, mv.cells, mv.dir));
    expect(plies(game)).toBe(0);
    const again = pair(game);
    pass(game, again.cells);
    pointer('pointercancel', past(game, again.cells, again.dir));
    expect(plies(game)).toBe(0);
    expect(rings(game).length).toBe(2);
  });

  it('plays nothing when the pointer is released where the ground is out of sight', async () => {
    const game = await boot('?bot=off');
    pointer('pointerdown', { x: 1, y: 1 });
    pointer('pointermove', { x: 1, y: -400 }); // the camera as low as it goes
    pointer('pointerup', { x: 1, y: -400 });
    const mv = pair(game);
    pass(game, mv.cells);
    pointer('pointerup', { x: 1, y: 0 });
    expect(plies(game)).toBe(0);
  });

  it('a tap on a marble still selects it', async () => {
    const game = await boot('?bot=off');
    const mv = legal(game).find((m) => m.cells.length === 1)!;
    const at = screen(game, ...mv.cells[0]!);
    pointer('pointerdown', at);
    pointer('pointerup', at);
    expect(rings(game)).toEqual([mv.cells[0]]);
  });
});
