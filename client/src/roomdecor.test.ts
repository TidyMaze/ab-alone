import { describe, expect, it } from 'vitest';
import { DECK_NAMES } from './deck';
import { DECK_TINTS } from './roomrefined';
import { AMBER, FLOOR, STEELS, floorPixels, gantryArches, props, wallPixels, wallStrips } from './roomdecor';

describe('the refined room decor (#1138)', () => {
  it('has three wall strips: two in the deck tint, one amber, all lit', () => {
    for (const deck of DECK_NAMES) {
      const strips = wallStrips(deck);
      expect(strips.map((s) => s.color)).toEqual([DECK_TINTS[deck], AMBER, DECK_TINTS[deck]]);
      for (const s of strips) expect(s.emissive).toBe(s.color);
    }
  });

  it('has two gantry arches of dark steel, each with four rivets', () => {
    const parts = gantryArches();
    for (const i of [0, 1]) {
      expect(parts.filter((p) => p.id.startsWith(`arch-${i}-rivet`))).toHaveLength(4);
      expect(parts.filter((p) => p.id.startsWith(`arch-${i}-`) && !p.id.includes('rivet')).map((p) => p.id.split('-')[2])).toEqual(['post', 'post', 'beam']);
    }
    expect(parts.filter((p) => p.color === STEELS[0])).toHaveLength(6);
  });

  it('has crates, canisters, a conduit and a slate in the three steels, each lit accent in the deck tint', () => {
    const list = props('furnace');
    expect(new Set(list.filter((p) => !p.emissive).map((p) => p.color))).toEqual(new Set(STEELS));
    for (const kind of ['crate', 'canister', 'conduit', 'slate']) expect(list.some((p) => p.id.startsWith(kind))).toBe(true);
    const accents = list.filter((p) => p.emissive);
    expect(accents.map((a) => a.id)).toEqual(['crate-a-accent', 'canister-a-accent', 'slate-accent']);
    for (const a of accents) expect(a.emissive).toBe(DECK_TINTS.furnace);
    expect(new Set(list.map((p) => p.id)).size).toBe(list.length);
  });

  it('paints the wall as dark steel panels with a 1 px seam', () => {
    const px = wallPixels(8);
    expect(px).toHaveLength(8 * 8 * 4);
    const at = (x: number, y: number): number => px[(y * 8 + x) * 4]!;
    expect(at(0, 3)).toBe(0x14); // the seam
    expect(at(4, 3)).toBe(0x14);
    expect(at(1, 1)).toBe(0x5a);
    expect(at(5, 1)).toBe(0x64); // the next panel is a shade lighter
    expect(at(5, 5)).toBe(0x5a);
  });

  it('paints the floor as plated steel with a 1 px grid and the amber hazard band', () => {
    const size = 64;
    const px = floorPixels(size);
    const rgb = (x: number, y: number): number[] => [...px.slice((y * size + x) * 4, (y * size + x) * 4 + 3)];
    const rowOf = (z: number): number => Math.floor((z / FLOOR.size + 0.5) * size);
    expect(rgb(4, 2)).toEqual([0x1c, 0x21, 0x26]); // a grid line
    expect(rgb(3, 3)).toEqual([0x34, 0x3a, 0x41]); // a plate
    const band = Array.from({ length: size }, (_, x) => rgb(x, rowOf(10)));
    expect(band).toContainEqual([0xff, 0xb0, 0x00]);
    expect(band).toContainEqual([0x16, 0x18, 0x1a]);
    expect(rgb(3, rowOf(5))).toEqual([0x34, 0x3a, 0x41]); // no band elsewhere
  });
});
