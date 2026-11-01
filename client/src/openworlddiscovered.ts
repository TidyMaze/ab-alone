// The cells of the Open world the hero has discovered (#1411, docs/specs/openworld.md section 9): every cell within SIGHT of a cell
// the hero stood on. One bit a cell, a bitset of CHUNK x CHUNK bits per chunk, saved as base64 text (44 characters a chunk).
import type { Axial } from './board';
import { CHUNK, chunkOf } from './openworld';

/** The hero discovers the hex disc of this radius round its cell. */
export const SIGHT = 10;
const BYTES = (CHUNK * CHUNK) / 8;

/** The discovered cells as saved: `[cx, cy, bits]` for each chunk with any, `bits` the base64 of its bitset (bit `i` is the cell `i`
 * of the chunk, row by row, as the chunk's tiles). */
export type DiscoveredSave = [number, number, string][];

/** The key of a chunk, as World's: the chunks of a world are within 32k of the spawn. */
const keyOf = (cx: number, cy: number): number => cx * 65536 + cy;
/** The place of a cell in its chunk's bitset. */
const bitOf = (q: number, r: number, cx: number, cy: number): number => (r - cy * CHUNK) * CHUNK + (q - cx * CHUNK);

/** The bits of a saved chunk, `null` when they are not base64 of a whole bitset. */
function decodeBits(text: string): Uint8Array | null {
  try {
    const bits = Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
    return bits.length === BYTES ? bits : null;
  } catch {
    return null;
  }
}

/** The save in `raw` when it is a list of chunks with whole coordinates and whole bitsets; `null` otherwise. */
export function decodeDiscovered(raw: unknown): DiscoveredSave | null {
  if (!Array.isArray(raw)) return null;
  const ok = raw.every(
    (entry) => Array.isArray(entry) && entry.length === 3 && Number.isInteger(entry[0]) && Number.isInteger(entry[1]) && typeof entry[2] === 'string' && decodeBits(entry[2]) !== null,
  );
  return ok ? (raw as DiscoveredSave) : null;
}

export class Discovered {
  private readonly chunks = new Map<number, { cx: number; cy: number; bits: Uint8Array }>();
  /** How many cells are discovered. */
  count = 0;

  /** The cells of a save (`decodeDiscovered`). */
  static from(save: DiscoveredSave): Discovered {
    const seen = new Discovered();
    for (const [cx, cy, text] of save) {
      const bits = decodeBits(text)!;
      seen.chunks.set(keyOf(cx, cy), { cx, cy, bits });
      for (const byte of bits) for (let b = byte; b; b &= b - 1) seen.count++;
    }
    return seen;
  }

  /** Whether the cell `(q, r)` is discovered. */
  has(q: number, r: number): boolean {
    const [cx, cy] = chunkOf([q, r]);
    const chunk = this.chunks.get(keyOf(cx, cy));
    const i = bitOf(q, r, cx, cy);
    return chunk !== undefined && (chunk.bits[i >> 3]! & (1 << (i & 7))) !== 0;
  }

  /** Discovers the hex disc of SIGHT round `at`. */
  reveal([q, r]: Axial): void {
    for (let dq = -SIGHT; dq <= SIGHT; dq++) {
      for (let dr = Math.max(-SIGHT, -dq - SIGHT); dr <= Math.min(SIGHT, -dq + SIGHT); dr++) this.add(q + dq, r + dr);
    }
  }

  private add(q: number, r: number): void {
    const [cx, cy] = chunkOf([q, r]);
    const key = keyOf(cx, cy);
    let chunk = this.chunks.get(key);
    if (!chunk) this.chunks.set(key, (chunk = { cx, cy, bits: new Uint8Array(BYTES) }));
    const i = bitOf(q, r, cx, cy);
    const mask = 1 << (i & 7);
    if (chunk.bits[i >> 3]! & mask) return;
    chunk.bits[i >> 3]! |= mask;
    this.count++;
  }

  toJSON(): DiscoveredSave {
    return [...this.chunks.values()].map(({ cx, cy, bits }) => [cx, cy, btoa(String.fromCharCode(...bits))]);
  }
}
