import { describe, expect, it } from 'vitest';
import { AUDIO_LOGS } from './audiologs';
import { LORE } from './lore';
import { deckOf, DECK_NAMES } from './deck';
import { CLAMP_OPEN, EPILOGUE } from './epilogue';
import { audioDeckOf, BOSS_BLURBS, BOSS_LORE, bossBlurb, bossLore, entryOf, STORY, WORLD_LOGS, type StoryEntry } from './lorelogs';
import { SECRETS } from './story';
import { BOSS_IDS } from './tally';

// The lore of the story (docs/specs/world.md section 12): 15 boss entries and 12 world logs, each with its stage of the reveal ladder.
const ENTRIES: readonly StoryEntry[] = [...BOSS_LORE, ...WORLD_LOGS];

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

// #1516, #1544: every boss is a tower, a station of one section of the Ballast (a deck, world.md section 13), with its blurb and its entry.
describe('the tower of each boss (#1516, #1544)', () => {
  const section = (boss: string): string => deckOf('boss', boss).replace(/^./, (c) => c.toUpperCase());

  it('has a blurb for each of the 15 bosses, in the order of the roster, at stage 1: a boss menu shows it at any time', () => {
    expect(BOSS_BLURBS.map((b) => b.boss)).toEqual([...BOSS_IDS]);
    for (const b of BOSS_BLURBS) {
      expect(b.stage, b.boss).toBe(1);
      expect(b.blurb.length, b.boss).toBeGreaterThan(0);
      expect(b.blurb.length, b.boss).toBeLessThanOrEqual(80);
      expect(b.blurb, b.boss).not.toMatch(/[<>&\n]/);
    }
  });

  it('holds no secret word of the story, at any stage, and repeats no blurb', () => {
    for (const { boss, blurb } of BOSS_BLURBS) for (const { word } of SECRETS) expect(blurb, boss).not.toMatch(word);
    expect(new Set(BOSS_BLURBS.map((b) => b.blurb)).size).toBe(15);
  });

  it('repeats no sentence of a boss entry, a terminal or an audio log', () => {
    const old = new Set([...BOSS_LORE.map((e) => e.body), ...LORE.map((e) => e.body), ...AUDIO_LOGS.flatMap((l) => l.lines.map((line) => line.text))].flatMap(sentences));
    for (const { boss, blurb } of BOSS_BLURBS) for (const sentence of sentences(blurb)) expect(old.has(sentence), `${boss}: ${sentence}`).toBe(false);
  });

  it('gives the blurb of a boss, none for a boss the roster does not hold', () => {
    for (const id of BOSS_IDS) expect(bossBlurb(id)).toBe(BOSS_BLURBS.find((b) => b.boss === id)!.blurb);
    expect(bossBlurb('nobody')).toBeUndefined();
  });

  it('puts every boss in a section of the ship: its entry is titled by that section, and the section keeps its two terminals', () => {
    for (const id of BOSS_IDS) {
      expect(DECK_NAMES, id).toContain(deckOf('boss', id));
      expect(bossLore(id)!.title, id).toMatch(new RegExp(`^${section(id)}: `));
    }
    for (const deck of DECK_NAMES) expect(LORE.filter((e) => e.deck === deck)).toHaveLength(2);
  });

  it('keeps the five senior seats on the five sections, one each, and the ten later bosses on the same five', () => {
    expect(BOSS_IDS.slice(0, 5).map((id) => deckOf('boss', id))).toEqual([...DECK_NAMES]);
    expect(new Set(BOSS_IDS.slice(5).map((id) => deckOf('boss', id)))).toEqual(new Set(DECK_NAMES));
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

  it('list the 28 entries of the story, the bosses, the logs then the epilogue, and find any entry of the reader by its id', () => {
    expect(STORY).toEqual([...BOSS_LORE, ...WORLD_LOGS, { id: EPILOGUE.id, title: EPILOGUE.title, body: EPILOGUE.body, stage: 7 }]);
    expect(entryOf('mess-house-rule')!.title).toBe("Captain's order, pinned above table four");
    expect(entryOf('boss-hull')).toBe(BOSS_LORE[1]);
    expect(entryOf('log-meadow-near')).toBe(WORLD_LOGS[0]);
    expect(entryOf('nobody-here')).toBeUndefined();
  });

  // #1546: from stage 7 the bridge console reads the clamp open; every other entry reads the same at every stage.
  it('give the bridge console its open-clamp text from stage 7 and the locked one before, the other entries the same at every stage', () => {
    const locked = entryOf('bridge-clamp')!;
    expect(locked.body).toMatch(/^Docking clamp: locked\./);
    for (const stage of [1, 4]) expect(entryOf('bridge-clamp', stage)).toBe(locked);
    expect(entryOf('bridge-clamp', 6)!.body).toMatch(/^Docking clamp: locked\./); // from stage 5 with the note of Tally under it (#1587)
    expect(entryOf('bridge-clamp', 7)).toMatchObject({ id: 'bridge-clamp', title: CLAMP_OPEN.title, body: expect.stringContaining(CLAMP_OPEN.body) });
    expect(entryOf('mess-house-rule', 4)).toBe(entryOf('mess-house-rule'));
    expect(entryOf('story-epilogue')!.title).toBe(EPILOGUE.title);
    expect(audioDeckOf('story-epilogue')).toBeNull();
  });

  // #1585: after stage 5 every terminal of the Hub carries an appended note of Tally.
  it('append the note of Tally to every terminal from stage 5, the bridge console too, and to nothing else', () => {
    const note = ' Appended by TALLY: Read count: two. Line 0412 read this first, and walked on.';
    for (const { id, body } of LORE) {
      for (const stage of [1, 2, 3, 4]) expect(entryOf(id, stage)!.body, `${id} ${stage}`).toBe(entryOf(id)!.body);
      for (const stage of [5, 6]) expect(entryOf(id, stage)!.body, `${id} ${stage}`).toBe(`${body}${note}`);
    }
    expect(entryOf('bridge-clamp', 7)!.body).toBe(`${CLAMP_OPEN.body}${note}`);
    expect(entryOf('cargo-assay', 7)!.title).toBe(LORE.find((e) => e.id === 'cargo-assay')!.title);
    for (const stage of [5, 7]) {
      expect(entryOf('boss-hull', stage)).toBe(BOSS_LORE[1]);
      expect(entryOf('log-meadow-near', stage)).toBe(WORLD_LOGS[0]);
    }
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
