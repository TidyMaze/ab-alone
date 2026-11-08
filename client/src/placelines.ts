// Tally's lines of the places of the Open world (#1315, docs/specs/openworld.md section 7, world.md section 13): the first time the hero
// reaches a town, a dungeon gate, a tower or a remembered biome, Tally files it in one line, once per kind for the player. The lines
// only name what world.md section 13 says each place is; they hold no secret word, so any stage may meet them.
import type { Axial } from './board';
import type { Biome } from './openworld';
import { read, write, type Store } from './quality';
import { hexDistance } from './stalker';

export type PlaceLineKind = 'town' | 'gate' | 'tower' | Exclude<Biome, 'meadow'>;

export const PLACE_LINES: Readonly<Record<PlaceLineKind, string>> = {
  town: 'Muster point: table zero, a ledger station. Present: filed.',
  gate: 'Mining cut. The crew followed the vein into the moon. Audit: open.',
  tower: 'Station: a deck stood upright, its lift the shaft. Seat: still kept.',
  forest: 'Pines: on file. Hollow grows none. Slag-glass remembers heat.',
  tundra: 'Snow: on file. Hollow has no weather. Entry: remembered.',
  desert: 'Dunes: on file. No wind on Hollow. The vein kept their shape.',
  badlands: 'Ridges: on file. A remembered place, fixed into the moon.',
  archipelago: 'Sea: on file. Hollow has no atmosphere. Entry: remembered.',
};

/** How near a place the hero has reached it, in cells: close enough to read it, short of its entrance. */
export const PLACE_REACH = 3;
/** The kinds already filed, space separated, kept next to the claim line's flag (`ab-alone.tally0412`). */
export const PLACE_LINES_KEY = 'ab-alone.placelines';

/** The kinds of place the hero at `hero` reaches: the places within `PLACE_REACH`, in the order given, then the biome it stands in, the
 * spawn's meadow aside. */
export function placesReached(hero: Axial, sites: readonly { kind: 'town' | 'gate' | 'tower'; cell: Axial }[], biome: Biome): PlaceLineKind[] {
  const near = sites.filter(({ cell }) => hexDistance(hero, cell) <= PLACE_REACH).map(({ kind }) => kind);
  return biome === 'meadow' ? near : [...near, biome];
}

/** The line of the first kind in `kinds` not filed yet, which is filed now; empty when every one is. */
export function firstNewLine(store: Store, kinds: readonly PlaceLineKind[]): string {
  const met = (read(store, PLACE_LINES_KEY) ?? '').split(' ');
  const kind = kinds.find((k) => !met.includes(k));
  if (!kind) return '';
  write(store, PLACE_LINES_KEY, [...met.filter(Boolean), kind].join(' '));
  return PLACE_LINES[kind];
}
