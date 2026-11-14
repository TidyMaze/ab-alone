import { describe, expect, it } from 'vitest';
import type { Move } from './board';
import { COACH, COLD_OPEN, firstRunDone, firstRunDue, isBroadside, isPush, markFirstRunDone, nextStep, stepLine, verb } from './firstrun';
import type { Store } from './quality';
import { SECRETS } from './story';
import { tallyLine } from './tally';

const memory = (): NonNullable<Store> => {
  const data = new Map<string, string>();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
};
const due = (store: Store | null, search = '', automated = false, hash = '', returning = false): boolean => firstRunDue(store, search, automated, hash, returning);

describe('the first run (#1521, docs/specs/ui.md section 4.7)', () => {
  it('is due to a player who has not played it, and is marked done for good', () => {
    const store = memory();
    expect(firstRunDone(store)).toBe(false);
    expect(due(store)).toBe(true);
    markFirstRunDone(store);
    expect(store.getItem('ab-alone.firstrun')).toBe('done');
    expect(firstRunDone(store)).toBe(true);
    expect(due(store)).toBe(false);
    expect(due(store, '?firstrun', true)).toBe(false); // a hook cannot play it twice either
  });

  it('is never due to a returning player: a saved game or a boss beaten, nor to one who saw the guide', () => {
    expect(due(memory(), '', false, '', true)).toBe(false);
    const seen = memory();
    seen.setItem('ab-alone.guide', 'seen');
    expect(due(seen)).toBe(false);
  });

  it('is not due on a link or under automation, unless ?firstrun asks for it', () => {
    const store = memory();
    expect(due(store, '?bot=off')).toBe(false);
    expect(due(store, '', false, '#room')).toBe(false);
    expect(due(store, '', true)).toBe(false); // the e2e specs boot on a fresh profile: no first run over them
    expect(due(store, '?firstrun', true)).toBe(true);
  });

  it('is due at every launch when storage is blocked, where nothing is remembered', () => {
    expect(firstRunDone(null)).toBe(false);
    expect(due(null)).toBe(true);
    expect(() => markFirstRunDone(null)).not.toThrow();
  });
});

describe('the cold open (#1523)', () => {
  const lines = [COLD_OPEN.title, ...COLD_OPEN.lines, ...Object.values(COACH)];

  it('is three short lines: the place, the last clear visor, Tally\'s rule', () => {
    expect(COLD_OPEN.lines).toHaveLength(3);
    expect(COLD_OPEN.lines[0]).toMatch(/Ballast.*Hollow/);
    expect(COLD_OPEN.lines[1]).toMatch(/visor/);
    expect(COLD_OPEN.lines[2]).toMatch(/Tally.*six out/);
    for (const line of COLD_OPEN.lines) expect(line.length).toBeLessThanOrEqual(70); // fits a phone card
  });

  it('holds no secret word of a later stage: it is stage 1 (world.md section 12.2)', () => {
    for (const { word, from } of SECRETS) {
      expect(from).toBeGreaterThan(1);
      for (const line of lines) expect(line).not.toMatch(word);
    }
  });

  it('speaks White and Black, as the HUD does, never glass and shell', () => {
    for (const line of lines) expect(line).not.toMatch(/pale|shell|glass/i);
    expect(COACH.push).toMatch(/Black/);
    expect(COACH.select).toMatch(/White/);
  });

  it('explains the first Tally line of the HUD, the line of the bot table: whose seats they are', () => {
    expect(tallyLine({ mode: 'bot' })).toMatch(/seat/);
    expect(COACH.tally).toMatch(/ledger.*seat is yours.*bot/);
  });

  it('ends on Tally\'s eject line, the lore\'s words for a marble pushed off: over the edge (#1649)', () => {
    expect(COACH.won).toContain('Tally: "Another one over the edge."');
  });
});

const m = (cells: [number, number][], dir: number): Move => ({ cells, dir });
const grid = (marbles: Record<string, number>) => (q: number, r: number): number => marbles[q + ',' + r] ?? 0;

