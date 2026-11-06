// The sounds of the game, docs/specs/world.md section 7, synthesized with Web Audio: no audio file,
// nothing fetched. The design is data (the cue per side, the voices and their envelopes, the steady tones of
// the hum and the tension drones), played by a thin wrapper through four bus gains, music, ambience, effects
// and voice, into one master gain (#438), music and ambience through a duck node that lowers them under an audio
// log (#514), the audio logs through the voice bus (#516). The ejection follows the ejection effect of eject.ts: a sharp inhale on the push over the rim, a
// muffled thud as the void takes the marble, vacuum silence while it falls, then, once it is gone, a low toll for a
// lost player marble or a dry clack for an enemy one. The boss tells have their sound twins too (#358).

import { RADIUS, type Axial } from './board';
import { EJECT_MS, PUSH_MS } from './eject';
import { pulseRate, sceneMix, SMALL_SPEAKER_HZ, type SceneId, type SceneLayer } from './scenes';
import type { Tension } from './tension';

/** The last note of an ejection: who lost a marble. */
export type Cue = 'toll' | 'clack';

/** The glass side (the player's) gives a low toll, every other side an enemy shell a dry clack. */
export const cueFor = (side: number, glass = 2): Cue => (side === glass ? 'toll' : 'clack');

/** Gain points [seconds after the ejection, gain], ramped in turn, silent at both ends. */
export type Envelope = readonly (readonly [number, number])[];
export interface Filter {
  type: 'bandpass' | 'lowpass';
  freq: readonly [number, number]; // Hz, glides from the first to the second over the voice
  q: number;
}
export type Voice =
  | { source: 'noise'; filter: Filter; env: Envelope }
  | { source: 'sine' | 'triangle'; freq: readonly [number, number]; env: Envelope };

const PUSH = PUSH_MS / 1000;
/** The toll or the clack sounds when the marble is gone, at the end of the effect. */
export const CUE_AT = EJECT_MS / 1000;

/** A hit: up in 4 ms, then dies away over `decay` seconds. */
const strike = (at: number, peak: number, decay: number): Envelope => [
  [at, 0],
  [at + 0.004, peak],
  [at + decay, 0],
];

// Air leaving: a hiss that rises and swells through the push, cut short as the void takes the marble.
const INHALE: Voice = {
  source: 'noise',
  filter: { type: 'bandpass', freq: [600, 4000], q: 0.9 },
  env: [
    [0, 0],
    [0.05, 0.15],
    [PUSH - 0.03, 0.9],
    [PUSH, 0],
  ],
};
// Muffled: a low falling sine and a dull lowpassed knock, nothing bright.
const THUD: Voice[] = [
  { source: 'sine', freq: [120, 40], env: strike(PUSH, 0.9, 0.12) },
  { source: 'noise', filter: { type: 'lowpass', freq: [300, 120], q: 0.7 }, env: strike(PUSH, 0.5, 0.06) },
];
// A low bell: inharmonic partials [ratio, gain, decay], the higher ones die first.
const TOLL_HZ = 98;
const TOLL: Voice[] = (
  [
    [1, 0.45, 1.8],
    [2, 0.2, 1.1],
    [2.76, 0.12, 0.7],
    [5.4, 0.05, 0.35],
  ] as const
).map(([ratio, gain, decay]): Voice => ({
  source: 'sine',
  freq: [TOLL_HZ * ratio, TOLL_HZ * ratio],
  env: strike(CUE_AT, gain, decay),
}));
// Dry: a short bright knock of shell on shell, no tail.
const CLACK: Voice[] = [
  { source: 'noise', filter: { type: 'bandpass', freq: [2400, 1800], q: 4 }, env: strike(CUE_AT, 1, 0.05) },
  { source: 'triangle', freq: [520, 300], env: strike(CUE_AT, 0.5, 0.06) },
];

/** Every voice of an ejection that ends on `cue`. */
export function ejectionVoices(cue: Cue): Voice[] {
  return [INHALE, ...THUD, ...(cue === 'toll' ? TOLL : CLACK)];
}

// The knock of a move (#289): pitch in Hz for 1, 2, 3 marbles pushed in line, lower for more.
const KNOCK_HZ = [330, 247, 196] as const;
/** The pitch of the knock of a move that pushes `marbles` marbles (1 to 3). */
export const knockPitch = (marbles: number): number => KNOCK_HZ[marbles - 1]!;

/** The knock of a move: a short glass-on-steel hit, a bright click over a dull body, no tail. When the move pushes
 * `pushed` opposing marbles (a sumito, #1576) a grinding scrape lasts under it: a lower body and a swelling band of
 * noise, longer and louder for each marble pushed (3 at most). */
export function knockVoices(pitch: number, pushed = 0): Voice[] {
  const click: Voice = { source: 'noise', filter: { type: 'bandpass', freq: [pitch * 6, pitch * 4], q: 3 }, env: strike(0, 0.3, 0.02) };
  if (pushed === 0) return [{ source: 'triangle', freq: [pitch, pitch * 0.9], env: strike(0, 0.6, 0.12) }, click];
  const weight = Math.min(pushed, 3);
  const decay = 0.2 + 0.1 * weight;
  const grind = 0.3 + 0.1 * weight;
  return [
    { source: 'triangle', freq: [pitch, pitch * 0.6], env: strike(0, 0.6, decay) },
    click,
    {
      source: 'noise',
      filter: { type: 'bandpass', freq: [pitch * 3, pitch * 1.5], q: 1.5 },
      env: [
        [0, 0],
        [0.03, grind],
        [decay * 0.5, grind * 0.7],
        [decay, 0],
      ],
    },
  ];
}

