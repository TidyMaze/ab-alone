// The marble looks per faction (docs/specs/world.md section 5), the parameters of the materials main.ts builds.
// Plain transparency, no transmission pass: it stays cheap under software WebGL.

/** The player's inner light: a small unlit sphere of the palette's cold cyan inside each ghost marble, drawn after its
 * see-through glass. A marble's opaque skin would hide it, so a marble has none (#885). */
export const CORE = { color: 0x7fd6e8, radius: 0.09 };

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

/** The enemy shell's plain look, the seats' tints and the ghosts: matte black. The marbles wear a skin (skins.ts). */
export const SHELL = { color: 0x101214, roughness: 0.6, metalness: 0.1 };

/** The shell's faint heat pulse (#509): the sodium orange glows through the black shell, one slow pulse every `period`
 * seconds up to `peak` emissive intensity, a far smaller swing than a flash; the shell stays 3:1 on every deck. */
export const HEAT = { color: 0xd9822b, period: 6, peak: 0.008 };

/** The heat pulse's glow at `t` seconds: none at 0, its peak half a period later, a smooth cosine in between. */
export const pulseAt = (t: number): number => (HEAT.peak * (1 - Math.cos((2 * Math.PI * t) / HEAT.period))) / 2;

/** Battle royale shell tints, one per seat (#49): the Okabe-Ito colours a colour-blind eye still tells apart, without
 * its blue and black, too dark on the deck. An engraved glyph marks the seat as well, never the tint alone. */
export const SEATS: readonly number[] = [0xe69f00, 0x56b4e9, 0x009e73, 0xf0e442, 0xd55e00, 0xcc79a7];

// `n` points round the unit circle from `start` turns, every other one at radius `inner`, cut to 3 decimals.
const cut = (v: number): number => Math.trunc(v * 1000) / 1000;
const outline = (n: number, start: number, inner = 1): [number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const a = (start + i / n) * 2 * Math.PI;
    const r = i % 2 ? inner : 1;
    return [cut(r * Math.cos(a)), cut(r * Math.sin(a))];
  });

/** The seat glyphs (#558), one per seat in SEATS order: a flat shape engraved on the seat's marbles, and drawn on its
 * tint on the HUD plate. Its outline in units of its radius, y up (away from the player). */
export const SEAT_GLYPHS: readonly { name: string; points: readonly [number, number][] }[] = [
  { name: 'disc', points: outline(24, 0) },
  { name: 'triangle', points: outline(3, 0.25) },
  { name: 'square', points: outline(4, 0.125) },
  {
    name: 'cross',
    points: [[0.3, 0.9], [0.3, 0.3], [0.9, 0.3], [0.9, -0.3], [0.3, -0.3], [0.3, -0.9],
      [-0.3, -0.9], [-0.3, -0.3], [-0.9, -0.3], [-0.9, 0.3], [-0.3, 0.3], [-0.3, 0.9]],
  },
  { name: 'star', points: outline(10, 0.25, 0.45) },
  { name: 'diamond', points: [[0, 1], [0.6, 0], [0, -1], [-0.6, 0]] },
];
/** The glyphs' ink: the near-black of the enemy shell, 3:1 on every seat tint. */
export const SEAT_INK = SHELL.color;

/** A boss accent (#507): the one shape a boss adds to the shells of its side, in boss mode only (world.md section 5).
 * Its geometry as data, in marble units round the shell's centre (radius 0.36), kept upright whatever the shell's turn:
 * a three.js cylinder (`args` as CylinderGeometry takes them) lifted by `y`, every other vertex of its top rim lowered by
 * `points`, or a torus (`args` as TorusGeometry takes them) tilted by `tilt` about x. Its colour reads 3:1 on every
 * palette's and skin's shell. */
export type Accent = { name: string; color: number; roughness: number; metalness: number } & (
  | { shape: 'cylinder'; args: [number, number, number, number, number, boolean]; y: number; points: number }
  | { shape: 'torus'; args: [number, number, number, number]; tilt: number }
);

/** The accent of each boss, by boss id. The Echo and The Choir keep the plain shell: the Choir's army glyphs are its
 * shape cue. The crown is a lighter rust than the palette's (#7a3b1d), which reads under 3:1 on the shell. */
export const ACCENTS: Readonly<Record<string, Accent>> = {
  hull: { name: 'crown', color: 0xe6a06a, roughness: 0.8, metalness: 0, shape: 'cylinder', args: [0.2, 0.16, 0.14, 12, 1, true], y: 0.37, points: 0.07 },
  chaplain: { name: 'wax', color: 0xc4b89a, roughness: 0.5, metalness: 0, shape: 'cylinder', args: [0.06, 0.07, 0.14, 12, 1, false], y: 0.41, points: 0 },
  ballast: { name: 'wire', color: 0x8f989e, roughness: 0.35, metalness: 0.6, shape: 'torus', args: [0.365, 0.016, 6, 48], tilt: 1 },
};
