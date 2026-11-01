// @vitest-environment jsdom
import * as THREE from 'three/webgpu';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import type { Axial } from './board';
import { boot, type Game } from './test/harness';

// One mode at a time (#1275, docs/specs/ui.md): a mode left for another leaves nothing behind, not a HUD block, a body data
// key, a mesh of the scene, nor a timer. The clean base is the Hub, where every mode can be picked: each mode of the
// README's table is entered, played a little and left for the hub, which must show what it showed before. The stray
// state no mode owns is cleared by the switch from the lists of modeswitch.ts.

const byId = <T extends HTMLElement = HTMLButtonElement>(id: string): T => document.getElementById(id) as T;
type Move = { cells: Axial[]; dir: number };
const DIRS: Axial[] = [[1, 0], [-1, 0], [1, -1], [-1, 1], [0, -1], [0, 1]];

/** Catches the board's scene main.ts builds: call before boot. */
function catchScene(): () => THREE.Scene {
  let scene: THREE.Scene | null = null;
  const add = THREE.Object3D.prototype.add;
  const spy = vi.spyOn(THREE.Object3D.prototype, 'add').mockImplementation(function (this: THREE.Object3D, ...objects) {
    if (this instanceof THREE.Scene && this.name === 'abalone-scene') scene = this;
    return add.apply(this, objects);
  });
  onTestFinished(() => spy.mockRestore());
  return () => scene!;
}

/** Counts the intervals the page starts from now on and has not cleared: call after boot, over the harness's own. */
function countIntervals(): () => number {
  const live = new Set<unknown>();
  const [every, stop] = [globalThis.setInterval, globalThis.clearInterval];
  vi.stubGlobal('setInterval', (fn: () => void, ms?: number) => {
    const id = every(fn, ms);
    live.add(id);
    return id;
  });
  vi.stubGlobal('clearInterval', (id: Parameters<typeof clearInterval>[0]) => {
    live.delete(id);
    stop(id);
  });
  return () => live.size;
}

interface Probe {
  scene: () => THREE.Scene;
  intervals: () => number;
}

/** What the page shows: the elements with an id out of any hidden one, the body's data keys, the scene's visible objects
 * counted by kind, and the live intervals. */
function snapshot({ scene, intervals }: Probe) {
  const shown = [...document.body.querySelectorAll<HTMLElement>('[id]')].filter((el) => !el.closest('[hidden]')).map((el) => el.id);
  const objects: Record<string, number> = {};
  scene().traverseVisible((o) => {
    const key = `${o.type} ${o.name} ${(o as THREE.Mesh).geometry?.type ?? ''}`;
    objects[key] = (objects[key] ?? 0) + 1;
  });
  // The count of the Open world's saves is the page's (#968): the leave's own save counts after it.
  const data = Object.keys(document.body.dataset).filter((key) => key !== 'openworldSaved');
  return { shown: shown.sort(), data: data.sort(), objects, intervals: intervals() };
}

/** The Ship entry of the mode menu, then one draw: the marbles' instances follow the draw (instancedcells.ts). */
async function ship(game: Game): Promise<void> {
  game.openModes();
  byId('ship').click();
  await game.settle();
  game.hook('__drawNext'); // under automation the loop draws when asked (#365)
  game.frame(400);
}

/** A few turns against the bot or the boss, their effects played out. */
async function play(game: Game): Promise<void> {
  await game.hook('__playTurns', 3, [0, 1, 2, 3, 4, 5]);
  for (let i = 0; i < 20; i++) game.frame(200);
  await game.settle();
}

/** One move of the player, a marble north-west or north-east, and the bot's reply. */
async function move(game: Game): Promise<void> {
  const mv = game.hook<Move[]>('__legal').find((m) => m.cells.length === 1 && (m.dir === 2 || m.dir === 4))!;
  const [q, r] = mv.cells[0]!;
  game.click(q, r);
  game.click(q + DIRS[mv.dir]![0], r + DIRS[mv.dir]![1]);
  for (let i = 0; i < 20; i++) game.frame(200);
  await game.settle();
}

/** A menu entry of the mode menu. */
function pick(game: Game, id: string): void {
  game.openModes();
  byId(id).click();
}

/** The fight ends at the next move, won (1) or lost (2), and plays that move. A win would mark the boss beaten in the hub. */
async function endFight(game: Game, result: number): Promise<void> {
  const { Encounter } = await import('abalone-wasm');
  const over = (): number => (game.hook<number>('__plies') > 0 ? result : 0);
  vi.spyOn(Encounter.prototype, 'result').mockImplementation(over);
  vi.spyOn(Encounter.prototype, 'status').mockImplementation(over);
  await move(game);
}

