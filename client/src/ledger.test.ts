import { describe, expect, it } from 'vitest';
import { AUDIO_LOGS, lineAt } from './audiologs';
import { bossEndLine } from './bossends';
import { appended, CARGO_LINE, LEDGER, ledgerList, linesIn, MEDAL_LINE, TERMINAL_LINE, VOIDED_LINE } from './ledger';
import { LORE } from './lore';
import { entryOf } from './lorelogs';
import { medalRoom } from './medals';
import { auditLine, choiceText, EVENTS, type Run } from './roguelite';
import { SECRETS } from './story';
import { BOSS_IDS, TOWN_LINES, tallyLine, townLine } from './tally';

// The Ledger (#1585, #1586, #1587, docs/specs/world.md section 12.9): the story lines the player has seen, in stage order, and the new lines of
// stages 3 to 5. Every line declares its stage and holds no secret word of a later one.
const leaks = (stage: number, text: string): string[] => SECRETS.filter(({ word, from }) => stage < from && word.test(text)).map(({ word }) => word.source);

describe('the lines of stages 3, 4 and 5', () => {
  it('say the sample of the issue exactly; the stage 3 sample keeps "delivered" back for stage 4, so it reads "breathing" (world.md 12.2)', () => {
    expect(MEDAL_LINE).toBe('Seat 3: not on board. Not on the books as lost. Entered: breathing.');
    expect(CARGO_LINE).toBe('Outside: minus one hundred and sixty. The glass lets go of what it held. Entered as weather.');
    expect(VOIDED_LINE).toBe('Run voided. Audit reopened. Line 0412 carries a mark from before. Entered without comment.');
    expect(TERMINAL_LINE).toBe('Read count: two. Line 0412 read this first, and walked on.');
  });

  it('are appended to a body as a note of Tally', () => {
    expect(appended('A body.', 'A line.')).toBe('A body. Appended by TALLY: A line.');
  });
});

describe('LEDGER', () => {
  it('lists the story lines from stage 2 up, in stage order, each with a unique lowercase id and a whole stage', () => {
    expect(LEDGER.map((l) => [l.id, l.stage])).toEqual([
      ['bot', 2],
      ['town-0', 2],
      ['town-1', 3],
      ['medal', 3],
      ['town-2', 4],
      ['town-3', 4],
      ['cargo', 4],
      ['town-4', 5],
      ['voided', 5],
      ['terminal', 5],
      ['ballast-6', 6],
      ['ballast-7', 7],
    ]);
    expect(new Set(LEDGER.map((l) => l.id)).size).toBe(LEDGER.length);
    expect(new Set(LEDGER.map((l) => l.line)).size).toBe(LEDGER.length);
    LEDGER.forEach(({ id, stage, line }, i) => {
      expect(id).toMatch(/^[a-z]+(-\d)?$/);
      expect(Number.isInteger(stage), id).toBe(true);
      expect(stage, id).toBeGreaterThanOrEqual(2);
      expect(stage, id).toBeLessThanOrEqual(7);
      if (i > 0) expect(stage, id).toBeGreaterThanOrEqual(LEDGER[i - 1]!.stage);
      expect(line.length, id).toBeLessThanOrEqual(120);
    });
  });

  it('holds the lines of the other sources unchanged, each at the stage that serves it', () => {
    const line = (id: string): string => LEDGER.find((l) => l.id === id)!.line;
    expect(line('bot')).toBe(tallyLine({ mode: 'bot', stage: 2 }));
    expect(line('ballast-6')).toBe(tallyLine({ mode: 'boss', boss: 'ballast', stage: 6 }));
    expect(line('ballast-7')).toBe(bossEndLine('ballast', 'win', 7));
    TOWN_LINES.forEach((town, i) => {
      expect(line(`town-${i}`)).toBe(townLine(i, 7));
      expect(LEDGER.find((l) => l.id === `town-${i}`)!.stage).toBe(town.stage);
    });
    expect(LEDGER.filter((l) => ['medal', 'cargo', 'voided', 'terminal'].includes(l.id)).map((l) => [l.id, l.stage, l.line])).toEqual([
      ['medal', 3, MEDAL_LINE],
      ['cargo', 4, CARGO_LINE],
      ['voided', 5, VOIDED_LINE],
      ['terminal', 5, TERMINAL_LINE],
    ]);
  });

  it('holds no secret word of a later stage than its own', () => {
    for (const { id, stage, line } of LEDGER) expect(leaks(stage, line), `${id} (stage ${stage})`).toEqual([]);
  });
});

describe('ledgerList', () => {
  it('keeps the lines seen whose stage is reached, in stage order, whatever the order seen', () => {
    expect(ledgerList([], 7)).toEqual([]);
    expect(ledgerList(['town-4', 'cargo', 'bot', 'medal'], 7).map((l) => l.id)).toEqual(['bot', 'medal', 'cargo', 'town-4']);
  });

  it('never lists a line above the stage, even one that was seen', () => {
    expect(ledgerList(['bot', 'medal', 'cargo', 'voided', 'terminal', 'ballast-7'], 3).map((l) => l.id)).toEqual(['bot', 'medal']);
    expect(ledgerList(['town-0', 'town-4', 'ballast-7'], 1)).toEqual([]);
  });

  it('ignores an id it does not know, as an older or newer profile may hold', () => {
    expect(ledgerList(['nonsense', 'bot', ''], 7).map((l) => l.id)).toEqual(['bot']);
  });
});

describe('linesIn', () => {
  it('finds the Ledger lines a text holds', () => {
    expect(linesIn(appended('The body.', MEDAL_LINE)).map((l) => l.id)).toEqual(['medal']);
    expect(linesIn(`${tallyLine({ mode: 'bot', stage: 2 })}`).map((l) => l.id)).toEqual(['bot']);
    expect(linesIn(tallyLine({ mode: 'bot', stage: 1 }))).toEqual([]);
    expect(linesIn('')).toEqual([]);
  });
});

describe('the rule of section 12.4 for the sources of the Ledger', () => {
  const store = (): Storage => ({ getItem: () => null, setItem: () => undefined }) as unknown as Storage;
  const bosses = [{ id: 'echo', name: 'The Echo' }];
  /** Every text the sources of the Ledger serve at `stage`. */
  function served(stage: number): string[] {
    const shell = EVENTS.find((e) => e.title === 'Shelled crewmate')!;
    return [
      medalRoom(store(), bosses, stage).body,
      ...LORE.flatMap((e) => [entryOf(e.id, stage)!.body]),
      entryOf('bridge-clamp', stage)!.body,
      ...AUDIO_LOGS.flatMap((log) => log.lines.map((l) => lineAt(log, l.at, stage)!)),
      auditLine({ end: 'lost', army: 3 } as Run, stage),
      ...shell.choices.map((c) => choiceText({ army: 10, scrap: 100 } as Run, c, stage)),
      ...TOWN_LINES.map((_, i) => townLine(i, stage)),
      ...['local', 'bot', 'online'].map((mode) => tallyLine({ mode: mode as 'bot', stage })),
      ...BOSS_IDS.map((boss) => tallyLine({ mode: 'boss', boss, stage })),
      ...BOSS_IDS.flatMap((boss) => [bossEndLine(boss, 'win', stage)!, bossEndLine(boss, 'loss', stage)!]),
    ];
  }

  it('serves no secret word that its stage may not speak of, at any of the 7 stages', () => {
    for (let stage = 1; stage <= 7; stage++) for (const text of served(stage)) expect(leaks(stage, text), `${text} (stage ${stage})`).toEqual([]);
  });
});
