import { describe, expect, it } from 'vitest';
import { PHASE_MS } from './daynight';
import { BIOMES } from './openworld';
import {
  PULSE_CEILING_DB,
  PULSE_FLOOR_DB,
  SCENE_CEILING_DB,
  SCENE_FLOOR_DB,
  WIND_CEILING_DB,
  allScenes,
  bossPitch,
  pulseRate,
  sceneMix,
  sceneOf,
  type SceneId,
  type SceneState,
} from './scenes';
import { MASTER_LEVEL, SMALL_SPEAKER_HZ, smallSpeakerDb } from './sound';
import { BOSS_IDS } from './tally';

// The scene-to-music map of world.md section 7 (#1571): pure data and arithmetic, nobody can listen here, so the levels are
// calculated on a small speaker (smallSpeakerDb) and held between a floor and a ceiling, as cueDb does for the cues.
const NONE: SceneState = { hub: false, royale: false, run: null, boss: null, world: null };
const PHASES = Object.keys(PHASE_MS) as (keyof typeof PHASE_MS)[];

describe('the scene the player is in (#1571)', () => {
  it('names the hub, the royale, the rogue-lite map and fight, a boss fight and the Open world by biome and hour', () => {
    expect(sceneOf({ ...NONE, hub: true })).toBe('hub');
    expect(sceneOf({ ...NONE, royale: true })).toBe('royale');
    expect(sceneOf({ ...NONE, run: 'map' })).toBe('run-map');
    expect(sceneOf({ ...NONE, run: 'fight' })).toBe('run-fight');
    expect(sceneOf({ ...NONE, boss: 'hull' })).toBe('boss:hull');
    expect(sceneOf({ ...NONE, world: { biome: 'desert', phase: 'night' } })).toBe('world:desert:night');
  });

  it('is the bot scene for every other game of the board, and for a boss the table does not know', () => {
    expect(sceneOf(NONE)).toBe('bot');
    expect(sceneOf({ ...NONE, boss: 'nobody' })).toBe('bot');
  });

  it('lists every scene once: the hub, the bot, the royale, the two of the rogue-lite, each boss, each biome at each hour', () => {
    const all = allScenes();
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(5 + BOSS_IDS.length + BIOMES.length * PHASES.length);
    for (const boss of BOSS_IDS) expect(all).toContain(`boss:${boss}`);
    for (const biome of BIOMES) for (const phase of PHASES) expect(all).toContain(`world:${biome}:${phase}`);
  });
});

/** What a layer plays on a small speaker, in dBFS: its tones added as power at their peak. */
const toneDb = (id: SceneId, kind: 'drone' | 'pulse'): number[] =>
  sceneMix(id)
    .layers.filter((layer) => layer.kind === kind)
    .map((layer) => smallSpeakerDb(layer.kind === 'wind' ? [] : layer.tones));

