// The scene-to-music map (docs/specs/world.md section 7, Music; #1571): which synthesized layers play where the player is,
// pure data and arithmetic. The Sfx player (sound.ts) builds the layers of a scene and crossfades to the next one; main.ts
// only names the scene. No melody: drones, a pulse for the bosses, wind outdoors, all synthesized, no audio file. The levels
// are calculated on a small speaker (`smallSpeakerDb`, sound.ts), not heard: an owner should listen on a laptop and a phone.
import type { Phase } from './daynight';
import { PHASE_MS } from './daynight';
import { BIOMES, type Biome } from './openworld';
import type { Bus, HumTone } from './sound';
import { BOSS_IDS } from './tally';

/** A laptop or phone speaker reproduces almost nothing below this (#1572): a drone keeps its low sines for good speakers and
 * adds a harmonic above it. */
export const SMALL_SPEAKER_HZ = 150;

/** One layer of a scene: steady sines (`drone`), sines that breathe at the boss pulse (`pulse`), or a band of looped noise
 * (`wind`, outdoors). A drone or a pulse is music, wind is ambience. */
export type SceneLayer =
  | { kind: 'drone' | 'pulse'; bus: Extract<Bus, 'music'>; tones: readonly HumTone[] }
  | { kind: 'wind'; bus: Extract<Bus, 'ambience'>; freq: number; q: number; gain: number };

/** What plays in a scene: its synthesized layers, and whether the reactor room tone and the song of the audio files play
 * under them (the room tone is the ship's, the song is not played where a scene has a voice of its own). */
export interface SceneMix {
  layers: readonly SceneLayer[];
  room: boolean;
  track: boolean;
}

export type SceneId = 'hub' | 'bot' | 'royale' | 'run-map' | 'run-fight' | `boss:${string}` | `world:${Biome}:${Phase}`;

/** Where the player is, as main.ts knows it. */
export interface SceneState {
  hub: boolean;
  royale: boolean;
  run: 'map' | 'fight' | null;
  boss: string | null;
  world: { biome: Biome; phase: Phase } | null;
}

/** The scene of `state`: the Open world, the hub, the royale, a rogue-lite run, a boss fight, and the bot scene for every
 * other game of the board (against the bot, hot seat, online, the trainer), and for a boss the table does not know. */
export function sceneOf({ hub, royale, run, boss, world }: SceneState): SceneId {
  if (world) return `world:${world.biome}:${world.phase}`;
  if (hub) return 'hub';
  if (royale) return 'royale';
  if (run) return `run-${run}`;
  return boss !== null && BOSS_IDS.includes(boss as (typeof BOSS_IDS)[number]) ? `boss:${boss}` : 'bot';
}

// The levels, in dBFS on a small speaker (RMS, master included, buses at 100 %), at the peak of a layer: a drone between the
// floor and the ceiling, which is under the tension layers (level 1 at least -44, level 2 at most -30); a pulse between its
// own, under the quietest cue (-36, CUE_FLOOR_DB). Wind is noise: a calculated ceiling for white noise at its gain, which the
// band only lowers.
export const SCENE_FLOOR_DB = -48;
export const SCENE_CEILING_DB = -38;
export const PULSE_FLOOR_DB = -48;
export const PULSE_CEILING_DB = -40;
export const WIND_CEILING_DB = -40;

/** Adds, for each tone under the small-speaker limit, a harmonic above it at 0.6 of its level. */
const withHigh = (tones: readonly HumTone[]): HumTone[] => [
  ...tones,
  ...tones.filter(({ freq }) => freq < SMALL_SPEAKER_HZ).map(({ freq, gain }) => ({ freq: round(freq * Math.ceil((SMALL_SPEAKER_HZ + 10) / freq)), gain: gain * 0.6 })),
];
const round = (hz: number): number => Math.round(hz * 10) / 10;
const DRONE_GAIN = 0.012;
const drone = (freqs: readonly number[]): SceneLayer => ({ kind: 'drone', bus: 'music', tones: withHigh(freqs.map((freq) => ({ freq, gain: DRONE_GAIN }))) });

