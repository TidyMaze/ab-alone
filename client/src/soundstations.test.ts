import { describe, expect, it } from 'vitest';
import { MAX_STATIONS, STATION_KINDS, STATION_RANGE, STATION_TONES, stationGain, type Source } from './stations';
import { BUSES, CROSSFADE_TAU, SCENE_RELEASE, Sfx, stationDb, type Bus, type Mix } from './sound';
import { FakeContext, type FakeGain, type FakeOscillator } from './test/audio';

// The sounding stations (#1577, world.md section 7, Spatial): a quiet loop per station near the listener on the ambience bus, a
// stereo pan and a distance gain, at most MAX_STATIONS live. A fake context records the wiring; nobody can listen here.
const FULL: Mix = { music: 100, ambience: 100, effects: 100, voice: 100 };
const HERE = { x: 0, z: 0, yaw: 0 };
const at = (id: string, x: number, z: number, kind: Source['kind'] = 'terminal'): Source => ({ id, kind, x, z });
function setup(mix: Mix = FULL) {
  const ctx = new FakeContext();
  const sfx = new Sfx(() => ctx as unknown as AudioContext, { ...mix });
  return { ctx, sfx };
}
const bus = (ctx: FakeContext, b: Bus): FakeGain => ctx.gains[1 + BUSES.indexOf(b)]!;
const oscillators = (ctx: FakeContext): FakeOscillator[] => ctx.sources.filter((s): s is FakeOscillator => 'frequency' in s);

describe('Sfx.listen, the stations near the listener', () => {
  it('makes no context and no node before the first gesture', () => {
    const { ctx, sfx } = setup();
    sfx.listen(HERE, [at('a', 1, 0)]);
    expect(sfx.state).toBe('none');
    expect(sfx.stations).toEqual([]);
    expect(ctx.sources).toHaveLength(0);
  });

  it('builds a loop per station heard, its tones, a stereo panner and a gain into the ambience bus', () => {
    const { ctx, sfx } = setup();
    sfx.unlock();
    const [sources, panners] = [ctx.sources.length, ctx.panners.length];
    sfx.listen(HERE, [at('a', 2, 0, 'town')]);
    const made = ctx.sources.slice(sources) as FakeOscillator[];
    expect(made.map((o) => o.frequency.value)).toEqual(STATION_TONES.town.map((t) => t.freq));
    expect(made.every((o) => o.type === 'sine' && o.times.length === 1)).toBe(true); // started, not stopped
    expect(ctx.panners).toHaveLength(panners + 1);
    expect(ctx.panners.at(-1)!.outputs[0]).toBe(bus(ctx, 'ambience'));
    expect(sfx.stations).toEqual([{ id: 'a', kind: 'town', gain: stationGain(2), pan: expect.closeTo(0.8, 6) }]);
    expect(ctx.panners.at(-1)!.pan.events.at(-1)![1]).toBeCloseTo(0.8, 6);
  });

  it('starts silent and rises to the distance gain, so there is no click', () => {
    const { ctx, sfx } = setup();
    sfx.unlock();
    sfx.listen(HERE, [at('a', 1, 0)]);
    const level = ctx.gains.find((g) => g.outputs[0] === ctx.panners.at(-1))!;
    expect(level.gain.value).toBe(0);
    expect(level.gain.events.at(-1)).toEqual(['target', stationGain(1), 5]);
  });

  it('follows the listener frame after frame without building again', () => {
    const { ctx, sfx } = setup();
    sfx.unlock();
    sfx.listen(HERE, [at('a', 1, 0)]);
    const built = ctx.sources.length;
    sfx.listen({ x: 0, z: 1, yaw: 0 }, [at('a', 1, 0)]);
    expect(ctx.sources).toHaveLength(built);
    expect(sfx.stations[0]!.gain).toBeCloseTo(stationGain(Math.SQRT2), 6);
  });

  it('keeps at most MAX_STATIONS live, the nearest', () => {
    const { ctx, sfx } = setup();
    sfx.unlock();
    sfx.listen(HERE, [0, 1, 2, 3, 4].map((i) => at(`s${i}`, 0, -(0.5 + 0.2 * i))));
    expect(sfx.stations.map((s) => s.id)).toEqual(['s0', 's1', 's2']);
    expect(sfx.stations).toHaveLength(MAX_STATIONS);
    expect(oscillators(ctx).length).toBeGreaterThan(0);
  });

  it('fades a station that goes out of range and stops its sources once it is gone', () => {
    const { ctx, sfx } = setup();
    sfx.unlock();
    sfx.listen(HERE, [at('a', 1, 0)]);
    const made = ctx.sources.slice(-STATION_TONES.terminal.length) as FakeOscillator[];
    const level = ctx.gains.find((g) => g.outputs[0] === ctx.panners.at(-1))!;
    sfx.listen(HERE, [at('a', STATION_RANGE + 1, 0)]);
    expect(sfx.stations).toEqual([]);
    expect(level.gain.events.at(-1)).toEqual(['target', 0, 5]);
    for (const o of made) expect(o.times.at(-1)).toBeCloseTo(5 + SCENE_RELEASE, 6);
    expect(SCENE_RELEASE).toBeGreaterThan(CROSSFADE_TAU);
  });

  it('builds nothing with the ambience slider at 0, and starts when it rises', () => {
    const { ctx, sfx } = setup({ ...FULL, ambience: 0 });
    sfx.unlock();
    const built = ctx.sources.length;
    sfx.listen(HERE, [at('a', 1, 0)]);
    expect(sfx.stations).toEqual([]);
    expect(ctx.sources).toHaveLength(built);
    sfx.setVolume('ambience', 100);
    sfx.listen(HERE, [at('a', 1, 0)]);
    expect(sfx.stations).toHaveLength(1);
  });

  it('drops what sounds when the ambience slider falls to 0', () => {
    const { sfx } = setup();
    sfx.unlock();
    sfx.listen(HERE, [at('a', 1, 0)]);
    sfx.setVolume('ambience', 0);
    sfx.listen(HERE, [at('a', 1, 0)]);
    expect(sfx.stations).toEqual([]);
  });

  it('builds nothing with every slider at 0: no context at all', () => {
    const { sfx } = setup({ music: 0, ambience: 0, effects: 0, voice: 0 });
    sfx.unlock();
    sfx.listen(HERE, [at('a', 1, 0)]);
    expect(sfx.state).toBe('none');
  });
});

describe('stationDb, the level calculated on a small speaker (not heard)', () => {
  it('is silent at the range and beyond', () => {
    for (const kind of STATION_KINDS) expect(stationDb(kind, STATION_RANGE)).toBe(-Infinity);
  });

  it('is a quiet bed near the station: between -50 and -38 dBFS at one cell, under the scene drones ceiling', () => {
    for (const kind of STATION_KINDS) {
      expect(stationDb(kind, 1)).toBeGreaterThanOrEqual(-50);
      expect(stationDb(kind, 1)).toBeLessThanOrEqual(-38);
    }
  });

  it('is at least 15 dB lower at nine tenths of the range than at one cell, and still falls with distance', () => {
    for (const kind of STATION_KINDS) {
      expect(stationDb(kind, 1) - stationDb(kind, 0.9 * STATION_RANGE)).toBeGreaterThanOrEqual(15);
      expect(stationDb(kind, 2)).toBeLessThan(stationDb(kind, 1));
    }
  });
});
