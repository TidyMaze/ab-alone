import { describe, expect, it, vi } from 'vitest';
import { EJECT_MS, PUSH_MS, VOID_MS } from './eject';
import {
  BUSES,
  CROSSFADE_TAU,
  CUE_AT,
  HUM,
  MASTER_LEVEL,
  ROUTE,
  SILENT,
  Sfx,
  TENSION,
  TellWatch,
  busGain,
  cueFor,
  ejectionVoices,
  knockPitch,
  knockVoices,
  layerGains,
  tellVoices,
  type Bus,
  type Cue,
  type Mix,
  type Tell,
  type Voice,
} from './sound';

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

describe('TENSION, the drone tension layers (world.md section 7, Music; #439)', () => {
  it('two layers of steady low tones: drones, no melody, none in the knock or toll range', () => {
    expect(TENSION).toHaveLength(2);
    for (const layer of TENSION) {
      expect(layer.length).toBeGreaterThan(0);
      for (const tone of layer) {
        expect(tone.freq).toBeGreaterThanOrEqual(30);
        expect(tone.freq).toBeLessThan(200);
        expect(tone.gain).toBeGreaterThan(0);
      }
    }
  });

  it('as quiet as the hum: each layer at a tenth of the full level or less', () => {
    for (const layer of TENSION) expect(layer.reduce((sum, tone) => sum + tone.gain, 0)).toBeLessThanOrEqual(0.1);
  });

  it('level 0 plays no layer, 1 the first, 2 both', () => {
    expect(layerGains(0)).toEqual([0, 0]);
    expect(layerGains(1)).toEqual([1, 0]);
    expect(layerGains(2)).toEqual([1, 1]);
  });
});

