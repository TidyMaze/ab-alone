import { describe, expect, it } from 'vitest';
import page from '../index.html?raw';
import {
  CACHE_PREFIX,
  cacheName,
  fontFiles,
  fontStylesheets,
  olderCaches,
  precacheFiles,
  precacheUrl,
  route,
  staleCaches,
} from './offline';

const BUILD = [
  'index.html',
  'sw.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'assets/index-BHv8FDIG.js',
  'assets/index-BHv8FDIG.js.map',
  'assets/bot.worker-DeRlMK1Y.js',
  'assets/abalone_wasm_bg-B78a8gHf.wasm',
  'assets/index-CrwhyS3g.css',
  'assets/deck-albedo.png',
];

describe('precacheFiles', () => {
  it('keeps every file of the build but the service worker itself and the source maps, sorted', () => {
    expect(precacheFiles(BUILD)).toEqual([
      'assets/abalone_wasm_bg-B78a8gHf.wasm',
      'assets/bot.worker-DeRlMK1Y.js',
      'assets/deck-albedo.png',
      'assets/index-BHv8FDIG.js',
      'assets/index-CrwhyS3g.css',
      'icons/icon-192.png',
      'index.html',
      'manifest.webmanifest',
    ]);
  });

  it('keeps a file only named like the service worker in a folder', () => {
    expect(precacheFiles(['assets/sw.js'])).toEqual(['assets/sw.js']);
  });
});

describe('precacheUrl', () => {
  it('puts the file under the base path', () => {
    expect(precacheUrl('assets/deck-albedo.png', '/ab-alone/')).toBe('/ab-alone/assets/deck-albedo.png');
    expect(precacheUrl('assets/deck-albedo.png', '/')).toBe('/assets/deck-albedo.png');
  });

  it('caches index.html as the app root, the URL the page is opened at', () => {
    expect(precacheUrl('index.html', '/ab-alone/')).toBe('/ab-alone/');
  });
});

describe('cacheName', () => {
  // A stand-in for sha256: FNV-1a over the whole text, as 16 hex characters.
  const digest = (text: string): string => {
    let h = 0x811c9dc5;
    for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
    return h.toString(16).padStart(8, '0').repeat(2);
  };
  const hashes = { 'index.html': 'aa', 'assets/x.wasm': 'bb' };

  it('starts with the app prefix and keeps 16 characters of the digest', () => {
    const name = cacheName(hashes, digest);
    expect(name.startsWith(CACHE_PREFIX)).toBe(true);
    expect(name).toHaveLength(CACHE_PREFIX.length + 16);
    expect(CACHE_PREFIX).toBe('ab-alone-');
  });

  it('does not depend on the order the files are listed in', () => {
    expect(cacheName({ 'assets/x.wasm': 'bb', 'index.html': 'aa' }, digest)).toBe(cacheName(hashes, digest));
  });

  it('changes when the content of any file changes, so a new deploy gets a new cache', () => {
    expect(cacheName({ ...hashes, 'assets/x.wasm': 'bc' }, digest)).not.toBe(cacheName(hashes, digest));
    expect(cacheName({ ...hashes, 'index.html': 'ab' }, digest)).not.toBe(cacheName(hashes, digest));
  });

  it('digests every path with its content hash, one file per line', () => {
    const seen: string[] = [];
    cacheName(hashes, (text) => {
      seen.push(text);
      return '0123456789abcdef0123';
    });
    expect(seen).toEqual(['assets/x.wasm bb\nindex.html aa\n']);
  });
});

