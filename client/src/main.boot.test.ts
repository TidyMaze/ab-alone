// @vitest-environment jsdom
import * as THREE from 'three';
import type * as THREEWebGPU from 'three/webgpu';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { framing } from './camera';
import { boot, type Game } from './test/harness';

// The start of main.ts on the harness (src/test/harness.ts): the service worker's New version button, the renderer
// and its textures, the view and the fog, the theme, the UI scale, safe mode, the settings menu with its toggles and
// volume sliders, the FPS readout and the mode menu.

const byId = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const row = (id: string): HTMLButtonElement => byId(`setting-${id}`);
const root = document.documentElement;
const style = (name: string): string => root.style.getPropertyValue(name);
const key = (k: string): void => void dispatchEvent(new KeyboardEvent('keydown', { key: k }));
const press = (target: EventTarget): void => void target.dispatchEvent(new Event('pointerdown', { bubbles: true }));

/** The scene, the camera and the renderer of the next draw. */
async function drawn(
  game: Game,
): Promise<{ scene: THREE.Scene; camera: THREE.PerspectiveCamera; renderer: THREEWebGPU.WebGPURenderer }> {
  const { WebGPURenderer } = await import('three/webgpu');
  const render = vi.spyOn(WebGPURenderer.prototype, 'render');
  game.frame(1000); // past the gap the loop keeps between two draws under automation
  const [scene, camera] = render.mock.lastCall as unknown as [THREE.Scene, THREE.PerspectiveCamera];
  const renderer = render.mock.contexts.at(-1) as THREEWebGPU.WebGPURenderer;
  render.mockRestore();
  return { scene, camera, renderer };
}

/** Every material of the meshes in the scene. */
function materials(scene: THREE.Scene): THREE.MeshStandardMaterial[] {
  const all: THREE.MeshStandardMaterial[] = [];
  scene.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (m) all.push(...((Array.isArray(m) ? m : [m]) as THREE.MeshStandardMaterial[]));
  });
  return all;
}

/** The Copy diagnostics text, selected in its box: jsdom has no clipboard. */
async function diagnostics(game: Game): Promise<{ environment: Record<string, unknown>; events: { event: string; data?: unknown }[] }> {
  byId('copy-diagnostics').click();
  await game.settle();
  return JSON.parse(byId<HTMLTextAreaElement>('diagnostics').value);
}

/** Boots with the stored settings set after the harness clears the storage, before main.ts reads them. */
async function bootWith(stored: Record<string, string>, url = '?bot=off', options?: Parameters<typeof boot>[1]): Promise<Game> {
  const booting = boot(url, options);
  for (const [k, v] of Object.entries(stored)) localStorage.setItem(k, v);
  return booting;
}