/** The pan of a knock at the rim of the board: never hard to one side. */
export const KNOCK_PAN = 0.6;
/** Where a move is across the board, -1 at the left rim to 1 at the right: the mean screen column of its marbles. */
export const columnOf = (cells: readonly Axial[]): number => {
  const x = cells.reduce((sum, [q, r]) => sum + q + r / 2, 0) / cells.length;
  return Math.max(-1, Math.min(1, x / RADIUS));
};

/** The variation of a play (#1574), from one draw each: the pitch within 3 % either way, the level within 10 %, and
 * where in the looped noise the voice starts, in seconds. */
const PITCH_JITTER = 0.06;
const LEVEL_JITTER = 0.2;
interface Shape {
  rate: number;
  level: number;
  offset: number;
}
const FLAT: Shape = { rate: 1, level: 1, offset: 0 };
/** The short room of the effects bus: a synthesized impulse of this many seconds, heard at this level under the dry
 * sound. Calculated, not heard. */
const ROOM_SECONDS = 0.4;
export const ROOM_WET = 0.2;

/** A boss tell with a sound twin (world.md sections 3 and 8, #358): The Hull's crack countdown, The Chaplain's
 * flip tell, The Choir's next army. */
export type Tell = 'crack' | 'flip' | 'choir' | 'blip';

const TELLS: Record<Tell, Voice[]> = {
  // The frame groans as a rim cell cracks or ticks down: a low falling creak and a splinter of noise.
  crack: [
    {
      source: 'triangle',
      freq: [90, 60],
      env: [
        [0, 0],
        [0.03, 0.5],
        [0.35, 0],
      ],
    },
    { source: 'noise', filter: { type: 'bandpass', freq: [900, 300], q: 5 }, env: strike(0, 0.4, 0.12) },
  ],
  // A small high chapel bell over the marbles a move would expose: two pure partials, the higher dies first.
  flip: [
    { source: 'sine', freq: [1320, 1320], env: strike(0, 0.25, 0.6) },
    { source: 'sine', freq: [3640, 3640], env: strike(0, 0.08, 0.25) },
  ],
  // The Overseer typing a letter (#741): a soft short synth blip.
  blip: [{ source: 'triangle', freq: [880, 660], env: strike(0, 0.12, 0.06) }],
  // The next army takes the note: two hummed voices a fifth apart that swell, then fade.
  choir: [220, 330].map(
    (hz, i): Voice => ({
      source: 'sine',
      freq: [hz, hz],
      env: [
        [0, 0],
        [0.12, 0.3 - i * 0.1],
        [0.5, 0],
      ],
    }),
  ),
};

/** The pick of a node on the rogue-lite map (#1468): a short soft blip that rises, a low note and a bright one a fifth above. */
export const PICK: Voice[] = [
  { source: 'triangle', freq: [330, 440], env: strike(0, 0.3, 0.14) },
  { source: 'sine', freq: [660, 880], env: strike(0.05, 0.15, 0.2) },
];

/** The events with a cue (world.md section 7, the cue table; #1570). */
export type CueEvent =
  | 'win' | 'loss' | 'phase' | 'elimination' | 'reward' | 'click'
  | 'draw' | 'turn-start' | 'selection' | 'illegal-move' | 'boss-intro' | 'boss-death' | 'shop' | 'relic' | 'royale-round' | 'step' | 'pickup' | 'time-of-day' | 'online-join';

/** A fight ends, a boss changes phase: the cue follows the ejection that caused it, after its toll or clack. */
export const AFTER_EJECTION = CUE_AT + 0.3;
/** The turn comes back to the player: the cue waits for the marbles of the other side's move to arrive (200 ms). */
export const AFTER_SLIDE = 0.25;

// Dry and mechanical, the register of the ship (world.md section 7): a latch, a stamp, a relay, never a fanfare. Each
// has a tone above 150 Hz for a small speaker (#1572) and a dull body of noise, short, no tail over a second.
const STAMP: Voice = { source: 'noise', filter: { type: 'lowpass', freq: [400, 150], q: 0.7 }, env: strike(0, 0.4, 0.05) };

/** The cue table: the mode where it plays, the bus, the voices. The spec table of world.md section 7 lists the same rows
 * (cuetable.test.ts). */
