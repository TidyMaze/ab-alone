// @vitest-environment jsdom
import * as THREE from 'three/webgpu';
import { describe, expect, it, vi } from 'vitest';
import { boot } from './test/harness';

// The deck console (#511): the room's console screen shows its deck's lore entry on a canvas texture, paged for the
// UI scale, once the web fonts are in. body[data-console] names the entry and the page shown, read by the e2e test.

type Screen = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
/** The console screen main.ts draws last, the one unlit mesh with a canvas map, caught when its props are added to
 *  their group: call before boot. */
function catchScreen(): () => Screen {
  let screen: Screen | null = null;
  const add = THREE.Object3D.prototype.add;
  vi.spyOn(THREE.Object3D.prototype, 'add').mockImplementation(function (this: THREE.Object3D, ...objects) {
    for (const o of objects)
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshBasicMaterial && o.material.map?.image instanceof HTMLCanvasElement)
        screen = o as Screen;
    return add.apply(this, objects);
  });
  return () => screen!;
}
const shown = (): string | undefined => document.body.dataset.console;
const version = (screen: () => Screen): number => screen().material.map!.version;

describe('main.ts, the deck console (#511)', () => {
  it('waits for the web fonts, then shows the first page of its deck entry', async () => {
    const asked: string[] = [];
    const pending: (() => void)[] = [];
    const screen = catchScreen();
    const game = await boot('?bot=off', {
      fonts: (font) => {
        asked.push(font);
        return new Promise((done) => pending.push(() => done([])));
      },
    });
    game.frame();
    game.frame(9000);
    expect(asked).toEqual(['600 24px "Chakra Petch"', '400 24px "IBM Plex Sans"']);
    expect(shown()).toBeUndefined(); // nothing drawn in a fallback font
    const blank = version(screen); // the empty canvas, uploaded once
    game.hook('__deck', 'cargo'); // a deck change before the fonts draws nothing either
    game.frame();
    expect(shown()).toBeUndefined();
    for (const fontIn of pending) fontIn();
    await game.settle();
    game.frame();
    expect(shown()).toBe('cargo-assay 1/1');
    expect(version(screen)).toBe(blank + 1);
  });

  it('turns the page every 8 s and draws the screen only then: no flicker under safe mode', async () => {
    const screen = catchScreen();
    const game = await boot('?bot=off');
    await game.settle();
    game.frame();
    expect(document.getElementById('setting-theme')!.getAttribute('aria-pressed')).toBe('true'); // safe mode
    expect(shown()).toBe('mess-house-rule 1/2');
    const drawn = version(screen);
    for (let i = 0; i < 20; i++) game.frame(16);
    expect([shown(), version(screen)]).toEqual(['mess-house-rule 1/2', drawn]);
    game.frame(8000);
    expect([shown(), version(screen)]).toEqual(['mess-house-rule 2/2', drawn + 1]);
    game.frame(8000);
    expect([shown(), version(screen)]).toEqual(['mess-house-rule 1/2', drawn + 2]);
  });

  it('shows the first page of the new deck entry when a mode starts on another deck', async () => {
    const game = await boot('?bot=off');
    await game.settle();
    game.frame();
    game.frame(8000);
    expect(shown()).toBe('mess-house-rule 2/2');
    game.hook('__deck', 'bridge');
    game.frame(16);
    expect(shown()).toBe('bridge-clamp 1/1');
  });

  it('lays the entry out again for a new UI scale, from its first page', async () => {
    vi.stubGlobal('innerWidth', 1600);
    vi.stubGlobal('innerHeight', 900);
    const screen = catchScreen();
    const game = await boot('?bot=off');
    await game.settle();
    game.frame();
    game.frame(8000);
    expect(shown()).toBe('mess-house-rule 2/2');
    const drawn = version(screen);
    for (let i = 0; i < 12; i++) document.getElementById('setting-theme')!.click(); // 3 presses a step: up to 200 %
    expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe('2');
    game.frame(16);
    expect(shown()).toBe('mess-house-rule 1/4');
    expect(version(screen)).toBeGreaterThan(drawn);
  });

  it('falls back to local fonts when document.fonts.load rejects, bug #600', async () => {
    const game = await boot('?bot=off', {
      fonts: () => Promise.reject(new Error('NetworkError: A network error occurred.')),
    });
    await game.settle();
    game.frame();
    expect(shown()).toBe('mess-house-rule 1/2');
  });
});
