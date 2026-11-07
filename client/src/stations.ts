// Positional audio (docs/specs/world.md section 7, Spatial; #1577): the stations that sound near the listener, pure arithmetic.
// A station is a place of the Hub (a terminal, a lift) or of the Open world (a town, a dungeon gate, a tower) with a quiet
// synthesized loop; the Sfx player (sound.ts) builds the loop of each one heard, through a stereo pan and a distance gain on the
// ambience bus. The pan and the gain are calculated here from the listener, which follows the camera, not heard: an owner
// should listen on a laptop and a phone.
import { axialTo3D } from './board';
import type { Deck } from './deck';
import { roomsOf } from './hub';
import type { HumTone } from './sound';

export const STATION_KINDS = ['terminal', 'machinery', 'town', 'gate', 'tower'] as const;
export type StationKind = (typeof STATION_KINDS)[number];

/** A station: where it stands on the ground plane, in the board's units (one cell is one unit). */
export interface Source {
  id: string;
  kind: StationKind;
  x: number;
  z: number;
}
/** The listener: its place on the ground plane and the way it faces, `yaw` 0 toward -z, a quarter turn toward +x. */
export interface Listener {
  x: number;
  z: number;
  yaw: number;
}
/** What is heard of a station: its distance gain (0 to 1) and its pan (-1 left, 1 right). */
export interface Heard {
  id: string;
  kind: StationKind;
  gain: number;
  pan: number;
}

/** A station is silent from this distance on, in cells. */
export const STATION_RANGE = 4;
/** At most this many stations sound at once: the nearest. */
export const MAX_STATIONS = 3;
/** The pan of a station straight to one side: never fully hard, as the knock's 60 % (#1574). */
export const STATION_PAN = 0.8;

/** The gain at `distance` cells: 1 on the station, a straight line down to 0 at the range. */
export const stationGain = (distance: number): number => Math.max(0, 1 - distance / STATION_RANGE);

/** The steady sines of each kind, level before the ambience bus and the distance gain: a low tone and one above 150 Hz for a small
 * speaker. A terminal hums at the mains, machinery throbs low, a town holds an open fifth, a gate a hollow draught, a tower
 * a beating pair. */
export const STATION_TONES: Record<StationKind, readonly HumTone[]> = {
  terminal: [{ freq: 120, gain: 0.012 }, { freq: 240, gain: 0.012 }],
  machinery: [{ freq: 55, gain: 0.02 }, { freq: 165, gain: 0.014 }],
  town: [{ freq: 196, gain: 0.012 }, { freq: 294, gain: 0.01 }],
  gate: [{ freq: 73.4, gain: 0.02 }, { freq: 220, gain: 0.012 }],
  tower: [{ freq: 98, gain: 0.02 }, { freq: 294, gain: 0.012 }, { freq: 296, gain: 0.012 }],
};

/** The stations heard from `listener`: those within the range, the nearest first (the id breaks a tie), at most MAX_STATIONS, each
 * with its gain and its pan toward the right of the listener. */
export function audible(listener: Listener, sources: readonly Source[]): Heard[] {
  const right = { x: Math.cos(listener.yaw), z: Math.sin(listener.yaw) };
  return sources
    .map((source) => {
      const [dx, dz] = [source.x - listener.x, source.z - listener.z];
      return { source, distance: Math.hypot(dx, dz), side: dx * right.x + dz * right.z };
    })
    .filter(({ distance }) => distance < STATION_RANGE)
    .sort((a, b) => a.distance - b.distance || a.source.id.localeCompare(b.source.id))
    .slice(0, MAX_STATIONS)
    .map(({ source, distance, side }) => ({ id: source.id, kind: source.kind, gain: stationGain(distance), pan: distance === 0 ? 0 : (STATION_PAN * side) / distance }));
}

/** The listener of a camera at `position` looking along `direction`: on the ground the camera looks at (a camera that looks
 * level or up stays under itself), facing the way the camera heads on the ground. */
export function listenerOf(position: { x: number; y: number; z: number }, direction: { x: number; y: number; z: number }): Listener {
  const reach = direction.y < 0 ? position.y / -direction.y : 0;
  const yaw = Math.hypot(direction.x, direction.z) < 1e-6 ? 0 : Math.atan2(direction.x, -direction.z);
  return { x: position.x + direction.x * reach, z: position.z + direction.z * reach, yaw };
}

/** The stations of a deck of the Hub: each terminal room hums, each lift runs its machinery, on the cell of the room. */
export function hubStations(deck: Deck): Source[] {
  return roomsOf(deck).flatMap(({ cell, door }) => {
    if (door.kind !== 'terminal' && door.kind !== 'lift') return [];
    const { x, z } = axialTo3D(cell[0], cell[1]);
    return [{ id: `${deck}:${cell}`, kind: door.kind === 'terminal' ? 'terminal' : 'machinery', x, z } as Source];
  });
}