export const CUES = {
  // The ledger closes: a stamp, a plain note and its fifth above.
  win: {
    mode: 'fights, royale',
    bus: 'effects',
    voices: [
      { source: 'triangle', freq: [330, 330], env: strike(0, 0.3, 0.3) },
      { source: 'sine', freq: [495, 495], env: strike(0.14, 0.22, 0.6) },
      STAMP,
    ],
  },
  // The ledger is struck: the same stamp, a plain note and a minor third below it.
  loss: {
    mode: 'fights, royale',
    bus: 'effects',
    voices: [
      { source: 'triangle', freq: [294, 294], env: strike(0, 0.3, 0.3) },
      { source: 'sine', freq: [247, 247], env: strike(0.16, 0.25, 0.8) },
      { ...STAMP, filter: { type: 'lowpass', freq: [300, 100], q: 0.7 } },
    ],
  },
  // A gear shifts down: a falling tritone and a grind of noise.
  phase: {
    mode: 'boss',
    bus: 'effects',
    voices: [
      {
        source: 'sine',
        freq: [523, 370],
        env: [
          [0, 0],
          [0.02, 0.25],
          [0.4, 0],
        ],
      },
      {
        source: 'triangle',
        freq: [262, 185],
        env: [
          [0, 0],
          [0.02, 0.15],
          [0.4, 0],
        ],
      },
      { source: 'noise', filter: { type: 'bandpass', freq: [1200, 300], q: 3 }, env: strike(0, 0.2, 0.2) },
    ],
  },
  // A set of marbles goes out: a short drop, like a drip into the dark.
  elimination: {
    mode: 'royale',
    bus: 'effects',
    voices: [
      { source: 'sine', freq: [700, 250], env: strike(0, 0.3, 0.12) },
      { source: 'noise', filter: { type: 'bandpass', freq: [2000, 1000], q: 3 }, env: strike(0, 0.15, 0.03) },
    ],
  },
  // Scrap into the hold: two small bright ticks, a major third apart.
  reward: {
    mode: 'rogue-lite',
    bus: 'effects',
    voices: [
      { source: 'triangle', freq: [880, 880], env: strike(0, 0.18, 0.12) },
      { source: 'sine', freq: [1109, 1109], env: strike(0.08, 0.14, 0.28) },
    ],
  },
  // A key of the console: the shortest and quietest.
  click: {
    mode: 'every mode',
    bus: 'effects',
    voices: [
      { source: 'triangle', freq: [1100, 900], env: strike(0, 0.1, 0.025) },
      { source: 'noise', filter: { type: 'bandpass', freq: [3200, 2400], q: 2 }, env: strike(0, 0.12, 0.012) },
    ],
  },
  // The ledger balances: the stamp and one plain note twice, neither rising nor falling.
  draw: {
    mode: 'fights, royale',
    bus: 'effects',
    voices: [
      { source: 'triangle', freq: [370, 370], env: strike(0, 0.28, 0.3) },
      { source: 'sine', freq: [370, 370], env: strike(0.14, 0.2, 0.5) },
      { ...STAMP, filter: { type: 'lowpass', freq: [350, 130], q: 0.7 } },
    ],
  },
  // The turn is yours again: a soft, short tap, under the level of a click.
  'turn-start': {
    mode: 'every mode',
    bus: 'effects',
    voices: [{ source: 'sine', freq: [660, 660], env: strike(0, 0.07, 0.05) }],
  },
  // A group of marbles is taken up: a tick, under the level of a click.
  selection: {
    mode: 'every mode',
    bus: 'effects',
    voices: [
      { source: 'sine', freq: [1320, 1320], env: strike(0, 0.06, 0.02) },
      { source: 'noise', filter: { type: 'bandpass', freq: [2600, 2000], q: 2 }, env: strike(0, 0.06, 0.008) },
    ],
  },
  // A move the engine refuses: a dull short drop, never a buzz.
  'illegal-move': {
    mode: 'every mode',
    bus: 'effects',
    voices: [
      { source: 'sine', freq: [260, 180], env: strike(0, 0.22, 0.12) },
      { source: 'noise', filter: { type: 'lowpass', freq: [260, 110], q: 0.7 }, env: strike(0, 0.25, 0.05) },
    ],
  },
  // A bulkhead latches as the fight opens: a dull latch and two low notes close together, short so that it clears the tally line.
  'boss-intro': {
    mode: 'boss',
    bus: 'effects',
    voices: [
      { source: 'triangle', freq: [220, 220], env: strike(0.03, 0.26, 0.22) },
      { source: 'sine', freq: [330, 330], env: strike(0.03, 0.16, 0.22) },
      { source: 'noise', filter: { type: 'lowpass', freq: [320, 120], q: 0.7 }, env: strike(0, 0.45, 0.08) },
    ],
  },
  // The boss is gone, and the win does not play: a heavy stamp, a low note that falls a fourth and a plain note above it.
  'boss-death': {
    mode: 'boss',
    bus: 'effects',
    voices: [
      { source: 'triangle', freq: [262, 196], env: strike(0, 0.3, 0.5) },
      { source: 'sine', freq: [523, 523], env: strike(0.16, 0.2, 0.7) },
      { source: 'noise', filter: { type: 'lowpass', freq: [300, 100], q: 0.7 }, env: strike(0, 0.45, 0.1) },
    ],
  },
  // The shop opens: a till, a counter bell and its octave.
  shop: {
    mode: 'rogue-lite',
    bus: 'effects',
    voices: [
      { source: 'sine', freq: [740, 740], env: strike(0, 0.2, 0.18) },
      { source: 'sine', freq: [1480, 1480], env: strike(0, 0.08, 0.1) },
      { source: 'noise', filter: { type: 'bandpass', freq: [2800, 2000], q: 3 }, env: strike(0, 0.1, 0.015) },
    ],
  },
  // A relic is taken: a rising fourth with its octave, a latch closing on it.
  relic: {
    mode: 'rogue-lite',
    bus: 'effects',
    voices: [
      { source: 'sine', freq: [440, 587], env: strike(0, 0.2, 0.4) },
      { source: 'sine', freq: [1174, 1174], env: strike(0.05, 0.08, 0.3) },
      { source: 'noise', filter: { type: 'lowpass', freq: [500, 200], q: 0.7 }, env: strike(0, 0.3, 0.04) },
    ],
  },
  // The next round is open: a counter ticks over.
  'royale-round': {
    mode: 'royale',
    bus: 'effects',
    voices: [
      { source: 'triangle', freq: [349, 349], env: strike(0, 0.2, 0.1) },
      { source: 'noise', filter: { type: 'bandpass', freq: [1500, 800], q: 3 }, env: strike(0, 0.15, 0.05) },
    ],
  },
  // The hero steps: the softest of all, a pad on the deck, under the level of a click.
  step: {
    mode: 'Open world',
    bus: 'effects',
    voices: [
      { source: 'triangle', freq: [420, 380], env: strike(0, 0.07, 0.03) },
      { source: 'noise', filter: { type: 'lowpass', freq: [900, 500], q: 0.7 }, env: strike(0, 0.12, 0.02) },
    ],
  },
  // Something is picked up: a small ding and its fifth.
  pickup: {
    mode: 'Open world',
    bus: 'effects',
    voices: [
      { source: 'triangle', freq: [784, 784], env: strike(0, 0.2, 0.08) },
      { source: 'sine', freq: [1175, 1175], env: strike(0.04, 0.14, 0.2) },
    ],
  },
  // The light changes: a slow soft swell of a note and its fifth, on the ambience bus (the only cue that does not strike).
  'time-of-day': {
    mode: 'Open world',
    bus: 'ambience',
    voices: [
      { source: 'sine', freq: [262, 262], env: [[0, 0], [0.35, 0.18], [0.95, 0]] },
      { source: 'sine', freq: [392, 392], env: [[0, 0], [0.4, 0.12], [0.95, 0]] },
    ],
  },
  // The opponent is in: two equal knocks on the hull and a high note on the second.
  'online-join': {
    mode: 'online',
    bus: 'effects',
    voices: [
      { source: 'triangle', freq: [587, 587], env: strike(0, 0.2, 0.07) },
      { source: 'triangle', freq: [587, 587], env: strike(0.11, 0.2, 0.07) },
      { source: 'sine', freq: [880, 880], env: strike(0.11, 0.1, 0.2) },
    ],
  },
} as const satisfies Record<CueEvent, { mode: string; bus: Bus; voices: readonly Voice[] }>;

