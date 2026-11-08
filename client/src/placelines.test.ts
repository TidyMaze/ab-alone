import { describe, expect, it } from 'vitest';
import type { Axial } from './board';
import { firstNewLine, PLACE_LINES, PLACE_LINES_KEY, PLACE_REACH, placesReached, type PlaceLineKind } from './placelines';
import { SECRETS } from './story';

// Tally's lines of the places of the Open world (#1315, docs/specs/openworld.md section 7): one per kind of place, once per player.
const memory = (): Storage => {
  const items = new Map<string, string>();
  return { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v) } as Storage;
};

describe("Tally's place lines (#1315)", () => {
  const lines = Object.values(PLACE_LINES);

  it('has one line per kind of place: a town, a gate, a tower and the five remembered biomes, eight in all', () => {
    expect(Object.keys(PLACE_LINES).sort()).toEqual(['archipelago', 'badlands', 'desert', 'forest', 'gate', 'tower', 'town', 'tundra']);
    expect(new Set(lines).size).toBe(8);
  });

  it('fits the HUD line and holds no secret word of the story, being met at any stage', () => {
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(80);
      for (const { word } of SECRETS) expect(line).not.toMatch(word);
    }
  });
});

describe('the places the hero reaches (#1315)', () => {
  const sites = [
    { kind: 'town', cell: [10, 0] as Axial },
    { kind: 'gate', cell: [0, 10] as Axial },
    { kind: 'tower', cell: [-10, 0] as Axial },
  ] as const;

  it('reaches nothing in the meadow, far from every place', () => {
    expect(placesReached([0, 0], sites, 'meadow')).toEqual([]);
  });

  it('reaches a place within the reach, not one step beyond', () => {
    expect(placesReached([10 - PLACE_REACH, 0], sites, 'meadow')).toEqual(['town']);
    expect(placesReached([10 - PLACE_REACH - 1, 0], sites, 'meadow')).toEqual([]);
    expect(placesReached([0, 10 - PLACE_REACH], sites, 'meadow')).toEqual(['gate']);
    expect(placesReached([-10, PLACE_REACH], sites, 'meadow')).toEqual(['tower']);
  });

  it('reaches a remembered biome by standing in it, after the place reached', () => {
    expect(placesReached([0, 0], sites, 'tundra')).toEqual(['tundra']);
    expect(placesReached([10, 0], sites, 'forest')).toEqual(['town', 'forest']);
  });
});

describe('the first line not met yet (#1315)', () => {
  it("returns the first kind's line, once: then the next kind's, then none", () => {
    const store = memory();
    const kinds: PlaceLineKind[] = ['town', 'forest'];
    expect(firstNewLine(store, kinds)).toBe(PLACE_LINES.town);
    expect(firstNewLine(store, kinds)).toBe(PLACE_LINES.forest);
    expect(firstNewLine(store, kinds)).toBe('');
    expect(store.getItem(PLACE_LINES_KEY)).toBe('town forest');
  });

  it('shows nothing and stores nothing when nothing is reached', () => {
    const store = memory();
    expect(firstNewLine(store, [])).toBe('');
    expect(store.getItem(PLACE_LINES_KEY)).toBeNull();
  });

  it('reads the kinds met from the store, so a reload does not say a line twice', () => {
    const store = memory();
    store.setItem(PLACE_LINES_KEY, 'gate');
    expect(firstNewLine(store, ['gate'])).toBe('');
    expect(firstNewLine(store, ['gate', 'tower'])).toBe(PLACE_LINES.tower);
  });
});
