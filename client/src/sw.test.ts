import { beforeEach, describe, expect, it, vi } from 'vitest';

// The service worker (sw.ts) on a hand-made scope: the test fires its install, activate and fetch events, with an
// in-memory CacheStorage and a fake network. The build defines of scripts/offline-app.mjs are globals here.
const ORIGIN = 'https://tidymaze.test';
const SCOPE = `${ORIGIN}/ab-alone/`;
const CURRENT = 'ab-alone-new';
const SHEET = 'https://fonts.googleapis.com/css2?family=Rajdhani';
const FONT = 'https://fonts.gstatic.com/s/rajdhani/r.woff2';
const APP = `${SCOPE}assets/app.js`;

type Listener = (e: unknown) => void;
const scope = vi.hoisted(() => ({
  listeners: new Map<string, Listener>(),
  skipWaiting: vi.fn(async () => {}),
  claim: vi.fn(async () => {}),
}));
vi.stubGlobal('self', {
  location: { href: `${SCOPE}sw.js` },
  registration: { scope: SCOPE },
  clients: { claim: scope.claim },
  skipWaiting: scope.skipWaiting,
  addEventListener: (type: string, listener: Listener) => scope.listeners.set(type, listener),
});
vi.stubGlobal('__PRECACHE__', ['/ab-alone/', '/ab-alone/assets/app.js']);
vi.stubGlobal('__CACHE_NAME__', CURRENT);
vi.stubGlobal('__FONT_STYLESHEETS__', [SHEET]);

// CacheStorage in memory: caches by name in creation order, each a map from URL to response.
let stores: Map<string, Map<string, Response>>;
const keyOf = (r: Request | string): string => (typeof r === 'string' ? r : r.url);
const cacheOf = (name: string) => {
  if (!stores.has(name)) stores.set(name, new Map());
  const entries = stores.get(name)!;
  return {
    entries,
    match: async (key: string) => entries.get(key)?.clone(),
    put: async (key: string, response: Response) => void entries.set(key, response),
    addAll: async (requests: Request[]) => {
      for (const request of requests) {
        const response = await fetch(request);
        if (!response.ok) throw new TypeError(`${request.url} ${response.status}`);
        entries.set(request.url, response);
      }
    },
  };
};
vi.stubGlobal('caches', {
  open: async (name: string) => cacheOf(name),
  keys: async () => [...stores.keys()],
  delete: async (name: string) => stores.delete(name),
});

// The network: a response per URL, or a thrown error (offline).
let network: Map<string, () => Response>;
const fetched: (Request | { url: string })[] = [];
vi.stubGlobal(
  'fetch',
  vi.fn(async (input: Request | string, init?: RequestInit) => {
    const url = keyOf(input);
    fetched.push(typeof input === 'string' ? { url, ...init } : input);
    const answer = network.get(url);
    if (!answer) throw new TypeError(`offline: ${url}`);
    return answer();
  }),
);
const ok = (body: string) => () => new Response(body);

await import('./sw');

beforeEach(() => {
  stores = new Map();
  network = new Map([
    [SCOPE, ok('page')],
    [APP, ok('app')],
    [SHEET, ok(`@font-face { src: url(${FONT}) format('woff2'); }`)],
    [FONT, ok('font')],
  ]);
  fetched.length = 0;
  scope.skipWaiting.mockClear();
  scope.claim.mockClear();
});

/** Fires a lifecycle event and waits for the work it hands to waitUntil. */
async function fire(type: 'install' | 'activate'): Promise<void> {
  let work: Promise<unknown> = Promise.resolve();
  scope.listeners.get(type)!({ waitUntil: (p: Promise<unknown>) => (work = p) });
  await work;
}

/** Fires a fetch event: the answer the worker gives, or null when it lets the browser fetch. */
async function request(url: string, init: { method?: string; mode?: string } = {}): Promise<Response | null> {
  let answer: Promise<Response> | null = null;
  const req = { url, method: init.method ?? 'GET', mode: init.mode ?? 'cors' };
  scope.listeners.get('fetch')!({ request: req, respondWith: (p: Promise<Response>) => (answer = p) });
  return answer;
}

