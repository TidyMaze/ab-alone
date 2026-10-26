// The Alien tell (docs/specs/game-design.md section 7.7, #588): an egg on an empty cell hatches into an Alien marble
// after the player's next few turns, and a counter above it shows how many are left. Pure helpers over the bridge's
// `eggs()` records, the board drawing lives in main.ts.
import type { Axial } from './board';
import { parseCracks } from './hull';

export interface Egg {
  cell: Axial;
  left: number; // player turns before it hatches
}

/** The counter's colours: the pale tell digit on the shell's near-black (main.ts BONE and COLORS.base). */
export const COUNTER = { ink: 0xd8d4c8, plate: 0x0b0d0f };
/** The highest count an egg shows, its hatch time in P1 and P2. */
export const COUNTER_MAX = 4;

/** Splits the flat `[q, r, player_turns_left]` records of `Encounter.eggs()`, the stride of the Hull's cracks. */
export function parseEggs(flat: ArrayLike<number>): Egg[] {
  if (flat.length % 3 !== 0) throw new Error(`egg array length ${flat.length} is not a multiple of 3`);
  return parseCracks(flat);
}

const turns = (n: number): string => `${n} ${n === 1 ? 'turn' : 'turns'}`;

/** HUD fallback of the tell, '' without eggs: "Eggs hatch: 1 in 1 turn · 2 in 4 turns". */
export function eggText(eggs: readonly Egg[]): string {
  if (eggs.length === 0) return '';
  const byLeft = new Map<number, number>();
  for (const e of eggs) byLeft.set(e.left, (byLeft.get(e.left) ?? 0) + 1);
  const parts = [...byLeft.entries()].sort(([a], [b]) => a - b).map(([left, n]) => `${n} in ${turns(left)}`);
  return `Eggs hatch: ${parts.join(' · ')}`;
}

/** Opacity of the glow under an egg on 1, at `seconds`: a steady pulse once a second (under the 3 a second flash cap
 * of world.md), never off, held still under reduced motion. */
export function eggGlow(seconds: number, reduced: boolean): number {
  if (reduced) return 0.6;
  return 0.35 + 0.25 * (1 - Math.cos(2 * Math.PI * seconds));
}

const css = (hex: number): string => `#${hex.toString(16).padStart(6, '0')}`;

/** Draws the counter `n` on a `size` square: a near-black disc, the pale digit in its middle. */
export function drawCounter(g: CanvasRenderingContext2D, n: number, size: number): void {
  const half = size / 2;
  g.clearRect(0, 0, size, size);
  g.beginPath();
  g.arc(half, half, half, 0, Math.PI * 2);
  g.fillStyle = css(COUNTER.plate);
  g.fill();
  g.fillStyle = css(COUNTER.ink);
  g.font = `bold ${Math.floor(size * 0.7)}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), half, half);
}