describe('route', () => {
  const scope = 'https://tidymaze.github.io/ab-alone/';
  const precache = new Set([
    'https://tidymaze.github.io/ab-alone/',
    'https://tidymaze.github.io/ab-alone/assets/abalone_wasm_bg-B78a8gHf.wasm',
    'https://tidymaze.github.io/ab-alone/assets/deck-albedo.png',
  ]);
  const get = (url: string, mode = 'cors') => route({ method: 'GET', url, mode }, scope, precache);

  it('answers a precached file from the cache', () => {
    expect(get('https://tidymaze.github.io/ab-alone/assets/abalone_wasm_bg-B78a8gHf.wasm')).toEqual({
      key: 'https://tidymaze.github.io/ab-alone/assets/abalone_wasm_bg-B78a8gHf.wasm',
      precached: true,
    });
  });

  it('answers every opening of the app with the cached page, whatever its query and hash', () => {
    for (const url of [scope, `${scope}?bot=off`, `${scope}#room=abc`, `${scope}index.html`, `${scope}index.html?backend=webgl`]) {
      expect(get(url, 'navigate')).toEqual({ key: scope, precached: true });
    }
  });

  it('drops the hash of a file request', () => {
    expect(get(`${scope}assets/deck-albedo.png#x`)).toEqual({ key: `${scope}assets/deck-albedo.png`, precached: true });
  });

  it('looks in the older caches for a file of the app this build does not have', () => {
    expect(get(`${scope}assets/index-OLD.js`)).toEqual({ key: `${scope}assets/index-OLD.js`, precached: false });
    expect(get(`${scope}?bot=off`)).toEqual({ key: `${scope}?bot=off`, precached: false });
  });

  it('looks in the older caches when the page itself is not in this build', () => {
    expect(route({ method: 'GET', url: scope, mode: 'navigate' }, scope, new Set())).toEqual({ key: scope, precached: false });
  });

  it('opens another page of the scope by its own URL', () => {
    expect(get(`${scope}manifest.webmanifest`, 'navigate')).toEqual({ key: `${scope}manifest.webmanifest`, precached: false });
  });

  it('leaves alone what is not a GET of the app: other methods, other sites, other paths of the host', () => {
    expect(route({ method: 'POST', url: `${scope}assets/deck-albedo.png`, mode: 'cors' }, scope, precache)).toBeNull();
    expect(get('https://relay.example.org/announce')).toBeNull();
    expect(get('https://tidymaze.github.io/other-game/')).toBeNull();
    expect(get('https://tidymaze.github.io/ab-alone-next/assets/deck-albedo.png')).toBeNull();
  });

  const sheet = 'https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@600&family=IBM+Plex+Sans:wght@400;500&display=swap';
  const file = 'https://fonts.gstatic.com/s/chakrapetch/v13/cIflMapbsEk7TDLdtEz1BwkeQI51U5_F_gUk0wzH.woff2';

  it('answers the UI fonts from the caches of the app: the Google Fonts stylesheet and the font files', () => {
    expect(get(sheet, 'no-cors')).toEqual({ key: sheet, font: true });
    expect(get(file)).toEqual({ key: file, font: true });
    expect(get(`${file}#x`)).toEqual({ key: file, font: true });
  });

  it('caches nothing else of another site: only a GET over https to the two font hosts', () => {
    expect(route({ method: 'POST', url: file, mode: 'cors' }, scope, precache)).toBeNull();
    for (const url of [
      'http://fonts.gstatic.com/s/chakrapetch/v13/x.woff2',
      'https://fonts.gstatic.com:8443/s/chakrapetch/v13/x.woff2',
      'https://cdn.fonts.gstatic.com/s/chakrapetch/v13/x.woff2',
      'https://fonts.gstatic.com.example.org/s/chakrapetch/v13/x.woff2',
      'https://fonts.google.com/specimen/Chakra+Petch',
      'https://example.org/fonts.googleapis.com/css2?family=Chakra+Petch',
    ]) {
      expect(get(url)).toBeNull();
    }
  });
});

describe('fontStylesheets', () => {
  it('finds the Google Fonts stylesheet the page links to', () => {
    expect(fontStylesheets(page)).toEqual([
      'https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@600&family=IBM+Plex+Sans:wght@400;500&display=swap',
    ]);
  });

  it('reads only the stylesheet links to Google Fonts, in page order, with &amp; read as &', () => {
    const html = `
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chakra+Petch&amp;display=swap" />
      <link rel="stylesheet" href="/ab-alone/assets/index-ClyGjfYk.css">
      <link rel="stylesheet" href="https://example.org/fonts.css">
      <link rel="stylesheet">
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans" rel="stylesheet">
      <link href="https://fonts.googleapis.com/css2?family=Inter">`;
    expect(fontStylesheets(html)).toEqual([
      'https://fonts.googleapis.com/css2?family=Chakra+Petch&display=swap',
      'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans',
    ]);
  });
});

describe('fontFiles', () => {
  it('lists the font files a Google Fonts stylesheet points to, each once, only those of fonts.gstatic.com', () => {
    const css = `
/* latin-ext */
@font-face {
  font-family: 'IBM Plex Sans';
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/ibmplexsans/v23/zYXzKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1swZSAXcomDVmadSDNF5zAA.woff2) format('woff2');
}
/* latin-ext */
@font-face {
  font-family: 'IBM Plex Sans';
  font-weight: 500;
  src: url(https://fonts.gstatic.com/s/ibmplexsans/v23/zYXzKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1swZSAXcomDVmadSDNF5zAA.woff2) format('woff2');
}
@font-face {
  font-family: 'Chakra Petch';
  src: local('Chakra Petch'), url("https://fonts.gstatic.com/s/chakrapetch/v13/latin.woff2") format('woff2'),
    url( 'https://example.org/chakra.woff2' ), url(/ab-alone/assets/chakra.woff2);
}`;
    expect(fontFiles(css)).toEqual([
      'https://fonts.gstatic.com/s/ibmplexsans/v23/zYXzKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1swZSAXcomDVmadSDNF5zAA.woff2',
      'https://fonts.gstatic.com/s/chakrapetch/v13/latin.woff2',
    ]);
  });

  it('finds none in an empty or failed stylesheet', () => {
    expect(fontFiles('')).toEqual([]);
  });
});

describe('older and stale caches', () => {
  // CacheStorage.keys() lists the caches in the order they were created.
  const names = ['other-app', 'ab-alone-1111', 'ab-alone-2222', 'ab-alone-3333'];

  it('lists the older caches of the app, newest first, never the current one or another app', () => {
    expect(olderCaches(names, 'ab-alone-3333')).toEqual(['ab-alone-2222', 'ab-alone-1111']);
  });

  it('deletes the older caches but the newest one, kept for a page that loaded before the update', () => {
    expect(staleCaches(names, 'ab-alone-3333')).toEqual(['ab-alone-1111']);
    expect(staleCaches(['ab-alone-1111', 'ab-alone-2222'], 'ab-alone-2222')).toEqual([]);
    expect(staleCaches(['ab-alone-1111'], 'ab-alone-1111')).toEqual([]);
  });
});
