import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain Node script, no type declarations
import { ICON_SIZES, generateIcons } from './gen-icons.mjs';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex');
const hashAll = (icons: Map<string, Buffer>): string =>
  sha(Buffer.concat([...icons.entries()].map(([n, b]) => Buffer.concat([Buffer.from(n), b]))));

// Width, height and RGB pixels of a PNG written by gen-assets.mjs (8-bit RGB, one IDAT, filter 0).
function decode(png: Buffer): { w: number; h: number; at: (x: number, y: number) => number[] } {
  const w = png.readUInt32BE(16);
  const h = png.readUInt32BE(20);
  const idat = png.indexOf('IDAT');
  const raw = inflateSync(png.subarray(idat + 4, idat + 4 + png.readUInt32BE(idat - 4)));
  const at = (x: number, y: number): number[] => {
    const o = y * (w * 3 + 1) + 1 + x * 3;
    return [raw[o]!, raw[o + 1]!, raw[o + 2]!];
  };
  return { w, h, at };
}

const BASE = [0x0b, 0x0d, 0x0f]; // world.md section 5: near-black base

describe('gen-icons', () => {
  it('is deterministic: two runs give the same hash', () => {
    expect(hashAll(generateIcons())).toBe(hashAll(generateIcons()));
  });

  it('draws one square PNG per size, 192 and 512 as installability needs', () => {
    expect(ICON_SIZES).toEqual([192, 512]);
    const icons: Map<string, Buffer> = generateIcons();
    expect([...icons.keys()]).toEqual(['icon-192.png', 'icon-512.png']);
    for (const n of ICON_SIZES) {
      const png = icons.get(`icon-${n}.png`)!;
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      const { w, h } = decode(png);
      expect([w, h]).toEqual([n, n]);
    }
  });

  it('fills the whole square with the base colour and keeps the drawing in the maskable safe zone', () => {
    for (const png of generateIcons().values()) {
      const { w, at } = decode(png);
      // The safe zone of a maskable icon is the centred circle of radius 40 % of the size.
      for (let y = 0; y < w; y++) {
        for (let x = 0; x < w; x++) {
          if (Math.hypot(x + 0.5 - w / 2, y + 0.5 - w / 2) > 0.4 * w) expect(at(x, y)).toEqual(BASE);
        }
      }
    }
  });

  it('has the cold cyan player marble in the centre', () => {
    const { w, at } = decode(generateIcons().get('icon-512.png')!);
    const [r, g, b] = at(w / 2, w / 2);
    expect(b).toBeGreaterThan(r! + 60);
    expect(g).toBeGreaterThan(r! + 40);
  });

  it('keeps the committed files identical to the generator output', () => {
    for (const [name, buf] of generateIcons()) {
      expect(readFileSync(new URL(`../public/icons/${name}`, import.meta.url))).toEqual(buf);
    }
  });
});

describe('web app manifest', () => {
  const manifest = JSON.parse(read('../public/manifest.webmanifest'));
  const html = read('../index.html');

  it('names the app and opens it standalone', () => {
    expect(manifest.name).toBe('AB-ALONE');
    expect(manifest.short_name).toBe('AB-ALONE');
    expect(manifest.display).toBe('standalone');
  });

  it('uses paths relative to the manifest, so they work under the GitHub Pages base path', () => {
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
    for (const icon of manifest.icons) expect(icon.src).toMatch(/^icons\//);
  });

  it('takes its colours from the world palette', () => {
    const palette = read('../../docs/specs/world.md').match(/\*\*Palette\.\*\*([^\n]*\n[^\n]*)/)![1]!;
    expect(palette).toContain('#0b0d0f');
    expect(manifest.theme_color).toBe('#0b0d0f');
    expect(manifest.background_color).toBe('#0b0d0f');
    expect(html).toContain('<meta name="theme-color" content="#0b0d0f" />');
  });

  it('lists every generated icon with its real size, and a maskable one', () => {
    const icons: { src: string; sizes: string; type: string; purpose: string }[] = manifest.icons;
    for (const n of ICON_SIZES) {
      expect(icons).toContainEqual({ src: `icons/icon-${n}.png`, sizes: `${n}x${n}`, type: 'image/png', purpose: 'any' });
    }
    expect(icons).toContainEqual({ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' });
    for (const icon of icons) expect(existsSync(new URL(`../public/${icon.src}`, import.meta.url))).toBe(true);
  });

  it('is linked from the page, with the icon', () => {
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain('<link rel="icon" type="image/png" href="/icons/icon-192.png" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/icon-192.png" />');
  });
});
