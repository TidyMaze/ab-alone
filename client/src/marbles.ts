// The marble looks per faction (docs/specs/world.md section 5), the parameters of the materials main.ts builds.
// Plain transparency, no transmission pass: it stays cheap under software WebGL.

/** The player's inner light: a small unlit sphere of the palette's cold cyan inside each glass marble, drawn after
 * the glass so the glass never dims it. `floor`: its opacity once the game is lost, still 3:1 on the shell (#506). */
export const CORE = { color: 0x7fd6e8, radius: 0.09, floor: 0.4 };

/** The core's opacity (#506): full light, one even step down per marble lost, the floor at the losing marble. */
export const coreLevel = (lost: number, toWin: number): number =>
  Math.max(CORE.floor, 1 - (lost * (1 - CORE.floor)) / toWin);

/** The player's smoked glass: dark, see-through, smooth, with a clear coat that catches the lamp. */
export const GLASS = {
  color: 0x2c363d,
  transparent: true,
  opacity: 0.8, // the glass shows a fifth of the deck behind it, so it reads 3:1 on the deck with no fog (#344, #417)
  depthWrite: false, // the core inside shows through
  roughness: 0.2,
  metalness: 0,
  clearcoat: 1,
  clearcoatRoughness: 0.05,
};

/** The enemy shell: matte black, ridged by shell-normal.png (scripts/gen-assets.mjs) at this normal scale. */
export const SHELL = { color: 0x101214, roughness: 0.6, metalness: 0.1, ridges: 1 };

/** Battle royale shell tints, one per seat (#49): the Okabe-Ito colours a colour-blind eye still tells apart, without
 * its blue and black, too dark on the deck. An engraved glyph marks the seat as well, never the tint alone. */
export const SEATS: readonly number[] = [0xe69f00, 0x56b4e9, 0x009e73, 0xf0e442, 0xd55e00, 0xcc79a7];
