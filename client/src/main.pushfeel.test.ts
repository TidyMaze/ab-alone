// @vitest-environment jsdom
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { type Axial, axialTo3D } from './board';
import { KICK_MS, KICK_PX, REST, unkick, type Kick } from './kick';
import { SLIDE_MS, SQUASH_MS, STAGGER_MS } from './slide';
import { boot, type Game } from './test/harness';

// How a push lands on the board (#1560): the arrival squash, the pushed marbles that start a little after the pusher, and the
// camera kick of an ejection, all on top of the slide and gone under reduced motion.

const data = (): DOMStringMap => document.body.dataset; // boot() replaces the body

/** The 3v2 push of e2e/eject.spec.ts: five plies, the fifth pushes a White marble off the board. Each ply's slide ends
 * before the next one; the slide of the fifth has just started (its first frame is not drawn). */
function pushOffBoard(game: Game): void {
  const plies: Axial[][] = [
    [[-2, 2], [-2, 3], [-2, 4], [-2, 1]], // 1. Black trio NW
    [[0, -3], [0, -2], [-1, -2]], // 2. White pair SW
    [[-2, 1], [-2, 2], [-2, 3], [-2, 0]], // 3. Black trio NW
    [[-1, -2], [-1, -1], [-2, -2]], // 4. White pair W, into the Black column
    [[-2, 0], [-2, 1], [-2, 2], [-2, -1]], // 5. 3v2 push: the White marble on (-2, -1) is pushed to (-2, -2), the one there leaves
  ];
  for (const [i, cells] of plies.entries()) {
    if (i > 0) game.frame(SLIDE_MS);
    for (const [q, r] of cells) game.click(q, r);
  }
}

/** The marble drawn on cell (q, r), by its position, whatever it is doing: null when none stands within 1e-6 of it. */
function marbleOn(game: Game, [q, r]: Axial): THREE.Mesh | null {
  const at = axialTo3D(q, r);
  const marbles = game.hook<THREE.Group>('__marbles');
  const found = marbles.children.find((o) => o instanceof THREE.Mesh && o.geometry instanceof THREE.SphereGeometry && Math.hypot(o.position.x - at.x, o.position.z - at.z) < 1e-6);
  return (found as THREE.Mesh | undefined) ?? null;
}

/** The height of the marble as drawn: the length of the row of its matrix that gives y, 1 at rest. */
function height(marble: THREE.Mesh): number {
  const e = marble.matrix.elements;
  return Math.hypot(e[1]!, e[5]!, e[9]!);
}

describe('the arrival squash', () => {
  it('squashes a marble when it arrives, then it rebounds and rests, while the slide is over for input', async () => {
    const game = await boot('?bot=off');
    pushOffBoard(game);
    game.frame(SLIDE_MS); // the slide ends; the first frame after it is drawn at the arrival
    expect(data().sliding).toBeUndefined(); // nothing waits for the squash: the next move can be played now
    const pushed = (): THREE.Mesh => marbleOn(game, [-2, -2])!;
    expect(height(pushed())).toBeCloseTo(1, 9);
    game.frame(SQUASH_MS / 4);
    const squashed = pushed();
    expect(height(squashed)).toBeLessThan(0.95);
    expect(squashed.matrixAutoUpdate).toBe(false);
    expect(squashed.matrix.elements[0]).toBeGreaterThan(1); // and wider
    // It stays on the board: the contact point under it does not rise.
    expect(squashed.position.y).toBe(0.36);
    expect(squashed.matrix.elements[13]).toBeCloseTo(0.36 - 0.36 * (1 - height(squashed)), 9);
    game.frame(SQUASH_MS / 2);
    expect(height(pushed())).toBeGreaterThan(1); // the rebound
    game.frame(SQUASH_MS);
    expect(pushed().matrixAutoUpdate).toBe(true); // at rest: the marble is drawn as any other
  });

  it('does not delay a click: the move after the push plays at the end of the slide, squash or not', async () => {
    const game = await boot('?bot=off');
    pushOffBoard(game);
    game.frame(SLIDE_MS + 10); // in the squash
    expect(height(marbleOn(game, [-2, -2])!)).not.toBe(1);
    expect(game.hook<number>('__plies')).toBe(5);
    const mv = game.hook<{ cells: Axial[]; dir: number }[]>('__legal').find((m) => m.cells.length === 1)!;
    game.click(...mv.cells[0]!);
    game.click(...game.hook<{ cell: Axial; dir: number }[]>('__targets').find((t) => t.dir === mv.dir)!.cell);
    expect(game.hook<number>('__plies')).toBe(6);
  });

  it('is cut under reduced motion: the marbles are at their cells at once and never squashed', async () => {
    const game = await boot('?bot=off', { reducedMotion: true });
    pushOffBoard(game);
    expect(data().sliding).toBeUndefined();
    for (let ms = 0; ms < 400; ms += 20) {
      game.frame(20);
      expect(height(marbleOn(game, [-2, -2])!)).toBeCloseTo(1, 9);
    }
  });
});

describe('the stagger of a push', () => {
  it('starts the marble pushed a little after the pusher, along the line, and ends with the move', async () => {
    const game = await boot('?bot=off');
    pushOffBoard(game);
    game.frame(STAGGER_MS / 2); // 10 ms: the pusher has left, the pushed marble waits on its cell
    expect(marbleOn(game, [-2, 0])).toBeNull(); // the head of the line left its cell
    expect(marbleOn(game, [-2, -1])).not.toBeNull(); // the pushed marble did not
    game.frame(STAGGER_MS); // 30 ms: it has started
    expect(marbleOn(game, [-2, -1])).toBeNull();
    game.frame(SLIDE_MS - 30);
    expect(marbleOn(game, [-2, -2])).not.toBeNull(); // both are on their cells when the slide ends
    expect(marbleOn(game, [-2, -1])).not.toBeNull();
  });
});

