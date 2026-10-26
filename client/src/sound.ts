// The sounds of the game, docs/specs/world.md section 7, synthesized with Web Audio: no audio file,
// nothing fetched. The design is data (the cue per side, the voices and their envelopes, the steady tones of
// the hum and the tension drones), played by a thin wrapper through four bus gains, music, ambience, effects
// and voice, into one master gain (#438), music and ambience through a duck node that lowers them under an audio
// log (#514), the audio logs through the voice bus (#516). The ejection follows the ejection effect of eject.ts: a sharp inhale on the push over the rim, a
// muffled thud as the void takes the marble, vacuum silence while it falls, then, once it is gone, a low toll for a
// lost player marble or a dry clack for an enemy one. The boss tells have their sound twins too (#358).

import { EJECT_MS, PUSH_MS } from './eject';
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

/** The knock of a move: a short glass-on-steel hit, a bright click over a dull body, no tail. */
export function knockVoices(pitch: number): Voice[] {
  return [
    { source: 'triangle', freq: [pitch, pitch * 0.9], env: strike(0, 0.6, 0.12) },
    { source: 'noise', filter: { type: 'bandpass', freq: [pitch * 6, pitch * 4], q: 3 }, env: strike(0, 0.3, 0.02) },
  ];
}

/** A boss tell with a sound twin (world.md sections 3 and 8, #358): The Hull's crack countdown, The Chaplain's
 * flip tell, The Choir's next army. */
export type Tell = 'crack' | 'flip' | 'choir';

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
 * tells effects, the audio logs voice (#516). */
export const ROUTE = {
  hum: 'ambience',
  tension: 'music',
  knock: 'effects',
  ejection: 'effects',
  tell: 'effects',
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
/** The hum under every game (world.md section 7): two low sines a fifth apart, no melody, quiet. */
export const HUM: readonly HumTone[] = [
  { freq: 55, gain: 0.03 },
  { freq: 82.4, gain: 0.02 },
];
/** The two drone tension layers under the hum (world.md section 7, Music; #439): steady tones, no melody. */
export const TENSION: readonly (readonly HumTone[])[] = [
  // Unease: a minor second over the hum's root, two sines a hair apart that beat slowly.
  [
    { freq: 58.3, gain: 0.02 },
    { freq: 58.8, gain: 0.02 },
  ],
  // Dread: the tritone over the root and its octave, thin and cold.
  [
    { freq: 77.8, gain: 0.015 },
    { freq: 155.6, gain: 0.008 },
  ],
];
/** The gain of each tension layer at `level`: level n plays the first n layers. */
export const layerGains = (level: Tension): number[] => TENSION.map((_, i) => (i < level ? 1 : 0));

interface Graph {
  ctx: AudioContext;
  buses: Record<Bus, GainNode>;
  layers: GainNode[];
  ducks: GainNode[];
  noise: AudioBuffer;
}

/** The sound player. The audio context is made on the first user gesture (browsers block audio before one), only
 * while a slider is above 0. */
export class Sfx {
  private graph: Graph | null = null;
  private level: Tension = 0;
  private ducked = false;
  private log: AudioScheduledSourceNode[] = []; // the sources of the audio log playing

  constructor(
    private readonly create: () => AudioContext | null,
    private readonly mix: Mix,
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
      startTones(ctx, HUM, buses[ROUTE.hum]);
      const layers = TENSION.map((tones, i) => {
        const layer = ctx.createGain();
        layer.gain.value = layerGains(this.level)[i]!;
        layer.connect(buses[ROUTE.tension]);
        startTones(ctx, tones, layer);
        return layer;
      });
      this.graph = { ctx, buses, layers, ducks, noise: whiteNoise(ctx) };
    }
    if (this.graph.ctx.state === 'suspended') this.graph.ctx.resume().catch(() => undefined);
  }

  /** A slider, itself a user gesture: fades `bus` to `percent`, 0 silences what still rings through it. */
  setVolume(bus: Bus, percent: number): void {
    this.mix[bus] = percent;
    this.graph?.buses[bus].gain.setTargetAtTime(busGain(percent), this.graph.ctx.currentTime, SLIDER_TAU);
    this.unlock();
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
    return this.playAll(ROUTE.ejection, ejectionVoices(cue)) ? cue : null;
  }

  /** Plays the knock of a move that pushes `marbles` from now. Its pitch, or null when silent (effects at 0, or no
   * gesture yet). */
  knock(marbles: number): number | null {
    const pitch = knockPitch(marbles);
    return this.playAll(ROUTE.knock, knockVoices(pitch)) ? pitch : null;
  }

  /** Plays the sound twin of `tell` from now. The tell, or null when silent (effects at 0, or no gesture yet). */
  tell(tell: Tell): Tell | null {
    return this.playAll(ROUTE.tell, tellVoices(tell)) ? tell : null;
  }

  /** Plays `voices` from now through `bus`. False when silent: the bus at 0, or no gesture yet. */
  private playAll(bus: Bus, voices: Voice[]): boolean {
    if (this.mix[bus] === 0 || !this.graph) return false;
    const now = this.graph.ctx.currentTime;
    for (const voice of voices) this.play(this.graph, this.graph.buses[bus], voice, now);
    return true;
  }

  private play({ ctx, noise }: Graph, bus: GainNode, voice: Voice, now: number): AudioScheduledSourceNode {
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
      glide(filter.frequency, voice.filter.freq, from, to);
      source = buffer;
      out = buffer.connect(filter);
    } else {
      const osc = ctx.createOscillator();
      osc.type = voice.source;
      glide(osc.frequency, voice.freq, from, to);
      source = out = osc;
    }
    const gain = ctx.createGain();
    voice.env.forEach(([t, g], i) => {
      const value = Math.max(g, SILENT);
      if (i === 0) gain.gain.setValueAtTime(value, now + t);
      else gain.gain.exponentialRampToValueAtTime(value, now + t);
    });
    out.connect(gain).connect(bus);
    source.start(from);
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

/** One second of white noise, looped by every noise voice. */
function whiteNoise(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}