/** The pulse is the same slow rate for every boss: 0.5 Hz in the first phase (30 beats a minute), 1.4 times faster each phase,
 * stopping at the fourth. */
export const PULSE_BASE_HZ = 0.5;
export const PULSE_STEP = 1.4;
export const PULSE_PHASES = 3;
export const pulseRate = (phase: number): number => PULSE_BASE_HZ * PULSE_STEP ** Math.min(Math.max(phase, 0), PULSE_PHASES);

/** The pitch of the pulse of `boss`, in Hz: a semitone a boss of the list from 49 Hz (G1), so each boss has its own. */
export const bossPitch = (boss: string): number => 49 * 2 ** (BOSS_IDS.indexOf(boss as (typeof BOSS_IDS)[number]) / 12);
const pulse = (boss: string): SceneLayer => {
  const root = bossPitch(boss);
  return {
    kind: 'pulse',
    bus: 'music',
    tones: [
      { freq: root, gain: 0.016 },
      { freq: root * 3, gain: 0.01 },
      { freq: root * 4, gain: 0.006 },
    ],
  };
};

// The Open world: a root a biome, the hour moves the second tone (a fifth by day, a fourth at dusk, a minor third and the root
// an octave down at night) and the wind (lower and softer as it gets dark); each biome blows its own way.
const ROOTS: Record<Biome, number> = { meadow: 110, forest: 98, tundra: 87.3, desert: 73.4, badlands: 65.4, archipelago: 123.5 };
const WINDS: Record<Biome, number> = { meadow: 1, forest: 0.8, tundra: 1.3, desert: 1.2, badlands: 1.1, archipelago: 0.9 };
const HOUR: Record<Phase, { tones: (root: number) => number[]; wind: number; gain: number }> = {
  day: { tones: (root) => [root, root * 1.5], wind: 700, gain: 0.015 },
  dusk: { tones: (root) => [root, root * 1.335], wind: 480, gain: 0.014 },
  night: { tones: (root) => [root / 2, root * 1.189], wind: 300, gain: 0.012 },
};
const world = (biome: Biome, phase: Phase): SceneMix => {
  const hour = HOUR[phase];
  const layers: SceneLayer[] = [
    drone(hour.tones(ROOTS[biome]).map(round)),
    { kind: 'wind', bus: 'ambience', freq: round(hour.wind * WINDS[biome]), q: 0.6, gain: hour.gain },
  ];
  return { layers, room: false, track: false };
};

const SHIP: Record<'hub' | 'bot' | 'royale' | 'run-map' | 'run-fight', number[]> = {
  hub: [110, 164.8], // an open fifth: calm
  bot: [87.3, 130.8], // a fifth lower: a table with a foe
  royale: [73.4, 77.8], // a minor second beating: many foes
  'run-map': [82.4, 103.8, 123.5], // a major triad: the road
  'run-fight': [82.4, 98], // a minor third: the fight
};

const PHASES = Object.keys(PHASE_MS) as Phase[];
const IDS: SceneId[] = [
  ...(Object.keys(SHIP) as (keyof typeof SHIP)[]),
  ...BOSS_IDS.map((id): SceneId => `boss:${id}`),
  ...BIOMES.flatMap((biome) => PHASES.map((phase): SceneId => `world:${biome}:${phase}`)),
];

function build(id: SceneId): SceneMix {
  const [kind, name, phase] = id.split(':') as [string, string, Phase];
  if (kind === 'world') return world(name as Biome, phase);
  if (kind === 'boss') return { layers: [pulse(name)], room: true, track: false }; // the pulse is its music
  return { layers: [drone(SHIP[kind as keyof typeof SHIP])], room: true, track: true };
}
const MIXES = new Map(IDS.map((id) => [id, build(id)]));

/** Every scene, once. */
export const allScenes = (): SceneId[] => [...IDS];
/** What plays in `id`. */
export const sceneMix = (id: SceneId): SceneMix => MIXES.get(id)!;
