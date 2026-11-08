// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Axial, Move } from './board';
import { boot } from './test/harness';

// #1649: the rename to Edgefall keeps every save key `ab-alone.*`, so a profile saved before it boots on its progress and plays.

const SAVED = {
  'ab-alone.firstrun': 'done',
  'ab-alone.progress': JSON.stringify({ version: 1, deck: 'mess', cell: [0, 0], beaten: ['echo'] }),
};

describe('a profile saved before the rename (#1649)', () => {
  it('lands on its Hub with The Echo beaten, and plays a move', async () => {
    const hub = await boot('/', { storage: SAVED });
    expect(document.body.dataset.hub).toBe('mess 0,0');
    expect(document.querySelector('#hub-rail p.goal')!.textContent).not.toContain('The Echo');
    await hub.settle();
    const game = await boot('?bot=off', { storage: SAVED });
    const move = game.hook<Move[]>('__legal').find((m) => m.cells.length === 1)!;
    game.click(...move.cells[0]!);
    game.click(...game.hook<{ cell: Axial; dir: number }[]>('__targets').find((t) => t.dir === move.dir)!.cell);
    await game.settle();
    expect(game.hook('__plies')).toBe(1);
    expect(document.querySelector('canvas')!.getAttribute('aria-label')).toBe('Edgefall board');
  });
});