/** Every voice of the sound twin of `tell`. */
export const tellVoices = (tell: Tell): Voice[] => TELLS[tell];

/** The last marks of each tell, so that a tell sounds only when it appears or changes, never on a redraw. */
export class TellWatch {
  private readonly last = new Map<Tell, string>();

  /** True when `tell` shows `marks` (none: an empty list) and did not show them last time. */
  changed(tell: Tell, marks: readonly unknown[]): boolean {
    const key = JSON.stringify(marks);
    const was = this.last.get(tell);
    this.last.set(tell, key);
    return marks.length > 0 && key !== was;
  }
}

/** The four buses of the mix (world.md section 7, Mix; tech.md section 5.4), one slider each. */
export type Bus = 'music' | 'ambience' | 'effects' | 'voice';
export const BUSES: readonly Bus[] = ['music', 'ambience', 'effects', 'voice'];
/** The volume of each bus, 0 to 100 %, as its slider shows it. */
export type Mix = Record<Bus, number>;
/** The bus each sound goes through: the hum is ambience, the tension drones music, the knock, the ejection and the
 * tells and the pick of a map node effects, the audio logs voice (#516). */
export const ROUTE = {
  hum: 'ambience',
  tension: 'music',
  knock: 'effects',
  ejection: 'effects',
  tell: 'effects',
  pick: 'effects',
  log: 'voice',
} as const satisfies Record<string, Bus>;
/** The gain of a bus at `percent` of its slider. */
export const busGain = (percent: number): number => percent / 100;
/** The gain of the master node, every bus into it. */
export const MASTER_LEVEL = 0.8;
/** Where the envelopes start and end: an exponential ramp cannot reach 0. */
export const SILENT = 0.0001;
/** A slider fades its bus over about 20 ms: a cut would click. */
const SLIDER_TAU = 0.007;
/** The tension layers crossfade over about a second (three time constants). */
export const CROSSFADE_TAU = 0.3;
/** A scene that leaves fades out over the same second, and its sources stop after five time constants, at under 1 % (under
 * -40 dB) of what they played: nothing is cut while it can be heard. */
export const SCENE_RELEASE = 5 * CROSSFADE_TAU;
/** The buses an audio log ducks (tech.md section 5.4), each through its own duck node into the master. */
export const DUCKED: readonly Bus[] = ['music', 'ambience'];
/** How far a log ducks them, in dB. */
export const DUCK_DB = -12;
/** They duck and come back over about 300 ms (three time constants). */
export const DUCK_TAU = 0.1;
/** The gain of each duck node, in the order of DUCKED, while a log plays (`active`) or not. */
export const duckGains = (active: boolean): number[] => DUCKED.map(() => (active ? 10 ** (DUCK_DB / 20) : 1));