/** Boots the page with fixed seeds (a boss fight, a run, a room), and the hub it lands on drawn once. */
async function bootHub(url = '/'): Promise<{ game: Game; probe: Probe }> {
  vi.spyOn(crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
    new Uint8Array(array!.buffer).fill(7);
    return array;
  });
  const scene = catchScene();
  const game = await boot(url);
  const probe = { scene, intervals: countIntervals() };
  await game.settle();
  game.hook('__drawNext');
  game.frame(400);
  return { game, probe };
}

describe('a mode switch leaves nothing of the mode behind (#1275)', () => {
  it('every mode of the mode menu, left for the Hub, leaves the hub as the boot showed it', async () => {
    const { game, probe } = await bootHub();
    const base = snapshot(probe);
    const { boss_ids } = await import('abalone-wasm');
    const modes: [string, () => Promise<void>][] = [
      ...boss_ids().map((id, i): [string, () => Promise<void>] => [
        `the boss fight ${id}`,
        async () => {
          pick(game, 'boss-fight');
          byId('boss-list').querySelectorAll('button')[i]!.click();
          await play(game);
        },
      ]),
      ['the daily challenge, lost', async () => (pick(game, 'daily'), await endFight(game, 2))],
      ['the rogue-lite map', async () => (pick(game, 'roguelite'), await game.settle())],
      ['a rogue-lite fight', async () => (pick(game, 'roguelite'), byId('run-map').querySelector<HTMLButtonElement>('button[data-node]')!.click(), await move(game))],
      ['the Trainer', async () => (pick(game, 'trainer'), await move(game))],
      ['the battle royale', async () => (pick(game, 'battle-royale'), byId('royale-hold').click(), await game.settle())],
      ['the online battle royale', async () => (pick(game, 'battle-royale'), byId('royale-invite').click(), await game.online())],
      ['the Open world', async () => (pick(game, 'openworld'), await game.settle(), game.frame(400))],
      ['Play online', async () => (pick(game, 'play-online'), await game.online())],
      ['Ranked', async () => (pick(game, 'ranked'), await game.online())],
      ['Fight together', async () => (pick(game, 'fight-together'), byId('coop-list').querySelector('button')!.click(), await game.online())],
    ];
    const leaks: string[] = [];
    for (const [name, enter] of modes) {
      await enter();
      await ship(game);
      const left = snapshot(probe);
      for (const key of ['shown', 'data'] as const) {
        for (const x of left[key]) if (!base[key].includes(x)) leaks.push(`${name}: ${key} ${x} stays`);
        for (const x of base[key]) if (!left[key].includes(x)) leaks.push(`${name}: ${key} ${x} goes`);
      }
      for (const kind of new Set([...Object.keys(base.objects), ...Object.keys(left.objects)]))
        if (base.objects[kind] !== left.objects[kind]) leaks.push(`${name}: ${kind.trim()} ${base.objects[kind] ?? 0} -> ${left.objects[kind] ?? 0}`);
      if (left.intervals !== base.intervals) leaks.push(`${name}: intervals ${base.intervals} -> ${left.intervals}`);
    }
    expect(leaks).toEqual([]);
  }, 60_000);

  it('a boss door of the hub, the fight lost and Back to the hub: the hub as it was', async () => {
    const { game, probe } = await bootHub();
    game.click(1, 0); // from the spawn to the cell west of the Echo's door
    game.hook('__drawNext');
    game.frame(400);
    const before = snapshot(probe);
    game.click(2, 0);
    expect(document.body.dataset.boss).toBe('echo');
    await endFight(game, 2);
    byId('ship-back').click();
    await game.settle();
    game.hook('__drawNext');
    game.frame(400);
    expect(document.body.dataset.hub).toBe('mess 2,0');
    expect(snapshot(probe)).toEqual(before);
  });

  it('a lair of the Open world, the fight lost and Back to the Open world, then Esc and Ship: the hub as the boot showed it', async () => {
    const { game, probe } = await bootHub('/?openworld=7'); // a query: the page opens on the local game
    await ship(game);
    const base = snapshot(probe);
    pick(game, 'openworld');
    await game.settle();
    const [q, r] = document.body.dataset.openworldLairs!.split(' ')[0]!.split(',').map(Number) as unknown as Axial;
    game.hook('__openworldFixture', { hero: [q - 1, r], troop: [], enemies: [] });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }));
    expect(document.body.dataset.boss).toBe('echo');
    await endFight(game, 2);
    byId('ship-back').click();
    await game.settle();
    expect(document.body.dataset.openworld).toBe('7');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await ship(game);
    expect(snapshot(probe)).toEqual(base);
  });
});
