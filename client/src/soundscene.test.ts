import { describe, expect, it } from 'vitest';
import { allScenes, pulseRate, sceneMix, type SceneId } from './scenes';
import { BUSES, MASTER_LEVEL, SCENE_RELEASE, Sfx, type Mix, type Bus } from './sound';
import { FakeContext, type FakeBufferSource, type FakeFilter, type FakeGain, type FakeOscillator } from './test/audio';

// The scenes of the music (#1571, world.md section 7): synthesized layers on the music and ambience buses that crossfade
// when the scene changes, a pulse that follows the boss phase, and the song and the room tone of the files that fade out
// where a scene has none. A fake context records the wiring; nobody can listen here.
const FULL: Mix = { music: 100, ambience: 100, effects: 100, voice: 100 };
const NOW = 5; // the fake context's clock

function setup(mix: Mix = FULL) {
  const ctx = new FakeContext();
  const sfx = new Sfx(() => ctx as unknown as AudioContext, { ...mix });
  return { ctx, sfx };
}
/** The context made, then the scene set: the sources and gains the scene added. */
function scened(id: SceneId, mix: Mix = FULL, phase = 0) {
  const { ctx, sfx } = setup(mix);
  sfx.unlock();
  const [sources, gains] = [ctx.sources.length, ctx.gains.length];
  sfx.setScene(id, phase);
  return { ctx, sfx, sources: ctx.sources.slice(sources) as FakeOscillator[], gains: ctx.gains.slice(gains) };
}
const bus = (ctx: FakeContext, b: Bus): FakeGain => ctx.gains[1 + BUSES.indexOf(b)]!;
const targets = (node: FakeGain): number[] => node.gain.events.filter(([method]) => method === 'target').map(([, value]) => value);
/** The gain a layer fades through: the one that goes into a bus. */
const fades = (ctx: FakeContext, gains: FakeGain[], b: Bus): FakeGain[] => gains.filter((g) => g.outputs[0] === bus(ctx, b));

describe('Sfx, a scene before and after the first gesture (#1571)', () => {
  it('remembers the scene before a gesture and makes no context for it', () => {
    const { ctx, sfx } = setup();
    sfx.setScene('boss:echo', 1);
    expect(sfx.state).toBe('none');
    expect(sfx.scene).toMatchObject({ id: 'boss:echo', phase: 1, layers: 0, pulse: 0 });
    expect(ctx.sources).toHaveLength(0);
  });

  it('starts the scene it remembers when the context is made', () => {
    const { ctx, sfx } = setup();
    sfx.setScene('hub');
    sfx.unlock();
    const tones = sceneMix('hub').layers.flatMap((layer) => (layer.kind === 'wind' ? [] : layer.tones));
    const heard = ctx.sources.map((s) => (s as FakeOscillator).frequency.value);
    expect(heard).toEqual(expect.arrayContaining(tones.map((tone) => tone.freq)));
    expect(sfx.scene.layers).toBe(1);
  });

  it('has no scene until one is set: the files play as they did, no layer', () => {
    const { sfx } = setup();
    sfx.unlock();
    expect(sfx.scene).toEqual({ id: null, phase: 0, layers: 0, pulse: 0, room: true, track: true });
  });
});

