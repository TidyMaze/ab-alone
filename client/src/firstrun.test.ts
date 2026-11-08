import './test/openworldwasm';
import { Engine } from 'edgefall-wasm';
import { describe, expect, it } from 'vitest';
import { cellIndex, encodeMove } from './board';
import { COACH, COLD_OPEN, FIRST_FIGHT, FIRST_PUSH, firstRunDone, firstRunDue, markFirstRunDone } from './firstrun';
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
  const lines = [COLD_OPEN.title, ...COLD_OPEN.lines, COACH.push, COACH.tally, COACH.done];

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
    expect(COACH.push).toMatch(/White.*Black/);
  });

  it('explains the first Tally line of the HUD, the line of the bot table: whose seats they are', () => {
    expect(tallyLine({ mode: 'bot' })).toMatch(/seat/);
    expect(COACH.tally).toMatch(/ledger.*seat is yours.*bot/);
  });

  it('ends the fight on Tally\'s eject line, the lore\'s words for a marble pushed off: over the edge (#1649)', () => {
    expect(COACH.done).toContain('Tally: "Another one over the edge."');
  });
});

describe('the scripted fight (#1521)', () => {
  const stand = (): Engine => {
    const engine = new Engine();
    for (const move of FIRST_FIGHT) engine.play(Int32Array.from(encodeMove(move)));
    return engine;
  };

  it('plays on the standard board with the engine\'s own rules, six legal plies leaving the player (side 1) to move, nothing out yet', () => {
    expect(FIRST_FIGHT).toHaveLength(6);
    const engine = stand();
    expect(engine.to_move()).toBe(1);
    expect(engine.status()).toBe(0);
    expect([engine.ejected(1), engine.ejected(2)]).toEqual([0, 0]);
  });

  it('leaves one obvious push: three White marbles in a line against the lone Black marble on the rim, which ejects it', () => {
    const engine = stand();
    const board = engine.board();
    expect(board[cellIndex(-2, -2)]).toBe(2); // the lone marble, on the rim
    expect(FIRST_PUSH.cells).toHaveLength(3);
    for (const [q, r] of FIRST_PUSH.cells) expect(board[cellIndex(q, r)]).toBe(1);
    engine.play(Int32Array.from(encodeMove(FIRST_PUSH)));
    expect(engine.ejected(1)).toBe(1);
    expect(engine.board()[cellIndex(-2, -2)]).toBe(1);
  });
});
