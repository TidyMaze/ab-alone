// The service worker of the offline app (#193). scripts/offline-app.mjs builds it into sw.js after the production
// build, with the precache list and the cache name of that build. Thin glue over offline.ts, covered by the
// Playwright offline test.
import { olderCaches, route, staleCaches, type Route } from './offline';

declare const __PRECACHE__: string[];
declare const __CACHE_NAME__: string;

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

// Install: fetch the whole build into its own cache, revalidated with the server (no stale HTTP cache entry), then
// take over at once. A failed fetch fails the install: the previous build stays in charge.
sw.addEventListener('install', (e) =>
  e.waitUntil(
    (async () => {
      const cache = await caches.open(__CACHE_NAME__);
      await cache.addAll([...precache].map((url) => new Request(url, { cache: 'no-cache' })));
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

async function answer(request: Request, to: NonNullable<Route>): Promise<Response> {
  const names = to.precached ? [__CACHE_NAME__] : olderCaches(await caches.keys(), __CACHE_NAME__);
  for (const name of names) {
    const hit = await (await caches.open(name)).match(to.key);
    if (hit) return hit;
  }
  return fetch(request);
}

// Cache first: every file of a build comes from that build's cache, so the page, its JS and its wasm always match.
sw.addEventListener('fetch', (e) => {
  const to = route(e.request, sw.registration.scope, precache);
  if (to) e.respondWith(answer(e.request, to));
});
