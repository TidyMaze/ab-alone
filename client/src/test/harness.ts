// A harness that runs the whole page, src/main.ts, in vitest under jsdom (decision #445): the test file starts with
// `// @vitest-environment jsdom`, then `const game = await boot('?bot=off')` loads index.html's body and imports a fresh
// main.ts on the real wasm engine. What jsdom lacks is stubbed: the three.js renderer (no WebGL or WebGPU, the scene
// graph stays real), the KTX2 texture loader, the bay's model loader, canvas 2D, the web fonts, matchMedia, IndexedDB
// (fake-indexeddb), the bot workers (the worker's answer() runs in-process), the Trystero transport (one end of a
// localPair) and the clock of the animation loop (game.frame), and Web Audio on demand (the fake of src/test/audio.ts).
// Everything is undone when the test ends.
import { IDBFactory } from 'fake-indexeddb';
import { onTestFinished, vi } from 'vitest';
import page from '../../index.html?raw';
import type { BotRequest, BotResponse } from '../bot';
import type { Transport } from '../transport';
import { FakeContext } from './audio';

export interface BootOptions {
  /** navigator.webdriver, true by default as under Playwright: `?nodes=` sets the bot's budget, `__playTurns` exists. */
  webdriver?: boolean;
  /** The IndexedDB the page opens, a fresh one by default. Pass the same one to two boots to reload a saved game. */
  indexedDB?: IDBFactory;
  /** The system's prefers-reduced-motion. */
  reducedMotion?: boolean;
  /** A touch screen: matchMedia('(pointer: coarse)') matches, as on a phone. */
  touch?: boolean;
  /** A fake AudioContext (src/test/audio.ts), read back with `game.hook('__audio')`; none by default, as in a browser
   * without Web Audio. */
  audio?: boolean;
  /** The texture files under assets/ that fail to load, as a missing file would, `spaceship-bay.glb` included. The others
   * load, each a texture named after its file. */
  missing?: string[];
  /** document.fonts.load, which jsdom lacks: by default every font is in at once. */
  fonts?: (font: string) => Promise<unknown>;
  /** What fails: `worker` answers every bot request with an error, `wasm` and `renderer` reject their init (#736, #737). */
  fails?: 'worker' | 'wasm' | 'renderer';
  /** The renderer runs on WebGPU, not its WebGL fallback: compute shaders, so clustered lighting (#neon tubes). */
  webgpu?: boolean;
}

export interface Game {
  /** Calls a window hook main.ts sets for the browser checks (`__legal`, `__rings`, `__plies`, ...), which must exist. */
  hook<T = unknown>(name: string, ...args: unknown[]): T;
  /** Plays a click on a cell by its axial coordinates, as `__click` does (no raycast). */
  click(q: number, r: number): void;
  /** The whole HUD plate as text, and its turn line alone. */
  hud(): string;
  turn(): string;
  /** Presses the cog of the settings menu, or the button of the mode menu. */
  openSettings(): void;
  openModes(): void;
  /** Moves the clock `ms` on and runs one frame of the animation loop: slides and ejections advance. */
  frame(ms?: number): void;
  /** Lets the pending tasks run: the bot workers' replies, IndexedDB. */
  settle(): Promise<void>;
  /** Waits until the page is online: it makes its keys first, which may take any time on a loaded machine (#636). */
  online(): Promise<void>;
  /** The three.js scenes drawn so far. */
  draws(): number;
  /** The other end of the online room once the page goes online (Play online, an invite link), else null. */
  peer(): Transport | null;
  /** The room the page went online in, else null. */
  room(): string | null;
}

// The engine's answers are deterministic (a fixed node budget, bot.ts): the evaluation bar asks the same opening position
// at every boot, a search of ~80 ms. They are kept for the whole test file, keyed by the request but its id (#1079).
const answers = new Map<string, BotResponse>();

// RoundedBoxGeometry is the page's costliest build at boot (~30 ms of vertex maths for the props): the first one of each
// size is kept and the next boots clone it.
const boxes = new Map<string, import('three').BufferGeometry & { parameters?: object }>();

const body = /<body>([\s\S]*)<\/body>/.exec(page)![1]!;
// Taken before any boot wraps them: a second boot in the same test (a reload) wraps these, not the first wrappers.
const addListener = window.addEventListener.bind(window);
const every = setInterval;

// Canvas 2D (the room art, the deck console) draws into nothing: every property and call of the context is a no-op, but
// measureText, for the deck console's line wrap (terminal.ts): a character is 20 px wide.
const nothing: unknown = new Proxy(() => nothing, {
  get: (_, key) => (key === 'measureText' ? (text: string) => ({ width: text.length * 20 }) : nothing),
  set: () => true,
  apply: () => nothing,
});

/** The next WebCrypto key pair comes 20 tasks late, after two settle() calls, as on a loaded machine (#636). Called just
 * before the page goes online (before boot() for an invite link), it slows the page's keys, not the test's. */
