// The allowed-hue check of the art direction (#1550): every colour token the code paints the neon look
// and the chrome with must be listed in the palette bullet of docs/specs/art.md. Reads the code, not a copy.
import { describe, expect, it } from 'vitest';
import { NEON } from './neonlook';
import css from './ui.css?raw';
import doc from '../../docs/specs/art.md?raw';


/** The hexes of the palette bullet: from its `- **Palette` line to the next bullet. */
const bullet = doc.slice(doc.indexOf('- **Palette'), doc.indexOf('- **Materials'));
const allowed = new Set((bullet.match(/#[0-9a-f]{6}\b/gi) ?? []).map((h: string) => h.toLowerCase()));

describe('the allowed hues of the art direction (#1550)', () => {
  it('finds the palette bullet with its hexes', () => {
    expect(allowed.size).toBeGreaterThan(20);
  });

  it('lists every neon colour token of neonlook.ts', () => {
    const missing = Object.entries(NEON)
      .map(([k, v]) => [k, `#${v.toString(16).padStart(6, '0')}`] as const)
      .filter(([, hex]) => !allowed.has(hex));
    expect(missing).toEqual([]);
  });

  it('lists every chrome colour token of the first :root block of ui.css', () => {
    const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
    const hexes = [...root.matchAll(/--[\w-]+:\s*(#[0-9a-f]{6})\b/gi)].map((m) => m[1]!.toLowerCase());
    expect(hexes.length).toBeGreaterThan(5);
    expect(hexes.filter((h) => !allowed.has(h))).toEqual([]);
  });
});
