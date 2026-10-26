// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { boot, type Game } from './test/harness';

// The collectable audio logs (#517, world.md section 4): a click on the recorder prop of the deck plays the deck's log
// and saves it collected; the log archive (#513) lists the logs collected after the entries read, and a press on one
// replays it. Play log on an archived entry of another deck plays that deck's log.

type Rect = { x: number; y: number; width: number; height: number };
const byId = (id: string): HTMLElement => document.getElementById(id)!;
const menu = (): HTMLElement => byId('settings-menu');
const data = (): DOMStringMap => document.body.dataset;
const rows = (): HTMLButtonElement[] => [...menu().querySelectorAll<HTMLButtonElement>('.setting-archive button')];
const canvas = (): HTMLCanvasElement => document.querySelector('canvas')!;
function tap(r: Rect): void {
  const at = { clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerId: 1, bubbles: true };
  canvas().dispatchEvent(new PointerEvent('pointerdown', at));
  canvas().dispatchEvent(new PointerEvent('pointerup', at));
}

async function ready(): Promise<Game> {
  const game = await boot('?bot=off');
  await game.settle();
  game.frame();
  return game;
}

describe('main.ts, the collectable audio logs (#517)', () => {
  it('a click on the recorder plays the deck log and saves it collected, once', async () => {
    const game = await ready();
    game.hook('__deck', 'bridge');
    const recorder: Rect = game.hook('__recorderRect');
    expect(recorder.width).toBeGreaterThan(0);
    tap(recorder);
    expect(data().log).toBe('bridge-crew-count');
    expect(byId('reader').hidden).toBe(true); // no reader: the log plays over the board
    expect(byId('log-button').textContent).toBe('Skip log');
    expect(localStorage.getItem('ab-alone.logs-collected')).toBe('bridge-crew-count');
    tap(recorder);
    expect(localStorage.getItem('ab-alone.logs-collected')).toBe('bridge-crew-count');
  });

  it('the archive lists the logs collected after the entries read, and a press replays one', async () => {
    const game = await ready();
    localStorage.setItem('ab-alone.lore-read', 'mess-house-rule');
    localStorage.setItem('ab-alone.logs-collected', 'bridge-crew-count,mess-first-game');
    game.openSettings();
    byId('setting-log-archive').click();
    expect(rows().map((b) => b.textContent)).toEqual([
      "Captain's order, pinned above table four",
      'Mess recorder, the first game after the order',
      'Bridge, console recorder',
    ]);
    rows()[2]!.click();
    expect(menu().hidden).toBe(true);
    expect(data().log).toBe('bridge-crew-count');
    expect(byId('reader').hidden).toBe(true);
    expect(byId('log-button').textContent).toBe('Skip log');
  });

  it('lists a log collected even when no entry was read', async () => {
    const game = await ready();
    localStorage.setItem('ab-alone.logs-collected', 'chapel-names');
    game.openSettings();
    byId('setting-log-archive').click();
    expect(rows().map((b) => b.textContent)).toEqual(['Chapel recorder, left on the rail']);
  });

  it('Play log on an archived entry of another deck plays that deck log', async () => {
    const game = await ready();
    localStorage.setItem('ab-alone.lore-read', 'cargo-assay');
    game.openSettings();
    byId('setting-log-archive').click();
    rows()[0]!.click();
    expect(data().reading).toBe('cargo-assay');
    byId('log-button').click();
    expect(data().log).toBe('cargo-night-shift');
  });
});