describe('install', () => {
  it('fetches the whole build into its cache revalidated, then the fonts, then takes over', async () => {
    await fire('install');
    expect([...stores.get(CURRENT)!.keys()]).toEqual([SCOPE, APP, SHEET, FONT]);
    const build = fetched.filter((r) => r instanceof Request) as Request[];
    expect(build.map((r) => [r.url, r.cache])).toEqual([
      [SCOPE, 'no-cache'],
      [APP, 'no-cache'],
    ]);
    expect(fetched.find((r) => r.url === FONT)).toMatchObject({ mode: 'cors', credentials: 'omit' });
    expect(scope.skipWaiting).toHaveBeenCalledOnce();
  });

  it('fails when a file of the build fails: the previous build stays in charge', async () => {
    network.delete(APP);
    await expect(fire('install')).rejects.toThrow(TypeError);
    expect(scope.skipWaiting).not.toHaveBeenCalled();
  });

  it('installs without the fonts when the stylesheet is refused or the network fails', async () => {
    network.set(SHEET, () => new Response('', { status: 404 }));
    await fire('install');
    expect([...stores.get(CURRENT)!.keys()]).toEqual([SCOPE, APP]);
    network.delete(SHEET);
    await fire('install');
    expect(scope.skipWaiting).toHaveBeenCalledTimes(2);
  });

  it('installs without the fonts when the stylesheet cannot be read', async () => {
    const unreadable = new Response('x');
    unreadable.clone = () => unreadable;
    unreadable.text = () => Promise.reject(new TypeError('body'));
    network.set(SHEET, () => unreadable);
    await fire('install');
    expect(scope.skipWaiting).toHaveBeenCalledOnce();
  });
});

describe('activate', () => {
  it('drops the older caches of the app but the newest, never another site, and controls the open pages', async () => {
    for (const name of ['other-site', 'ab-alone-a', 'ab-alone-b', CURRENT]) stores.set(name, new Map());
    await fire('activate');
    expect([...stores.keys()]).toEqual(['other-site', 'ab-alone-b', CURRENT]);
    expect(scope.claim).toHaveBeenCalledOnce();
  });
});

describe('fetch', () => {
  it('lets the browser fetch what is not for the app', async () => {
    expect(await request(APP, { method: 'POST' })).toBeNull();
    expect(await request('https://elsewhere.test/x.js')).toBeNull();
  });

  it('answers a precached file from the current cache, else from the network', async () => {
    cacheOf(CURRENT).entries.set(SCOPE, new Response('cached page'));
    expect(await (await request(`${SCOPE}?x=1#top`, { mode: 'navigate' }))!.text()).toBe('cached page');
    expect(await (await request(APP))!.text()).toBe('app');
  });

  it('answers another file of the scope from the older caches, newest first, else from the network', async () => {
    const old = `${SCOPE}assets/old.js`;
    cacheOf('ab-alone-a').entries.set(old, new Response('oldest'));
    cacheOf('ab-alone-b').entries.set(old, new Response('older'));
    cacheOf(CURRENT);
    expect(await (await request(old))!.text()).toBe('older');
    network.set(`${SCOPE}assets/new.js`, ok('network'));
    expect(await (await request(`${SCOPE}assets/new.js`))!.text()).toBe('network');
  });

  it('answers a UI font from any cache of the app, else from the network, kept for the next offline load', async () => {
    cacheOf('ab-alone-a').entries.set(SHEET, new Response('old sheet'));
    expect(await (await request(SHEET))!.text()).toBe('old sheet');
    expect(await (await request(FONT))!.text()).toBe('font');
    expect(stores.get(CURRENT)!.has(FONT)).toBe(true);
  });

  it('answers a network error for a font it has nowhere', async () => {
    network.delete(FONT);
    expect((await request(FONT))!.type).toBe('error');
  });
});
