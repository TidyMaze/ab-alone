// Offline app (#193): the pure parts of the service worker and of the build step that writes it.
// The build lists its files (precacheFiles, precacheUrl) and names the cache from their content (cacheName),
// the service worker routes each request (route) and drops the old caches (staleCaches, olderCaches).

/** Every cache of the app starts with this. The GitHub Pages origin is shared with other sites: never touch theirs. */
export const CACHE_PREFIX = 'ab-alone-';

/** The files of the build to precache, sorted: all of them but the service worker itself and the source maps. */
export function precacheFiles(files: readonly string[]): string[] {
  return files.filter((f) => f !== 'sw.js' && !f.endsWith('.map')).sort();
}

/** The URL a built file is served at under the base path. index.html is the app root, the URL players open. */
export function precacheUrl(file: string, base: string): string {
  return file === 'index.html' ? base : `${base}${file}`;
}

/**
 * The cache of one build: named from the content hash of every precached file, so a new deploy that changes any
 * file (JS, CSS, wasm, a texture, the page) gets a new cache, and an old cache never serves a new build.
 */
export function cacheName(hashes: Readonly<Record<string, string>>, digest: (text: string) => string): string {
  const lines = Object.keys(hashes)
    .sort()
    .map((file) => `${file} ${hashes[file]}\n`)
    .join('');
  return `${CACHE_PREFIX}${digest(lines).slice(0, 16)}`;
}

export interface RequestLike {
  method: string;
  url: string;
  mode: string;
}

/** Where the service worker answers from: the current cache (precached), the older caches, then the network. */
export type Route = { key: string; precached: boolean } | null;

/**
 * Routes one request. Null: not for the app (not a GET, another site, another path of the host), the browser
 * fetches it as usual. Opening the app (a navigation to the scope or its index.html, any query or hash) is the
 * cached page. Any other URL of the scope is looked up by its URL without the hash.
 */
export function route(req: RequestLike, scope: string, precache: ReadonlySet<string>): Route {
  const url = new URL(req.url);
  url.hash = '';
  if (req.method !== 'GET' || !url.href.startsWith(scope)) return null;
  const path = new URL(scope).pathname;
  const key = req.mode === 'navigate' && (url.pathname === path || url.pathname === `${path}index.html`) ? scope : url.href;
  return { key, precached: precache.has(key) };
}

/**
 * The older caches of the app, newest first (CacheStorage.keys() lists caches in creation order). A page that
 * loaded just before an update can still find the files of its own build there.
 */
export function olderCaches(names: readonly string[], current: string): string[] {
  return names.filter((n) => n.startsWith(CACHE_PREFIX) && n !== current).reverse();
}

/** The caches to delete when a new build activates: the older ones but the newest of them. */
export function staleCaches(names: readonly string[], current: string): string[] {
  return olderCaches(names, current).slice(1);
}
