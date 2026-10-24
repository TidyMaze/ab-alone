// The ejection sound, docs/specs/world.md section 7, synthesized with Web Audio: no audio file,
// nothing fetched. The design is data (the cue per side, the voices and their envelopes), played by a
// thin wrapper through one effects gain node. Its times follow the ejection effect of eject.ts: a
// sharp inhale on the push over the rim, a muffled thud as the void takes the marble, vacuum silence
// while it falls, then, once it is gone, a low toll for a lost player marble or a dry clack for an
// enemy one.

import { EJECT_MS, PUSH_MS } from './eject';

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

/** The gain of the effects node while the sound is on. */
export const FX_LEVEL = 0.8;
/** Where the envelopes start and end: an exponential ramp cannot reach 0. */
export const SILENT = 0.0001;
/** The toggle fades the effects node over about 20 ms: a cut would click. */
const TOGGLE_TAU = 0.007;

interface Graph {
  ctx: AudioContext;
  fx: GainNode;
  noise: AudioBuffer;
}

/** The effects player. The audio context is made on the first user gesture (browsers block audio
 * before one), only while the sound is on. */
export class Sfx {
  private graph: Graph | null = null;

  constructor(
    private readonly create: () => AudioContext | null,
    private on: boolean,
  ) {}

  get enabled(): boolean {
    return this.on;
  }

  /** 'none' until a context exists, then its state. */
  get state(): AudioContextState | 'none' {
    return this.graph?.ctx.state ?? 'none';
  }

  /** Called on every user gesture: makes the context the first time, resumes it while suspended. */
  unlock(): void {
    if (!this.on) return;
    if (!this.graph) {
      const ctx = this.create();
      if (!ctx) return;
      const fx = ctx.createGain();
      fx.gain.value = FX_LEVEL;
      fx.connect(ctx.destination);
      this.graph = { ctx, fx, noise: whiteNoise(ctx) };
    }
    if (this.graph.ctx.state === 'suspended') this.graph.ctx.resume().catch(() => undefined);
  }

  /** The sound toggle, itself a user gesture. Off fades out what is still ringing. */
  setEnabled(on: boolean): void {
    this.on = on;
    this.graph?.fx.gain.setTargetAtTime(on ? FX_LEVEL : 0, this.graph.ctx.currentTime, TOGGLE_TAU);
    this.unlock();
  }

  /** Plays the ejection of a marble of `side` from now. Its cue, or null when silent (sound off, or
   * no gesture yet). */
  ejection(side: number, glass = 2): Cue | null {
    if (!this.on || !this.graph) return null;
    const cue = cueFor(side, glass);
    const now = this.graph.ctx.currentTime;
    for (const voice of ejectionVoices(cue)) this.play(this.graph, voice, now);
    return cue;
  }

  private play({ ctx, fx, noise }: Graph, voice: Voice, now: number): void {
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
    out.connect(gain).connect(fx);
    source.start(from);
    source.stop(to);
  }
}

function glide(param: AudioParam, [a, b]: readonly [number, number], from: number, to: number): void {
  param.setValueAtTime(a, from);
  param.exponentialRampToValueAtTime(b, to);
}

/** One second of white noise, looped by every noise voice. */
function whiteNoise(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}