describe('Sfx.setScene, a drone scene (#1571)', () => {
  it('starts one steady sine a tone through its own gain and one fade gain into the music bus, fading in without a click', () => {
    const { ctx, sources, gains } = scened('hub');
    const [layer] = sceneMix('hub').layers;
    if (layer?.kind !== 'drone') throw new Error('hub is a drone');
    expect(sources.map((s) => s.frequency.value)).toEqual(layer.tones.map((tone) => tone.freq));
    sources.forEach((osc, i) => {
      expect(osc.type).toBe('sine');
      expect(osc.times).toEqual([NOW]); // started now, no stop yet
      expect((osc.outputs[0] as FakeGain).gain.value).toBe(layer.tones[i]!.gain);
    });
    const [fade] = fades(ctx, gains, 'music');
    expect(fade!.gain.value).toBe(0); // silent when it starts, then fades in: a start at full level would click
    expect(targets(fade!)).toEqual([1]);
    expect(sources.every((s) => s.outputs[0]!.outputs[0] === fade)).toBe(true);
  });

  it('crossfades to the next scene: the old fades out and its sources stop once it is silent, the new fades in', () => {
    const { ctx, sfx, sources, gains } = scened('hub');
    const [old] = fades(ctx, gains, 'music');
    const [before, gainsBefore] = [ctx.sources.length, ctx.gains.length];
    sfx.setScene('bot');
    expect(targets(old!)).toEqual([1, 0]);
    for (const osc of sources) expect(osc.times).toEqual([NOW, NOW + SCENE_RELEASE]);
    expect(SCENE_RELEASE).toBeGreaterThanOrEqual(1);
    expect(SCENE_RELEASE).toBeLessThanOrEqual(2);
    const [fresh] = fades(ctx, ctx.gains.slice(gainsBefore), 'music');
    expect(ctx.sources.length).toBeGreaterThan(before);
    expect(fresh!.gain.value).toBe(0);
    expect(targets(fresh!)).toEqual([1]);
  });

  it('does nothing when the scene and the phase stay: the loop of the page may ask every frame', () => {
    const { ctx, sfx } = scened('hub');
    const [sources, gains] = [ctx.sources.length, ctx.gains.length];
    sfx.setScene('hub');
    sfx.setScene('hub', 0);
    expect([ctx.sources.length, ctx.gains.length]).toEqual([sources, gains]);
  });
});

describe('Sfx.setScene, the boss pulse (#1571)', () => {
  it('breathes its tones through a gain that a slow sine moves, at the rate of the phase', () => {
    const { sfx, sources } = scened('boss:hull', FULL, 0);
    const lfo = sources.find((s) => s.frequency.value === pulseRate(0))!;
    const depth = lfo.outputs[0] as FakeGain;
    const breath = depth.outputs[0] as unknown as { value: number; events: unknown[] }; // the gain param of the pulse gain
    expect(lfo.type).toBe('sine');
    expect(depth.gain.value).toBe(0.5);
    expect(breath.value).toBe(0.5); // 0.5 plus or minus 0.5: from silent to full, never over
    expect(sfx.scene.pulse).toBe(pulseRate(0));
  });

  it('follows the phase of the same boss without restarting: only the rate moves, smoothly', () => {
    const { ctx, sfx, sources } = scened('boss:hull', FULL, 0);
    const lfo = sources.find((s) => s.frequency.value === pulseRate(0))!;
    const count = ctx.sources.length;
    sfx.setScene('boss:hull', 2);
    expect(ctx.sources).toHaveLength(count);
    expect(lfo.frequency.events.at(-1)).toEqual(['target', pulseRate(2), NOW]);
    expect(sfx.scene).toMatchObject({ id: 'boss:hull', phase: 2, pulse: pulseRate(2) });
  });

  it('gives each boss its own pitch at the same rate', () => {
    const roots = ['boss:echo', 'boss:hull', 'boss:choir'].map((id) => scened(id as SceneId).sources[0]!.frequency.value);
    expect(new Set(roots).size).toBe(3);
    const rates = ['boss:echo', 'boss:hull'].map((id) => scened(id as SceneId).sfx.scene.pulse);
    expect(new Set(rates).size).toBe(1);
  });
});

describe('Sfx.setScene, the wind of the Open world (#1571)', () => {
  it('plays a looped band of noise on the ambience bus and the drone on the music bus', () => {
    const { ctx, sources, gains } = scened('world:forest:night');
    const wind = sceneMix('world:forest:night').layers.find((layer) => layer.kind === 'wind')!;
    if (wind.kind !== 'wind') throw new Error('wind');
    const noise = ctx.sources.filter((s) => 'buffer' in s).at(-1) as FakeBufferSource;
    expect(noise.loop).toBe(true);
    const filter = noise.outputs[0] as FakeFilter;
    expect(filter.type).toBe('bandpass');
    expect(filter.frequency.value).toBe(wind.freq);
    expect(filter.Q.value).toBe(wind.q);
    const level = filter.outputs[0] as FakeGain;
    expect(level.gain.value).toBe(wind.gain);
    expect(level.outputs[0]).toBe(fades(ctx, gains, 'ambience')[0]);
    expect(fades(ctx, gains, 'music')).toHaveLength(1);
    expect(sources.length).toBeGreaterThan(1);
  });
});