describe('the service worker (#193)', () => {
  function serviceWorker(controller: object | null) {
    const update = vi.fn(async () => {});
    const listeners: Record<string, () => void> = {};
    const worker = {
      controller,
      register: vi.fn(async () => ({ update })),
      addEventListener: (type: string, fn: () => void) => (listeners[type] = fn),
    };
    Object.defineProperty(navigator, 'serviceWorker', { value: worker, configurable: true });
    onTestFinished(() => {
      Reflect.deleteProperty(navigator, 'serviceWorker');
      vi.unstubAllEnvs();
    });
    return { worker, update, listeners };
  }

  it('offers New version when a new build takes over a page it controlled, and the button reloads', async () => {
    vi.stubEnv('PROD', true);
    const { worker, update, listeners } = serviceWorker({});
    const game = await boot('?bot=off');
    await game.settle();
    expect(worker.register).toHaveBeenCalledWith('/sw.js');
    expect(update).toHaveBeenCalledOnce(); // the check for a new build at each load
    const button = byId<HTMLButtonElement>('update');
    expect(button.hidden).toBe(true);
    listeners.controllerchange!();
    expect(button.hidden).toBe(false);
    const reload = vi.fn();
    vi.stubGlobal('location', { ...location, reload });
    button.click();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('offers nothing when the first install takes control', async () => {
    vi.stubEnv('PROD', true);
    const { worker, update, listeners } = serviceWorker(null);
    const game = await boot('?bot=off');
    await game.settle();
    expect(worker.register).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
    listeners.controllerchange!();
    expect(byId('update').hidden).toBe(true);
  });

  it('lets the game go on when the registration is refused', async () => {
    vi.stubEnv('PROD', true);
    const { worker } = serviceWorker({});
    worker.register.mockRejectedValueOnce(new Error('blocked'));
    const game = await boot('?bot=off');
    await game.settle();
    expect(worker.register).toHaveBeenCalledOnce();
    expect(game.turn()).toBe('Black to move');
  });

  it('is not registered by the dev server', async () => {
    const { worker, listeners } = serviceWorker({});
    await boot('?bot=off');
    expect(worker.register).not.toHaveBeenCalled();
    expect(listeners.controllerchange).toBeUndefined();
  });
});

describe('the renderer and its textures', () => {
  // Bug #585: the e2e tests take a canvas in the page for a page that is ready. It joins the page once the HUD is filled,
  // after every listener and page hook, not while the textures and the saved game still load.
  it('puts the canvas in the page only once the page is ready, bug #585', async () => {
    let hud: string | null = null;
    const append = Node.prototype.appendChild;
    vi.spyOn(Node.prototype, 'appendChild').mockImplementation(function <T extends Node>(this: Node, child: T): T {
      if (child instanceof HTMLCanvasElement && this === document.body) hud = byId('hud').textContent;
      return append.call(this, child) as T;
    });
    await boot('?bot=off');
    expect(hud).toContain('Black to move');
  });

  it('draws the generated textures, and frames the whole board in the window', async () => {
    const game = await boot('?bot=off');
    const { scene, camera } = await drawn(game);
    const backdrop = scene.background as THREE.Texture;
    expect(backdrop.isTexture).toBe(true);
    expect(backdrop.colorSpace).toBe('srgb');
    expect(backdrop.wrapS).not.toBe(1000); // RepeatWrapping: the backdrop is not tiled
    const deck = materials(scene).find((m) => m.roughnessMap)!;
    expect(deck.map!.colorSpace).toBe('srgb');
    expect([deck.map!.wrapS, deck.map!.wrapT, deck.roughnessMap!.wrapS]).toEqual([1000, 1000, 1000]);
    expect(deck.roughnessMap!.colorSpace).not.toBe('srgb');
    expect(document.body.lastElementChild).toBeInstanceOf(HTMLCanvasElement); // the renderer's canvas
    expect(camera.aspect).toBe(innerWidth / innerHeight);
    expect(camera.fov).toBe(framing(innerWidth, innerHeight).fov);
    expect(camera.position.length()).toBeGreaterThan(0); // the reset view, looking at the board
    expect(game.hook('__draws')).toBe(1);
  });

  it('gives the marbles no reflections under automation (#416), and the prefiltered room to a player (#376)', async () => {
    const reflection = async (webdriver: boolean): Promise<THREE.Texture | null> => {
      const game = await boot('?bot=off', { webdriver });
      const glass = materials((await drawn(game)).scene).find((m) => (m as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial)!;
      return glass.envMap;
    };
    expect(await reflection(true)).toBeNull();
    expect((await reflection(false))?.isTexture).toBe(true);
  });

  it('reports the WebGL2 backend in the diagnostics', async () => {
    const game = await boot('?bot=off');
    const report = await diagnostics(game);
    expect(report.environment.backend).toBe('WebGL2');
    expect(report.events.find((e) => e.event === 'start')?.data).toMatchObject({ backend: 'WebGL2' });
  });

  describe('on a WebGPU renderer that loads no texture', () => {
    // A renderer of its own in place of the harness's: WebGPU, and every texture load fails.
    function renderer(): { options: unknown[]; draw: () => THREE.Scene } {
      const options: unknown[] = [];
      let loop: ((now: number) => void) | null = null;
      let scene: THREE.Scene | null = null;
      vi.doMock('three/webgpu', async (importOriginal) => ({
        ...(await importOriginal<typeof import('three/webgpu')>()),
        WebGPURenderer: class {
          domElement = document.createElement('canvas');
          backend = { isWebGPUBackend: true };
          shadowMap = { enabled: false, type: 0 };
          constructor(o: unknown) {
            options.push(o);
          }
          init = async (): Promise<void> => {};
          setPixelRatio(): void {}
          setSize(): void {}
          getMaxAnisotropy = (): number => 1;
          render(s: THREE.Scene): void {
            scene = s;
          }
          setAnimationLoop(fn: (now: number) => void): void {
            loop = fn;
          }
        },
        TextureLoader: class {
          loadAsync = async (): Promise<never> => Promise.reject(new Error('404'));
        },
      }));
      return { options, draw: () => (loop!(0), scene!) };
    }

    it('keeps the flat look and reports WebGPU', async () => {
      const booting = boot('?bot=off');
      const { options, draw } = renderer();
      const game = await booting;
      expect(options).toEqual([{ antialias: true, forceWebGL: false }]);
      const scene = draw();
      expect((scene.background as THREE.Color).getHex()).toBe(0x0b0d0f);
      expect(materials(scene).some((m) => m.map && !(m.map as THREE.CanvasTexture).isCanvasTexture)).toBe(false);
      expect((await diagnostics(game)).environment.backend).toBe('WebGPU');
    });

    it('is asked for the WebGL2 backend by ?backend=webgl', async () => {
      const booting = boot('?bot=off&backend=webgl');
      const { options } = renderer();
      await booting;
      expect(options).toEqual([{ antialias: true, forceWebGL: true }]);
    });
  });
});

describe('the view and the fog', () => {
  it('fogs the rim, and Clear board takes the fog off and saves it', async () => {
    const game = await boot('?bot=off');
    const { scene } = await drawn(game);
    const fog = scene.fog as THREE.Fog;
    expect(fog.near).toBeGreaterThan(0);
    expect(fog.far).toBeGreaterThan(fog.near);
    expect(document.body.dataset.clear).toBe('off');
    expect(row('clear-board').getAttribute('aria-pressed')).toBe('false');
    row('clear-board').click();
    expect(scene.fog).toBeNull();
    expect(document.body.dataset.clear).toBe('on');
    expect(row('clear-board').getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('ab-alone.clear-board')).toBe('on');
  });

  it('starts clear when saved so, and on the saved quality tier', async () => {
    const game = await bootWith({ 'ab-alone.clear-board': 'on', 'ab-alone.quality': 'low' });
    expect((await drawn(game)).scene.fog).toBeNull();
    expect(document.body.dataset.clear).toBe('on');
    expect(document.body.dataset.tier).toBe('low');
  });

  it('picks the tier from the device and saves it', async () => {
    vi.stubGlobal('innerWidth', 500); // a phone: the low tier
    await boot('?bot=off');
    expect(document.body.dataset.tier).toBe('low');
    expect(localStorage.getItem('ab-alone.quality')).toBe('low');
  });

  it('thins the fog farther on the high tier', async () => {
    const far = async (tier: string): Promise<number> => {
      const game = await bootWith({ 'ab-alone.quality': tier });
      const fog = (await drawn(game)).scene.fog as THREE.Fog;
      return fog.far - fog.near;
    };
    expect(await far('high')).toBeLessThan(await far('low'));
  });
});

describe('the shadows (#459)', () => {
  const shadows = async (url: string, options?: Parameters<typeof boot>[1], stored = {}): Promise<[boolean, string]> => {
    const { BasicShadowMap, PCFSoftShadowMap } = await import('three/webgpu');
    const { shadowMap } = (await drawn(await bootWith(stored, url, options))).renderer;
    const types: Record<number, string> = { [BasicShadowMap]: 'basic', [PCFSoftShadowMap]: 'soft' };
    return [shadowMap.enabled, types[shadowMap.type]!];
  };

  it('are off under automation, unless ?shadows=on or ?shadows=1 asks for them', async () => {
    expect(await shadows('?bot=off')).toEqual([false, 'basic']);
    expect(await shadows('?bot=off&shadows=on')).toEqual([true, 'soft']);
    expect(await shadows('?bot=off&shadows=1')).toEqual([true, 'soft']);
  });

  it('are soft for a player on the high tier, off on the low tier', async () => {
    expect(await shadows('?bot=off', { webdriver: false }, { 'ab-alone.quality': 'high' })).toEqual([true, 'soft']);
    expect(await shadows('?bot=off', { webdriver: false }, { 'ab-alone.quality': 'low' })).toEqual([false, 'basic']);
  });
});

describe('the Theme row: theme, UI scale and safe mode', () => {
  it('cycles System, Dark, Light, then flips safe mode once the scale is at its cap', async () => {
    await boot('?bot=off');
    const theme = row('theme');
    expect(theme.textContent).toBe('Theme: System');
    expect(root.dataset.theme).toBeUndefined();
    expect(theme.getAttribute('aria-pressed')).toBe('true'); // safe mode, on by default
    expect([style('--end-peak'), style('--end-duration')]).toEqual(['0.2', '1.6s']);
    theme.click();
    expect([theme.textContent, root.dataset.theme, localStorage.getItem('ab-alone.theme')]).toEqual(['Theme: Dark', 'dark', 'dark']);
    theme.click();
    expect([theme.textContent, root.dataset.theme]).toEqual(['Theme: Light', 'light']);
    theme.click(); // back to System: the 1024 by 768 window has no room above 100 %, so safe mode flips
    expect([theme.textContent, root.dataset.theme]).toEqual(['Theme: System', undefined]);
    expect(theme.getAttribute('aria-pressed')).toBe('false');
    expect([style('--end-peak'), style('--end-duration')]).toEqual(['1', '1.6s']); // the full win light
    expect(localStorage.getItem('ab-alone.safe-mode')).toBe('off');
    expect(style('--ui-scale')).toBe('1');
  });

  it('starts on the saved theme and safe mode', async () => {
    await bootWith({ 'ab-alone.theme': 'light', 'ab-alone.safe-mode': 'off' }); // index.html sets data-theme itself
    expect(row('theme').textContent).toBe('Theme: Light');
    expect(row('theme').getAttribute('aria-pressed')).toBe('false');
    expect(style('--end-peak')).toBe('1');
  });

  it('steps the UI scale up on a large window, and saves it', async () => {
    vi.stubGlobal('innerWidth', 1600);
    vi.stubGlobal('innerHeight', 900);
    await boot('?bot=off');
    expect(style('--ui-scale')).toBe('1');
    for (let i = 0; i < 3; i++) row('theme').click(); // Dark, Light, System and the next scale
    expect(style('--ui-scale')).toBe('1.25');
    expect(localStorage.getItem('ab-alone.ui-scale')).toBe('125');
    expect(row('theme').getAttribute('aria-pressed')).toBe('true'); // safe mode stays
  });

  it('applies a saved UI scale at the cap of the window', async () => {
    await bootWith({ 'ab-alone.ui-scale': '150' });
    expect(style('--ui-scale')).toBe('1'); // 1024 by 768: 100 % at most
  });

  it('applies a saved UI scale the window has room for', async () => {
    vi.stubGlobal('innerWidth', 1600);
    vi.stubGlobal('innerHeight', 900);
    await bootWith({ 'ab-alone.ui-scale': '150' });
    expect(style('--ui-scale')).toBe('1.5');
  });
});

describe('the settings toggles', () => {
  it('lists every item with its icon, its name for screen readers and as a tooltip', async () => {
    await boot('?bot=off');
    const ids = [...byId('settings-menu').querySelectorAll('button')].map((b) => b.id);
    expect(ids).toEqual([
      'setting-clear-board',
      'setting-fps',
      'setting-reduced-motion',
      'setting-flat-hud',
      'setting-sound',
      'setting-transcript',
      'setting-theme',
      'setting-palette',
      'setting-shell-skin',
      'setting-glass-skin',
      'setting-export-game',
      'setting-import-game',
      'setting-log-archive',
    ]);
    const sound = row('sound');
    expect(sound.querySelector('svg')).not.toBeNull();
    expect([sound.textContent, sound.getAttribute('aria-label'), sound.title]).toEqual(['Sound', 'Sound', 'Sound']);
    expect(sound.hasAttribute('aria-pressed')).toBe(false); // an action, not a toggle
    expect(row('export-game').textContent).toBe('Export game');
  });

  it('follows the system reduced motion until the player presses Reduced motion', async () => {
    const booting = boot('?bot=off');
    const system = { matches: false, change: (): void => {} };
    vi.stubGlobal('matchMedia', (media: string) => ({
      media,
      get matches() {
        return system.matches;
      },
      addEventListener: (_: string, fn: () => void) => (system.change = fn),
    }));
    await booting;
    expect(root.dataset.motion).toBeUndefined();
    system.matches = true;
    system.change();
    expect(root.dataset.motion).toBe('reduced');
    expect(row('reduced-motion').getAttribute('aria-pressed')).toBe('true');
    row('reduced-motion').click(); // the player's choice now wins over the system
    expect(root.dataset.motion).toBeUndefined();
    expect(localStorage.getItem('ab-alone.reduced-motion')).toBe('off');
    system.matches = false;
    system.change();
    row('reduced-motion').click();
    expect(root.dataset.motion).toBe('reduced');
    expect(row('reduced-motion').getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('ab-alone.reduced-motion')).toBe('on');
  });

  it('starts with motion cut when the system asks for it', async () => {
    await boot('?bot=off', { reducedMotion: true });
    expect(root.dataset.motion).toBe('reduced');
    expect(row('reduced-motion').getAttribute('aria-pressed')).toBe('true');
  });

  it('writes every game-critical value as text on the plate with Flat HUD', async () => {
    const game = await boot('?bot=off');
    expect(byId('hud').querySelector('.flat')).toBeNull();
    row('flat-hud').click();
    expect(byId('hud').querySelector('.flat')?.textContent).toContain('Turn: ');
    expect(row('flat-hud').getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('ab-alone.flat-hud')).toBe('on');
    row('flat-hud').click();
    expect(game.hud()).not.toContain('Ejected: ');
  });

  it('puts the next dark skin on the enemy shells, and saves it', async () => {
    const game = await boot('?bot=off');
    const skinned = async (): Promise<boolean> =>
      materials((await drawn(game)).scene).some(
        (m) => m.isMeshStandardMaterial && (m.map as THREE.CanvasTexture | null)?.isCanvasTexture,
      ); // the lit materials: the deck console's unlit screen has its own canvas (#511)
    expect(row('shell-skin').textContent).toBe('Scarab ridges');
    expect(await skinned()).toBe(false);
    row('shell-skin').click();
    expect(row('shell-skin').textContent).toBe('Obsidian');
    expect(localStorage.getItem('ab-alone.shell-skin')).toBe('obsidian');
    expect(await skinned()).toBe(true);
  });

  it('starts on the saved skins', async () => {
    await bootWith({ 'ab-alone.shell-skin': 'slag', 'ab-alone.glass-skin': 'pearl' });
    expect(row('shell-skin').textContent).toBe('Slag crust');
    expect(row('glass-skin').textContent).toBe('Pearl');
  });

  it("puts the next pale skin on the player's glass, beside the shell skin, and saves it", async () => {
    const game = await boot('?bot=off');
    expect(row('glass-skin').parentElement).toBe(row('shell-skin').parentElement);
    expect(row('glass-skin').parentElement!.className).toBe('setting-group skin-pair');
    const patterned = async (): Promise<boolean> =>
      materials((await drawn(game)).scene).some(
        (m) => (m as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial && (m.map as THREE.CanvasTexture | null)?.isCanvasTexture,
      );
    expect(row('glass-skin').textContent).toBe('Smoked glass');
    expect(await patterned()).toBe(false);
    row('glass-skin').click();
    expect(row('glass-skin').textContent).toBe('Frost');
    expect(localStorage.getItem('ab-alone.glass-skin')).toBe('frost');
    expect(await patterned()).toBe(true);
  });

  it('switches to the next colorblind palette, beside the theme, and saves it', async () => {
    const game = await boot('?bot=off');
    expect(row('palette').parentElement).toBe(row('theme').parentElement);
    expect(row('palette').textContent).toBe('Palette: Default');
    expect(root.dataset.palette).toBe('default');
    const accent = style('--accent');
    row('palette').click();
    expect(row('palette').textContent).toBe('Palette: Protan');
    expect([root.dataset.palette, game.hook('__palette')]).toEqual(['protan', 'protan']);
    expect(style('--accent')).not.toBe(accent);
    expect(localStorage.getItem('ab-alone.palette')).toBe('protan');
  });

  it('starts on the saved palette', async () => {
    const game = await bootWith({ 'ab-alone.palette': 'tritan' });
    expect(row('palette').textContent).toBe('Palette: Tritan');
    expect(game.hook('__palette')).toBe('tritan');
  });

  it('keeps working, unsaved, when the storage is blocked', async () => {
    const booting = boot('?bot=off');
    const storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')!;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
    onTestFinished(() => void Object.defineProperty(globalThis, 'localStorage', storage));
    await booting;
    row('clear-board').click();
    expect(document.body.dataset.clear).toBe('on');
    Object.defineProperty(globalThis, 'localStorage', storage);
    expect(localStorage.getItem('ab-alone.clear-board')).toBeNull();
  });
});

describe('the volume sliders (#438)', () => {
  it('opens on Sound, the music slider focused, until the menu closes', async () => {
    const game = await boot('?bot=off');
    game.openSettings();
    const menu = byId('settings-menu');
    row('sound').click();
    expect(menu.dataset.page).toBe('volume');
    expect(document.activeElement).toBe(byId('volume-music'));
    const names = [...menu.querySelectorAll('.setting-volume span')].map((s) => s.textContent);
    expect(names).toEqual(['Music', 'Ambience', 'Effects', 'Voice']);
    game.openSettings(); // closes
    game.openSettings();
    expect(menu.dataset.page).toBeUndefined();
  });

  it('shows the saved volumes and saves a moved slider', async () => {
    await bootWith({ 'ab-alone.volume.voice': '40' });
    const slider = (bus: string): HTMLInputElement => byId(`volume-${bus}`);
    expect([slider('music').value, slider('voice').value]).toEqual(['100', '40']);
    slider('effects').value = '25';
    slider('effects').dispatchEvent(new Event('input'));
    expect(localStorage.getItem('ab-alone.volume.effects')).toBe('25');
  });

  it('starts the sound when a slider moves up from 0', async () => {
    const game = await bootWith({ 'ab-alone.sound': 'off' }, '?bot=off', { audio: true });
    expect((byId('volume-music') as HTMLInputElement).value).toBe('0'); // a Sound off saved before the sliders
    key('a'); // a gesture with every bus at 0 starts nothing
    expect(game.hook('__audio')).toBe('none');
    (byId('volume-music') as HTMLInputElement).value = '60';
    byId('volume-music').dispatchEvent(new Event('input'));
    expect(game.hook('__audio')).toBe('running');
    expect(localStorage.getItem('ab-alone.volume.music')).toBe('60');
  });
});

describe('the sound', () => {
  it('starts on the first gesture, a key, a mouse press or a touch', async () => {
    for (const gesture of [() => key('a'), () => press(document.body), () => dispatchEvent(new Event('pointerup'))]) {
      const game = await boot('?bot=off', { audio: true });
      expect(game.hook('__audio')).toBe('none');
      gesture();
      expect(game.hook('__audio')).toBe('running');
    }
  });

  it('stays silent in a browser without Web Audio', async () => {
    const game = await boot('?bot=off');
    key('a');
    expect(game.hook('__audio')).toBe('none');
  });

  it('plays a boss tell once when it appears, and only after a gesture', async () => {
    const choir = async (gesture: boolean): Promise<unknown[]> => {
      const game = await boot('?bot=off', { audio: true });
      if (gesture) key('a');
      game.openModes();
      byId('boss-fight').click();
      [...byId('boss-list').querySelectorAll('button')].find((b) => b.textContent === 'The Choir')!.click();
      row('flat-hud').click(); // a redraw of the same tell plays nothing new
      return game.hook('__tellCues');
    };
    expect(await choir(false)).toEqual([]);
    expect(await choir(true)).toEqual(['choir']);
  });
});

describe('the FPS readout (#426)', () => {
  it('is off by default: the box stays hidden and empty', async () => {
    const game = await boot('?bot=off');
    expect(row('fps').getAttribute('aria-pressed')).toBe('false');
    expect(row('fps').parentElement!.className).toBe('setting-group'); // beside Clear board
    expect(row('fps').parentElement!.firstElementChild).toBe(row('clear-board'));
    game.frame(20);
    expect(byId('fps').hidden).toBe(true);
    expect(byId('fps').textContent).toBe('');
  });

  it('shows the frames per second of the last frames once on, and starts over when turned on again', async () => {
    const game = await boot('?bot=off');
    row('fps').click();
    expect(byId('fps').hidden).toBe(false);
    expect(row('fps').getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('ab-alone.fps')).toBe('on');
    game.frame(20);
    expect(byId('fps').textContent).toBe('0 FPS'); // one frame: no time between two yet
    for (let i = 0; i < 5; i++) game.frame(20);
    expect(byId('fps').textContent).toBe('50 FPS');
    row('fps').click();
    expect([byId('fps').hidden, localStorage.getItem('ab-alone.fps')]).toEqual([true, 'off']);
    row('fps').click();
    game.frame(20);
    expect(byId('fps').textContent).toBe('0 FPS');
  });

  it('starts on when saved on', async () => {
    const game = await bootWith({ 'ab-alone.fps': 'on' });
    expect(byId('fps').hidden).toBe(false);
    expect(row('fps').getAttribute('aria-pressed')).toBe('true');
    game.frame(10);
    game.frame(10);
    expect(byId('fps').textContent).toBe('100 FPS');
  });
});

describe.each([
  { name: 'settings', button: 'settings', menu: 'settings-menu', open: (g: Game) => g.openSettings() },
  { name: 'mode', button: 'modes', menu: 'mode-menu', open: (g: Game) => g.openModes() },
])('the $name menu', ({ button, menu, open }) => {
  it('is enabled once ready, opened and closed by its button', async () => {
    const game = await boot('?bot=off');
    const b = byId<HTMLButtonElement>(button);
    expect(b.disabled).toBe(false);
    expect(byId(menu).hidden).toBe(true);
    open(game);
    expect([byId(menu).hidden, b.getAttribute('aria-expanded')]).toEqual([false, 'true']);
    open(game);
    expect([byId(menu).hidden, b.getAttribute('aria-expanded')]).toEqual([true, 'false']);
  });

  it('closes on Escape and gives the focus back to its button', async () => {
    const game = await boot('?bot=off');
    key('Escape'); // closed: nothing happens
    expect(byId(menu).hidden).toBe(true);
    open(game);
    key('Enter');
    expect(byId(menu).hidden).toBe(false);
    key('Escape');
    expect(byId(menu).hidden).toBe(true);
    expect(byId(button).getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(byId(button));
  });

  it('closes on a press outside it, not on a press in it or on its button', async () => {
    const game = await boot('?bot=off');
    press(byId('hud')); // closed: nothing happens
    open(game);
    press(byId(menu).firstElementChild!);
    press(byId(button));
    expect(byId(menu).hidden).toBe(false);
    press(byId('hud'));
    expect(byId(menu).hidden).toBe(true);
  });
});

it('shows the mode menu icon on its button', async () => {
  await boot('?bot=off');
  expect(byId('modes').querySelector('svg')).not.toBeNull();
});

it("draws a hovered move's ghost on a fresh game, the fight's own in a boss fight", async () => {
  const ghosts = async (boss: string | null): Promise<string | undefined> => {
    const game = await boot('?bot=off');
    if (boss) {
      game.openModes();
      byId('boss-fight').click();
      [...byId('boss-list').querySelectorAll('button')].find((b) => b.textContent === boss)!.click();
    }
    const mv = game.hook<{ cells: [number, number][]; dir: number }[]>('__legal').find((m) => m.cells.length === 1)!;
    game.click(...mv.cells[0]!);
    const target = game.hook<{ cell: [number, number]; dir: number }[]>('__targets').find((t) => t.dir === mv.dir)!;
    const { x, y } = game.hook<{ x: number; y: number }>('__cellToScreen', ...target.cell);
    document.querySelector('canvas')!.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y }));
    return document.body.dataset.ghosts;
  };
  expect(Number(await ghosts(null))).toBeGreaterThan(0);
  expect(Number(await ghosts('The Choir'))).toBeGreaterThan(0);
});

it('mounts the progressive PBR spaceship bay into propsGroup (#648, #660)', async () => {
  const game = await boot('?bot=off');
  const dummyBay = {
    scene: new THREE.Group(),
    materials: {
      deck: new THREE.MeshStandardMaterial(),
      bulkhead: new THREE.MeshStandardMaterial(),
      grate: new THREE.MeshStandardMaterial(),
    },
  };
  game.hook('__mountBay', dummyBay);
  game.hook('__setTier', 'low'); // calls applyLook() and drawProps() with currentBay active
  game.hook('__mountBay', null);
});

it('honors query quality param and allows setting tier live (#655)', async () => {
  const game = await boot('?bot=off&quality=high');
  expect(document.body.dataset.tier).toBe('high');
  game.hook('__setTier', 'low');
  expect(document.body.dataset.tier).toBe('low');
  game.hook('__setTier', 'high');
  expect(document.body.dataset.tier).toBe('high');
});
