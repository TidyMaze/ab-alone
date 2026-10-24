// Offline app (#193): the pure parts of the service worker and of the build step that writes it.
// The build lists its files (precacheFiles, precacheUrl) and names the cache from their content (cacheName),
// the service worker routes each request (route) and drops the old caches (staleCaches, olderCaches).
// The UI fonts come from Google Fonts (#221): the build finds the stylesheets the page links to (fontStylesheets),
// the service worker caches them and the font files they point to (fontFiles).

/** Every cache of the app starts with this. The GitHub Pages origin is shared with other sites: never touch theirs. */
export const CACHE_PREFIX = 'ab-alone-';

/** The only other sites the service worker caches: the Google Fonts stylesheets and their font files. */
const FONT_STYLESHEETS = 'https://fonts.googleapis.com/';
const FONT_FILES = 'https://fonts.gstatic.com/';

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

/**
 * Where the service worker answers from. A file of the app: the current cache (precached) or the older caches, then
 * the network. A UI font: every cache of the app, then the network, and the answer is kept in the current cache.
 */
export type Route = { key: string; precached: boolean } | { key: string; font: true } | null;

/**
 * Routes one request. Null: not for the app (not a GET, another site, another path of the host), the browser
 * fetches it as usual. Opening the app (a navigation to the scope or its index.html, any query or hash) is the
 * cached page. Any other URL of the scope is looked up by its URL without the hash, and so is a UI font: a GET over
 * https to the Google Fonts stylesheet or font file host, nothing else of another site.
 */
export function route(req: RequestLike, scope: string, precache: ReadonlySet<string>): Route {
  const url = new URL(req.url);
  url.hash = '';
  if (req.method !== 'GET') return null;
  if (url.href.startsWith(FONT_STYLESHEETS) || url.href.startsWith(FONT_FILES)) return { key: url.href, font: true };
  if (!url.href.startsWith(scope)) return null;
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

const attribute = (tag: string, name: string): string | undefined => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

/** The Google Fonts stylesheets the page links to (`<link rel="stylesheet">`), in page order. */
export function fontStylesheets(html: string): string[] {
  return [...html.matchAll(/<link\b[^>]*>/g)]
    .filter(([tag]) => attribute(tag, 'rel') === 'stylesheet')
    .map(([tag]) => (attribute(tag, 'href') ?? '').replaceAll('&amp;', '&'))
    .filter((href) => href.startsWith(FONT_STYLESHEETS));
}

/** The font files a Google Fonts stylesheet points to (its `url()`), each once: only those of the font file host. */
export function fontFiles(css: string): string[] {
  const urls = [...css.matchAll(/url\(\s*['"]?([^'")\s]+)/g)].map((m) => m[1]!);
  return [...new Set(urls.filter((url) => url.startsWith(FONT_FILES)))];
}
