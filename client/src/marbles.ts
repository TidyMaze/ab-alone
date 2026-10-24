// The marble looks per faction (docs/specs/world.md section 5), the parameters of the materials main.ts builds.
// Plain transparency, no transmission pass: it stays cheap under software WebGL.

/** The player's inner light: a small unlit sphere of the palette's cold cyan inside each glass marble, drawn after
 * the glass so the glass never dims it. */
export const CORE = { color: 0x7fd6e8, radius: 0.09 };

/** The player's smoked glass: dark, see-through, smooth, with a clear coat that catches the lamp. */
export const GLASS = {
  color: 0x2c363d,
  transparent: true,
  opacity: 0.65,
  depthWrite: false, // the core inside shows through
  roughness: 0.2,
  metalness: 0,
  clearcoat: 1,
  clearcoatRoughness: 0.05,
};

/** The enemy shell: matte black, ridged by shell-normal.png (scripts/gen-assets.mjs) at this normal scale. */
export const SHELL = { color: 0x101214, roughness: 0.6, metalness: 0.1, ridges: 1 };
