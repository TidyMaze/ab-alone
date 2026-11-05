import { describe, expect, it } from 'vitest';
import { AUDIO_LOGS } from './audiologs';
import { LORE } from './lore';
import { audioDeckOf, BOSS_LORE, bossLore, entryOf, STORY, WORLD_LOGS, type StoryEntry } from './lorelogs';
import { BOSS_IDS } from './tally';

// The lore of the story (docs/specs/world.md section 12): 15 boss entries and 12 world logs, each with its stage of the reveal ladder.
const ENTRIES: readonly StoryEntry[] = [...BOSS_LORE, ...WORLD_LOGS];

/** The secret words of the ladder and the stage that may first hold each (world.md section 12.2): none appears in an entry of an earlier stage. */
const SECRETS: readonly { word: RegExp; from: number }[] = [
  { word: /deliver/i, from: 4 },
  { word: /\bcold/i, from: 4 },
  { word: /0412/, from: 5 },
  { word: /cannot push/i, from: 6 },
];
/** The stages of the five bosses the ladder binds (world.md section 12.3); the other ten stay at 3 or below. */
const LADDER: Record<string, number> = { echo: 2, hull: 4, choir: 3, chaplain: 5, ballast: 7 };
/** The sentences of a text, lowercase, the device "Appended by TALLY" (the note under a terminal, world.md section 4) left out. */
const sentences = (text: string): string[] =>
  text
    .replace(/appended by tally/gi, '')
    .split(/[.!?:]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.split(/\s+/).length >= 3);

/** The secret words `entry` holds that its stage may not speak of yet. */
const leaks = (entry: StoryEntry): string[] => SECRETS.filter(({ word, from }) => entry.stage < from && word.test(`${entry.title} ${entry.body}`)).map(({ word }) => word.source);
/** The sentences of `entries` that appear twice among them or in `old`. */
const repeats = (entries: readonly StoryEntry[], old: ReadonlySet<string>): string[] => {
  const seen = new Set<string>();
  const again: string[] = [];
  for (const e of entries) {
    for (const sentence of new Set(sentences(e.body))) {
      if (old.has(sentence) || seen.has(sentence)) again.push(sentence);
      seen.add(sentence);
    }
  }
  return again;
};
const entry = (stage: number, body: string): StoryEntry => ({ id: 'a-b', title: 'T', body, stage });

describe('the rules of the story tests', () => {
  it('flag a secret word before its stage and let it through from its stage on', () => {
    expect(leaks(entry(3, 'The cold and the word delivered.'))).toEqual(['deliver', '\\bcold']);
    expect(leaks(entry(4, 'The cold and the word delivered.'))).toEqual([]);
    expect(leaks(entry(4, 'Line 0412 cannot push.'))).toEqual(['0412', 'cannot push']);
    expect(leaks(entry(5, 'Line 0412 cannot push.'))).toEqual(['cannot push']);
    expect(leaks(entry(6, 'Line 0412 cannot push.'))).toEqual([]);
  });

  it('flag a sentence of three words that appears twice, and ignore the short ones and the Appended by TALLY device', () => {
    const two = [entry(1, 'Nobody is hurt here. Entered: ok.'), entry(1, 'Appended by TALLY: Care. Nobody is hurt here!')];
    expect(repeats(two, new Set())).toEqual(['nobody is hurt here']);
    expect(repeats([entry(1, 'Entered. Entered.'), entry(1, 'Entered.')], new Set())).toEqual([]);
    expect(repeats([entry(1, 'The count is kept.')], new Set(['the count is kept']))).toEqual(['the count is kept']);
  });
});

describe('BOSS_LORE', () => {
  it('holds one entry per boss, in the order of the roster', () => {
    expect(BOSS_LORE.map((e) => e.boss)).toEqual([...BOSS_IDS]);
    expect(BOSS_LORE).toHaveLength(15);
  });

  it('the first five follow the ladder and the other ten stay at stage 3 or below', () => {
    for (const e of BOSS_LORE) {
      if (e.boss in LADDER) expect(e.stage, e.boss).toBe(LADDER[e.boss]);
      else expect(e.stage, e.boss).toBeLessThanOrEqual(3);
    }
  });

  it('a body holds 200 characters at most', () => {
    for (const e of BOSS_LORE) expect(e.body.length, e.id).toBeLessThanOrEqual(200);
  });
});

