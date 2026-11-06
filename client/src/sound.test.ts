import { describe, expect, it, vi } from 'vitest';
import { EJECT_MS, PUSH_MS, VOID_MS } from './eject';
import { FakeBufferSource, FakeContext, FakeFilter, FakeGain, FakeNode, FakeOscillator } from './test/audio';
import {
  AFTER_EJECTION,
  AMBIENCE_TRACKS,
  BUSES,
  CROSSFADE_TAU,
  CUES,
  CUE_AT,
  CUE_FLOOR_DB,
  CUE_CEILING_DB,
  DUCKED,
  DUCK_DB,
  DUCK_TAU,
  HUM,
  MASTER_LEVEL,
  MUSIC_TRACK,
  ROUTE,
  SILENT,
  Sfx,
  SMALL_SPEAKER_HZ,
  TENSION,
  TellWatch,
  busGain,
  cueDb,
  cueFor,
  duckGains,
  ejectionVoices,
  knockPitch,
  knockVoices,
  PICK,
  layerGains,
  smallSpeakerDb,
  tellVoices,
  type Bus,
  type Cue,
  type CueEvent,
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
  it('low steady sines, no melody: two fundamentals under 90 Hz, any other tone a harmonic above 150 Hz', () => {
    expect(HUM.filter((tone) => tone.freq < 90).length).toBeGreaterThanOrEqual(2);
    for (const tone of HUM) {
      expect(tone.freq).toBeGreaterThanOrEqual(30);
      expect(tone.freq < 90 || tone.freq > SMALL_SPEAKER_HZ).toBe(true);
    }
  });

  it('is heard on a small speaker (#1572): at least -47 dBFS and at most -30 dBFS after the 150 Hz high-pass', () => {
    expect(smallSpeakerDb(HUM)).toBeGreaterThanOrEqual(-47);
    expect(smallSpeakerDb(HUM)).toBeLessThanOrEqual(-30);
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
        expect(tone.freq).toBeLessThan(400);
        expect(tone.gain).toBeGreaterThan(0);
      }
    }
  });

  it('every layer carries content above 150 Hz for laptop and phone speakers (#1572)', () => {
    for (const layer of TENSION) expect(layer.some((tone) => tone.freq > SMALL_SPEAKER_HZ)).toBe(true);
  });

  it('stays audible on a small speaker and still rises with the level (#1572, world.md section 7, Mix levels)', () => {
    const level = (n: number) => smallSpeakerDb(TENSION.slice(0, n).flat());
    expect(level(0)).toBe(-Infinity);
    expect(level(1)).toBeGreaterThanOrEqual(-44);
    expect(level(2)).toBeGreaterThanOrEqual(-40);
    expect(level(2) - level(1)).toBeGreaterThanOrEqual(3);
    expect(level(2)).toBeLessThanOrEqual(-30); // an undertone, not a new feature
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

describe('smallSpeakerDb, the level left on a laptop or phone speaker (#1572)', () => {
  it('is silent for no tone', () => {
    expect(smallSpeakerDb([])).toBe(-Infinity);
  });

  it('passes a tone far above the cutoff: a 1 kHz sine at gain 0.1 is the RMS of 0.1 times the master', () => {
    expect(smallSpeakerDb([{ freq: 1000, gain: 0.1 }])).toBeCloseTo(20 * Math.log10((0.1 * MASTER_LEVEL) / Math.SQRT2), 1);
  });

  it('is 3 dB down at the cutoff and about 40 dB down two decades below it (second-order high-pass)', () => {
    const at = (freq: number) => smallSpeakerDb([{ freq, gain: 0.1 }]);
    expect(at(1000) - at(SMALL_SPEAKER_HZ)).toBeCloseTo(3, 0);
    expect(at(1000) - at(SMALL_SPEAKER_HZ / 10)).toBeCloseTo(40, 0);
  });

  it('adds the power of the tones: two equal tones are 3 dB above one', () => {
    const one = smallSpeakerDb([{ freq: 400, gain: 0.05 }]);
    expect(smallSpeakerDb([{ freq: 400, gain: 0.05 }, { freq: 500, gain: 0.05 }]) - one).toBeCloseTo(3, 0);
  });
});

describe('the mix: four buses into one master (world.md section 7, Mix; #438)', () => {
  it('has the four sliders of the spec: music, ambience, effects, voice', () => {
    expect(BUSES).toEqual(['music', 'ambience', 'effects', 'voice']);
  });

  it('routes the hum to ambience, the drones to music, the knock, the ejection, the tells and the map pick to effects, the audio logs to voice', () => {
    expect(ROUTE).toEqual({ hum: 'ambience', tension: 'music', knock: 'effects', ejection: 'effects', tell: 'effects', pick: 'effects', log: 'voice' });
  });

  it('turns a slider percentage into a gain: 0 silent, 100 full', () => {
    expect(busGain(0)).toBe(0);
    expect(busGain(50)).toBe(0.5);
    expect(busGain(100)).toBe(1);
  });
});

describe('duckGains, music and ambience under an audio log (tech.md section 5.4, #514)', () => {
  it('ducks the music and the ambience, nothing else', () => {
    expect(DUCKED).toEqual(['music', 'ambience']);
  });

  it('leaves them at full gain while no log plays', () => {
    expect(duckGains(false)).toEqual([1, 1]);
  });

  it('lowers them by about 12 dB while a log plays', () => {
    expect(DUCK_DB).toBe(-12);
    for (const gain of duckGains(true)) expect(20 * Math.log10(gain)).toBeCloseTo(-12, 6);
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

describe('Sfx.pick, the sound of a node picked on the rogue-lite map (#1468)', () => {
  it('is a short soft rising blip, silent at both ends', () => {
    expect(PICK.length).toBeGreaterThan(0);
    expect(start(PICK[0]!)).toBe(0); // the second note follows at once
    for (const v of PICK) {
      expect(v.env[0]![1]).toBe(0);
      expect(v.env.at(-1)![1]).toBe(0);
      expect(end(v)).toBeLessThanOrEqual(0.3);
      expect(peak(v)).toBeLessThanOrEqual(0.5);
    }
    expect(JSON.stringify(PICK)).not.toBe(JSON.stringify(tellVoices('blip'))); // not the Overseer's
  });

  it('stays silent before a gesture, plays once the sound is on, and is silent with the effects at 0', () => {
    const { make, ctx, sfx } = setup();
    expect(sfx.pick()).toBe(false);
    expect(make).not.toHaveBeenCalled();
    sfx.unlock();
    const before = ctx.sources.length;
    expect(sfx.pick()).toBe(true);
    expect(ctx.sources.length).toBeGreaterThan(before);
    sfx.setVolume('effects', 0);
    const after = ctx.sources.length;
    expect(sfx.pick()).toBe(false);
    expect(ctx.sources.length).toBe(after);
  });
});

// #1570: the cue table of world.md section 7, one synthesized cue per event of the first slice.
const events = Object.keys(CUES) as CueEvent[];
describe('CUES, the cue table (world.md section 7, #1570)', () => {
  it('has the nineteen events of the table, the six of the first slice first', () => {
    expect(events).toEqual([
      'win', 'loss', 'phase', 'elimination', 'reward', 'click',
      'draw', 'turn-start', 'selection', 'illegal-move', 'boss-intro', 'boss-death', 'shop', 'relic', 'royale-round', 'step', 'pickup', 'time-of-day', 'online-join',
    ]);
  });

  it('puts every cue on the effects bus, the time of day on the ambience bus', () => {
    for (const event of events) expect(CUES[event].bus).toBe(event === 'time-of-day' ? 'ambience' : 'effects');
  });

  for (const event of events) {
    it(`${event}: a short synthesized cue, silent at both ends, moving forward in time, never above 0.5`, () => {
      const { voices } = CUES[event];
      expect(voices.length).toBeGreaterThan(0);
      for (const voice of voices) {
        expect(voice.env[0]![1]).toBe(0);
        expect(voice.env.at(-1)![1]).toBe(0);
        for (let i = 1; i < voice.env.length; i++) expect(voice.env[i]![0]).toBeGreaterThan(voice.env[i - 1]![0]);
        expect(peak(voice)).toBeLessThanOrEqual(0.5);
        expect(end(voice)).toBeLessThanOrEqual(1);
      }
      expect(Math.min(...voices.map(start))).toBe(0);
    });

    it(`${event}: carries a tone above ${SMALL_SPEAKER_HZ} Hz that a small speaker plays, between ${CUE_FLOOR_DB} and ${CUE_CEILING_DB} dBFS (#1572)`, () => {
      const tonal = CUES[event].voices.filter((voice) => voice.source !== 'noise');
      expect(tonal.some((voice) => Math.min(...freqs(voice)) > SMALL_SPEAKER_HZ)).toBe(true);
      expect(cueDb(CUES[event].voices)).toBeGreaterThanOrEqual(CUE_FLOOR_DB);
      expect(cueDb(CUES[event].voices)).toBeLessThanOrEqual(CUE_CEILING_DB);
    });
  }

  it('is dry and low-key, not a fanfare: no cue holds more than three voices (and none rings past a second, above)', () => {
    for (const event of events) expect(CUES[event].voices.length).toBeLessThanOrEqual(3);
  });

  it('gives each event its own sound, none the same as another cue, a tell, the pick or the knock', () => {
    const all = [...events.map((event) => CUES[event].voices), PICK, knockVoices(330), ...tells.map(tellVoices)].map((voices) => JSON.stringify(voices));
    expect(new Set(all).size).toBe(all.length);
  });

  it('the win rises and the loss falls, a ledger closing against a ledger struck', () => {
    const last = (event: CueEvent) => CUES[event].voices.filter((v) => v.source === 'sine').at(-1)!;
    const first = (event: CueEvent) => CUES[event].voices.find((v) => v.source === 'triangle')!;
    expect(freqs(last('win'))[0]!).toBeGreaterThan(freqs(first('win'))[0]!);
    expect(freqs(last('loss'))[0]!).toBeLessThan(freqs(first('loss'))[0]!);
  });

  it('the click and the three that come most often (selection, turn start, step) are the quietest of all: none of them above the click', () => {
    const level = (event: CueEvent) => cueDb(CUES[event].voices);
    const frequent: CueEvent[] = ['selection', 'turn-start', 'step'];
    for (const event of frequent) expect(level(event), event).toBeLessThanOrEqual(level('click'));
    for (const event of events) if (event !== 'click' && !frequent.includes(event)) expect(level('click'), event).toBeLessThan(level(event));
  });

  it('the draw is neither a win nor a loss: its note neither rises nor falls', () => {
    const [note, second] = CUES.draw.voices.filter((v) => v.source !== 'noise');
    expect(freqs(note!)[0]).toBe(freqs(note!)[1]);
    expect(freqs(second!)[0]).toBe(freqs(note!)[0]);
  });

  it('the illegal move is a dull reject, never a buzz: one short falling tone, under a quarter second, no sustain', () => {
    const tones = CUES['illegal-move'].voices.filter((v) => v.source !== 'noise');
    expect(tones).toHaveLength(1);
    const [from, to] = freqs(tones[0]!);
    expect(from!).toBeGreaterThan(to!);
    for (const voice of CUES['illegal-move'].voices) expect(end(voice)).toBeLessThanOrEqual(0.25);
  });

  it('the boss intro is short, under half a second, so that it does not stack with the tally line or the crossfade of the music', () => {
    for (const voice of CUES['boss-intro'].voices) expect(end(voice)).toBeLessThanOrEqual(0.5);
  });

  it('the boss death is heavier than the win it replaces: a longer fall than the stamp of a win, below the win in pitch', () => {
    const tone = (event: CueEvent) => CUES[event].voices.find((v) => v.source === 'triangle')!;
    expect(freqs(tone('boss-death'))[0]!).toBeLessThan(freqs(tone('win'))[0]!);
    expect(freqs(tone('boss-death'))[1]!).toBeLessThan(freqs(tone('boss-death'))[0]!);
  });

  it('the time of day is a slow soft swell, the only cue that does not strike: it rises before it falls', () => {
    for (const voice of CUES['time-of-day'].voices) {
      const top = voice.env.findIndex(([, g]) => g === peak(voice));
      expect(voice.env[top]![0]).toBeGreaterThan(0.1);
      expect(peak(voice)).toBeLessThanOrEqual(0.2);
    }
  });
});

describe('cueDb, the level of a cue on a small speaker (#1572, #1570)', () => {
  it('is silent for no voice and for noise alone: only the tones are counted, a floor that holds without the noise', () => {
    expect(cueDb([])).toBe(-Infinity);
    expect(cueDb([{ source: 'noise', filter: { type: 'lowpass', freq: [300, 120], q: 1 }, env: [[0, 0], [0.1, 0]] }])).toBe(-Infinity);
  });

  it('is the loudest tone by its peak: a sine at gain 0.1 and 1 kHz is smallSpeakerDb of that tone', () => {
    const sine = { source: 'sine', freq: [1000, 1000], env: [[0, 0], [0.01, 0.1], [0.2, 0]] } as const;
    expect(cueDb([sine])).toBeCloseTo(smallSpeakerDb([{ freq: 1000, gain: 0.1 }]), 6);
    expect(cueDb([sine, { ...sine, env: [[0, 0], [0.01, 0.05], [0.2, 0]] }])).toBeCloseTo(cueDb([sine]), 6);
  });

  it('takes the first harmonic of a triangle, 8/pi^2 of its peak, and the middle of a glide', () => {
    const triangle = { source: 'triangle', freq: [900, 1111.1], env: [[0, 0], [0.01, 0.1], [0.2, 0]] } as const;
    expect(cueDb([triangle])).toBeCloseTo(smallSpeakerDb([{ freq: 1000, gain: 0.1 * (8 / Math.PI ** 2) }]), 2);
  });

  it('drops a tone under the cutoff: a 60 Hz sine at gain 0.1 is under the floor', () => {
    expect(cueDb([{ source: 'sine', freq: [60, 60], env: [[0, 0], [0.01, 0.1], [0.2, 0]] }])).toBeLessThan(CUE_FLOOR_DB);
  });
});

describe('Sfx.cue, one call per event (#1570)', () => {
  it('stays silent before a gesture: no context, no cue', () => {
    const { make, sfx } = setup();
    expect(sfx.cue('click')).toBe(false);
    expect(make).not.toHaveBeenCalled();
  });

  for (const event of events) {
    it(`${event}: plays every voice from now through its bus, and says so`, () => {
      const { ctx, sfx } = setup();
      sfx.unlock();
      expect(sfx.cue(event)).toBe(true);
      const { voices } = CUES[event];
      expect(ctx.sources).toHaveLength(STEADY + voices.length);
      voices.forEach((voice, i) => {
        const source = ctx.sources[STEADY + i]!;
        expect(source.times).toEqual([5 + start(voice), 5 + end(voice)]);
        let node = next(source);
        if (voice.source === 'noise') node = next(node);
        expect(next(node)).toBe(bus(ctx, CUES[event].bus));
      });
    });

    it(`${event}: is silent with the slider of its bus (${CUES[event].bus}) at 0: no source, no cue`, () => {
      const { ctx, sfx } = setup();
      sfx.unlock();
      sfx.setVolume(CUES[event].bus, 0);
      const before = ctx.sources.length;
      expect(sfx.cue(event)).toBe(false);
      expect(ctx.sources.length).toBe(before);
    });
  }

  it('plays after a delay when asked: a cue that follows an ejection waits for its toll or clack', () => {
    const { ctx, sfx } = setup();
    sfx.unlock();
    expect(sfx.cue('win', AFTER_EJECTION)).toBe(true);
    expect(ctx.sources[STEADY]!.times[0]).toBeCloseTo(5 + AFTER_EJECTION + start(CUES.win.voices[0]!), 6);
    expect(AFTER_EJECTION).toBeGreaterThan(CUE_AT);
  });
});

// #358: every boss tell has a sound twin (world.md sections 3 and 8), short, played at once, one per tell.
const tells: Tell[] = ['crack', 'flip', 'choir', 'blip']; // blip: the Overseer typing a letter (#741)

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

const FULL: Mix = { music: 100, ambience: 100, effects: 100, voice: 100 };
const MUTED: Mix = { music: 0, ambience: 0, effects: 0, voice: 0 };
function setup(mix: Mix = FULL, ctx = new FakeContext()) {
  const make = vi.fn(() => ctx as unknown as AudioContext);
  return { ctx, make, sfx: new Sfx(make, { ...mix }) };
}
/** The graph is made master first, then the buses in their order. */
const master = (ctx: FakeContext): FakeGain => ctx.gains[0]!;
const bus = (ctx: FakeContext, b: Bus): FakeGain => ctx.gains[1 + BUSES.indexOf(b)]!;
/** The duck node a ducked bus goes through on its way to the master. */
const duck = (ctx: FakeContext, b: Bus): FakeGain => next(bus(ctx, b)) as FakeGain;
/** The steady sources started with the context: the hum, then the tension drones. */
const STEADY = HUM.length + TENSION.flat().length;
/** The gain of each tension layer into the music bus: not the gate of the song (#1571), which goes there too. */
const tensionLayers = (ctx: FakeContext): FakeGain[] => ctx.gains.filter((g) => g.outputs[0] === bus(ctx, ROUTE.tension) && !ctx.tracks.some((t) => t.outputs[0] === g));
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
      expect(DUCKED.includes(b) ? next(duck(ctx, b)) : next(bus(ctx, b))).toBe(master(ctx));
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

  it('starts the reactor room ambience tracks and the hauler music track looped on their buses', () => {
    const { ctx, sfx } = setup();
    sfx.unlock();
    expect(AMBIENCE_TRACKS.map((t) => t.url)).toEqual([
      'audio/reactor-room-tone-1.mp3',
      'audio/reactor-room-tone-2.mp3',
    ]);
    expect(MUSIC_TRACK.url).toBe('audio/dead-ore-hauler.mp3');
    expect(ctx.tracks).toHaveLength(AMBIENCE_TRACKS.length + 1);
    AMBIENCE_TRACKS.forEach((track, i) => {
      const node = ctx.tracks[i]!;
      expect(node.media.src).toBe(track.url);
      expect(node.media.loop).toBe(true);
      expect(node.media.volume).toBe(track.gain);
      expect(node.media.played).toBe(1);
      expect(next(next(node))).toBe(bus(ctx, ROUTE.hum)); // through the gate of the room tone (#1571)
    });
    const musicNode = ctx.tracks.at(-1)!;
    expect(musicNode.media.src).toBe(MUSIC_TRACK.url);
    expect(musicNode.media.loop).toBe(true);
    expect(musicNode.media.volume).toBe(MUSIC_TRACK.gain);
    expect(musicNode.media.played).toBe(1);
    expect(next(next(musicNode))).toBe(bus(ctx, ROUTE.tension)); // through the gate of the song (#1571)
  });

  it('starts the tension drones with the context, each layer through its own gain into the music bus, silent while calm', () => {
    const { ctx, sfx } = setup();
    sfx.unlock();
    expect(ctx.sources).toHaveLength(STEADY);
    const layers = tensionLayers(ctx);
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

  it('suspends the context while the page is hidden and resumes it once shown again (#728)', async () => {
    const { ctx, sfx } = setup();
    sfx.unlock();
    sfx.visible(false);
    expect(ctx.suspended).toBe(1);
    expect(sfx.state).toBe('suspended');
    sfx.visible(true);
    await Promise.resolve();
    expect(ctx.resumed).toBe(1);
    expect(sfx.state).toBe('running');
  });

  it('swallows a failed resume when the page is shown again (#728)', async () => {
    const { ctx, sfx } = setup(FULL, new FakeContext('running', true));
    sfx.unlock();
    sfx.visible(true);
    expect(ctx.resumed).toBe(1);
    await new Promise((done) => setTimeout(done, 0)); // no unhandled rejection
  });

  it('makes no context when the page is hidden or shown before any gesture (#728)', () => {
    const { make, sfx } = setup();
    sfx.visible(false);
    sfx.visible(true);
    expect(make).not.toHaveBeenCalled();
    expect(sfx.state).toBe('none');
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
    const layers = tensionLayers(ctx);
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
    expect(tensionLayers(ctx).map((l) => l.gain.events)).toEqual([[], []]);
  });

  it('starts calm', () => {
    expect(setup().sfx.tension).toBe(0);
  });
});

describe('Sfx.duck, an audio log lowers music and ambience (#514)', () => {
  it('starts every ducked bus through its own duck node at full gain, the effects and the voice never ducked', () => {
    const { ctx, sfx } = setup();
    sfx.unlock();
    for (const b of DUCKED) {
      expect(duck(ctx, b)).not.toBe(master(ctx));
      expect(duck(ctx, b).gain.value).toBe(1);
    }
    expect(next(bus(ctx, 'effects'))).toBe(master(ctx));
    expect(next(bus(ctx, 'voice'))).toBe(master(ctx));
  });

  it('ramps music and ambience down over about 300 ms while a log plays, then back up, the sliders untouched', () => {
    const { ctx, sfx } = setup();
    sfx.unlock();
    sfx.duck(true);
    const down = duckGains(true)[0]!;
    expect(DUCKED.map((b) => duck(ctx, b).gain.events)).toEqual([[['target', down, 5]], [['target', down, 5]]]);
    ctx.currentTime = 9;
    sfx.duck(false);
    expect(DUCKED.map((b) => duck(ctx, b).gain.events.at(-1))).toEqual([
      ['target', 1, 9],
      ['target', 1, 9],
    ]);
    for (const b of BUSES) expect(bus(ctx, b).gain.events).toEqual([]);
    expect(3 * DUCK_TAU).toBeGreaterThanOrEqual(0.25); // about 300 ms to settle
    expect(3 * DUCK_TAU).toBeLessThanOrEqual(0.35);
  });

  it('keeps the duck before a gesture, and the context starts the duck nodes at it', () => {
    const { ctx, sfx } = setup();
    sfx.duck(true);
    sfx.unlock();
    for (const b of DUCKED) {
      expect(duck(ctx, b).gain.value).toBe(duckGains(true)[0]);
      expect(duck(ctx, b).gain.events).toEqual([]);
    }
  });
});

describe('Sfx.playLog and Sfx.stopLog, an audio log on the voice bus (#516)', () => {
  const voices = knockVoices(330);
  /** The sources and their gains made since `from`, in order: each voice makes one of each. */
  const since = (ctx: FakeContext, sources: number, gains: number) => ({
    sources: ctx.sources.slice(sources),
    gains: ctx.gains.slice(gains),
  });

  it('plays every voice of the log from now through the voice bus, music and ambience ducked under it', () => {
    const { ctx, sfx } = setup();
    sfx.unlock();
    const [s0, g0] = [ctx.sources.length, ctx.gains.length];
    expect(sfx.playLog(voices)).toBe(true);
    const made = since(ctx, s0, g0);
    expect(made.sources).toHaveLength(voices.length);
    for (const gain of made.gains) expect(next(gain)).toBe(bus(ctx, ROUTE.log));
    expect(made.sources.map((s) => s.times[0])).toEqual(voices.map((v) => 5 + v.env[0]![0]));
    expect(sfx.ducking).toBe(true);
    expect(DUCKED.map((b) => duck(ctx, b).gain.events)).toEqual(DUCKED.map(() => [['target', duckGains(true)[0], 5]]));
  });

  it('stopLog stops every source of the log at once and brings music and ambience back', () => {
    const { ctx, sfx } = setup();
    sfx.unlock();
    const s0 = ctx.sources.length;
    sfx.playLog(voices);
    ctx.currentTime = 7;
    sfx.stopLog();
    for (const source of ctx.sources.slice(s0)) expect(source.times.at(-1)).toBe(7);
    expect(sfx.ducking).toBe(false);
    expect(DUCKED.map((b) => duck(ctx, b).gain.events.at(-1))).toEqual(DUCKED.map(() => ['target', 1, 7]));
    sfx.stopLog(); // nothing plays: nothing to stop
    for (const source of ctx.sources.slice(s0)) expect(source.times).toHaveLength(3);
  });

  it('a log started while another plays stops the first', () => {
    const { ctx, sfx } = setup();
    sfx.unlock();
    const s0 = ctx.sources.length;
    sfx.playLog(voices);
    ctx.currentTime = 6;
    sfx.playLog(voices);
    const [first, second] = [ctx.sources.slice(s0, s0 + voices.length), ctx.sources.slice(s0 + voices.length)];
    for (const source of first) expect(source.times.at(-1)).toBe(6);
    for (const source of second) expect(source.times).toHaveLength(2); // started and scheduled to end, not stopped
    expect(sfx.ducking).toBe(true);
  });

  it('is silent with the voice slider at 0 or before a gesture, and ducks all the same until stopLog', () => {
    const early = setup();
    expect(early.sfx.playLog(voices)).toBe(false);
    expect(early.make).not.toHaveBeenCalled();
    expect(early.sfx.ducking).toBe(true);
    const { ctx, sfx } = setup();
    sfx.unlock();
    sfx.setVolume('voice', 0);
    const before = ctx.sources.length;
    expect(sfx.playLog(voices)).toBe(false);
    expect(ctx.sources.length).toBe(before);
    expect(sfx.ducking).toBe(true);
    sfx.stopLog();
    expect(sfx.ducking).toBe(false);
  });
});
