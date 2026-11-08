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

/** The seed of the daily challenge of `day`: the boss fight's, and the rogue-lite daily run's (#1466). */
export const dailySeed = (day: string): number => hash32(`ab-alone daily ${day}`);

/** The daily challenge of `day`: its seed, and its boss picked among `ids` (the bridge's boss list). */
export function dailyFor(day: string, ids: readonly string[]): Daily {
  const seed = dailySeed(day);
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

/** Counts one more attempt on `day` and returns it. Only the current day is kept. The day is then a day played (`dailyRecord`). */
export function countAttempt(store: Store, day: string): number {
  const attempt = readAttempts(store, day) + 1;
  write(store, KEY, `${day} ${attempt}`);
  keepDay(store, day, { result: 'started', turns: 0 });
  return attempt;
}

// The days the daily was played (#1528, docs/specs/ui.md section 4.5): what the notice board of the Hub says of today's daily and counts for the
// local streak, in one key through the same store, no server. A day is `started` once the daily begins, then `won` or `lost` with the player turns
// of the fight; a win is kept over a loss, and a faster win over a slower one. An older profile has no such key: it loads as no day, and the
// attempts it already saved for a day count as that day started.
export interface DayRecord {
  result: 'started' | 'won' | 'lost';
  turns: number;
}

const DAYS_KEY = 'ab-alone.daily-days';
const KEPT_DAYS = 60;
const RANK = { started: 0, lost: 1, won: 2 };

function loadDays(store: Store): Record<string, DayRecord> {
  const days: Record<string, DayRecord> = {};
  try {
    const saved: unknown = JSON.parse(read(store, DAYS_KEY) ?? '{}');
    if (saved === null || typeof saved !== 'object' || Array.isArray(saved)) return days;
    for (const [day, text] of Object.entries(saved)) {
      const match = /^(started|(won|lost) ([1-9]\d*))$/.exec(String(text));
      if (/^\d{4}-\d\d-\d\d$/.test(day) && match) days[day] = match[2] ? { result: match[2] as 'won' | 'lost', turns: Number(match[3]) } : { result: 'started', turns: 0 };
    }
  } catch {
    // Not JSON: no day.
  }
  return days;
}

function keepDay(store: Store, day: string, record: DayRecord): void {
  const days = loadDays(store);
  const old = days[day];
  const better = !old || RANK[record.result] > RANK[old.result] || (record.result === 'won' && old.result === 'won' && record.turns < old.turns);
  if (!better) return;
  days[day] = record;
  const kept = Object.keys(days).sort().slice(-KEPT_DAYS);
  write(store, DAYS_KEY, JSON.stringify(Object.fromEntries(kept.map((d) => [d, days[d]!.result === 'started' ? 'started' : `${days[d]!.result} ${days[d]!.turns}`]))));
}

/** The record of `day`, null when the daily was not played that day. */
export function dailyRecord(store: Store, day: string): DayRecord | null {
  return loadDays(store)[day] ?? (readAttempts(store, day) > 0 ? { result: 'started', turns: 0 } : null);
}

/** Records how a fight of the daily of `day` ended, in the player's `turns`. The same result again changes nothing. */
export const recordDailyResult = (store: Store, day: string, won: boolean, turns: number): void =>
  keepDay(store, day, { result: won ? 'won' : 'lost', turns });

const dayBefore = (day: string): string => utcDay(Date.parse(`${day}T00:00:00Z`) - 24 * 3600 * 1000);

/** The consecutive UTC days with a daily played, ending today, or yesterday while today is not played yet: a missed day leaves none. */
export function dailyStreak(store: Store, today: string): number {
  let day = dailyRecord(store, today) ? today : dayBefore(today);
  let streak = 0;
  while (dailyRecord(store, day)) {
    streak++;
    day = dayBefore(day);
  }
  return streak;
}

/** The site the result card links to: the daily challenge button is on its page. */
export const SITE = 'https://tidymaze.github.io/edgefall/';

export interface DailyResult {
  day: string; // UTC date, YYYY-MM-DD
  boss: string; // the boss name
  result: number; // Encounter.result(): 0 playing, 1 won, 2 lost (a draw is a loss)
  plies: number; // plies played, the boss replies included
  attempt: number; // the attempt of the day this fight was
}

const OUTCOME = ['', 'Victory in', 'Defeat in'];

/** The text of the result card, to copy and share: the day, the boss, the result, the plies and the
 * attempt, then the link. Empty while the fight is on, so the card shows only at the end. */
export function dailyCard({ day, boss, result, plies, attempt }: DailyResult): string {
  if (result === 0) return '';
  const count = `${plies} ${plies === 1 ? 'ply' : 'plies'}`;
  return `Edgefall daily ${day}: ${boss}\n${OUTCOME[result]} ${count} on attempt ${attempt}\n${SITE}`;
}