describe('the mix: four buses into one master (world.md section 7, Mix; #438)', () => {
  it('has the four sliders of the spec: music, ambience, effects, voice', () => {
    expect(BUSES).toEqual(['music', 'ambience', 'effects', 'voice']);
  });

  it('routes the hum to ambience, the drones to music, the knock, the ejection and the tells to effects', () => {
    expect(ROUTE).toEqual({ hum: 'ambience', tension: 'music', knock: 'effects', ejection: 'effects', tell: 'effects' });
  });

  it('turns a slider percentage into a gain: 0 silent, 100 full', () => {
    expect(busGain(0)).toBe(0);
    expect(busGain(50)).toBe(0.5);
    expect(busGain(100)).toBe(1);
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

describe('knockPitch, the knock of a move (#289)', () => {
  it('one, two or three marbles give three pitches, lower for more marbles', () => {
    const pitches = ([1, 2, 3] as const).map(knockPitch);
    expect(new Set(pitches).size).toBe(3);
    expect(pitches[0]).toBeGreaterThan(pitches[1]!);
    expect(pitches[1]).toBeGreaterThan(pitches[2]!);
  });

  it('a dull low knock: every pitch between 100 and 500 Hz', () => {
    for (const n of [1, 2, 3] as const) {
      expect(knockPitch(n)).toBeGreaterThan(100);
      expect(knockPitch(n)).toBeLessThan(500);
    }
  });
});

describe('knockVoices', () => {
  for (const n of [1, 2, 3] as const) {
    it(`${n} marble(s): one hit at the move, silent at both ends, short, never above 1`, () => {
      const voices = knockVoices(knockPitch(n));
      expect(voices.length).toBeGreaterThan(1);
      for (const v of voices) {
        expect(start(v)).toBe(0);
        expect(v.env[0]![1]).toBe(0);
        expect(v.env.at(-1)![1]).toBe(0);
        expect(end(v)).toBeLessThanOrEqual(0.2);
        expect(peak(v)).toBeLessThanOrEqual(1);
        for (const f of freqs(v)) expect(f).toBeGreaterThan(0);
      }
    });
  }
});

describe('Sfx.knock, the move sound', () => {
  it('stays silent before a gesture: no context, no knock', () => {
    const { make, sfx } = setup();
    expect(sfx.knock(1)).toBeNull();
    expect(make).not.toHaveBeenCalled();
  });

  it('plays the knock of its pitch once the sound is on, and reports that pitch', () => {
    const { ctx, sfx } = setup();
    sfx.unlock();
    const before = ctx.sources.length;
    expect(sfx.knock(3)).toBe(knockPitch(3));
    expect(ctx.sources.length).toBeGreaterThan(before);
  });

  it('is silent with the effects slider at 0: no source, no report', () => {
    const { ctx, sfx } = setup();
    sfx.unlock();
    sfx.setVolume('effects', 0);
    const before = ctx.sources.length;
    expect(sfx.knock(2)).toBeNull();
    expect(ctx.sources.length).toBe(before);
  });
});

// #358: every boss tell has a sound twin (world.md sections 3 and 8), short, played at once, one per tell.
const tells: Tell[] = ['crack', 'flip', 'choir'];

describe('tellVoices, the sound twins of the boss tells', () => {
  for (const tell of tells) {
    it(`${tell}: plays at once, silent at both ends, short, never above 1`, () => {
      const voices = tellVoices(tell);
      expect(voices.length).toBeGreaterThan(0);
      for (const v of voices) {
        expect(start(v)).toBe(0);
        expect(v.env[0]![1]).toBe(0);
        expect(v.env.at(-1)![1]).toBe(0);
        v.env.slice(1).forEach(([t], i) => expect(t).toBeGreaterThan(v.env[i]![0]));
        expect(end(v)).toBeLessThanOrEqual(1);
        expect(peak(v)).toBeLessThanOrEqual(1);
        for (const f of freqs(v)) expect(f).toBeGreaterThan(0);
      }
    });
  }

  it('each tell has its own sound, none the same as another', () => {
    const sounds = tells.map((t) => JSON.stringify(tellVoices(t)));
    expect(new Set(sounds).size).toBe(tells.length);
  });

  it("The Hull's crack: a low groan of the frame with a splinter of noise", () => {
    const voices = tellVoices('crack');
    expect(Math.min(...voices.flatMap(freqs))).toBeLessThan(150);
    expect(voices.some((v) => v.source === 'noise')).toBe(true);
  });

  it("The Chaplain's flip: a small high bell, pure sines only", () => {
    const voices = tellVoices('flip');
    for (const v of voices) expect(v.source).toBe('sine');
    expect(Math.min(...voices.flatMap(freqs))).toBeGreaterThan(1000);
  });

  it("The Choir's next army: hummed voices that swell, not a hit", () => {
    const voices = tellVoices('choir');
    expect(voices.length).toBeGreaterThan(1); // several voices
    for (const v of voices) {
      expect(v.source).toBe('sine');
      expect(v.env.find(([, g]) => g === peak(v))![0]).toBeGreaterThanOrEqual(0.05);
    }
  });
});

describe('TellWatch, a tell sounds only when it appears or changes', () => {
  it('sounds a tell that appears, not again while it stays the same', () => {
    const watch = new TellWatch();
    expect(watch.changed('crack', [{ cell: [3, 0], left: 2 }])).toBe(true);
    expect(watch.changed('crack', [{ cell: [3, 0], left: 2 }])).toBe(false);
  });

  it('sounds a tell that changes: a crack ticks down, another army is next', () => {
    const watch = new TellWatch();
    watch.changed('crack', [{ cell: [3, 0], left: 2 }]);
    expect(watch.changed('crack', [{ cell: [3, 0], left: 1 }])).toBe(true);
    watch.changed('choir', [0]);
    expect(watch.changed('choir', [1])).toBe(true);
  });

  it('is silent when no tell shows, or when one goes away, and sounds it again when it comes back', () => {
    const watch = new TellWatch();
    expect(watch.changed('flip', [])).toBe(false);
    watch.changed('flip', [[1, 1]]);
    expect(watch.changed('flip', [])).toBe(false);
    expect(watch.changed('flip', [[1, 1]])).toBe(true);
  });

  it('keeps each tell apart', () => {
    const watch = new TellWatch();
    watch.changed('choir', [0]);
    expect(watch.changed('flip', [0])).toBe(true);
    expect(watch.changed('choir', [0])).toBe(false);
  });
});

describe('Sfx.tell, the sound twin of a boss tell', () => {
  it('stays silent before a gesture: no context, no cue', () => {
    const { make, sfx } = setup();
    expect(sfx.tell('crack')).toBeNull();
    expect(make).not.toHaveBeenCalled();
  });

  for (const tell of tells) {
    it(`${tell}: plays every voice from now through the effects bus, and says so`, () => {
      const { ctx, sfx } = setup();
      sfx.unlock();
      expect(sfx.tell(tell)).toBe(tell);
      const voices = tellVoices(tell);
      expect(ctx.sources).toHaveLength(STEADY + voices.length);
      voices.forEach((voice, i) => {
        const source = ctx.sources[STEADY + i]!;
        expect(source.times).toEqual([5, 5 + end(voice)]);
        let node = next(source);
        if (voice.source === 'noise') node = next(node); // through its filter
        expect(next(node)).toBe(bus(ctx, 'effects')); // its envelope, then the effects bus
      });
    });
  }

  it('is silent with the effects slider at 0: no source, no cue', () => {
    const { ctx, sfx } = setup();
    sfx.unlock();
    sfx.setVolume('effects', 0);
    const before = ctx.sources.length;
    expect(sfx.tell('choir')).toBeNull();
    expect(ctx.sources.length).toBe(before);
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

const FULL: Mix = { music: 100, ambience: 100, effects: 100, voice: 100 };
const MUTED: Mix = { music: 0, ambience: 0, effects: 0, voice: 0 };
function setup(mix: Mix = FULL, ctx = new FakeContext()) {
  const make = vi.fn(() => ctx as unknown as AudioContext);
  return { ctx, make, sfx: new Sfx(make, { ...mix }) };
}
/** The graph is made master first, then the buses in their order. */
const master = (ctx: FakeContext): FakeGain => ctx.gains[0]!;
const bus = (ctx: FakeContext, b: Bus): FakeGain => ctx.gains[1 + BUSES.indexOf(b)]!;
/** The steady sources started with the context: the hum, then the tension drones. */
const STEADY = HUM.length + TENSION.flat().length;
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
  it('makes the context once: a master gain into the speakers, four bus gains into it, each at its slider', () => {
    const { ctx, make, sfx } = setup({ music: 20, ambience: 40, effects: 60, voice: 80 });
    sfx.unlock();
    sfx.unlock();
    expect(make).toHaveBeenCalledTimes(1);
    expect(sfx.state).toBe('running');
    expect(master(ctx).gain.value).toBe(MASTER_LEVEL);
    expect(next(master(ctx))).toBe(ctx.destination);
    for (const b of BUSES) {
      expect(next(bus(ctx, b))).toBe(master(ctx));
      expect(bus(ctx, b).gain.value).toBe(busGain(sfx.volume(b)));
      expect(sfx.gain(b)).toBe(busGain(sfx.volume(b)));
    }
    expect(sfx.volume('music')).toBe(20);
  });

  it('starts the hum with the context: one steady sine per tone, never stopped, under the ambience bus', () => {
    const { ctx, sfx } = setup();
    sfx.unlock();
    HUM.forEach((tone, i) => {
      const osc = ctx.sources[i] as FakeOscillator;
      expect(osc.type).toBe('sine');
      expect(osc.frequency.value).toBe(tone.freq);
      expect(osc.times).toEqual([5]); // started now, no stop
      const level = next(osc) as FakeGain;
      expect(level.gain.value).toBe(tone.gain);
      expect(next(level)).toBe(bus(ctx, ROUTE.hum));
    });
  });

  it('starts the tension drones with the context, each layer through its own gain into the music bus, silent while calm', () => {
    const { ctx, sfx } = setup();
    sfx.unlock();
    expect(ctx.sources).toHaveLength(STEADY);
    const layers = ctx.gains.filter((g) => g.outputs[0] === bus(ctx, ROUTE.tension));
    expect(layers).toHaveLength(TENSION.length);
    let s = HUM.length;
    TENSION.forEach((tones, i) => {
      expect(layers[i]!.gain.value).toBe(0);
      for (const tone of tones) {
        const osc = ctx.sources[s++] as FakeOscillator;
        expect(osc.type).toBe('sine');
        expect(osc.frequency.value).toBe(tone.freq);
        expect(osc.times).toEqual([5]);
        const level = next(osc) as FakeGain;
        expect(level.gain.value).toBe(tone.gain);
        expect(next(level)).toBe(layers[i]);
      }
    });
    expect(sfx.layers).toEqual([0, 0]);
  });

  it('reads the gains: 0 before a context, the bus and layer gains once it runs', () => {
    const { sfx } = setup();
    expect(sfx.gain('effects')).toBe(0);
    expect(sfx.layers).toEqual([0, 0]);
    sfx.unlock();
    expect(sfx.gain('effects')).toBe(1);
  });

  it('resumes a context the browser started suspended, and only then', async () => {
    const { ctx, sfx } = setup(FULL, new FakeContext('suspended'));
    sfx.unlock();
    expect(ctx.resumed).toBe(1);
    await Promise.resolve();
    expect(sfx.state).toBe('running');
    sfx.unlock();
    expect(ctx.resumed).toBe(1);
  });

  it('swallows a failed resume: the game goes on, silent', async () => {
    const { ctx, sfx } = setup(FULL, new FakeContext('suspended', true));
    sfx.unlock();
    expect(ctx.resumed).toBe(1);
    expect(ctx.rejection!.catch).toHaveBeenCalled(); // handled: no unhandled rejection
    await new Promise((done) => setTimeout(done, 0));
    expect(sfx.state).toBe('suspended');
  });

  it('stays silent without Web Audio', () => {
    const sfx = new Sfx(() => null, { ...FULL });
    sfx.unlock();
    expect(sfx.state).toBe('none');
    expect(sfx.ejection(2)).toBeNull();
  });

  it('does nothing while every slider is at 0: no context for a muted player', () => {
    const { make, sfx } = setup(MUTED);
    sfx.unlock();
    expect(make).not.toHaveBeenCalled();
    for (const b of BUSES) expect(sfx.volume(b)).toBe(0);
  });

  it('makes the context while any one slider is above 0', () => {
    const { make, sfx } = setup({ ...MUTED, voice: 10 });
    sfx.unlock();
    expect(make).toHaveBeenCalledTimes(1);
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
      expect(ctx.sources).toHaveLength(STEADY + voices.length);
      const fx = bus(ctx, ROUTE.ejection);
      voices.forEach((voice, i) => {
        const source = ctx.sources[STEADY + i]!;
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
        expect(next(gain)).toBe(fx); // every voice goes through the effects bus
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

describe('Sfx.setVolume, a slider', () => {
  it('0 fades its bus out at once, a ringing toll included, and plays nothing more through it', () => {
    const { ctx, sfx } = setup();
    sfx.unlock();
    sfx.ejection(2);
    const played = ctx.sources.length;
    ctx.currentTime = 6;
    sfx.setVolume('effects', 0);
    expect(sfx.volume('effects')).toBe(0);
    expect(bus(ctx, 'effects').gain.events).toEqual([['target', 0, 6]]);
    expect(sfx.ejection(2)).toBeNull();
    expect(ctx.sources).toHaveLength(played);
  });

  it('moves only its own bus, to its gain', () => {
    const { ctx, sfx } = setup();
    sfx.unlock();
    sfx.setVolume('music', 30);
    expect(bus(ctx, 'music').gain.events).toEqual([['target', 0.3, 5]]);
    for (const b of BUSES.filter((b) => b !== 'music')) expect(bus(ctx, b).gain.events).toEqual([]);
  });

  it('back above 0 fades the bus in and plays again', () => {
    const { ctx, sfx } = setup();
    sfx.unlock();
    sfx.setVolume('effects', 0);
    sfx.setVolume('effects', 100);
    expect(bus(ctx, 'effects').gain.events.at(-1)).toEqual(['target', 1, 5]);
    expect(sfx.ejection(1)).toBe('clack');
  });

  it('above 0 from a muted start makes the context: moving a slider is a user gesture', () => {
    const { make, sfx } = setup(MUTED);
    sfx.setVolume('effects', 50);
    expect(make).toHaveBeenCalledTimes(1);
    expect(sfx.ejection(2)).toBe('toll');
  });

  it('a slider of another bus at 0 leaves the effects playing', () => {
    const { sfx } = setup();
    sfx.unlock();
    sfx.setVolume('music', 0);
    sfx.setVolume('ambience', 0);
    expect(sfx.knock(1)).toBe(knockPitch(1));
  });

  it('0 before any gesture makes nothing', () => {
    const { make, sfx } = setup({ ...MUTED, effects: 100 });
    sfx.setVolume('effects', 0);
    expect(make).not.toHaveBeenCalled();
    expect(sfx.state).toBe('none');
  });
});

describe('Sfx.setTension, the drone layers crossfade on the tension level (#439)', () => {
  it('crossfades each layer to its gain at the new level over about a second', () => {
    const { ctx, sfx } = setup();
    sfx.unlock();
    const layers = ctx.gains.filter((g) => g.outputs[0] === bus(ctx, ROUTE.tension));
    sfx.setTension(1);
    expect(sfx.tension).toBe(1);
    expect(layers.map((l) => l.gain.events)).toEqual([[['target', 1, 5]], [['target', 0, 5]]]);
    ctx.currentTime = 7;
    sfx.setTension(2);
    expect(layers.map((l) => l.gain.events.at(-1))).toEqual([
      ['target', 1, 7],
      ['target', 1, 7],
    ]);
    expect(3 * CROSSFADE_TAU).toBeGreaterThanOrEqual(0.5); // about a second to settle
    expect(3 * CROSSFADE_TAU).toBeLessThanOrEqual(1.5);
  });

  it('keeps the level before a gesture, and the context starts the layers at it', () => {
    const { ctx, sfx } = setup();
    sfx.setTension(2);
    expect(sfx.tension).toBe(2);
    expect(sfx.layers).toEqual([0, 0]); // no context yet: silent
    sfx.unlock();
    expect(sfx.layers).toEqual([1, 1]);
    expect(ctx.gains.filter((g) => g.outputs[0] === bus(ctx, ROUTE.tension)).map((l) => l.gain.events)).toEqual([[], []]);
  });

  it('starts calm', () => {
    expect(setup().sfx.tension).toBe(0);
  });
});