/** A steady tone of the hum or a tension drone: pitch in Hz, level before its bus. */
export interface HumTone {
  freq: number;
  gain: number;
}
/** A looped audio file track routed into a bus at `gain`. */
export interface Track {
  url: string;
  gain: number;
}
/** The music track looped under the music bus. */
export const MUSIC_TRACK: Track = { url: 'audio/dead-ore-hauler.mp3', gain: 0.35 };
/** The reactor room tones layered and looped under the ambience bus. */
export const AMBIENCE_TRACKS: readonly Track[] = [
  { url: 'audio/reactor-room-tone-1.mp3', gain: 0.4 },
  { url: 'audio/reactor-room-tone-2.mp3', gain: 0.35 },
];
/** The hum under every game (world.md section 7): two low sines a fifth apart, no melody, quiet, and the octave of the
 * upper one above 150 Hz so a laptop or phone speaker plays something (#1572). */
export const HUM: readonly HumTone[] = [
  { freq: 55, gain: 0.03 },
  { freq: 82.4, gain: 0.02 },
  { freq: 164.8, gain: 0.008 },
];
/** The two drone tension layers under the hum (world.md section 7, Music; #439): steady tones, no melody. Each keeps
 * its low sines for good speakers and adds harmonics above 150 Hz for small ones (#1572). */
export const TENSION: readonly (readonly HumTone[])[] = [
  // Unease: a minor second over the hum's root, two sines a hair apart that beat slowly, and their 3rd harmonics.
  [
    { freq: 58.3, gain: 0.02 },
    { freq: 58.8, gain: 0.02 },
    { freq: 174.9, gain: 0.012 },
    { freq: 176.4, gain: 0.012 },
  ],
  // Dread: the tritone over the root and its octave, thin and cold, with the 3rd and 4th harmonics.
  [
    { freq: 77.8, gain: 0.015 },
    { freq: 155.6, gain: 0.012 },
    { freq: 233.4, gain: 0.012 },
    { freq: 311.2, gain: 0.008 },
  ],
];
export { SMALL_SPEAKER_HZ };
/** The level in dBFS (RMS, master included, buses at 100 %) left of `tones` on a small speaker: each sine goes through
 * a second-order Butterworth high-pass at `SMALL_SPEAKER_HZ`, the tones add as power. Calculated, not rendered. */
export const smallSpeakerDb = (tones: readonly HumTone[]): number => {
  const power = tones.reduce((sum, { freq, gain }) => {
    const pass = 1 / Math.sqrt(1 + (SMALL_SPEAKER_HZ / freq) ** 4);
    return sum + (gain * pass * MASTER_LEVEL) ** 2 / 2;
  }, 0);
  return 10 * Math.log10(power);
};
/** What a cue must leave on a small speaker (#1570, #1572): the loudest tone of it, at its peak, between these in dBFS
 * (RMS, master included, bus at 100 %). The floor is above the hum and the drones, the ceiling under a shout. */
export const CUE_FLOOR_DB = -36;
export const CUE_CEILING_DB = -10;
/** The level in dBFS of the loudest tone of `voices` on a small speaker, at its peak: a sine by its gain, a triangle by
 * 8/pi^2 of it (its first harmonic), at the middle of its glide. Noise is not counted, so the floor holds without it.
 * Calculated, not rendered. */
export const cueDb = (voices: readonly Voice[]): number =>
  voices.reduce((loudest, voice) => {
    if (voice.source === 'noise') return loudest;
    const gain = Math.max(...voice.env.map(([, g]) => g)) * (voice.source === 'triangle' ? 8 / Math.PI ** 2 : 1);
    return Math.max(loudest, smallSpeakerDb([{ freq: Math.sqrt(voice.freq[0] * voice.freq[1]), gain }]));
  }, -Infinity);
/** The gain of each tension layer at `level`: level n plays the first n layers. */
export const layerGains = (level: Tension): number[] => TENSION.map((_, i) => (i < level ? 1 : 0));

interface Graph {
  ctx: AudioContext;
  buses: Record<Bus, GainNode>;
  layers: GainNode[];
  ducks: GainNode[];
  noise: AudioBuffer;
  master: GainNode;
  reverb: ConvolverNode | null; // the room of the effects bus, built with the first effect (#1574)
  room: GainNode; // the gate of the reactor room tones, open in the ship and closed outdoors (#1571)
  song: GainNode; // the gate of the music track
  open: { room: boolean; track: boolean }; // what the gates let through
}

/** The layers of a scene that are playing: the fade gains into their buses, the sources to stop, the slow oscillators of a pulse. */
interface Live {
  id: SceneId;
  key: string; // which layers of the scene are built: a bus at 0 builds none of its
  fades: GainNode[];
  sources: AudioScheduledSourceNode[];
  lfos: OscillatorNode[];
}

/** The sound player. The audio context is made on the first user gesture (browsers block audio before one), only
 * while a slider is above 0. */
export class Sfx {
  private graph: Graph | null = null;
  private level: Tension = 0;
  private ducked = false;
  private want: { id: SceneId; phase: number } | null = null; // the scene the page asked for (#1571)
  private live: Live | null = null; // what plays of it
  private log: AudioScheduledSourceNode[] = []; // the sources of the audio log playing

  constructor(
    private readonly create: () => AudioContext | null,
    private readonly mix: Mix,
    private readonly random: () => number = () => 0.5, // the middle of every variation; the page passes Math.random
  ) {}

  /** The volume of `bus`, 0 to 100 %. */
  volume(bus: Bus): number {
    return this.mix[bus];
  }

