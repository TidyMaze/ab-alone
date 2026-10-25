import { describe, expect, it } from 'vitest';
import { SHELL } from './marbles';
import { DEFAULT_SKIN, SKINS, nextSkin, skinById } from './skins';
import { PATTERNS, drawSkin } from './skinart';

describe('the shell skins (#377)', () => {
  it('lists the ten dark shells, Scarab ridges first and the default', () => {
    expect(SKINS.map((s) => s.name)).toEqual([
      'Scarab ridges', 'Obsidian', 'Slag crust', 'Hex chitin', 'Ash swirl',
      'Riveted hull', 'Tar drip', 'Ember core', 'Copper circuit', 'Void eye',
    ]);
    expect(DEFAULT_SKIN).toBe(SKINS[0]!.id);
  });

  it('keeps the current shell as Scarab ridges, values unchanged (#293)', () => {
    const { color, roughness, metalness } = SHELL;
    expect(SKINS[0]).toMatchObject({ id: 'scarab', side: 1, color, roughness, metalness, pattern: 'ridges' });
  });

  it('gives every skin a unique id, side 1, valid material values and a known pattern', () => {
    expect(new Set(SKINS.map((s) => s.id)).size).toBe(SKINS.length);
    for (const s of SKINS) {
      expect(s.id).toMatch(/^[a-z-]+$/);
      expect(s.side).toBe(1);
      for (const c of [s.color, s.ink, s.accent]) expect(Number.isInteger(c) && c >= 0 && c <= 0xffffff).toBe(true);
      for (const v of [s.roughness, s.metalness]) expect(v >= 0 && v <= 1).toBe(true);
      if (s.glow !== undefined) expect(s.glow > 0 && s.glow <= 1).toBe(true);
      expect(s.pattern === 'ridges' || s.pattern in PATTERNS).toBe(true);
    }
  });

  it('finds a skin by id, Scarab ridges when the id is unknown', () => {
    expect(skinById('hex').name).toBe('Hex chitin');
    expect(skinById('nope')).toBe(SKINS[0]);
    expect(skinById(null)).toBe(SKINS[0]);
  });

  it('cycles through the skins and back to the first', () => {
    const seen = [DEFAULT_SKIN];
    for (let i = 1; i < SKINS.length; i++) seen.push(nextSkin(seen.at(-1)!));
    expect(seen).toEqual(SKINS.map((s) => s.id));
    expect(nextSkin(seen.at(-1)!)).toBe(DEFAULT_SKIN);
  });
});

// A recording 2D context: every method is a spy, the colours and widths are plain fields.
const fakeContext = () => {
  const calls: string[] = [];
  const g = new Proxy({ fillStyle: '', strokeStyle: '', lineWidth: 0 } as Record<string, unknown>, {
    get: (t, k: string) => (k in t ? t[k] : (...a: unknown[]) => { calls.push(k); void a; }),
  });
  return { g: g as unknown as CanvasRenderingContext2D, calls };
};

describe('drawSkin', () => {
  it('paints the base colour and, but for the ridges, a pattern on top', () => {
    for (const s of SKINS) {
      const { g, calls } = fakeContext();
      drawSkin(g, 256, 128, s);
      expect(calls[0]).toBe('fillRect');
      expect(calls.length > 1).toBe(s.pattern !== 'ridges');
    }
  });
});
