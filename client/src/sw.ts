// The service worker of the offline app (#193). scripts/offline-app.mjs builds it into sw.js after the production
// build, with the precache list, the cache name and the font stylesheets of that build. Thin glue over offline.ts,
// covered by the Playwright offline test.
import { fontFiles, olderCaches, route, staleCaches, type Route } from './offline';

declare const __PRECACHE__: string[];
declare const __CACHE_NAME__: string;
declare const __FONT_STYLESHEETS__: string[];

// The few service worker types used here (the DOM lib of tsconfig.json has none of them).
interface LifecycleEvent extends Event {
  waitUntil(work: Promise<unknown>): void;
}
interface FetchRequestEvent extends LifecycleEvent {
  readonly request: Request;
  respondWith(response: Promise<Response>): void;
}
interface ServiceWorkerScope {
  readonly location: Location;
  readonly registration: { readonly scope: string };
  readonly clients: { claim(): Promise<void> };
  skipWaiting(): Promise<void>;
  addEventListener(type: 'install' | 'activate', listener: (e: LifecycleEvent) => void): void;
  addEventListener(type: 'fetch', listener: (e: FetchRequestEvent) => void): void;
}
const sw = self as unknown as ServiceWorkerScope;
const precache = new Set(__PRECACHE__.map((path) => new URL(path, sw.location.href).href));

// Fetches a UI font with CORS (the page links its stylesheet without it, and an opaque answer cannot be read) and
// keeps a copy in the cache. Null when the network or the cache fails.
async function keepFont(cache: Cache, url: string): Promise<Response | null> {
  try {
    const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!response.ok) return null;
    await cache.put(url, response.clone());
    return response;
  } catch {
    return null;
  }
}

// The UI fonts (#221): the Google Fonts stylesheets the page links to, then the font files they point to. The page
// fetched them before this worker controlled it, so it caches them itself: one online visit is enough.
async function cacheFonts(cache: Cache): Promise<void> {
  for (const sheet of __FONT_STYLESHEETS__) {
    const css = await keepFont(cache, sheet);
    if (css) await Promise.all(fontFiles(await css.text()).map((file) => keepFont(cache, file)));
  }
}

// Install: fetch the whole build into its own cache, revalidated with the server (no stale HTTP cache entry), then
// take over at once. A failed fetch fails the install: the previous build stays in charge. The fonts are best effort:
// without them the game still plays, in the system fonts.
sw.addEventListener('install', (e) =>
  e.waitUntil(
    (async () => {
      const cache = await caches.open(__CACHE_NAME__);
      await cache.addAll([...precache].map((url) => new Request(url, { cache: 'no-cache' })));
      await cacheFonts(cache).catch(() => undefined);
      await sw.skipWaiting();
    })(),
  ),
);

// Activate: drop the old caches (the previous one stays for a page still loading its build), control the open pages.
sw.addEventListener('activate', (e) =>
  e.waitUntil(
    (async () => {
      await Promise.all(staleCaches(await caches.keys(), __CACHE_NAME__).map((name) => caches.delete(name)));
      await sw.clients.claim();
    })(),
  ),
);

async function lookup(names: readonly string[], key: string): Promise<Response | undefined> {
  for (const name of names) {
    const hit = await (await caches.open(name)).match(key);
    if (hit) return hit;
  }
  return undefined;
}

async function answer(request: Request, to: NonNullable<Route>): Promise<Response> {
  if ('font' in to) {
    // A UI font: from any cache of the app, newest first, else from the network, kept for the next offline load.
    const hit = await lookup([__CACHE_NAME__, ...olderCaches(await caches.keys(), __CACHE_NAME__)], to.key);
    return hit ?? (await keepFont(await caches.open(__CACHE_NAME__), to.key)) ?? Response.error();
  }
  const names = to.precached ? [__CACHE_NAME__] : olderCaches(await caches.keys(), __CACHE_NAME__);
  return (await lookup(names, to.key)) ?? fetch(request);
}

// Cache first: every file of a build comes from that build's cache, so the page, its JS and its wasm always match.
sw.addEventListener('fetch', (e) => {
  const to = route(e.request, sw.registration.scope, precache);
  if (to) e.respondWith(answer(e.request, to));
});
