import { describe, expect, it } from 'vitest';
import { DECK_NAMES } from './deck';
import { DECK_TINTS, DEFAULT_ROOM, FILL, LIGHT_BUDGET, ROOM_KEY, readRoom, roomRig } from './roomrefined';

const memory = (value?: string) => ({ getItem: (k: string) => (k === ROOM_KEY ? (value ?? null) : null), setItem: () => undefined });

describe('the refined room (#1138)', () => {
  it('tints each deck as the design canvas says', () => {
    expect(DECK_TINTS).toEqual({ mess: 0x6fa8dc, cargo: 0x7fc4a0, furnace: 0xffb000, chapel: 0xb9a8e8, bridge: 0x6fd0dc });
    expect(Object.keys(DECK_TINTS).sort()).toEqual([...DECK_NAMES].sort());
  });

  it('reads ?room= first, then the stored room, then the default', () => {
    expect(readRoom('?room=refined', memory())).toBe('refined');
    expect(readRoom('?room=today', memory('refined'))).toBe('today');
    expect(readRoom('?room=nope', memory('refined'))).toBe('refined');
    expect(readRoom('', memory('nope'))).toBe(DEFAULT_ROOM);
    expect(readRoom('', null)).toBe(DEFAULT_ROOM);
    expect(readRoom('', memory('today'))).toBe('today');
  });

  it('stores the room an address names, and survives blocked storage', () => {
    const kept: string[] = [];
    readRoom('?room=refined', { getItem: () => null, setItem: (_k, v) => void kept.push(v) });
    expect(kept).toEqual(['refined']);
    const blocked = { getItem: () => null, setItem: () => { throw new Error('blocked'); } };
    expect(readRoom('?room=refined', blocked)).toBe('refined');
  });

  it('has one key point light, and the amber rim only in a boss fight: three real lights with the fill (#845)', () => {
    expect(LIGHT_BUDGET).toBe(3);
    expect(roomRig(false).map((l) => l.name)).toEqual(['key']);
    const boss = roomRig(true);
    expect(boss.map((l) => l.name)).toEqual(['key', 'rim']);
    expect(boss[0]!.color).toBe(0xf2f4f6); // neutral: the marbles keep their white and black
    expect(boss[1]!.color).toBe(0xffb000);
    expect(boss[1]!.position[2]).toBeLessThan(0); // behind the boss side, the far end
    expect(boss.length + 1).toBeLessThanOrEqual(LIGHT_BUDGET);
    for (const l of boss) expect(l.power).toBeGreaterThan(0);
    expect(FILL.intensity).toBeGreaterThan(0);
  });
});
