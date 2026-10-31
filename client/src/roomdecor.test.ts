import { describe, expect, it } from 'vitest';
import { DECK_NAMES } from './deck';
import { DECK_TINTS } from './roomrefined';
import * as THREE from 'three/webgpu';
import { AMBER, BAY, FLOOR, GLOW, glowRingPixels, refineBay, rivetPoints, STEELS, floorPixels, gantryArches, props, wallPixels, wallStrips } from './roomdecor';

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

  it('marks the floor with amber hazard stripes at the near side and nothing else', () => {
    const size = 64;
    const px = floorPixels(size);
    const rgba = (x: number, y: number): number[] => [...px.slice((y * size + x) * 4, (y * size + x) * 4 + 4)];
    const rowOf = (z: number): number => Math.floor((z / FLOOR.size + 0.5) * size);
    const band = Array.from({ length: size }, (_, x) => rgba(x, rowOf(8.2)));
    expect(band).toContainEqual([0xff, 0xb0, 0x00, 255]);
    expect(band).toContainEqual([0x16, 0x18, 0x1a, 255]);
    expect(rgba(3, rowOf(5))).toEqual([0, 0, 0, 0]);
    expect(rgba(3, rowOf(10))).toEqual([0, 0, 0, 0]);
  });

  it('restyles the bay materials: darker steel, finer grate, calmer floor, crisp amber chevrons, the conduit chevrons amber', () => {
    const tex = (): THREE.Texture => new THREE.Texture();
    const mat = (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ map: tex(), emissive: 0x38e8ff, emissiveIntensity: 2.5 });
    const m = { deck: mat(), grate: Object.assign(mat(), { normalMap: tex() }), conduit: mat(), hazard: mat() };
    m.grate.map!.repeat.set(0.05, 0.05);
    refineBay(m);
    refineBay(m); // the second call changes nothing more
    expect(m.grate.color.getHex()).toBe(BAY.grate);
    expect(m.grate.map!.repeat.x).toBeCloseTo(0.05 * BAY.grateRepeat);
    expect(m.grate.normalMap!.repeat.x).toBeCloseTo(BAY.grateRepeat);
    expect(m.deck.color.getHex()).toBe(BAY.deck);
    expect(m.deck.normalScale.x).toBe(BAY.deckNormal);
    expect(m.hazard.color.getHex()).toBe(AMBER);
    expect(m.hazard.emissiveIntensity).toBe(BAY.hazardGlow);
    expect(m.conduit.emissive.getHex()).toBe(AMBER);
    expect(m.conduit.emissiveIntensity).toBe(BAY.conduitGlow);
    const bare = { deck: mat(), grate: new THREE.MeshStandardMaterial() }; // no conduit, no hazard, no maps: nothing to restyle there
    refineBay(bare);
    expect(bare.grate.color.getHex()).toBe(BAY.grate);
  });

  it('puts rivets along the edges of an outline, one every spacing at most', () => {
    const square = [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 2 }, { x: 0, z: 2 }];
    const pts = rivetPoints(square, 1);
    expect(pts).toHaveLength(8);
    expect(pts[0]).toEqual({ x: 0, z: 0 });
    expect(pts[1]).toEqual({ x: 1, z: 0 });
    expect(rivetPoints([{ x: 0, z: 0 }, { x: 0.1, z: 0 }], 1)).toHaveLength(2); // a short edge still holds its first rivet
  });

  it('bakes a soft ring of tint: clear in the middle and at the edge, strongest between the radii', () => {
    const size = 64;
    const px = glowRingPixels(size);
    const alpha = (x: number, y: number): number => px[(y * size + x) * 4 + 3]!;
    const mid = Math.round(size / 2 + ((GLOW.inner + GLOW.outer) / 2 / GLOW.size) * size);
    expect(alpha(32, 32)).toBe(0);
    expect(alpha(0, 0)).toBe(0);
    expect(alpha(mid, 32)).toBeGreaterThan(200);
  });
});