describe('Sfx.setScene, the room tone and the song (#1571)', () => {
  /** The gate of each file track: the gain between it and its bus. */
  const gate = (ctx: FakeContext, track: number): FakeGain => ctx.tracks[track]!.outputs[0] as FakeGain;

  it('opens both for the ship and closes both outdoors, fading over the same second', () => {
    const { ctx, sfx } = setup();
    sfx.setScene('hub');
    sfx.unlock();
    expect(ctx.tracks.map((t) => (t.outputs[0] as FakeGain).gain.value)).toEqual([1, 1, 1]);
    sfx.setScene('world:meadow:day');
    expect(ctx.tracks.map((t, i) => targets(gate(ctx, i)))).toEqual([[0], [0], [0]]);
    expect(sfx.scene).toMatchObject({ room: false, track: false });
    sfx.setScene('hub');
    expect(targets(gate(ctx, 0))).toEqual([0, 1]);
    expect(sfx.scene).toMatchObject({ room: true, track: true });
  });

  it('keeps the room tone, not the song, in a boss fight: the pulse is its music', () => {
    const { ctx, sfx } = setup();
    sfx.unlock();
    sfx.setScene('boss:echo');
    expect(targets(gate(ctx, 0))).toEqual([1]);
    expect(targets(gate(ctx, 2))).toEqual([0]);
    expect(sfx.scene).toMatchObject({ room: true, track: false });
  });

  it('starts closed when the first scene is outdoors, so the room tone never plays there', () => {
    const { ctx, sfx } = setup();
    sfx.setScene('world:tundra:dusk');
    sfx.unlock();
    expect(ctx.tracks.map((t) => (t.outputs[0] as FakeGain).gain.value)).toEqual([0, 0, 0]);
  });
});

describe('Sfx.setScene, muted (#1571)', () => {
  it('builds nothing for a bus at 0: no cost when muted, the music at 0 plays no drone and no pulse', () => {
    const { ctx, sfx, sources } = scened('boss:echo', { ...FULL, music: 0 });
    expect(sources).toHaveLength(0);
    expect(sfx.scene.layers).toBe(0);
    expect(ctx.sources.length).toBeGreaterThan(0); // the hum
  });

  it('builds the wind of a world scene with the music at 0, and the drone with the ambience at 0', () => {
    expect(scened('world:meadow:day', { ...FULL, music: 0 }).sfx.scene.layers).toBe(1);
    expect(scened('world:meadow:day', { ...FULL, ambience: 0 }).sfx.scene.layers).toBe(1);
  });

  it('starts the layers when a slider rises from 0 and drops them, faded, when it falls back to 0', () => {
    const { ctx, sfx } = setup({ ...FULL, music: 0 });
    sfx.unlock();
    sfx.setScene('boss:echo');
    expect(sfx.scene.layers).toBe(0);
    sfx.setVolume('music', 60);
    expect(sfx.scene.layers).toBe(1);
    const live = ctx.sources.filter((s) => s.times.length === 1).slice(-4) as FakeOscillator[];
    sfx.setVolume('music', 0);
    expect(sfx.scene.layers).toBe(0);
    for (const osc of live) expect(osc.times.at(-1)).toBe(NOW + SCENE_RELEASE);
  });

  it('makes no context at all with every slider at 0', () => {
    const { ctx, sfx } = setup({ music: 0, ambience: 0, effects: 0, voice: 0 });
    sfx.setScene('hub');
    sfx.unlock();
    expect(sfx.state).toBe('none');
    expect(ctx.sources).toHaveLength(0);
    expect(MASTER_LEVEL).toBeGreaterThan(0);
  });
});

describe('every scene (#1571)', () => {
  it('starts something and, when the next scene comes, stops all of it at its release', () => {
    for (const id of allScenes()) {
      const { sfx, sources } = scened(id);
      expect(sources.length, id).toBeGreaterThan(0);
      sfx.setScene(id === 'bot' ? 'hub' : 'bot');
      for (const osc of sources) expect(osc.times.at(-1), id).toBe(NOW + SCENE_RELEASE);
    }
  });
});
