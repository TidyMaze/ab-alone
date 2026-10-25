// The procedural pattern of each dark shell skin (#377): drawn on a small canvas that wraps around the sphere. The
// marbles start turned any way (#345), so one motif is repeated TILES times around, any turn shows one.
import type { PatternId, Skin } from './skins';

type Ctx = CanvasRenderingContext2D;
/** What a skin paints: the base colour and its motif, null for the plain colour (the pale glass of Smoked glass). */
export type Look = Pick<Skin, 'color' | 'ink' | 'accent'> & { pattern: PatternId | null };
type Drawer = (g: Ctx, w: number, h: number, skin: Look) => void; // one tile: w x h, its own origin

const TILES = 4;
export const css = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

const fillPoly = (g: Ctx, color: number, points: [number, number][]): void => {
  g.fillStyle = css(color);
  g.beginPath();
  points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fill();
};

const line = (g: Ctx, color: number, width: number, points: [number, number][], close = false): void => {
  g.strokeStyle = css(color);
  g.lineWidth = width;
  g.beginPath();
  points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  if (close) g.closePath();
  g.stroke();
};
const dot = (g: Ctx, color: number, x: number, y: number, r: number): void => {
  g.fillStyle = css(color);
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
};
const hexAt = (cx: number, cy: number, r: number): [number, number][] =>
  [0, 1, 2, 3, 4, 5].map((k) => [cx + r * Math.cos((k * Math.PI) / 3), cy + r * Math.sin((k * Math.PI) / 3)]);

export const PATTERNS: Record<Exclude<PatternId, 'ridges'>, Drawer> = {
  arc: (g, w, h, s) => line(g, s.ink, 5, Array.from({ length: 9 }, (_, i) => [w * (0.15 + i * 0.07), h * (0.7 - 0.25 * Math.sin((i / 8) * Math.PI))])),
  cracks: (g, w, h, s) => {
    line(g, s.ink, 4, [[0, h * 0.45], [w * 0.3, h * 0.5], [w * 0.45, h * 0.3], [w * 0.65, h * 0.48], [w, h * 0.38]]);
    line(g, s.ink, 4, [[w * 0.45, h * 0.3], [w * 0.5, 0], [w * 0.65, h * 0.48], [w * 0.6, h * 0.8], [w * 0.7, h]]);
    line(g, s.accent, 1.5, [[w * 0.3, h * 0.5], [w * 0.2, h * 0.9]]);
  },
  hexes: (g, w, h, s) => {
    for (let y = 0; y < 5; y++) for (let x = 0; x < 2; x++) line(g, s.ink, 3, hexAt(w * (0.25 + x / 2 + (y % 2) / 4), h * (0.1 + 0.2 * y), w * 0.14), true);
  },
  swirl: (g, w, h, s) => {
    line(g, s.ink, 6, Array.from({ length: 16 }, (_, i) => [w * (0.1 + i * 0.055), h * (0.35 + 0.2 * Math.sin(i * 0.8))]));
    line(g, s.ink, 6, Array.from({ length: 16 }, (_, i) => [w * (0.05 + i * 0.06), h * (0.75 + 0.1 * Math.cos(i * 0.9))]));
  },
  rivets: (g, w, h, s) => {
    g.fillStyle = css(s.ink);
    g.fillRect(0, h * 0.4, w, h * 0.2);
    dot(g, s.accent, w * 0.25, h * 0.5, h * 0.045);
    dot(g, s.accent, w * 0.75, h * 0.5, h * 0.045);
  },
  drips: (g, w, h, s) => {
    line(g, s.ink, 9, [[w * 0.3, 0], [w * 0.4, h * 0.3], [w * 0.35, h * 0.55], [w * 0.4, h * 0.8]]);
    line(g, s.ink, 7, [[w * 0.75, 0], [w * 0.7, h * 0.25], [w * 0.78, h * 0.45]]);
    dot(g, s.ink, w * 0.4, h * 0.85, 7);
  },
  rings: (g, w, h, s) => {
    dot(g, s.ink, w / 2, h / 2, h * 0.22);
    dot(g, s.accent, w / 2, h / 2, h * 0.11);
    dot(g, 0x6a2a14, w / 2 - 3, h / 2 - 3, h * 0.04);
  },
  traces: (g, w, h, s) => {
    line(g, s.ink, 2.5, [[0, h * 0.3], [w * 0.3, h * 0.3], [w * 0.3, h * 0.55], [w * 0.7, h * 0.55], [w * 0.7, h * 0.2], [w, h * 0.2]]);
    line(g, s.ink, 2.5, [[w * 0.2, h], [w * 0.2, h * 0.8], [w * 0.6, h * 0.8], [w * 0.6, h * 0.9], [w, h * 0.9]]);
    for (const [x, y] of [[0.3, 0.3], [0.7, 0.55], [0.6, 0.8]] as const) dot(g, s.accent, w * x, h * y, 3.5);
  },
  frost: (g, w, h, s) => {
    line(g, s.ink, 2, [[w / 2, h * 0.1], [w / 2, h * 0.9]]);
    line(g, s.ink, 2, [[w * 0.1, h * 0.25], [w * 0.9, h * 0.75]]);
    line(g, s.ink, 2, [[w * 0.1, h * 0.75], [w * 0.9, h * 0.25]]);
  },
  pearl: (g, w, h, s) => {
    dot(g, s.ink, w * 0.35, h * 0.4, h * 0.3);
    dot(g, s.accent, w * 0.65, h * 0.6, h * 0.27);
  },
  facets: (g, w, h, s) => {
    fillPoly(g, s.ink, [[w * 0.5, 0], [w * 0.85, h * 0.45], [w * 0.5, h * 0.4]]);
    fillPoly(g, s.accent, [[w * 0.5, 0], [w * 0.15, h * 0.45], [w * 0.5, h * 0.4]]);
    fillPoly(g, s.ink, [[w * 0.15, h * 0.45], [w * 0.5, h], [w * 0.5, h * 0.4]]);
    fillPoly(g, s.accent, [[w * 0.85, h * 0.45], [w * 0.5, h], [w * 0.5, h * 0.4]]);
  },
  eye: (g, w, h, s) => {
    for (const [r, c] of [[0.3, 0x15152a], [0.2, s.ink]] as const) {
      g.strokeStyle = css(c);
      g.lineWidth = 4;
      g.beginPath();
      g.arc(w / 2, h / 2, h * r, 0, Math.PI * 2);
      g.stroke();
    }
    dot(g, s.accent, w / 2, h / 2, h * 0.1);
    dot(g, 0x6a64a0, w / 2 - 2, h / 2 - 2, h * 0.03);
  },
};

/** Paints the skin on a w x h canvas: the base colour, then its motif in each of the TILES columns. The ridges are a
 * normal map, nothing to paint. */
export function drawSkin(g: Ctx, w: number, h: number, skin: Look): void {
  g.fillStyle = css(skin.color);
  g.fillRect(0, 0, w, h);
  if (skin.pattern === null || skin.pattern === 'ridges') return;
  for (let k = 0; k < TILES; k++) {
    g.save();
    g.translate((k * w) / TILES, 0);
    PATTERNS[skin.pattern](g, w / TILES, h, skin);
    g.restore();
  }
}