describe('what a scene plays (#1571)', () => {
  it('gives every scene at least one synthesized layer, on the music bus for drones and pulses, ambience for wind', () => {
    for (const id of allScenes()) {
      const { layers } = sceneMix(id);
      expect(layers.length, id).toBeGreaterThan(0);
      for (const layer of layers) expect(layer.bus, id).toBe(layer.kind === 'wind' ? 'ambience' : 'music');
    }
  });

  it('sounds different in every scene of one family: no two bosses, no two hours of a biome, no two biomes share a layer set', () => {
    const sets = allScenes().map((id) => JSON.stringify(sceneMix(id).layers));
    expect(new Set(sets).size).toBe(sets.length);
  });

  it('keeps every drone between the floor and the ceiling on a small speaker, a good speaker plays more', () => {
    for (const id of allScenes()) {
      for (const db of toneDb(id, 'drone')) {
        expect(db, id).toBeGreaterThanOrEqual(SCENE_FLOOR_DB);
        expect(db, id).toBeLessThanOrEqual(SCENE_CEILING_DB);
      }
    }
  });

  it('gives every drone a tone above 150 Hz, so a laptop or phone speaker plays something', () => {
    for (const id of allScenes()) {
      for (const layer of sceneMix(id).layers) {
        if (layer.kind === 'wind') continue;
        expect(
          layer.tones.some((tone) => tone.freq >= SMALL_SPEAKER_HZ),
          id,
        ).toBe(true);
      }
    }
  });

  it('keeps wind under its ceiling: even unfiltered white noise at its gain stays under it, so no file needs listening to', () => {
    for (const id of allScenes()) {
      for (const layer of sceneMix(id).layers) {
        if (layer.kind !== 'wind') continue;
        expect(layer.freq, id).toBeGreaterThan(SMALL_SPEAKER_HZ);
        expect(20 * Math.log10(layer.gain * MASTER_LEVEL * Math.sqrt(1 / 3)), id).toBeLessThanOrEqual(WIND_CEILING_DB);
      }
    }
  });

  it('plays no wind in the ship, outdoors it replaces the room tone and the song, and night differs from day', () => {
    for (const id of allScenes()) {
      const outdoors = id.startsWith('world:');
      const mix = sceneMix(id);
      expect(mix.layers.some((layer) => layer.kind === 'wind'), id).toBe(outdoors);
      expect(mix.room, id).toBe(!outdoors);
      expect(mix.track, id).toBe(!outdoors && !id.startsWith('boss:'));
    }
    for (const biome of BIOMES) {
      const [day, dusk, night] = PHASES.map((phase) => JSON.stringify(sceneMix(`world:${biome}:${phase}` as SceneId).layers));
      expect(new Set([day, dusk, night]).size).toBe(3);
    }
  });
});

describe('the boss pulse (#1571)', () => {
  it('is a slow pulse, under 1 Hz at the first phase, that speeds up with each phase and stops at the last', () => {
    expect(pulseRate(0)).toBeLessThan(1);
    expect(pulseRate(0)).toBeGreaterThan(0.25);
    expect(pulseRate(1)).toBeGreaterThan(pulseRate(0));
    expect(pulseRate(2)).toBeGreaterThan(pulseRate(1));
    expect(pulseRate(3)).toBeGreaterThan(pulseRate(2));
    expect(pulseRate(9)).toBe(pulseRate(3));
    expect(pulseRate(-1)).toBe(pulseRate(0));
  });

  it('gives every boss the same base rate and its own pitch, a semitone a boss from 49 Hz', () => {
    const pitches = BOSS_IDS.map(bossPitch);
    expect(new Set(pitches).size).toBe(BOSS_IDS.length);
    expect(pitches[0]).toBeCloseTo(49, 6);
    expect(pitches[1]! / pitches[0]!).toBeCloseTo(2 ** (1 / 12), 6);
    expect(Math.max(...pitches)).toBeLessThan(120);
    for (const boss of BOSS_IDS) {
      const pulses = sceneMix(`boss:${boss}`).layers.filter((layer) => layer.kind === 'pulse');
      expect(pulses, boss).toHaveLength(1);
      expect(pulses[0]!.kind === 'pulse' && pulses[0]!.tones[0]!.freq, boss).toBeCloseTo(bossPitch(boss), 6);
    }
  });

  it('keeps the pulse between its floor and ceiling at its peak, under the quietest cue and the tension layers', () => {
    expect(PULSE_CEILING_DB).toBeLessThanOrEqual(-36 - 3); // at least 3 dB under the floor of a cue (CUE_FLOOR_DB)
    expect(PULSE_FLOOR_DB).toBeLessThan(PULSE_CEILING_DB);
    for (const boss of BOSS_IDS) {
      for (const db of toneDb(`boss:${boss}`, 'pulse')) {
        expect(db, boss).toBeGreaterThanOrEqual(PULSE_FLOOR_DB);
        expect(db, boss).toBeLessThanOrEqual(PULSE_CEILING_DB);
      }
    }
  });

  it('plays only in a boss fight', () => {
    for (const id of allScenes()) {
      expect(sceneMix(id).layers.some((layer) => layer.kind === 'pulse'), id).toBe(id.startsWith('boss:'));
    }
  });
});