export function slowKeys(): void {
  const generate = crypto.subtle.generateKey.bind(crypto.subtle) as (...args: unknown[]) => Promise<CryptoKeyPair>;
  vi.spyOn(crypto.subtle, 'generateKey').mockImplementationOnce((async (...args: unknown[]) => {
    for (let i = 0; i < 20; i++) await new Promise((done) => setTimeout(done));
    return generate(...args);
  }) as never);
}

/** Loads index.html and a fresh main.ts at `url` (a path, a query and a hash, for example `?bot=off`). */
export async function boot(url = '/', options: BootOptions = {}): Promise<Game> {
  const { webdriver = true, reducedMotion = false, touch = false } = options;
  const undo: (() => void)[] = [];
  onTestFinished(() => {
    for (const fn of undo.reverse()) fn();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.doUnmock('three/webgpu');
    vi.doUnmock('abalone-wasm');
    vi.doUnmock('../p2p');
    vi.doUnmock('three/examples/jsm/geometries/RoundedBoxGeometry.js');
    vi.doUnmock('three/examples/jsm/loaders/KTX2Loader.js');
    vi.doUnmock('three/examples/jsm/loaders/GLTFLoader.js');
  });

  // The page: index.html's body, a clean root, no saved settings, the URL.
  const root = document.documentElement;
  for (const { name } of [...root.attributes]) if (name !== 'lang') root.removeAttribute(name);
  document.body.replaceWith(Object.assign(document.createElement('body'), { innerHTML: body }));
  localStorage.clear();
  localStorage.setItem('ab-alone.room', 'today'); // the refined room is the default (#1138): the tests of today's room keep it, ?room= overrides
  history.replaceState(null, '', new URL(url, location.origin).href);
  Object.defineProperty(navigator, 'webdriver', { value: webdriver, configurable: true });
  undo.push(() => Reflect.deleteProperty(navigator, 'webdriver'));

  // The clock of the animation loop, moved by frame() only.
  let clock = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.spyOn(console, 'info').mockImplementation(() => {}); // the page's diagnostics log (logger.ts)

  vi.stubGlobal('indexedDB', options.indexedDB ?? new IDBFactory());
  if (options.audio) vi.stubGlobal('AudioContext', FakeContext);
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: (reducedMotion && query.includes('reduced-motion')) || (touch && query.includes('pointer: coarse')),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => nothing as RenderingContext);
  Object.assign(Element.prototype, { setPointerCapture() {}, releasePointerCapture() {} });
  Object.defineProperty(document, 'fonts', { value: { load: options.fonts ?? (async () => []) }, configurable: true });
  undo.push(() => Reflect.deleteProperty(document, 'fonts'));

  // Window listeners and intervals of this page, removed when the test ends so the next boot starts alone.
  vi.spyOn(window, 'addEventListener').mockImplementation((type: string, listener, opts) => {
    addListener(type, listener, opts);
    undo.push(() => window.removeEventListener(type, listener, opts));
  });
  vi.stubGlobal('setInterval', (fn: () => void, ms?: number) => {
    const id = every(fn, ms);
    undo.push(() => clearInterval(id));
    return id;
  });
  // Timeouts too: one left pending (a bot reply, the joiner's 30 s signaling timeout) would fire in a later test, or log
  // after the file's environment closed (#623). Taken at boot, not before: a test may spy on setTimeout first.
  const later = setTimeout;
  const cancel = clearTimeout;
  vi.stubGlobal('setTimeout', (...args: Parameters<typeof setTimeout>) => {
    const id = later(...args);
    undo.push(() => cancel(id));
    return id;
  });

  // The KTX2 texture loader (#700): each file under assets/ loads as a texture named after it, but the missing ones. As
  // the real one, it needs the renderer up first.
  const missing = (url: string): boolean => !!options.missing?.includes(url.slice(url.lastIndexOf('/') + 1));
  vi.doMock('three/examples/jsm/loaders/KTX2Loader.js', async () => {
    const { Texture } = await vi.importActual<typeof import('three')>('three');
    return {
      KTX2Loader: class {
        ready = false;
        detectSupport(renderer: { initialized?: boolean }): this {
          if (!renderer.initialized) throw new Error('detectSupport() before await renderer.init()');
          this.ready = true;
          return this;
        }
        loadAsync = async (url: string): Promise<InstanceType<typeof Texture>> => {
          const name = url.slice(url.lastIndexOf('/') + 1);
          if (!this.ready) throw new Error('THREE.KTX2Loader: Missing initialization with `.detectSupport( renderer )`.');
          if (missing(url)) throw new Error(`404 ${name}`);
          return Object.assign(new Texture(), { name });
        };
      },
    };
  });

  // The renderer draws nothing: it keeps the animation loop for frame() and counts the draws.
  let loop: ((now: number) => void) | null = null;
  let draws = 0;
  vi.resetModules();
  vi.doMock('abalone-wasm', async (importOriginal) => {
    const wasm = await (await import('./wasm')).nodeWasm(importOriginal as never);
    return options.fails === 'wasm' ? { ...wasm, default: () => Promise.reject(new Error('wasm fetch failed')) } : wasm;
  });
  vi.doMock('three/webgpu', async (importOriginal) => {
    const THREE = await importOriginal<typeof import('three/webgpu')>();
    class WebGPURenderer {
      domElement = document.createElement('canvas');
      backend = { isWebGPUBackend: options.webgpu ?? false };
      toneMapping = 0;
      info = { render: { calls: 7, triangles: 300 }, memory: { geometries: 5, textures: 2 } };
      toneMappingExposure = 1;
      initialized = false;
      init = async (): Promise<void> => {
        if (options.fails === 'renderer') throw new Error('no GPU');
        this.initialized = true;
      };
      setPixelRatio(): void {}
      setSize(): void {}
      getMaxAnisotropy = (): number => 1;
      render(): void {
        draws++;
      }
      setAnimationLoop(fn: ((now: number) => void) | null): void {
        loop = fn;
      }
    }
    class PMREMGenerator {
      // The texture remembers what it was made from: the scene, the capture options.
      fromScene = (scene: InstanceType<typeof THREE.Scene>, _sigma: number, _near: number, _far: number, options: object) => ({
        texture: Object.assign(new THREE.Texture(), { userData: { scene, options } }),
      });
      dispose(): void {}
    }
    return { ...THREE, WebGPURenderer, PMREMGenerator };
  });
  // The spaceship bay (#648): its maps load as above, its model as an empty scene, unless missing.
  vi.doMock('three/examples/jsm/loaders/GLTFLoader.js', async () => {
    const { Group } = await vi.importActual<typeof import('three')>('three');
    return {
      GLTFLoader: class {
        setMeshoptDecoder(): this {
          return this; // the model is an empty scene: nothing to decode
        }
        loadAsync = async (url: string): Promise<{ scene: InstanceType<typeof Group> }> => {
          if (missing(url)) throw new Error(`404 ${url}`);
          return { scene: new Group() };
        };
      },
    };
  });

  vi.doMock('three/examples/jsm/geometries/RoundedBoxGeometry.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('three/examples/jsm/geometries/RoundedBoxGeometry.js')>();
    const { BufferGeometry } = await vi.importActual<typeof import('three')>('three');
    return {
      RoundedBoxGeometry: class extends actual.RoundedBoxGeometry {
        constructor(...args: ConstructorParameters<typeof actual.RoundedBoxGeometry>) {
          const key = args.join();
          const kept = boxes.get(key);
          if (kept) {
            super(1, 1, 1, 0, 0); // a unit box, replaced by the kept one below
            this.copy(kept);
            Object.assign(this, { parameters: kept.parameters });
          } else {
            super(...args);
            boxes.set(key, Object.assign(new BufferGeometry().copy(this), { parameters: this.parameters }));
          }
        }
      },
    };
  });

  // The online room: main.ts gets one end of a local pair, the test holds the other.
  let peer: Transport | null = null;
  let room: string | null = null;
  vi.doMock('../p2p', async (importOriginal) => {
    const { localPair } = await import('../transport');
    return {
      ...(await importOriginal<typeof import('../p2p')>()),
      p2pTransport: (id: string): Transport => {
        const [mine, theirs] = localPair();
        [peer, room] = [theirs, id];
        return mine;
      },
    };
  });

  // The bot workers answer in-process, on the next task, with the page's own engine.
  const wasm = await import('abalone-wasm');
  const { answer, engineFor } = await import('../bot');
  vi.stubGlobal(
    'Worker',
    class {
      onmessage: ((e: MessageEvent<BotResponse>) => void) | null = null;
      postMessage(req: BotRequest): void {
        setTimeout(() => {
          if (options.fails === 'worker') return void this.onmessage?.({ data: { id: req.id, error: 'Error: boom' } } as never);
          const { id, ...query } = req;
          const key = JSON.stringify(query);
          let response = answers.get(key);
          if (!response) {
            response = answer(req, (army, placed) => engineFor(wasm.Engine, army, placed), (boss, seed) => new wasm.Encounter(boss, seed));
            answers.set(key, response);
          }
          this.onmessage?.({ data: { ...response, id } } as MessageEvent<BotResponse>);
        });
      }
      terminate(): void {}
    },
  );

  await import('../main');
  const hook = <T>(name: string, ...args: unknown[]): T => {
    const fn = (window as unknown as Record<string, ((...args: unknown[]) => T) | undefined>)[name];
    if (!fn) throw new Error(`main.ts sets no ${name} hook`);
    return fn(...args);
  };
  const byId = (id: string): HTMLElement => document.getElementById(id)!;
  const game: Game = {
    hook,
    click: (q, r) => void hook('__click', q, r),
    hud: () => byId('hud').textContent ?? '',
    turn: () => byId('hud').querySelector('.turn')?.textContent ?? '',
    openSettings: () => byId('settings').click(),
    openModes: () => byId('modes').click(),
    frame: (ms = 16) => {
      clock += ms;
      loop?.(clock);
    },
    settle: async () => {
      for (let i = 0; i < 10; i++) await new Promise((done) => setTimeout(done));
    },
    online: async () => {
      while (document.body.dataset.online === undefined) await new Promise((done) => setTimeout(done));
    },
    draws: () => draws,
    peer: () => peer,
    room: () => room,
  };
  return game;
}