  /** 'none' until a context exists, then its state. */
  get state(): AudioContextState | 'none' {
    return this.graph?.ctx.state ?? 'none';
  }

  /** The gain of `bus`: 0 until a context exists. */
  gain(bus: Bus): number {
    return this.graph?.buses[bus].gain.value ?? 0;
  }

  /** The tension level the drones play. */
  get tension(): Tension {
    return this.level;
  }

  /** The gain of each tension layer: 0 until a context exists. */
  get layers(): number[] {
    return this.graph?.layers.map((layer) => layer.gain.value) ?? TENSION.map(() => 0);
  }

  /** Called on every user gesture: makes the context the first time, resumes it while suspended. */
  unlock(): void {
    if (BUSES.every((bus) => this.mix[bus] === 0)) return;
    if (!this.graph) {
      const ctx = this.create();
      if (!ctx) return;
      const master = ctx.createGain();
      master.gain.value = MASTER_LEVEL;
      master.connect(ctx.destination);
      const buses = {} as Record<Bus, GainNode>;
      for (const bus of BUSES) {
        buses[bus] = ctx.createGain();
        buses[bus].gain.value = busGain(this.mix[bus]);
        if (!DUCKED.includes(bus)) buses[bus].connect(master);
      }
      const ducks = DUCKED.map((bus, i) => {
        const duck = ctx.createGain();
        duck.gain.value = duckGains(this.ducked)[i]!;
        duck.connect(master);
        buses[bus].connect(duck);
        return duck;
      });
      const open = this.want ? sceneMix(this.want.id) : { room: true, track: true }; // the room tone never plays outdoors, not even at the start
      const room = gate(ctx, buses[ROUTE.hum], open.room);
      const song = gate(ctx, buses[ROUTE.tension], open.track);
      const opened = { room: open.room, track: open.track };
      startTones(ctx, HUM, buses[ROUTE.hum]);
      startTracks(ctx, AMBIENCE_TRACKS, room);
      const layers = TENSION.map((tones, i) => {
        const layer = ctx.createGain();
        layer.gain.value = layerGains(this.level)[i]!;
        layer.connect(buses[ROUTE.tension]);
        startTones(ctx, tones, layer);
        return layer;
      });
      startTracks(ctx, [MUSIC_TRACK], song);
      this.graph = { ctx, buses, layers, ducks, noise: whiteNoise(ctx, this.random), master, reverb: null, room, song, open: opened };
      this.applyScene();
    }
    if (this.graph.ctx.state === 'suspended') this.graph.ctx.resume().catch(() => undefined);
  }

  /** The page was hidden (`shown` false: tab switch, locked phone) or shown again: the context is suspended while hidden,
   * so nothing plays or runs in the background (#728). Nothing to do before the first gesture made a context. */
  visible(shown: boolean): void {
    const ctx = this.graph?.ctx;
    if (!ctx) return;
    (shown ? ctx.resume() : ctx.suspend()).catch(() => undefined);
  }

  /** A slider, itself a user gesture: fades `bus` to `percent`, 0 silences what still rings through it. */
  setVolume(bus: Bus, percent: number): void {
    this.mix[bus] = percent;
    this.graph?.buses[bus].gain.setTargetAtTime(busGain(percent), this.graph.ctx.currentTime, SLIDER_TAU);
    this.unlock();
    this.applyScene(); // a bus that rises from 0 starts its layers, one that falls to 0 drops them
  }

  /** The scene the music plays (world.md section 7, Music; #1571), `phase` the boss phase that moves its pulse. Cheap to call
   * every frame: nothing happens while the scene and the phase stay. A new scene crossfades over about a second. */
  setScene(id: SceneId, phase = 0): void {
    if (this.want?.id === id && this.want.phase === phase) return;
    this.want = { id, phase };
    this.applyScene();
  }

  /** The scene asked for, and what plays of it: the layers started, the pulse rate in Hz (0 without one), and whether the room
   * tone and the song are let through. */
  get scene(): { id: SceneId | null; phase: number; layers: number; pulse: number; room: boolean; track: boolean } {
    const { id = null, phase = 0 } = this.want ?? {};
    const { room, track } = id ? sceneMix(id) : { room: true, track: true };
    return { id, phase, layers: this.live?.fades.length ?? 0, pulse: this.live?.lfos.length ? pulseRate(phase) : 0, room, track };
  }

  /** Brings the layers that play in line with the scene asked for and the sliders: the gates of the files, the pulse rate, or, when
   * the scene or the layers to build changed, a crossfade to the new ones. A bus at 0 builds nothing: no cost when muted. */
  private applyScene(): void {
    const { graph, want } = this;
    if (!graph || !want) return;
    const { ctx } = graph;
    const now = ctx.currentTime;
    const mix = sceneMix(want.id);
    for (const [door, key] of [[graph.room, 'room'], [graph.song, 'track']] as const) {
      if (graph.open[key] === mix[key]) continue;
      graph.open[key] = mix[key];
      door.gain.setTargetAtTime(mix[key] ? 1 : 0, now, CROSSFADE_TAU);
    }
    const layers = mix.layers.filter((layer) => this.mix[layer.bus] > 0);
    const key = layers.map((layer) => mix.layers.indexOf(layer)).join();
    const old = this.live;
    if (old?.id === want.id && old.key === key) {
      for (const lfo of old.lfos) lfo.frequency.setTargetAtTime(pulseRate(want.phase), now, CROSSFADE_TAU);
      return;
    }
    if (old) {
      for (const fade of old.fades) fade.gain.setTargetAtTime(0, now, CROSSFADE_TAU);
      for (const source of old.sources) source.stop(now + SCENE_RELEASE);
    }
    const live: Live = { id: want.id, key, fades: [], sources: [], lfos: [] };
    for (const layer of layers) {
      const fade = ctx.createGain();
      fade.gain.value = 0; // silent when it starts, then up: a start at full level would click
      fade.gain.setTargetAtTime(1, now, CROSSFADE_TAU);
      fade.connect(graph.buses[layer.bus]);
      live.fades.push(fade);
      this.startLayer(graph, layer, fade, live, pulseRate(want.phase));
    }
    this.live = layers.length ? live : null;
  }