describe('WORLD_LOGS', () => {
  it('holds 12 logs of stage 1 to 3', () => {
    expect(WORLD_LOGS).toHaveLength(12);
    for (const e of WORLD_LOGS) expect(e.stage, e.id).toBeGreaterThanOrEqual(1);
    for (const e of WORLD_LOGS) expect(e.stage, e.id).toBeLessThanOrEqual(3);
  });

  it('a body holds 320 characters at most', () => {
    for (const e of WORLD_LOGS) expect(e.body.length, e.id).toBeLessThanOrEqual(320);
  });

  it('two or three logs carry the hint of a reread', () => {
    const rereads = WORLD_LOGS.filter((e) => e.reread).length;
    expect(rereads).toBeGreaterThanOrEqual(2);
    expect(rereads).toBeLessThanOrEqual(3);
  });
});

describe('every entry of the story (world.md section 12)', () => {
  it('has an id, a short title, a body and a whole stage from 1 to 7', () => {
    expect(ENTRIES).toHaveLength(27);
    expect(new Set(ENTRIES.map((e) => e.id)).size).toBe(ENTRIES.length);
    for (const e of ENTRIES) {
      expect(e.id).toMatch(/^[a-z]+(-[a-z]+)+$/);
      expect(e.title.trim(), e.id).not.toBe('');
      expect(e.title.length, e.id).toBeLessThanOrEqual(40);
      expect(e.body.trim(), e.id).not.toBe('');
      expect(Number.isInteger(e.stage), e.id).toBe(true);
      expect(e.stage, e.id).toBeGreaterThanOrEqual(1);
      expect(e.stage, e.id).toBeLessThanOrEqual(7);
    }
  });

  it('holds no secret word of a later stage than its own', () => {
    for (const e of ENTRIES) expect(leaks(e), `${e.id} (stage ${e.stage})`).toEqual([]);
  });

  it('repeats no text: no title, no body and no sentence of three words or more appears twice, nor in a terminal or an audio log', () => {
    expect(new Set(ENTRIES.map((e) => e.title)).size).toBe(ENTRIES.length);
    expect(new Set(ENTRIES.map((e) => e.body)).size).toBe(ENTRIES.length);
    const old = new Set([...LORE.map((e) => e.body), ...AUDIO_LOGS.flatMap((l) => l.lines.map((line) => line.text))].flatMap(sentences));
    expect(repeats(ENTRIES, old)).toEqual([]);
  });
});

describe('the lookups of the reader and the win screen', () => {
  it('give the entry of a boss, none for a boss the roster does not know', () => {
    for (const id of BOSS_IDS) expect(bossLore(id)!.boss).toBe(id);
    expect(bossLore('nobody')).toBeUndefined();
  });

  it('list the 27 entries of the story, the bosses then the logs, and find any entry of the reader by its id', () => {
    expect(STORY).toEqual([...BOSS_LORE, ...WORLD_LOGS]);
    expect(entryOf('mess-house-rule')!.title).toBe("Captain's order, pinned above table four");
    expect(entryOf('boss-hull')).toBe(BOSS_LORE[1]);
    expect(entryOf('log-meadow-near')).toBe(WORLD_LOGS[0]);
    expect(entryOf('nobody-here')).toBeUndefined();
  });

  it('give the audio log of an entry: the deck of a terminal or of a boss, none for a log of the world', () => {
    expect(audioDeckOf('cargo-assay')).toBe('cargo');
    expect(audioDeckOf('boss-echo')).toBe('mess');
    expect(audioDeckOf('boss-ballast')).toBe('bridge');
    expect(audioDeckOf('log-meadow-near')).toBeNull();
    expect(audioDeckOf('nobody-here')).toBeNull();
  });

  it('hold no markup character: the win screen writes them as text of the plate', () => {
    for (const e of STORY) expect(`${e.title}${e.body}`, e.id).not.toMatch(/[<>&]/);
  });
});
