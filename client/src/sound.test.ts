import { describe, expect, it, vi } from 'vitest';
import { EJECT_MS, PUSH_MS, VOID_MS } from './eject';
import { CUE_AT, FX_LEVEL, HUM, SILENT, Sfx, cueFor, ejectionVoices, type Cue, type Voice } from './sound';

const PUSH = PUSH_MS / 1000;
const start = (v: Voice): number => v.env[0]![0];
const end = (v: Voice): number => v.env.at(-1)![0];
const peak = (v: Voice): number => Math.max(...v.env.map(([, g]) => g));
const freqs = (v: Voice): readonly number[] => (v.source === 'noise' ? v.filter.freq : v.freq);
const cues: Cue[] = ['toll', 'clack'];

describe('cueFor, world.md section 7', () => {
  it('tolls for a lost player glass marble (side 2, White)', () => {
    expect(cueFor(2)).toBe('toll');
  });
  it('clacks for a lost enemy shell (side 1, Black)', () => {
    expect(cueFor(1)).toBe('clack');
  });
  it('tolls for the glass side when the human is Black (side 1)', () => {
    expect(cueFor(1, 1)).toBe('toll');
    expect(cueFor(2, 1)).toBe('clack');
  });
});

describe('HUM, world.md section 7 ambience', () => {
  it('low steady sines, no melody: every tone one pitch under 90 Hz', () => {
    expect(HUM.length).toBeGreaterThanOrEqual(2);
    for (const tone of HUM) {
      expect(tone.freq).toBeGreaterThanOrEqual(30);
      expect(tone.freq).toBeLessThan(90);
    }
  });

  it('quiet under the effects: the tones together stay at a tenth of the full level or less', () => {
    for (const tone of HUM) expect(tone.gain).toBeGreaterThan(0);
    expect(HUM.reduce((sum, tone) => sum + tone.gain, 0)).toBeLessThanOrEqual(0.1);
  });
});

describe('ejectionVoices', () => {
  for (const cue of cues) {
    const voices = ejectionVoices(cue);
    const at = (t: number): Voice[] => voices.filter((v) => start(v) === t);

    it(`${cue}: every envelope starts and ends silent, moves forward in time, never above 1`, () => {
      for (const v of voices) {
        expect(v.env[0]![1]).toBe(0);
        expect(v.env.at(-1)![1]).toBe(0);
        v.env.slice(1).forEach(([t], i) => expect(t).toBeGreaterThan(v.env[i]![0]));
        for (const [, g] of v.env) expect(g).toBeGreaterThanOrEqual(0);
        expect(peak(v)).toBeLessThanOrEqual(1);
        for (const f of freqs(v)) expect(f).toBeGreaterThan(0); // exponential glides need a positive frequency
      }
    });

    it(`${cue}: three moments only, the push, the void taking the marble, and the marble gone`, () => {
      expect(new Set(voices.map(start))).toEqual(new Set([0, PUSH, CUE_AT]));
      expect(CUE_AT).toBeCloseTo(EJECT_MS / 1000);
    });

    it(`${cue}: a sharp inhale on the push over the rim, air rushing out, cut as the void takes it`, () => {
      const [inhale, ...rest] = at(0);
      expect(rest).toEqual([]);
      expect(inhale!.source).toBe('noise');
      expect(end(inhale!)).toBeCloseTo(PUSH);
      const [low, high] = freqs(inhale!);
      expect(high).toBeGreaterThan(low!); // the hiss rises
      const top = inhale!.env.find(([, g]) => g === peak(inhale!))![0];
      expect(top).toBeGreaterThan(PUSH / 2); // a swell that builds to the end of the push
      expect(PUSH - top).toBeLessThan(0.05); // then cut short
    });

    it(`${cue}: a muffled thud as the void takes it, low and short`, () => {
      const thud = at(PUSH);
      expect(thud.length).toBeGreaterThan(0);
      for (const v of thud) {
        expect(Math.max(...freqs(v))).toBeLessThan(400); // muffled: no bright part
        expect(end(v) - PUSH).toBeLessThanOrEqual(0.15);
      }
      expect(thud.some((v) => v.source !== 'noise' && Math.min(...freqs(v)) < 60)).toBe(true); // a body you feel
    });

    it(`${cue}: then vacuum silence while the marble falls, about 600 ms after the thud`, () => {
      const before = voices.filter((v) => start(v) < CUE_AT);
      const silence = CUE_AT - Math.max(...before.map(end));
      expect(silence).toBeGreaterThanOrEqual(0.45);
      expect(CUE_AT - PUSH).toBeCloseTo(VOID_MS / 1000);
    });
  }

  it('the toll is low, pure and rings out', () => {
    const toll = ejectionVoices('toll').filter((v) => start(v) === CUE_AT);
    expect(toll.length).toBeGreaterThan(1); // a bell: several partials
    for (const v of toll) expect(v.source).toBe('sine');
    expect(Math.min(...toll.flatMap(freqs))).toBeLessThan(150);
    expect(Math.max(...toll.map(end)) - CUE_AT).toBeGreaterThan(1);
    expect(Math.max(...toll.map(end)) - CUE_AT).toBeLessThan(2.5);
  });

  it('the clack is dry, bright and short', () => {
    const clack = ejectionVoices('clack').filter((v) => start(v) === CUE_AT);
    expect(clack.length).toBeGreaterThan(0);
    for (const v of clack) expect(end(v) - CUE_AT).toBeLessThanOrEqual(0.1);
    expect(clack.some((v) => v.source === 'noise' && v.filter.type === 'bandpass' && v.filter.freq[0]! > 1000)).toBe(true);
  });

  it('the inhale and the thud are the same for both, only the last note tells who lost a marble', () => {
    const shared = (cue: Cue): Voice[] => ejectionVoices(cue).filter((v) => start(v) < CUE_AT);
    expect(shared('toll')).toEqual(shared('clack'));
    const last = (cue: Cue): Voice[] => ejectionVoices(cue).filter((v) => start(v) === CUE_AT);
    expect(last('toll')).not.toEqual(last('clack'));
  });
});

