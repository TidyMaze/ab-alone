import { describe, expect, it } from 'vitest';
import { AUDIO_LOGS } from './audiologs';
import { LORE } from './lore';
import { BOSS_LORE, WORLD_LOGS, type StoryEntry } from './lorelogs';
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
const sentences = (text: string): string[] =>
  text
    .split(/[.!?:]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.split(/\s+/).length >= 3);

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
    for (const e of ENTRIES) {
      for (const { word, from } of SECRETS) {
        if (e.stage < from) expect(`${e.title} ${e.body}`, `${e.id} (stage ${e.stage})`).not.toMatch(word);
      }
    }
  });

  it('repeats no text: no title, no body and no sentence of three words or more appears twice, nor in a terminal or an audio log', () => {
    expect(new Set(ENTRIES.map((e) => e.title)).size).toBe(ENTRIES.length);
    expect(new Set(ENTRIES.map((e) => e.body)).size).toBe(ENTRIES.length);
    const old = new Set([...LORE.map((e) => e.body), ...AUDIO_LOGS.flatMap((l) => l.lines.map((line) => line.text))].flatMap(sentences));
    const seen = new Set<string>();
    for (const e of ENTRIES) {
      for (const sentence of new Set(sentences(e.body))) {
        expect(old.has(sentence) || seen.has(sentence), `${e.id}: ${sentence}`).toBe(false);
        seen.add(sentence);
      }
    }
  });
});
