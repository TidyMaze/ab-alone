import { describe, expect, it } from 'vitest';
import { BIOMES } from './openworld';
import { allScenes, sceneMix } from './scenes';

// #1571: the scene table of world.md section 7 against the code, as cuetable.test.ts does for the cues. A scene cannot play
// without its row, nor a row say played without its scene. Node's fetch cannot read a file:// URL, so the test reads it with
// node:fs, imported untyped.
const fs = 'node:fs/promises';
const { readFile } = (await import(/* @vite-ignore */ fs)) as { readFile(path: URL): Promise<Uint8Array> };
const world = new TextDecoder().decode(await readFile(new URL('../../docs/specs/world.md', import.meta.url)));
const audio = world.split('\n## ').find((section) => section.startsWith('7. Audio direction'))!;
const rows = [...audio.matchAll(/^ *\| `([\w:-]+)` \| ([^|]+) \| (yes|no) \| (yes|no) \| (played|planned) \|$/gm)].map(([, scene, layers, room, track, status]) => ({
  scene: scene!,
  layers: layers!.trim(),
  room: room === 'yes',
  track: track === 'yes',
  status: status!,
}));
/** The row a scene belongs to: the Open world has one row a biome, the hour is a rule of the text. */
const rowOf = (id: string): string => (id.startsWith('world:') ? id.split(':').slice(0, 2).join(':') : id);

describe('the scene table of world.md section 7 (#1571)', () => {
  it('has one row for the hub, the bot, the royale, the two rogue-lite scenes, each boss and each biome, all played', () => {
    expect(rows.length).toBeGreaterThanOrEqual(5 + 15 + BIOMES.length);
    expect(new Set(rows.map((row) => row.scene)).size).toBe(rows.length);
    expect(new Set(rows.map((row) => row.status))).toEqual(new Set(['played']));
    expect(new Set(allScenes().map(rowOf))).toEqual(new Set(rows.map((row) => row.scene)));
  });

  it('states for each row whether the room tone and the song play, as the code does', () => {
    for (const id of allScenes()) {
      const row = rows.find((r) => r.scene === rowOf(id))!;
      expect({ room: row.room, track: row.track }, id).toEqual({ room: sceneMix(id).room, track: sceneMix(id).track });
    }
  });

  it('names the layers of each row by kind: drone, pulse, wind', () => {
    for (const id of allScenes()) {
      const row = rows.find((r) => r.scene === rowOf(id))!;
      const kinds = [...new Set(sceneMix(id).layers.map((layer) => layer.kind))].join(', ');
      expect(row.layers, id).toBe(kinds);
    }
  });
});