// A fake AudioContext: every node records how it is wired and how its params are automated.
type Event = [method: string, value: number, time: number];
class FakeParam {
  value = 0;
  events: Event[] = [];
  setValueAtTime(v: number, t: number) {
    this.events.push(['set', v, t]);
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    this.events.push(['exp', v, t]);
  }
  setTargetAtTime(v: number, t: number, tau: number) {
    this.events.push(['target', v, t]);
    expect(tau).toBeGreaterThan(0);
  }
}
class FakeNode {
  outputs: FakeNode[] = [];
  connect<T extends FakeNode>(to: T): T {
    this.outputs.push(to);
    return to;
  }
}
class FakeGain extends FakeNode {
  gain = new FakeParam();
}
class FakeFilter extends FakeNode {
  type = '';
  Q = new FakeParam();
  frequency = new FakeParam();
}
class FakeSource extends FakeNode {
  times: number[] = [];
  start(t: number) {
    this.times.push(t);
  }
  stop(t: number) {
    this.times.push(t);
  }
}
class FakeOscillator extends FakeSource {
  type = '';
  frequency = new FakeParam();
}
class FakeBufferSource extends FakeSource {
  buffer: FakeBuffer | null = null;
  loop = false;
}
class FakeBuffer {
  data: Float32Array;
  constructor(
    public channels: number,
    length: number,
    public rate: number,
  ) {
    this.data = new Float32Array(length);
  }
  getChannelData(i: number) {
    expect(i).toBeLessThan(this.channels);
    return this.data;
  }
}
class FakeContext {
  currentTime = 5;
  sampleRate = 8000;
  destination = new FakeNode();
  sources: FakeSource[] = [];
  gains: FakeGain[] = [];
  buffers: FakeBuffer[] = [];
  resumed = 0;
  rejection: Promise<void> | null = null;
  constructor(
    public state: 'suspended' | 'running' = 'running',
    private failResume = false,
  ) {}
  resume() {
    this.resumed++;
    if (this.failResume) {
      this.rejection = Promise.reject(new Error('closed'));
      vi.spyOn(this.rejection, 'catch');
      return this.rejection;
    }
    this.state = 'running';
    return Promise.resolve();
  }
  createGain() {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createBiquadFilter() {
    return new FakeFilter();
  }
  createOscillator() {
    const o = new FakeOscillator();
    this.sources.push(o);
    return o;
  }
  createBufferSource() {
    const s = new FakeBufferSource();
    this.sources.push(s);
    return s;
  }
  createBuffer(channels: number, length: number, rate: number) {
    const b = new FakeBuffer(channels, length, rate);
    this.buffers.push(b);
    return b;
  }
}

function setup(on = true, ctx = new FakeContext()) {
  const make = vi.fn(() => ctx as unknown as AudioContext);
  return { ctx, make, sfx: new Sfx(make, on) };
}
/** The node after `node` on the way out, through its only output. */
const next = (node: FakeNode): FakeNode => {
  expect(node.outputs).toHaveLength(1);
  return node.outputs[0]!;
};

describe('Sfx, before a user gesture', () => {
  it('makes no audio context and stays silent: browsers block audio before a gesture', () => {
    const { make, sfx } = setup();
    expect(sfx.state).toBe('none');
    expect(sfx.ejection(2)).toBeNull();
    expect(make).not.toHaveBeenCalled();
  });
});

describe('Sfx.unlock, on a user gesture', () => {
  it('makes the context once, with one effects gain node into the speakers', () => {
    const { ctx, make, sfx } = setup();
    sfx.unlock();
    sfx.unlock();
    expect(make).toHaveBeenCalledTimes(1);
    expect(sfx.state).toBe('running');
    expect(ctx.gains).toHaveLength(1 + HUM.length); // the effects node, then one level per hum tone
    const [fx] = ctx.gains;
    expect(fx!.gain.value).toBe(FX_LEVEL);
    expect(next(fx!)).toBe(ctx.destination);
  });

  it('starts the hum with the context: one steady sine per tone, never stopped, under the effects node', () => {
    const { ctx, sfx } = setup();
    sfx.unlock();
    expect(ctx.sources).toHaveLength(HUM.length);
    HUM.forEach((tone, i) => {
      const osc = ctx.sources[i] as FakeOscillator;
      expect(osc.type).toBe('sine');
      expect(osc.frequency.value).toBe(tone.freq);
      expect(osc.times).toEqual([5]); // started now, no stop
      const level = next(osc) as FakeGain;
      expect(level.gain.value).toBe(tone.gain);
      expect(next(level)).toBe(ctx.gains[0]);
    });
  });

  it('reads the level: 0 before a context, the effects level once it runs', () => {
    const { sfx } = setup();
    expect(sfx.level).toBe(0);
    sfx.unlock();
    expect(sfx.level).toBe(FX_LEVEL);
  });

  it('resumes a context the browser started suspended, and only then', async () => {
    const { ctx, sfx } = setup(true, new FakeContext('suspended'));
    sfx.unlock();
    expect(ctx.resumed).toBe(1);
    await Promise.resolve();
    expect(sfx.state).toBe('running');
    sfx.unlock();
    expect(ctx.resumed).toBe(1);
  });

  it('swallows a failed resume: the game goes on, silent', async () => {
    const { ctx, sfx } = setup(true, new FakeContext('suspended', true));
    sfx.unlock();
    expect(ctx.resumed).toBe(1);
    expect(ctx.rejection!.catch).toHaveBeenCalled(); // handled: no unhandled rejection
    await new Promise((done) => setTimeout(done, 0));
    expect(sfx.state).toBe('suspended');
  });

  it('stays silent without Web Audio', () => {
    const sfx = new Sfx(() => null, true);
    sfx.unlock();
    expect(sfx.state).toBe('none');
    expect(sfx.ejection(2)).toBeNull();
  });

  it('does nothing while the sound is off: no context for a muted player', () => {
    const { make, sfx } = setup(false);
    sfx.unlock();
    expect(make).not.toHaveBeenCalled();
    expect(sfx.enabled).toBe(false);
  });
});

describe('Sfx.ejection', () => {
  for (const [side, cue] of [
    [2, 'toll'],
    [1, 'clack'],
  ] as const) {
    it(`side ${side}: plays every voice of the ${cue} once, from now, and says so`, () => {
      const { ctx, sfx } = setup();
      sfx.unlock();
      expect(sfx.ejection(side)).toBe(cue);
      const voices = ejectionVoices(cue);
      expect(ctx.sources).toHaveLength(HUM.length + voices.length);
      const fx = ctx.gains[0]!;
      voices.forEach((voice, i) => {
        const source = ctx.sources[HUM.length + i]!;
        expect(source.times).toEqual([5 + start(voice), 5 + end(voice)]);
        let node = next(source);
        if (voice.source === 'noise') {
          const s = source as FakeBufferSource;
          expect(s.buffer).toBe(ctx.buffers[0]);
          expect(s.loop).toBe(true);
          const filter = node as FakeFilter;
          expect(filter.type).toBe(voice.filter.type);
          expect(filter.Q.value).toBe(voice.filter.q);
          expect(filter.frequency.events).toEqual([
            ['set', voice.filter.freq[0], 5 + start(voice)],
            ['exp', voice.filter.freq[1], 5 + end(voice)],
          ]);
          node = next(filter);
        } else {
          const o = source as FakeOscillator;
          expect(o.type).toBe(voice.source);
          expect(o.frequency.events).toEqual([
            ['set', voice.freq[0], 5 + start(voice)],
            ['exp', voice.freq[1], 5 + end(voice)],
          ]);
        }
        const gain = node as FakeGain;
        expect(gain.gain.events).toEqual(
          voice.env.map(([t, g], j) => [j === 0 ? 'set' : 'exp', Math.max(g, SILENT), 5 + t]),
        );
        expect(next(gain)).toBe(fx); // every voice goes through the one effects node
      });
    });
  }

  it('makes one second of white noise, once, for every noise voice', () => {
    const { ctx, sfx } = setup();
    sfx.unlock();
    sfx.ejection(2);
    sfx.ejection(1);
    expect(ctx.buffers).toHaveLength(1);
    const [noise] = ctx.buffers;
    expect(noise!.channels).toBe(1);
    expect(noise!.data).toHaveLength(ctx.sampleRate);
    expect(noise!.rate).toBe(ctx.sampleRate);
    for (const s of noise!.data) expect(Math.abs(s)).toBeLessThanOrEqual(1);
    expect(new Set(noise!.data).size).toBeGreaterThan(ctx.sampleRate / 2);
  });

  it('a ramp never aims at 0, which an exponential ramp cannot reach', () => {
    expect(SILENT).toBeGreaterThan(0);
    expect(SILENT).toBeLessThan(0.001);
  });
});

describe('Sfx.setEnabled, the sound toggle', () => {
  it('off fades the effects node out at once, a ringing toll included, and plays nothing more', () => {
    const { ctx, sfx } = setup();
    sfx.unlock();
    sfx.ejection(2);
    const played = ctx.sources.length;
    ctx.currentTime = 6;
    sfx.setEnabled(false);
    expect(sfx.enabled).toBe(false);
    expect(ctx.gains[0]!.gain.events).toEqual([['target', 0, 6]]);
    expect(sfx.ejection(2)).toBeNull();
    expect(ctx.sources).toHaveLength(played);
  });

  it('back on fades the effects node in and plays again', () => {
    const { ctx, sfx } = setup();
    sfx.unlock();
    sfx.setEnabled(false);
    sfx.setEnabled(true);
    expect(ctx.gains[0]!.gain.events.at(-1)).toEqual(['target', FX_LEVEL, 5]);
    expect(sfx.ejection(1)).toBe('clack');
  });

  it('on from a muted start makes the context: the toggle click is a user gesture', () => {
    const { make, sfx } = setup(false);
    sfx.setEnabled(true);
    expect(make).toHaveBeenCalledTimes(1);
    expect(sfx.ejection(2)).toBe('toll');
  });

  it('off before any gesture makes nothing', () => {
    const { make, sfx } = setup();
    sfx.setEnabled(false);
    expect(make).not.toHaveBeenCalled();
    expect(sfx.state).toBe('none');
  });
});
