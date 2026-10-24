// Daily challenge, see docs/specs/game-design.md section 7.6. Pure functions only: main.ts feeds them
// the clock, the boss ids of the wasm bridge and the storage.

import { read, write, type Store } from './quality';

export interface Daily {
  day: string; // UTC date, YYYY-MM-DD
  id: string; // boss id, one of boss_ids()
  seed: number; // unsigned 32-bit, the Encounter seed
}

const KEY = 'ab-alone.daily';

/** The UTC date of the instant `ms` (a Date.now() value) as YYYY-MM-DD. It changes at 00:00 UTC. */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** 32-bit FNV-1a of the char codes of `text`, then the murmur3 finaliser so every bit of the result
 * depends on the whole text. Integer maths only (Math.imul, >>>): the same value in every browser. */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** The daily challenge of `day`: its seed, and its boss picked among `ids` (the bridge's boss list). */
export function dailyFor(day: string, ids: readonly string[]): Daily {
  const seed = hash32(`ab-alone daily ${day}`);
  return { day, id: ids[seed % ids.length]!, seed };
}

/** The label of the Daily challenge button. */
export const dailyTitle = (day: string, name: string): string => `Daily challenge ${day}: ${name}`;

/** The HUD line of a running daily fight. The e2e tests read it. */
export const dailyLine = (day: string, attempt: number): string => `Daily challenge ${day} · attempt ${attempt}`;

/** Attempts already started on `day`, 0 when the stored count is for another day. */
export function readAttempts(store: Store, day: string): number {
  const saved = /^(\S+) ([1-9]\d*)$/.exec(read(store, KEY) ?? '');
  return saved && saved[1] === day ? Number(saved[2]) : 0;
}

/** Counts one more attempt on `day` and returns it. Only the current day is kept. */
export function countAttempt(store: Store, day: string): number {
  const attempt = readAttempts(store, day) + 1;
  write(store, KEY, `${day} ${attempt}`);
  return attempt;
}

/** The site the result card links to: the daily challenge button is on its page. */
export const SITE = 'https://tidymaze.github.io/ab-alone/';

export interface DailyResult {
  day: string; // UTC date, YYYY-MM-DD
  boss: string; // the boss name
  goal: string; // the boss goal, one line of the card
  result: number; // Encounter.result(): 0 playing, 1 won, 2 lost (a draw is a loss)
  plies: number; // plies played, the boss replies included
  attempt: number; // the attempt of the day this fight was
}

const OUTCOME = ['', 'Victory in', 'Defeat in'];

/** The text of the result card, to copy and share: the day, the boss, its goal, the result, the plies
 * and the attempt, then the link. Empty while the fight is on, so the card shows only at the end. */
export function dailyCard({ day, boss, goal, result, plies, attempt }: DailyResult): string {
  if (result === 0) return '';
  const count = `${plies} ${plies === 1 ? 'ply' : 'plies'}`;
  return `AB-ALONE daily ${day}: ${boss}\nGoal: ${goal}\n${OUTCOME[result]} ${count} on attempt ${attempt}\n${SITE}`;
}
