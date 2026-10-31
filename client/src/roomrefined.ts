// The refined room (#1138, piece 2): today's bay with its 76 point lights replaced by a rig of at most 6 (#845) in the deck's
// tint, and a baked pool of light under the board. Behind `?room=refined`, `today` is the default. Pure data and functions, no
// Three.js: main.ts builds the lights and the decal from them.
import type { Deck } from './deck';
import { read, write, type Store } from './quality';

export type Room = 'today' | 'refined';
export const ROOM_KEY = 'ab-alone.room';
/** The refined room is the default on this branch, for the owner's preview: the owner decides whether it ships so (#1138). */
export const DEFAULT_ROOM: Room = 'refined';

/** The five deck tints (design canvas, board F. The room and decor, Today refined). */
export const DECK_TINTS: Record<Deck, number> = { mess: 0x6fa8dc, cargo: 0x7fc4a0, furnace: 0xffb000, chapel: 0xb9a8e8, bridge: 0x6fd0dc };

/** Point lights the room may hold (#845). */
export const LIGHT_BUDGET = 6;

const isRoom = (v: string | null): v is Room => v === 'today' || v === 'refined';

/** The room: `?room=` of the address (kept for the next visit), else the stored one, else today's. */
export function readRoom(search: string, store: Store): Room {
  const asked = new URLSearchParams(search).get('room');
  if (isRoom(asked)) {
    write(store, ROOM_KEY, asked);
    return asked;
  }
  const kept = read(store, ROOM_KEY);
  return isRoom(kept) ? kept : DEFAULT_ROOM;
}

export interface RigLight {
  name: string;
  color: number;
  power: number;
  reach: number;
  position: readonly [number, number, number];
}

/** key (soft, neutral, from above: the marbles keep their glossy white and black), fill (neutral, low), three strip lights at the emissive strips, in the deck's tint, and in a boss fight the rim: warm
 * amber from behind the boss side, the far end of the board. */
export function roomRig(deck: Deck, boss: boolean): RigLight[] {
  const tint = DECK_TINTS[deck];
  const rig: RigLight[] = [
    { name: 'key', color: 0xf2f4f6, power: 110, reach: 40, position: [0, 12, 0] },
    { name: 'fill', color: 0xdfe6ee, power: 40, reach: 40, position: [0, 6, 12] },
    { name: 'strip 1', color: tint, power: 18, reach: 24, position: [-12, 5, -8] },
    { name: 'strip 2', color: tint, power: 18, reach: 24, position: [12, 5, -8] },
    { name: 'strip 3', color: tint, power: 18, reach: 24, position: [0, 8, -16] },
  ];
  if (boss) rig.push({ name: 'rim', color: 0xffb000, power: 40, reach: 24, position: [0, 4, -12] });
  return rig;
}

/** The pool of light under the board: a decal, not a light. */
export const POOL = { radius: 6, opacity: 0.35, y: 0.01 } as const;

/** RGBA pixels of a `size` square: white, its alpha a smooth falloff from the middle to nothing at the edge. */
export function poolPixels(size: number): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5) * 2; // 0 in the middle, 1 at the edge
      const fall = Math.max(0, 1 - d);
      px.set([255, 255, 255, Math.round(255 * fall * fall)], (y * size + x) * 4);
    }
  return px;
}
