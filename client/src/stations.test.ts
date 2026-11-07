import { describe, expect, it } from 'vitest';
import { axialTo3D } from './board';
import { DECK_NAMES } from './deck';
import { roomsOf } from './hub';
import { audible, hubStations, listenerOf, MAX_STATIONS, STATION_KINDS, STATION_PAN, STATION_RANGE, STATION_TONES, stationGain, type Source } from './stations';
import { SMALL_SPEAKER_HZ } from './scenes';

// Positional audio (world.md section 7, Spatial; #1577): which stations the player hears and where, pure arithmetic.
const at = (id: string, x: number, z: number): Source => ({ id, kind: 'terminal', x, z });
const HERE = { x: 0, z: 0, yaw: 0 }; // facing -z, the way the Hub's camera looks

describe('stationGain, the distance gain', () => {
  it('is full on the station, falls in a straight line and is silent from the range on', () => {
    expect(stationGain(0)).toBe(1);
    expect(stationGain(STATION_RANGE / 2)).toBeCloseTo(0.5, 6);
    expect(stationGain(STATION_RANGE)).toBe(0);
    expect(stationGain(STATION_RANGE + 3)).toBe(0);
  });
});

describe('audible, what is heard of the stations round the listener', () => {
  it('drops the stations beyond the range', () => {
    expect(audible(HERE, [at('far', STATION_RANGE + 0.1, 0), at('edge', STATION_RANGE, 0), at('near', 1, 0)]).map((h) => h.id)).toEqual(['near']);
  });

  it('keeps the nearest few, the nearest first, at most MAX_STATIONS', () => {
    const many = [4, 1, 3, 2, 0.5].map((d) => at(`s${d}`, 0, -d * 0.7));
    const heard = audible(HERE, many);
    expect(heard).toHaveLength(MAX_STATIONS);
    expect(heard.map((h) => h.id)).toEqual(['s0.5', 's1', 's2']);
    expect(heard[0]!.gain).toBeGreaterThan(heard[1]!.gain);
  });

  it('breaks a tie by the id, so the same stations sound frame after frame', () => {
    expect(audible(HERE, [at('b', 1, 0), at('a', -1, 0)]).map((h) => h.id)).toEqual(['a', 'b']);
  });

  it('gives each its gain by distance', () => {
    expect(audible(HERE, [at('s', 0, 1.5)])[0]!.gain).toBeCloseTo(stationGain(1.5), 6);
  });

  it('pans a station on the right of the camera to the right and one on the left to the left, at most STATION_PAN', () => {
    const [right, left] = [audible(HERE, [at('r', 2, 0)])[0]!, audible(HERE, [at('l', -2, 0)])[0]!];
    expect(right.pan).toBeCloseTo(STATION_PAN, 6);
    expect(left.pan).toBeCloseTo(-STATION_PAN, 6);
  });

  it('keeps one ahead or behind, or on the listener, in the middle', () => {
    expect(audible(HERE, [at('s', 0, -2)])[0]!.pan).toBeCloseTo(0, 6);
    expect(audible(HERE, [at('s', 0, 2)])[0]!.pan).toBeCloseTo(0, 6);
    expect(audible(HERE, [at('s', 0, 0)])[0]!.pan).toBe(0);
  });

  it('turns with the camera: facing +x, a station at +z is on the right', () => {
    expect(audible({ x: 0, z: 0, yaw: Math.PI / 2 }, [at('s', 0, 2)])[0]!.pan).toBeCloseTo(STATION_PAN, 6);
  });

  it('measures from the listener, not from the origin', () => {
    expect(audible({ x: 10, z: 10, yaw: 0 }, [at('s', 11, 10)])[0]).toMatchObject({ id: 's', kind: 'terminal' });
    expect(audible({ x: 10, z: 10, yaw: 0 }, [at('s', 1, 1)])).toEqual([]);
  });
});

describe('listenerOf, the ears follow the camera', () => {
  it('stands on the ground the camera looks at, facing the way it looks', () => {
    const l = listenerOf({ x: 3, y: 10, z: 20 }, { x: 0, y: -Math.SQRT1_2, z: -Math.SQRT1_2 });
    expect(l.x).toBeCloseTo(3, 6);
    expect(l.z).toBeCloseTo(10, 6);
    expect(l.yaw).toBeCloseTo(0, 6);
    expect(listenerOf({ x: 0, y: 4, z: 0 }, { x: Math.SQRT1_2, y: -Math.SQRT1_2, z: 0 })).toMatchObject({ x: 4, z: 0 });
    expect(listenerOf({ x: 0, y: 4, z: 0 }, { x: Math.SQRT1_2, y: -Math.SQRT1_2, z: 0 }).yaw).toBeCloseTo(Math.PI / 2, 6);
  });

  it('keeps the camera yaw of the hero case: looking south is yaw pi', () => {
    expect(Math.abs(listenerOf({ x: 0, y: 4, z: 0 }, { x: 0, y: -Math.SQRT1_2, z: Math.SQRT1_2 }).yaw)).toBeCloseTo(Math.PI, 6);
  });

  it('looking straight down has no heading: yaw 0, the camera column', () => {
    expect(listenerOf({ x: 2, y: 9, z: -3 }, { x: 0, y: -1, z: 0 })).toEqual({ x: 2, z: -3, yaw: 0 });
  });

  it('looking level or up has no ground to hit: it stays at the camera', () => {
    expect(listenerOf({ x: 2, y: 9, z: -3 }, { x: 1, y: 0, z: 0 })).toMatchObject({ x: 2, z: -3 });
    expect(listenerOf({ x: 2, y: 9, z: -3 }, { x: 1, y: 0.5, z: 0 })).toMatchObject({ x: 2, z: -3 });
  });
});

describe('STATION_TONES, one quiet loop per kind', () => {
  it('has every kind, a low tone and a tone above 150 Hz for a small speaker', () => {
    expect(STATION_KINDS).toEqual(['terminal', 'machinery', 'town', 'gate', 'tower']);
    for (const kind of STATION_KINDS) {
      const tones = STATION_TONES[kind];
      expect(tones.some((t) => t.freq > SMALL_SPEAKER_HZ)).toBe(true);
      expect(tones.reduce((sum, t) => sum + t.gain, 0)).toBeLessThanOrEqual(0.06);
    }
  });
});

describe('hubStations, the stations of a deck of the Hub', () => {
  it('has a terminal for each terminal room and machinery for each lift, on the cell of the room, and nothing else', () => {
    for (const deck of DECK_NAMES) {
      const rooms = roomsOf(deck).filter(({ door }) => door.kind === 'terminal' || door.kind === 'lift');
      const stations = hubStations(deck);
      expect(stations).toHaveLength(rooms.length);
      for (const room of rooms) {
        const { x, z } = axialTo3D(room.cell[0], room.cell[1]);
        expect(stations).toContainEqual({ id: `${deck}:${room.cell}`, kind: room.door.kind === 'terminal' ? 'terminal' : 'machinery', x, z });
      }
    }
  });
});
