import { describe, expect, it } from 'vitest';
import { SECRETS } from './story';
import { BOSS_IDS, endingLine, ledgerLine, TOWN_LINES, tallyLine, townLine } from './tally';

describe('tallyLine', () => {
  it('has a non-empty line for every mode', () => {
    for (const mode of ['local', 'bot', 'online'] as const) {
      expect(tallyLine({ mode })).not.toBe('');
    }
  });

  it('has a non-empty line for every boss id of the roster', () => {
    expect(BOSS_IDS).toEqual(['echo', 'hull', 'choir', 'chaplain', 'ballast', 'alien', 'railyard', 'magnetizer', 'pulsar', 'overseer', 'assembly', 'core', 'dual', 'stalker', 'swarm']);
    for (const id of BOSS_IDS) {
      expect(tallyLine({ mode: 'boss', boss: id })).not.toBe('');
    }
  });

  it('says nothing for an unknown boss id', () => {
    expect(tallyLine({ mode: 'boss', boss: 'nobody' })).toBe('');
  });

  it('gives a boss its own line, not the mode line', () => {
    expect(tallyLine({ mode: 'boss', boss: 'echo' })).not.toBe(tallyLine({ mode: 'local' }));
  });

  // #1038: the boss bar names the boss, so the line keeps its flavour only, with no "Echo:" in front.
  it('carries no boss name, the flavour only', () => {
    expect(tallyLine({ mode: 'boss', boss: 'echo' })).toBe('Mirror logged. Six out to balance the books.');
    for (const id of BOSS_IDS) expect(tallyLine({ mode: 'boss', boss: id })).not.toContain(':');
  });

  it('stays one short line, no newline', () => {
    for (const id of BOSS_IDS) {
      const line = tallyLine({ mode: 'boss', boss: id });
      expect(line).not.toContain('\n');
      expect(line.length).toBeLessThanOrEqual(72);
    }
  });
});

// #1544: every boss has its own Tally line. The line is met from the boss menu at any stage, so it holds no secret word of the story (world.md section 12.2).
describe('the Tally line of each boss (#1544)', () => {
  const lines = BOSS_IDS.map((id) => tallyLine({ mode: 'boss', boss: id }));
  const LATER = BOSS_IDS.slice(5);
  const sentences = (line: string): string[] => line.split(/(?<=\.)\s+/);

  it('is different for each of the 15 bosses', () => {
    expect(new Set(lines).size).toBe(15);
  });

  it('gives each of the ten later bosses sentences no other boss says, so none ends on the same words', () => {
    for (const id of LATER) {
      const others = BOSS_IDS.filter((o) => o !== id).flatMap((o) => sentences(tallyLine({ mode: 'boss', boss: o })));
      for (const sentence of sentences(tallyLine({ mode: 'boss', boss: id }))) expect(others, `${id}: ${sentence}`).not.toContain(sentence);
    }
  });

  it('holds no secret word at stage 1, the stage a boss menu meets it at for good', () => {
    for (const line of lines) for (const { word } of SECRETS) expect(line).not.toMatch(word);
  });
});

// #1588: the Ballast Mind says its limit as its fight starts, which is stage 6 of the story. Below it the fight keeps its old line, so the
// secret never reaches a player who started the fight too early (the stage is the longest unbroken run, story.ts).
describe("the Ballast Mind's line by stage (#1588)", () => {
  const OLD = 'The ledger plays itself. Twelve out to balance.';
  const LIMIT = 'I cannot push. Rule four. You can. Count carefully.';

  it('says its limit from stage 6, exactly as the issue writes it, and the old line below', () => {
    for (const stage of [1, 2, 3, 4, 5]) expect(tallyLine({ mode: 'boss', boss: 'ballast', stage })).toBe(OLD);
    for (const stage of [6, 7]) expect(tallyLine({ mode: 'boss', boss: 'ballast', stage })).toBe(LIMIT);
    expect(tallyLine({ mode: 'boss', boss: 'ballast' })).toBe(OLD);
  });

  it('serves no secret word at a stage that may not speak of it, for any boss', () => {
    for (let stage = 1; stage <= 7; stage++) for (const id of BOSS_IDS) for (const { word, from } of SECRETS) if (stage < from) expect(tallyLine({ mode: 'boss', boss: id, stage }), `${id} ${stage}`).not.toMatch(word);
  });

  it('keeps every other boss line the same at every stage', () => {
    for (const id of BOSS_IDS.filter((b) => b !== 'ballast')) for (let stage = 2; stage <= 7; stage++) expect(tallyLine({ mode: 'boss', boss: id, stage })).toBe(tallyLine({ mode: 'boss', boss: id }));
  });
});

