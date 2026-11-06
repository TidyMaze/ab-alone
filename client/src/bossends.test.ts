import { describe, expect, it } from 'vitest';
import { BOSS_ENDS, bossEndLine } from './bossends';
import { SECRETS } from './story';
import { BOSS_IDS } from './tally';

// #1546: each of the 15 bosses has its own victory line and its own defeat line, with the stage that may speak it. The Ballast Mind's win line at
// stage 7 is the answer of the story (#1588): a player who beats it too early meets the neutral line, never this one.
const BANNER = ['The seat is empty.', 'The seat holds.'];
const KINDS = ['win', 'loss'] as const;
const ENDING = 'Delivered: fourteen. Crew clear: all. Seat five: Tally. Books balanced. Clamp: yours.';

describe('BOSS_ENDS (#1546)', () => {
  it('holds a victory and a defeat line at stage 1 for each of the 15 bosses, in the order of the roster', () => {
    for (const id of BOSS_IDS) for (const kind of KINDS) expect(BOSS_ENDS.filter((e) => e.boss === id && e.kind === kind && e.stage === 1), `${id} ${kind}`).toHaveLength(1);
    expect([...new Set(BOSS_ENDS.map((e) => e.boss))]).toEqual([...BOSS_IDS]);
  });

  it('has no duplicate line: no two bosses, no win and loss, share one', () => {
    const lines = BOSS_ENDS.map((e) => e.line);
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('keeps the old banner for The Ballast Mind below its ending only, and gives the other 14 bosses a line of their own', () => {
    for (const e of BOSS_ENDS) if (e.boss !== 'ballast') expect(BANNER, `${e.boss} ${e.kind}`).not.toContain(e.line);
    expect(bossEndLine('ballast', 'win', 6)).toBe('The seat is empty.');
    expect(bossEndLine('ballast', 'loss', 7)).toBe('The seat holds.');
  });

  it('holds no secret word a later stage than its own may speak of', () => {
    for (const { stage, line, boss, kind } of BOSS_ENDS) for (const { word, from } of SECRETS) if (stage < from) expect(line, `${boss} ${kind}`).not.toMatch(word);
  });

  it('is one short line: a plate, no markup, no newline', () => {
    for (const { stage, line, boss, kind } of BOSS_ENDS) {
      expect(line, `${boss} ${kind}`).not.toMatch(/[<>&\n]/);
      expect(line.length, `${boss} ${kind}`).toBeLessThanOrEqual(stage === 1 ? 44 : 90);
    }
  });
});

describe('bossEndLine (#1546)', () => {
  it('gives each boss its victory and defeat line from stage 1', () => {
    for (const e of BOSS_ENDS.filter((x) => x.stage === 1)) for (const stage of [1, 4, 7]) if (e.boss !== 'ballast' || stage < 7 || e.kind === 'loss') expect(bossEndLine(e.boss, e.kind, stage)).toBe(e.line);
  });

  it('gives the Ballast Mind the line of the ending only from stage 7, exactly as the issue writes it', () => {
    expect(bossEndLine('ballast', 'win', 7)).toBe(ENDING);
    for (const stage of [1, 2, 3, 4, 5, 6]) expect(bossEndLine('ballast', 'win', stage)).toBe('The seat is empty.');
  });

  it('serves no secret word at a stage that may not speak of it, for any boss and either result', () => {
    for (let stage = 1; stage <= 7; stage++) for (const id of BOSS_IDS) for (const kind of KINDS) for (const { word, from } of SECRETS) if (stage < from) expect(bossEndLine(id, kind, stage), `${id} ${kind} ${stage}`).not.toMatch(word);
  });

  it('says nothing for a boss the roster does not hold', () => {
    expect(bossEndLine('nobody', 'win', 7)).toBeUndefined();
  });
});
