import { describe, expect, it } from 'vitest';
import { DECK_NAMES } from './deck';
import { DECK_TINTS, LIGHT_BUDGET, POOL, ROOM_KEY, poolPixels, readRoom, roomRig } from './roomrefined';

const memory = (value?: string) => ({ getItem: (k: string) => (k === ROOM_KEY ? (value ?? null) : null), setItem: () => undefined });

describe('the refined room (#1138)', () => {
  it('tints each deck as the design canvas says', () => {
    expect(DECK_TINTS).toEqual({ mess: 0x6fa8dc, cargo: 0x7fc4a0, furnace: 0xffb000, chapel: 0xb9a8e8, bridge: 0x6fd0dc });
    expect(Object.keys(DECK_TINTS).sort()).toEqual([...DECK_NAMES].sort());
  });

  it('reads ?room= first, then the stored room, then today', () => {
    expect(readRoom('?room=refined', memory())).toBe('refined');
    expect(readRoom('?room=today', memory('refined'))).toBe('today');
    expect(readRoom('?room=nope', memory('refined'))).toBe('refined');
    expect(readRoom('', memory('nope'))).toBe('today');
    expect(readRoom('', null)).toBe('today');
  });

  it('stores the room an address names, and survives blocked storage', () => {
    const kept: string[] = [];
    readRoom('?room=refined', { getItem: () => null, setItem: (_k, v) => void kept.push(v) });
    expect(kept).toEqual(['refined']);
    const blocked = { getItem: () => null, setItem: () => { throw new Error('blocked'); } };
    expect(readRoom('?room=refined', blocked)).toBe('refined');
  });

  it('lights the room with five lights, six in a boss fight (#845)', () => {
    expect(LIGHT_BUDGET).toBe(6);
    for (const deck of DECK_NAMES) {
      expect(roomRig(deck, false)).toHaveLength(5);
      expect(roomRig(deck, true)).toHaveLength(6);
    }
  });

  it('names a neutral key, fill, three strips in the deck tint, and the amber rim from behind the boss side', () => {
    const rig = roomRig('cargo', true);
    expect(rig.map((l) => l.name)).toEqual(['key', 'fill', 'strip 1', 'strip 2', 'strip 3', 'rim']);
    expect(rig.filter((l) => l.name.startsWith('strip')).map((l) => l.color)).toEqual([0x7fc4a0, 0x7fc4a0, 0x7fc4a0]);
    expect(rig[0]!.color).toBe(0xf2f4f6); // the key is neutral: the marbles keep their white and black
    expect(rig[1]!.color).toBe(0xdfe6ee); // the fill is neutral
    const rim = rig[5]!;
    expect(rim.color).toBe(0xffb000);
    expect(rim.position[2]).toBeLessThan(0); // behind the boss side, the far end
    for (const l of rig) expect(l.power).toBeGreaterThan(0);
  });

  it('bakes a soft pool of light: opaque in the middle, clear at the edge, symmetric', () => {
    const size = 16;
    const px = poolPixels(size);
    expect(px).toHaveLength(size * size * 4);
    const alpha = (x: number, y: number): number => px[(y * size + x) * 4 + 3]!;
    expect(alpha(8, 8)).toBeGreaterThan(alpha(4, 8));
    expect(alpha(0, 0)).toBe(0);
    expect(alpha(15, 8)).toBeLessThan(3);
    expect(alpha(3, 8)).toBe(alpha(12, 8));
    expect(px[0]).toBe(0xff); // white light
    expect(POOL.radius).toBeGreaterThan(4);
    expect(POOL.opacity).toBeLessThan(1);
  });
});
