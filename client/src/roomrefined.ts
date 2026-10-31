// The refined room (#1138, piece 2): today's bay simplified, flat dark steel and three real lights in place of the 76 (#845).
// Behind `?room=`; `today` is today's room. Pure data and functions, no Three.js: roomscene.ts builds the lights.
import type { Deck } from './deck';
import { read, write, type Store } from './quality';

export type Room = 'today' | 'refined';
export const ROOM_KEY = 'ab-alone.room';
/** The refined room is the default on this branch, for the owner's preview: the owner decides whether it ships so (#1138). */
export const DEFAULT_ROOM: Room = 'refined';

/** The five deck tints (design canvas, board F. The room and decor, Today refined). */
export const DECK_TINTS: Record<Deck, number> = { mess: 0x6fa8dc, cargo: 0x7fc4a0, furnace: 0xffb000, chapel: 0xb9a8e8, bridge: 0x6fd0dc };

/** Real lights the room may hold: a key, a fill (a hemisphere, no point light) and in a boss fight the amber rim. */
export const LIGHT_BUDGET = 3;

const isRoom = (v: string | null): v is Room => v === 'today' || v === 'refined';

/** The room: `?room=` of the address (kept for the next visit), else the stored one, else the default. */
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

/** The neutral fill: a hemisphere light, sky above and the floor's steel below. */
export const FILL = { sky: 0xdfe6ee, ground: 0x222b32, intensity: 1.6 };

/** The point lights: the key, soft and neutral from above the board, and in a boss fight the rim, warm amber from behind the
 * boss side, the far end of the board. The deck's tint comes from the lit strips, not from a lamp. */
export function roomRig(boss: boolean): RigLight[] {
  const rig: RigLight[] = [{ name: 'key', color: 0xf2f4f6, power: 140, reach: 40, position: [0, 12, 0] }];
  if (boss) rig.push({ name: 'rim', color: 0xffb000, power: 40, reach: 24, position: [0, 4, -12] });
  return rig;
}