describe('the camera kick of an ejection', () => {
  const kickOf = (game: Game): Kick => game.hook<Kick>('__kick');

  it('punches and shakes the picture for at most 250 ms when a marble leaves, then it is at rest', async () => {
    const view = vi.spyOn(THREE.PerspectiveCamera.prototype, 'setViewOffset');
    const clear = vi.spyOn(THREE.PerspectiveCamera.prototype, 'clearViewOffset');
    const game = await boot('?bot=off');
    pushOffBoard(game);
    expect(data().ejections).toBe('1');
    expect(data().kick).toBe('on');
    view.mockClear();
    clear.mockClear();
    game.frame(60);
    expect(kickOf(game)).not.toEqual(REST);
    expect(kickOf(game).zoom).toBeGreaterThan(1);
    expect(Math.abs(kickOf(game).x) + Math.abs(kickOf(game).y)).toBeGreaterThan(0);
    expect(view).toHaveBeenCalledTimes(1); // drawn once, with the offset ...
    const [w, h, x, y, fw, fh] = view.mock.calls[0]!;
    expect([w, h, fw, fh]).toEqual([innerWidth, innerHeight, innerWidth, innerHeight]);
    expect([x, y]).toEqual([-kickOf(game).x, -kickOf(game).y]); // the picture moves by the kick
    expect(clear).toHaveBeenCalledTimes(1); // ... and the camera is the resting one again once drawn
    game.frame(KICK_MS - 60);
    expect(data().kick).toBeUndefined();
    game.frame(16);
    expect(kickOf(game)).toEqual(REST);
    view.mockClear();
    game.frame(16);
    expect(view).not.toHaveBeenCalled(); // nothing is drawn offset any more
  });

  it('does not kick a plain move', async () => {
    const view = vi.spyOn(THREE.PerspectiveCamera.prototype, 'setViewOffset');
    const game = await boot('?bot=off');
    const mv = game.hook<{ cells: Axial[]; dir: number }[]>('__legal').find((m) => m.cells.length === 1)!;
    game.click(...mv.cells[0]!);
    game.click(...game.hook<{ cell: Axial; dir: number }[]>('__targets').find((t) => t.dir === mv.dir)!.cell);
    for (let i = 0; i < 20; i++) game.frame(20);
    expect(data().kick).toBeUndefined();
    expect(view).not.toHaveBeenCalled();
  });

  it('is cut under reduced motion', async () => {
    const view = vi.spyOn(THREE.PerspectiveCamera.prototype, 'setViewOffset');
    const game = await boot('?bot=off', { reducedMotion: true });
    pushOffBoard(game);
    expect(data().ejections).toBe('1');
    for (let i = 0; i < 20; i++) game.frame(20);
    expect(data().kick).toBeUndefined();
    expect(view).not.toHaveBeenCalled();
  });

  it('ends at once on a press, and the picture is drawn at rest once more', async () => {
    const game = await boot('?bot=off');
    pushOffBoard(game);
    game.frame(60);
    expect(kickOf(game)).not.toEqual(REST);
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(data().kick).toBeUndefined();
    const draws = game.draws();
    game.frame(16);
    expect(game.draws()).toBeGreaterThan(draws); // the frame that shows the board at rest
    expect(kickOf(game)).toEqual(REST);
  });

  it('picks the cell under the pointer on the picture as drawn: a hover mid-kick is unshaken first', async () => {
    const game = await boot('?bot=off');
    pushOffBoard(game);
    game.frame(60);
    const kick = kickOf(game);
    expect(kick).not.toEqual(REST);
    const aimed = vi.spyOn(THREE.Raycaster.prototype, 'setFromCamera');
    document.querySelector('canvas')!.dispatchEvent(new PointerEvent('pointermove', { clientX: 300, clientY: 200, pointerId: 1, bubbles: true }));
    expect(aimed).toHaveBeenCalled();
    const [ndc] = aimed.mock.calls.at(-1)! as unknown as [THREE.Vector2];
    const rest = unkick(kick, 300, 200, innerWidth, innerHeight);
    expect(ndc.x).toBeCloseTo((rest.x / innerWidth) * 2 - 1, 9);
    expect(ndc.y).toBeCloseTo(-(rest.y / innerHeight) * 2 + 1, 9);
    // The kick moves the picture by a few pixels at most, so the cell hit is the one shown.
    expect(Math.hypot(rest.x - 300, rest.y - 200)).toBeLessThan(KICK_PX + 0.02 * Math.hypot(innerWidth, innerHeight));
  });

  it('keeps the click on the cell clicked: a press ends the kick before it picks', async () => {
    const game = await boot('?bot=off');
    pushOffBoard(game);
    game.frame(60);
    const aimed = vi.spyOn(THREE.Raycaster.prototype, 'setFromCamera');
    const canvas = document.querySelector('canvas')!;
    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 300, clientY: 200, pointerId: 1, bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: 300, clientY: 200, pointerId: 1, bubbles: true }));
    expect(aimed).toHaveBeenCalled();
    for (const [ndc] of aimed.mock.calls as unknown as [THREE.Vector2][]) {
      expect(ndc.x).toBeCloseTo((300 / innerWidth) * 2 - 1, 9); // the resting picture: the pointer as it is
      expect(ndc.y).toBeCloseTo(-(200 / innerHeight) * 2 + 1, 9);
    }
  });
});
