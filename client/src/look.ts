// The look of the board and the marbles (#1138): `pbr` is the ambientCG maps of today, `tonal` the Fluent x Material look of the
// interface (#1136): flat tonal materials from the design canvas, one tone per skin, and none of the normal, roughness,
// AO or displacement maps loaded. Pure data and functions, no Three.js: main.ts builds the materials.
import { read, write, type Store } from './quality';

export type Look = 'pbr' | 'tonal';
export const LOOK_KEY = 'ab-alone.look';
export const DEFAULT_LOOK: Look = 'pbr';

/** The tonal palette, board 3D. Fluent x Material materials and scene (design canvas HxV9KazoafHkke7kqyTamY). */
export const TONAL = {
  plate: 0x26282c,
  cell: 0x32353a,
  veiled: 0x2a2c30, // a cell out of the Stalker's sight
  black: { inner: 0x4a4d52, outer: 0x0f1012 }, // the black marble's radial gradient
  white: { inner: 0xffffff, outer: 0xdfe3e8 },
  last: 0x6fa8dc, // the ring of the last move, in both looks: the board's cyan
  revealed: 0xffb000, // the ring of a hidden marble the engine revealed, in both looks: the board's amber
} as const;

const isLook = (v: string | null): v is Look => v === 'pbr' || v === 'tonal';

/** The look: `?look=` of the address (kept for the next visit), else the stored one, else the default. */
export function readLook(search: string, store: Store): Look {
  const asked = new URLSearchParams(search).get('look');
  if (isLook(asked)) {
    write(store, LOOK_KEY, asked);
    return asked;
  }
  const kept = read(store, LOOK_KEY);
  return isLook(kept) ? kept : DEFAULT_LOOK;
}

const channel = (c: number, shift: number): number => (c >> shift) & 255;

/** `a` moved by `t` (0 to 1) towards `b`, channel by channel. */
export const mix = (a: number, b: number, t: number): number =>
  [16, 8, 0].reduce((out, shift) => out | (Math.round(channel(a, shift) + (channel(b, shift) - channel(a, shift)) * t) << shift), 0);

/** The flat colour of a tonal marble: the middle of the palette's gradient for its side, half way to the skin's tone. The
 * gradient itself comes from the lamps on the sphere and the soft highlight (`MARBLE_LOOK`), not from a baked map.
 * Side 1 is the enemy shell, black; side 2 the player's marble, white (marbles.ts). */
export function tonalMarble(side: number, tone: number): number {
  const ref = side === 2 ? TONAL.white : TONAL.black;
  return mix(mix(ref.inner, ref.outer, 0.5), tone, 0.5);
}

/** What a tonal marble keeps of a PBR one: a soft highlight, no map. */
export const MARBLE_LOOK = { roughness: 0.4, metalness: 0 } as const;

/** Whether a texture file loads in this look: the tonal one loads none of the board's, the marbles' or the cells' maps,
 * only the backdrop and the crack decal, which carry the room and a boss tell. */
/** The board's and the plate's maps: the room's, hidden on the terrace (#1370). */
const ROOM_PLATE = /^pbr\/(board|plate)-/;
/** Whether a texture file loads in this look, on the room (`room`) or on the terrace (#1370). The terrace draws no board or plate,
 * and no backdrop: its background is its own colour, and the canvas stays hidden until the terrace is drawn (#1389). */
export const loadsTexture = (look: Look, name: string, room = true): boolean => {
  if (name === 'backdrop.ktx2') return room;
  if (name === 'crack-decal.ktx2') return true;
  return look === 'pbr' && (room || !ROOM_PLATE.test(name));
};

/** Whether a skin's maps are asked for (#1370): the terrace draws its default skins with its own marbles, so their maps wait for
 * the room, and a skin the player picked always has them. */
export const asksSkinMaps = (room: boolean, skinId: string, terraceSkins: readonly string[]): boolean => room || !terraceSkins.includes(skinId);

/** How much a tonal material lights itself with its own colour: the room's lamps are dim, and a flat tone of the palette would
 * otherwise draw far darker than its swatch (cell #32353a drew as #14171a). */
export const GLOW = 0.7;

/** The material parameters of a flat tonal surface: its tone, lit from within by `GLOW`. */
export const flat = (color: number): { color: number; emissive: number; emissiveIntensity: number } => ({
  color,
  emissive: color,
  emissiveIntensity: GLOW,
});