describe('the guided steps (#1663)', () => {
  it('names the pointer verb and the keyboard once, on the first step only', () => {
    expect([verb(false), verb(true)]).toEqual(['Click', 'Tap']);
    expect(stepLine('select', false)).toBe('Click one of your White marbles, or a line of up to three touching ones, to pick it. The arrow keys and Enter work too.');
    expect(stepLine('select', true)).toMatch(/^Tap one.*pick it\.$/);
    expect(stepLine('move', true)).toMatch(/^Tap a ringed cell/);
    expect(stepLine('push', false)).toBe(COACH.push);
  });

  it('tells a broadside from an in-line move, whichever way the cells are listed', () => {
    expect(isBroadside(m([[0, 0]], 4))).toBe(false); // one marble
    expect(isBroadside(m([[0, 0], [1, 0]], 4))).toBe(true); // a pair on the E axis rolling NW
    expect(isBroadside(m([[1, 0], [0, 0]], 5))).toBe(true); // listed from the other end
    expect(isBroadside(m([[0, 0], [1, 0]], 0))).toBe(false); // along its axis
    expect(isBroadside(m([[0, 0], [1, 0]], 1))).toBe(false); // backwards along its axis
    expect(isBroadside(m([[1, 0], [0, 0]], 0))).toBe(false);
    expect(isBroadside(m([[0, 1], [0, 0]], 5))).toBe(false); // the SE axis, one q: along it
    expect(isBroadside(m([[0, 1], [0, 0]], 0))).toBe(true);
    expect(isBroadside(m([[0, 2], [0, 0], [0, 1]], 3))).toBe(true); // three marbles on the SE axis listed out of order, rolling SW
    expect(isBroadside(m([[1, -1], [0, 0]], 2))).toBe(false); // the NE axis
    expect(isBroadside(m([[1, -1], [0, 0]], 0))).toBe(true);
  });

  it('sees a push: an in-line line rolling into a marble of the other side, not into a free cell, an own marble or a broadside', () => {
    const line = m([[0, 0], [1, 0]], 0);
    expect(isPush(line, grid({ '2,0': 2 }), 1)).toBe(true);
    expect(isPush(m([[1, 0], [0, 0]], 0), grid({ '2,0': 2 }), 1)).toBe(true); // listed from the other end
    expect(isPush(m([[1, 0], [0, 0]], 1), grid({ '-1,0': 2 }), 1)).toBe(true); // the other way
    expect(isPush(line, grid({}), 1)).toBe(false);
    expect(isPush(line, grid({ '2,0': 1 }), 1)).toBe(false);
    expect(isPush(m([[0, 0], [1, 0]], 4), grid({ '0,-1': 2 }), 1)).toBe(false); // a broadside
    expect(isPush(m([[0, 0]], 0), grid({ '1,0': 2 }), 1)).toBe(false); // one marble pushes nothing
  });

  it("walks select, move, broadside, push, free, each on the player's real input", () => {
    expect(nextStep('select', { selected: 0 })).toBe('select');
    expect(nextStep('select', { selected: 2 })).toBe('move');
    expect(nextStep('move', { selected: 1 })).toBe('move'); // a later selection does not move it
    expect(nextStep('move', { move: m([[0, 0]], 4), pushed: false })).toBe('broadside');
    expect(nextStep('select', { move: m([[0, 0]], 4), pushed: false })).toBe('broadside'); // a move without the selection step
    expect(nextStep('broadside', { move: m([[0, 0]], 4), pushed: false })).toBe('broadside'); // a single marble is not one
    expect(nextStep('broadside', { move: m([[0, 0], [1, 0]], 4), pushed: false })).toBe('push');
    expect(nextStep('move', { move: m([[0, 0], [1, 0]], 4), pushed: false })).toBe('push'); // a broadside first skips its step
    expect(nextStep('push', { move: m([[0, 0], [1, 0]], 0), pushed: false })).toBe('push');
    expect(nextStep('push', { move: m([[0, 0], [1, 0]], 4), pushed: false })).toBe('push');
    expect(nextStep('push', { move: m([[0, 0], [1, 0]], 0), pushed: true })).toBe('free');
    expect(nextStep('select', { move: m([[0, 0], [1, 0]], 0), pushed: true })).toBe('free'); // a push first ends the lesson
    expect(nextStep('free', { move: m([[0, 0]], 4), pushed: false })).toBe('free');
  });

  it('the refusal gives the push rule, in plain words', () => {
    expect(COACH.refused).toMatch(/more marbles push fewer/);
    expect(COACH.refused).toMatch(/behind the target blocks/);
  });
});