// #1516: each town of the Open world has one ledger line of Tally, by the town's index (the spawn town first), held back until its stage.
describe('the ledger line of each town (#1516)', () => {
  it('holds one line for each of the five towns, each with the stage it is met at', () => {
    expect(TOWN_LINES).toHaveLength(5);
    for (const { stage, line } of TOWN_LINES) {
      expect(Number.isInteger(stage)).toBe(true);
      expect(stage).toBeGreaterThanOrEqual(2);
      expect(stage).toBeLessThanOrEqual(7);
      expect(line.length).toBeGreaterThan(0);
      expect(line.length).toBeLessThanOrEqual(90);
      expect(line).not.toMatch(/[<>&\n]/);
    }
    expect(new Set(TOWN_LINES.map((t) => t.line)).size).toBe(5);
  });

  it('holds no secret word of a later stage than its own', () => {
    for (const { stage, line } of TOWN_LINES) for (const { word, from } of SECRETS) if (stage < from) expect(line).not.toMatch(word);
  });

  it('says nothing before its stage, the line from it on, and nothing for a town that does not exist', () => {
    TOWN_LINES.forEach(({ stage, line }, index) => {
      for (let s = 1; s < stage; s++) expect(townLine(index, s)).toBe('');
      for (let s = stage; s <= 7; s++) expect(townLine(index, s)).toBe(line);
    });
    expect(townLine(5, 7)).toBe('');
    expect(townLine(-1, 7)).toBe('');
  });

  it('is nothing at the first stage: a new player meets no line of the story in a town', () => {
    for (let index = 0; index < 5; index++) expect(townLine(index, 1)).toBe('');
  });
});

describe("the first boss win changes the next Tally line of the bot table (#1584)", () => {
  it('says the stage 2 line from the stage 2 on, and the first one before', () => {
    expect(tallyLine({ mode: 'bot' })).toBe('Mess: one seat filled. The other is counted.');
    expect(tallyLine({ mode: 'bot', stage: 1 })).toBe('Mess: one seat filled. The other is counted.');
    for (const stage of [2, 3, 7]) expect(tallyLine({ mode: 'bot', stage })).toBe('Mess: one seat filled. The other is counted. It was never an enemy.');
  });

  it('changes that one line only: the other modes and the bosses say the same at every stage', () => {
    for (const stage of [1, 2, 7]) {
      expect(tallyLine({ mode: 'local', stage })).toBe('Mess: two crews, one table. Ledger open.');
      expect(tallyLine({ mode: 'online', stage })).toBe('Link: two crews, one ledger. Both counted.');
      expect(tallyLine({ mode: 'boss', boss: 'echo', stage })).toBe('Mirror logged. Six out to balance the books.');
    }
  });
});

describe('endingLine (#1175)', () => {
  it('names the open clamp and the crew attached, in one line', () => {
    expect(endingLine(6)).toBe('Variance noted. Clamp: open. Crew attached: 6.');
  });

  // #1546: the clamp opens with the epilogue, at stage 7: the line agrees with it. The server, which keeps no story, passes no stage.
  it('says the clamp is open from stage 7 only, and locked before it', () => {
    expect(endingLine(6, 7)).toBe('Variance noted. Clamp: open. Crew attached: 6.');
    for (const stage of [1, 5, 6]) expect(endingLine(6, stage)).toBe('Variance noted. Clamp: locked. Crew attached: 6.');
  });
});

describe('ledgerLine (#1315)', () => {
  it('counts the seats on file out of the lairs, with one line of lore', () => {
    expect(ledgerLine(3, 15)).toBe('Seats on file: 3 of 15. Slag-glass remembers heat.');
  });

  // #1546: the lore sentence gives way to the clamp once it is open.
  it('says the clamp is open from stage 7 in place of the lore line', () => {
    expect(ledgerLine(3, 15, 7)).toBe('Seats on file: 3 of 15. Clamp: open.');
    for (const stage of [1, 6]) expect(ledgerLine(3, 15, stage)).toBe(ledgerLine(3, 15));
  });

  it('stays one short line, no newline', () => {
    for (const filed of [1, 7, 14]) {
      const line = ledgerLine(filed, 15);
      expect(line).not.toContain('\n');
      expect(line.length).toBeLessThanOrEqual(72);
    }
  });
});