  private startLayer({ ctx, noise }: Graph, layer: SceneLayer, out: AudioNode, live: Live, rate: number): void {
    const now = ctx.currentTime;
    if (layer.kind === 'wind') {
      const buffer = ctx.createBufferSource();
      buffer.buffer = noise;
      buffer.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = layer.freq;
      filter.Q.value = layer.q;
      const level = ctx.createGain();
      level.gain.value = layer.gain;
      buffer.connect(filter).connect(level).connect(out);
      buffer.start(now);
      live.sources.push(buffer);
      return;
    }
    // A pulse breathes: its tones go through a gain at 0.5 that a sine of the pulse rate moves by 0.5 either way, silent to full.
    const breath = layer.kind === 'pulse' ? ctx.createGain() : null;
    if (breath) {
      breath.gain.value = 0.5;
      breath.connect(out);
    }
    const into = breath ?? out;
    for (const { freq, gain } of layer.tones) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const level = ctx.createGain();
      level.gain.value = gain;
      osc.connect(level).connect(into);
      osc.start(now);
      live.sources.push(osc);
    }
    if (breath) {
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = rate;
      const depth = ctx.createGain();
      depth.gain.value = 0.5;
      lfo.connect(depth).connect(breath.gain);
      lfo.start(now);
      live.lfos.push(lfo);
      live.sources.push(lfo);
    }
  }

  /** Crossfades the tension layers to `level` over about a second. */
  setTension(level: Tension): void {
    this.level = level;
    const graph = this.graph;
    if (!graph) return;
    const gains = layerGains(level);
    graph.layers.forEach((layer, i) => layer.gain.setTargetAtTime(gains[i]!, graph.ctx.currentTime, CROSSFADE_TAU));
  }

  /** Ducks music and ambience while an audio log plays (`active`), brings them back after, over about 300 ms. */
  duck(active: boolean): void {
    this.ducked = active;
    const graph = this.graph;
    if (!graph) return;
    const gains = duckGains(active);
    graph.ducks.forEach((duck, i) => duck.gain.setTargetAtTime(gains[i]!, graph.ctx.currentTime, DUCK_TAU));
  }

  /** Whether music and ambience are ducked under an audio log. */
  get ducking(): boolean {
    return this.ducked;
  }

  /** Plays an audio log from now on the voice bus, music and ambience ducked under it (#516); a log playing stops
   * first. False when silent (the voice at 0, or no gesture yet): the duck holds all the same, until stopLog. */
  playLog(voices: readonly Voice[]): boolean {
    this.endLog();
    this.duck(true);
    const graph = this.graph;
    if (this.mix[ROUTE.log] === 0 || !graph) return false;
    const now = graph.ctx.currentTime;
    this.log = voices.map((voice) => this.play(graph, graph.buses[ROUTE.log], voice, now));
    return true;
  }

  /** Stops the audio log at once, a skip or its end, and brings music and ambience back. */
  stopLog(): void {
    this.endLog();
    this.duck(false);
  }

  private endLog(): void {
    for (const source of this.log) source.stop(this.graph!.ctx.currentTime); // a log only sounds with a context
    this.log = [];
  }

  /** Plays the ejection of a marble of `side` from now. Its cue, or null when silent (effects at 0, or no gesture
   * yet). */
  ejection(side: number, glass = 2): Cue | null {
    const cue = cueFor(side, glass);
    return this.playAll(ROUTE.ejection, ejectionVoices(cue), 0, 'all') ? cue : null;
  }

  /** Plays the knock of a move of `marbles` marbles that pushes `pushed` opposing ones, at `column` of the board
   * (-1 to 1, see `columnOf`), from now. Its pitch, or null when silent (effects at 0, or no gesture yet). */
  knock(marbles: number, pushed = 0, column = 0): number | null {
    const pitch = knockPitch(marbles);
    return this.playAll(ROUTE.knock, knockVoices(pitch, pushed), 0, 'all', column * KNOCK_PAN) ? pitch : null;
  }

  /** Plays the sound twin of `tell` from now. The tell, or null when silent (effects at 0, or no gesture yet). */
  tell(tell: Tell): Tell | null {
    return this.playAll(ROUTE.tell, tellVoices(tell)) ? tell : null;
  }

  /** Plays the pick of a map node from now. False when silent (effects at 0, or no gesture yet). */
  pick(): boolean {
    return this.playAll(ROUTE.pick, PICK);
  }

  /** Plays the cue of `event` `after` seconds from now. False when silent (effects at 0, or no gesture yet). */
  cue(event: CueEvent, after = 0): boolean {
    const { bus, voices } = CUES[event];
    return this.playAll(bus, voices, after, 'noise');
  }

  /** Plays `voices` from now through `bus`, `pan` across the stereo field when given. `vary` is how much a play
   * varies (#1574): in every voice, in the noise only (the tones of a cue keep the levels `cueDb` counts), or not at
   * all. False when silent: the bus at 0, or no gesture yet. */
  private playAll(bus: Bus, voices: readonly Voice[], after = 0, vary: 'all' | 'noise' | 'none' = 'none', pan?: number): boolean {
    const graph = this.graph;
    if (this.mix[bus] === 0 || !graph) return false;
    if (bus === 'effects') this.room(graph);
    const now = graph.ctx.currentTime + after;
    const draw = (): Shape =>
      vary === 'none'
        ? FLAT
        : { rate: 1 + (this.random() - 0.5) * PITCH_JITTER, level: 1 + (this.random() - 0.5) * LEVEL_JITTER, offset: this.random() * NOISE_SECONDS };
    const shape = draw();
    for (const voice of voices) {
      const varied = vary === 'all' || voice.source === 'noise';
      this.play(graph, graph.buses[bus], voice, now, varied ? shape : FLAT, pan);
    }
    return true;
  }

  /** The short room of the effects bus: the bus also feeds a convolver of a synthesized impulse, a decaying noise,
   * into the master. Built once, with the first effect, so a bus at 0 builds nothing. */
  private room(graph: Graph): void {
    if (graph.reverb) return;
    const { ctx, buses, master } = graph;
    const convolver = ctx.createConvolver();
    convolver.buffer = impulse(ctx, this.random);
    const wet = ctx.createGain();
    wet.gain.value = ROOM_WET;
    buses.effects.connect(convolver);
    convolver.connect(wet).connect(master);
    graph.reverb = convolver;
  }

  private play({ ctx, noise }: Graph, bus: GainNode, voice: Voice, now: number, shape: Shape = FLAT, pan?: number): AudioScheduledSourceNode {
    const from = now + voice.env[0]![0];
    const to = now + voice.env.at(-1)![0];
    let source: AudioScheduledSourceNode;
    let out: AudioNode;
    if (voice.source === 'noise') {
      const buffer = ctx.createBufferSource();
      buffer.buffer = noise;
      buffer.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = voice.filter.type;
      filter.Q.value = voice.filter.q;
      glide(filter.frequency, voice.filter.freq.map((f) => f * shape.rate) as [number, number], from, to);
      source = buffer;
      out = buffer.connect(filter);
    } else {
      const osc = ctx.createOscillator();
      osc.type = voice.source;
      glide(osc.frequency, voice.freq.map((f) => f * shape.rate) as [number, number], from, to);
      source = out = osc;
    }
    const gain = ctx.createGain();
    voice.env.forEach(([t, g], i) => {
      const value = Math.max(g * shape.level, SILENT);
      if (i === 0) gain.gain.setValueAtTime(value, now + t);
      else gain.gain.exponentialRampToValueAtTime(value, now + t);
    });
    if (pan === undefined) out.connect(gain).connect(bus);
    else {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      out.connect(gain).connect(panner).connect(bus);
    }
    (source as AudioBufferSourceNode).start(from, voice.source === 'noise' ? shape.offset : undefined); // a tone has no offset
    source.stop(to);
    return source;
  }
}

