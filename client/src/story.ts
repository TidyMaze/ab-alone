// The stage store of the story (docs/specs/world.md section 12, #1584): the game reveals the story in order, so a new player cannot read the ending
// first. The ladder has seven stages. Stage 1 is the premise; stages 2 to 7 each begin at a moment of the game, bound in `TRIGGERS` to the events of
// today (a boss id, a Hub room), so the table is the one place to re-point them at towers later. Every moment is recorded when it happens, even out of
// order; the stage is the longest unbroken run of moments from stage 2 up. Saved locally in one key through the store of the lore (no server).
import type { Medals } from './medals';
import { read, write, type Store } from './quality';

/** Something that happened in the game: a boss `won` or a fight that `start`s (`id` the boss), a Hub `room` entered (`id` the reader's id), a `town` of the
 * Open world entered (#1586), a `win` of any mode. */
export interface StoryEvent {
  on: 'won' | 'start' | 'room' | 'town' | 'win';
  id?: string;
}

/** What a moment waits for: an event of this kind, of this id when it has one, and the count it needs: wins for a `win`, different bosses for a `won`. */
export interface Trigger extends StoryEvent {
  times?: number;
}

/** The moment that begins `stage`: the main ones, any of which the main line of the game fires (stage 3 is the Medal room or a town), and an optional
 * one, a second way to the same stage (it counts for that stage only, as a main one does). Today's events only: the optional triggers of the ladder
 * that need content the game has not got yet (an ejected crewmate of the rogue-lite, a night survived, a lost run, five towers) are not bound. */
export interface StageTrigger {
  stage: number;
  main: readonly Trigger[];
  optional?: Trigger;
}

export const TRIGGERS: readonly StageTrigger[] = [
  { stage: 2, main: [{ on: 'won' }], optional: { on: 'win', times: 3 } }, // the first boss beaten, or 3 wins in any mode
  { stage: 3, main: [{ on: 'room', id: 'medal-room' }, { on: 'town' }], optional: { on: 'won', times: 2 } }, // the Medal room or a town first visited, or a second boss beaten: nobody is stuck for not opening a room
  { stage: 4, main: [{ on: 'won', id: 'hull' }] }, // The Hull beaten
  { stage: 5, main: [{ on: 'won', id: 'chaplain' }] }, // The Chaplain beaten
  { stage: 6, main: [{ on: 'start', id: 'ballast' }] }, // The Ballast Mind's fight starts
  { stage: 7, main: [{ on: 'won', id: 'ballast' }] }, // The Ballast Mind beaten
];

/** The secret words of the ladder and the stage that may first hold each (world.md section 12.2): a line of an earlier stage holds none. */
export const SECRETS: readonly { word: RegExp; from: number }[] = [
  { word: /deliver/i, from: 4 },
  { word: /\bcold/i, from: 4 },
  { word: /0412/, from: 5 },
  { word: /cannot push/i, from: 6 },
];

/** What a win screen shows in place of an entry the player has not reached: the same for every boss, no secret word, in Tally's register. */
export const SEALED = { title: 'Ledger: sealed', body: 'Seat: empty. The entry is held. Tally enters it when the count allows.' } as const;

export const STORY_KEY = 'ab-alone.story';

/** What is saved: the stages whose moment came, in the order they came, the wins counted in any mode and the bosses beaten. */
export interface Story {
  moments: number[];
  wins: number;
  bosses: string[];
}

const whole = (n: unknown, least: number): n is number => Number.isInteger(n) && (n as number) >= least;

/** The saved story: a new player's, empty, for a missing or a corrupt save. */
export function loadStory(store: Store): Story {
  try {
    const saved = JSON.parse(read(store, STORY_KEY) ?? 'null') as Partial<Story> | null;
    const { moments, wins, bosses = [] } = saved ?? {};
    if (Array.isArray(moments) && moments.every((m) => whole(m, 2) && m <= 7) && whole(wins, 0) && Array.isArray(bosses)) return { moments, wins, bosses };
  } catch {
    // Not JSON: a new player.
  }
  return { moments: [], wins: 0, bosses: [] };
}

/** The stage of a story: the longest unbroken run of moments from stage 2 up, 1 with none. */
export function stageOf({ moments }: Story): number {
  let stage = 1;
  while (moments.includes(stage + 1)) stage++;
  return stage;
}

/** The stage the player has reached. */
export const storyStage = (store: Store): number => stageOf(loadStory(store));

const matches = (t: Trigger, e: StoryEvent, count: number): boolean => t.on === e.on && (t.id === undefined || t.id === e.id) && count >= (t.times ?? 0);

/** Records what happened, saves it when it changed anything, and returns the stage reached. */
export function fire(store: Store, event: StoryEvent): number {
  const story = loadStory(store);
  const wins = story.wins + (event.on === 'win' ? 1 : 0);
  const newBoss = event.on === 'won' && !story.bosses.includes(event.id!);
  const bosses = newBoss ? [...story.bosses, event.id!] : story.bosses;
  const count = event.on === 'win' ? wins : bosses.length;
  const hit = TRIGGERS.filter(({ stage, main, optional }) => !story.moments.includes(stage) && [...main, optional].some((t) => t && matches(t, event, count))).map((t) => t.stage);
  const next = { moments: [...story.moments, ...hit], wins, bosses };
  if (hit.length > 0 || wins !== story.wins || newBoss) write(store, STORY_KEY, JSON.stringify(next));
  return stageOf(next);
}

/** Fires the moments of the medals a player already holds: a boss beaten was started and won, so nobody is sent back. */
export function catchUp(store: Store, medals: Medals): void {
  for (const id of Object.keys(medals)) {
    fire(store, { on: 'start', id });
    fire(store, { on: 'won', id });
  }
}

/** The entries whose stage is reached. */
export const gated = <T extends { stage: number }>(entries: readonly T[], stage: number): T[] => entries.filter((e) => e.stage <= stage);
