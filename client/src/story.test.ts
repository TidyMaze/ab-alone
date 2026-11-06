import { describe, expect, it } from 'vitest';
import { AUDIO_LOGS } from './audiologs';
import { LORE } from './lore';
import main from './main.ts?raw';
import { BOSS_LORE, STORY, WORLD_LOGS } from './lorelogs';
import { catchUp, fire, gated, loadStory, SEALED, SECRETS, stageOf, STORY_KEY, storyStage, TRIGGERS, type StoryEvent } from './story';
import { BOSS_IDS, tallyLine } from './tally';

// The stage store of the story (docs/specs/world.md section 12, #1584): the game reveals the story in order, so a new player cannot read the
// ending first. These are the tests of the rule of section 12.4.
const memory = (): Storage => {
  const items = new Map<string, string>();
  return { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v) } as Storage;
};
const MAIN_LINE: StoryEvent[] = [
  { on: 'won', id: 'echo' },
  { on: 'room', id: 'medal-room' },
  { on: 'won', id: 'hull' },
  { on: 'won', id: 'chaplain' },
  { on: 'start', id: 'ballast' },
  { on: 'won', id: 'ballast' },
];
const saved = (store: Storage): unknown => JSON.parse(store.getItem(STORY_KEY)!);

describe('TRIGGERS', () => {
  it('bind the stages 2 to 7 once each, strictly in order', () => {
    expect(TRIGGERS.map((t) => t.stage)).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it('bind each main-line moment of the ladder to the events of today', () => {
    expect(TRIGGERS.map((t) => t.main)).toEqual([
      { on: 'won' },
      { on: 'room', id: 'medal-room' },
      { on: 'won', id: 'hull' },
      { on: 'won', id: 'chaplain' },
      { on: 'start', id: 'ballast' },
      { on: 'won', id: 'ballast' },
    ]);
    expect(TRIGGERS[0]!.optional).toEqual({ on: 'win', times: 3 });
  });

  it('have a real call site: main.ts fires every kind of event the table binds', () => {
    const fired = new Set([...main.matchAll(/storyEvent\(\{ on: '(\w+)'/g)].map((m) => m[1]));
    for (const { stage, main: trigger, optional } of TRIGGERS) {
      for (const t of [trigger, optional]) if (t) expect(fired.has(t.on), `stage ${stage}: ${t.on}`).toBe(true);
    }
  });
});

describe('the stage', () => {
  it('is 1 for a new player, a corrupt save and a blocked store', () => {
    expect(storyStage(memory())).toBe(1);
    expect(storyStage(null)).toBe(1);
    for (const text of ['', 'nonsense', '{"moments":', 'null', '[]', '7', '{"moments":"2","wins":0}', '{"moments":[2,"3"],"wins":0}', '{"moments":[2,9],"wins":0}', '{"moments":[1],"wins":0}', '{"moments":[2.5],"wins":0}', '{"moments":[2]}', '{"moments":[2],"wins":-1}', '{"moments":[2],"wins":1.5}']) {
      const store = memory();
      store.setItem(STORY_KEY, text);
      expect(storyStage(store), text).toBe(1);
      expect(loadStory(store), text).toMatchObject({ moments: [], wins: 0 });
    }
  });

  it('is the longest unbroken run of moments from stage 2 up', () => {
    const at = (...moments: number[]): number => stageOf({ moments, wins: 0, bosses: [] });
    expect(at()).toBe(1);
    expect(at(2)).toBe(2);
    expect(at(2, 3)).toBe(3);
    expect(at(3, 2)).toBe(3);
    expect(at(2, 4)).toBe(2);
    expect(at(5)).toBe(1);
    expect(at(2, 3, 4, 6, 7)).toBe(4);
    expect(at(2, 3, 4, 5, 6, 7)).toBe(7);
  });

  it('reaches 7 on the main line alone: the optional triggers are never needed', () => {
    const store = memory();
    const stages = MAIN_LINE.map((event) => fire(store, event));
    expect(stages).toEqual([2, 3, 4, 5, 6, 7]);
    expect(storyStage(store)).toBe(7);
  });

  it('counts a moment fired out of order as soon as the ones before it are reached', () => {
    const store = memory();
    expect(fire(store, { on: 'won', id: 'chaplain' })).toBe(2); // the first boss beaten, whichever it is, and the Chaplain's own moment
    expect(saved(store)).toMatchObject({ moments: [2, 5], wins: 0 });
    expect(fire(store, { on: 'won', id: 'hull' })).toBe(5); // a second boss reaches 3, The Hull is 4, and the Chaplain's 5 was waiting
  });
});

describe('fire', () => {
  it('records the first boss win as stage 2, and a boss of the ladder as its own moment as well', () => {
    const store = memory();
    expect(fire(store, { on: 'won', id: 'swarm' })).toBe(2);
    expect(saved(store)).toMatchObject({ moments: [2], wins: 0 });
    expect(fire(store, { on: 'won', id: 'hull' })).toBe(4); // a second boss is stage 3 as well
    expect(saved(store)).toMatchObject({ moments: [2, 3, 4], wins: 0 });
  });

  it('records a moment once, and writes nothing when an event changes nothing', () => {
    const store = memory();
    fire(store, { on: 'won', id: 'echo' });
    const writes: string[] = [];
    const watched = { getItem: (k: string) => store.getItem(k), setItem: (k: string, v: string) => void writes.push(v) } as Storage;
    fire(watched, { on: 'won', id: 'echo' });
    fire(watched, { on: 'start', id: 'echo' });
    fire(watched, { on: 'room', id: 'bridge' });
    fire(watched, { on: 'room' });
    expect(writes).toEqual([]);
  });

  it('keeps the moments of a save, in the order fired', () => {
    const store = memory();
    fire(store, { on: 'start', id: 'ballast' });
    fire(store, { on: 'room', id: 'medal-room' });
    expect(saved(store)).toMatchObject({ moments: [6, 3], wins: 0 });
  });

  it('reaches 7 for a player who never opens the Medal room: a second boss stands in for it, and the first alone does not', () => {
    const store = memory();
    expect(fire(store, { on: 'won', id: 'hull' })).toBe(2);
    expect(fire(store, { on: 'won', id: 'hull' })).toBe(2); // the same boss again is no second boss
    expect(fire(store, { on: 'won', id: 'echo' })).toBe(4);
    expect(fire(store, { on: 'won', id: 'chaplain' })).toBe(5);
    expect(fire(store, { on: 'start', id: 'ballast' })).toBe(6);
    expect(fire(store, { on: 'won', id: 'ballast' })).toBe(7);
  });

  it('counts the wins of any mode, and the third is the optional trigger of stage 2 only', () => {
    const store = memory();
    expect(fire(store, { on: 'win' })).toBe(1);
    expect(fire(store, { on: 'win' })).toBe(1);
    expect(saved(store)).toMatchObject({ moments: [], wins: 2 });
    expect(fire(store, { on: 'win' })).toBe(2);
    expect(saved(store)).toMatchObject({ moments: [2], wins: 3 });
    expect(fire(store, { on: 'win' })).toBe(2); // nothing else follows from wins
    expect(saved(store)).toMatchObject({ moments: [2], wins: 4 });
  });

  it('survives a blocked storage without throwing', () => {
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } } as unknown as Storage;
    expect(fire(blocked, { on: 'won', id: 'echo' })).toBe(2);
    expect(fire(null, { on: 'won', id: 'echo' })).toBe(2);
  });
});

describe('catchUp', () => {
  it('fires the boss moments of the medals a player already holds, so nobody is sent back', () => {
    const store = memory();
    catchUp(store, { echo: 14, hull: 20, ballast: 60 });
    expect(saved(store)).toMatchObject({ moments: [2, 3, 4, 6, 7], wins: 0 });
    expect(storyStage(store)).toBe(4); // the Chaplain (5) is still to come
  });

  it('writes nothing for a player with no medal', () => {
    const store = memory();
    catchUp(store, {});
    expect(store.getItem(STORY_KEY)).toBeNull();
  });
});

describe('gated', () => {
  const entries = [{ stage: 1 }, { stage: 3 }, { stage: 4 }, { stage: 7 }];
  it('keeps the entries whose stage is reached', () => {
    expect(gated(entries, 1)).toEqual([{ stage: 1 }]);
    expect(gated(entries, 4)).toEqual([{ stage: 1 }, { stage: 3 }, { stage: 4 }]);
    expect(gated(entries, 7)).toEqual(entries);
  });
});

describe('the rule of section 12.4', () => {
  /** The secret words `text` holds that stage `stage` may not speak of yet. */
  const leaks = (stage: number, text: string): string[] => SECRETS.filter(({ word, from }) => stage < from && word.test(text)).map(({ word }) => word.source);

  it('flags a secret word before its stage and lets it through from its stage on', () => {
    expect(leaks(3, 'The cold and the word delivered.')).toEqual(['deliver', '\\bcold']);
    expect(leaks(4, 'The cold and the word delivered.')).toEqual([]);
    expect(leaks(4, 'Line 0412 cannot push.')).toEqual(['0412', 'cannot push']);
    expect(leaks(6, 'Line 0412 cannot push.')).toEqual([]);
  });

  it('every line of stage n holds no secret word of a later stage: Tally lines', () => {
    const lines = (stage: number): string[] => [
      ...(['local', 'bot', 'online'] as const).map((mode) => tallyLine({ mode, stage })),
      ...BOSS_IDS.map((boss) => tallyLine({ mode: 'boss', boss, stage })),
    ];
    for (let stage = 1; stage <= 7; stage++) for (const line of lines(stage)) expect(leaks(stage, line), `${line} (stage ${stage})`).toEqual([]); // served at this stage: the Ballast Mind says its limit from stage 6 (#1588)
  });

  it('every line of stage n holds no secret word of a later stage: the terminals, the audio logs, the bosses, the logs of the world', () => {
    for (const e of LORE) expect(leaks(e.stage, `${e.title} ${e.body}`), e.id).toEqual([]);
    for (const log of AUDIO_LOGS) expect(leaks(log.stage, `${log.title} ${log.lines.map((l) => l.text).join(' ')}`), log.id).toEqual([]);
    for (const e of STORY) expect(leaks(e.stage, `${e.title} ${e.body}`), e.id).toEqual([]);
  });

  it('every lore.ts and audiologs.ts entry carries a stage from 1 to 7', () => {
    expect(LORE).toHaveLength(10);
    expect(AUDIO_LOGS).toHaveLength(5);
    for (const e of [...LORE, ...AUDIO_LOGS]) {
      expect(Number.isInteger(e.stage), e.id).toBe(true);
      expect(e.stage, e.id).toBeGreaterThanOrEqual(1);
      expect(e.stage, e.id).toBeLessThanOrEqual(7);
    }
  });

  it('keeps the meaning of the entries reworded for the rule', () => {
    const body = (id: string): string => LORE.find((e) => e.id === id)!.body;
    expect(body('chapel-sermon')).toContain('It is a coat against the night, given freely.');
    const lines = (id: string): string => AUDIO_LOGS.find((l) => l.id === id)!.lines.map((l) => l.text).join('\n');
    expect(lines('cargo-night-shift')).toContain('[A wide, dim bay. A crane runs somewhere above.]');
    expect(lines('cargo-night-shift')).toContain('That is the night air.');
    expect(lines('bridge-crew-count')).toContain('[A clean, steady hum. The console chimes.]');
  });

  it('every Tally line fits the HUD: one line of 72 characters at most, including the sealed one', () => {
    for (let stage = 1; stage <= 7; stage++) {
      for (const mode of ['local', 'bot', 'online'] as const) {
        const line = tallyLine({ mode, stage });
        expect(line.length, line).toBeLessThanOrEqual(72);
        expect(line).not.toContain('\n');
      }
    }
  });

  it('the sealed line is one fixed entry, in Tally is register, with no secret word and no markup', () => {
    expect(SEALED.body.length).toBeLessThanOrEqual(200);
    expect(leaks(1, `${SEALED.title} ${SEALED.body}`)).toEqual([]);
    expect(`${SEALED.title}${SEALED.body}`).not.toMatch(/[<>&]/);
    for (const e of BOSS_LORE) expect(SEALED.body).not.toContain(e.title);
  });

  it('keeps the world logs at stage 1 to 3', () => {
    for (const e of WORLD_LOGS) expect(e.stage, e.id).toBeLessThanOrEqual(3);
  });
});