function glide(param: AudioParam, [a, b]: readonly [number, number], from: number, to: number): void {
  param.setValueAtTime(a, from);
  param.exponentialRampToValueAtTime(b, to);
}

/** Steady sines, started once with the context, each at its level into `out`. A slider at 0 silences them through
 * their bus. */
function startTones(ctx: AudioContext, tones: readonly HumTone[], out: AudioNode): void {
  for (const { freq, gain } of tones) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const level = ctx.createGain();
    level.gain.value = gain;
    osc.connect(level).connect(out);
    osc.start(ctx.currentTime);
  }
}

/** A gate between audio files and their bus, open (1) or closed (0). */
function gate(ctx: AudioContext, out: AudioNode, open: boolean): GainNode {
  const door = ctx.createGain();
  door.gain.value = open ? 1 : 0;
  door.connect(out);
  return door;
}

/** Looped audio tracks, started once with the context, each routed into `out`. */
function startTracks(ctx: AudioContext, tracks: readonly Track[], out: AudioNode): void {
  for (const { url, gain } of tracks) {
    const audio = new Audio(url);
    audio.loop = true;
    audio.volume = gain;
    ctx.createMediaElementSource(audio).connect(out);
    audio.play().catch(() => undefined);
  }
}

/** The length of the looped noise in seconds. */
const NOISE_SECONDS = 1;
/** One second of white noise, looped by every noise voice. */
function whiteNoise(ctx: AudioContext, random: () => number): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * NOISE_SECONDS, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1;
  return buffer;
}

/** The impulse of the room: white noise dying away to nothing over `ROOM_SECONDS`. */
function impulse(ctx: AudioContext, random: () => number): AudioBuffer {
  const length = Math.round(ctx.sampleRate * ROOM_SECONDS);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (random() * 2 - 1) * (1 - i / length) ** 3;
  return buffer;
}
