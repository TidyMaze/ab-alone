// The rogue-lite book (#1466, docs/specs/roguelite.md section 21): the history of the runs finished, the daily run's one try
// a day and the compendium of what the runs held, kept in the browser next to the other progress (roguelite.ts). Only variety
// is kept, never power (Decision #934).

import { EVENTS, eventOf, glyph, lineGlyph, MAX_ASCENSION, RELICS, runScore, SPECIAL_LOOKS, TACTICS, COMMANDERS, type MapNode, type Run } from './roguelite';
import { read, write, type Store } from './quality';

/** A run over, as the history keeps it: its seed (a run is kept once), commander (an index of COMMANDERS, -1 for none),
 * ascension level, result, score, and the UTC day of a daily run, '' for any other. */
export interface Finished {
  seed: number;
  commander: number;
  ascension: number;
  result: 'won' | 'lost';
  score: number;
  daily: string;
}

/** The runs the history keeps, the newest first. */
export const MAX_HISTORY = 10;
const HISTORY_KEY = 'ab-alone.roguelite.history';
const DAILY_KEY = 'ab-alone.roguelite.daily';
const SEEN_KEY = 'ab-alone.roguelite.seen';
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const parsed = (store: Store, key: string): unknown => {
  try {
    return JSON.parse(read(store, key) ?? 'null');
  } catch {
    return null;
  }
};

/** The line of a run over for the history, null while it is on. */
export function finished(map: MapNode[], run: Run): Finished | null {
  return run.end ? { seed: run.seed, commander: run.commander, ascension: run.ascension, result: run.end, score: runScore(map, run), daily: run.daily } : null;
}

function isFinished(v: unknown): v is Finished {
  const f = v as Finished | null;
  return (
    typeof f === 'object' &&
    f !== null &&
    isInt(f.seed, 0, 0xffffffff) &&
    isInt(f.commander, -1, COMMANDERS.length - 1) &&
    isInt(f.ascension, 0, MAX_ASCENSION) &&
    (f.result === 'won' || f.result === 'lost') &&
    isInt(f.score, 0, 9_999_999) &&
    typeof f.daily === 'string' &&
    (f.daily === '' || DAY.test(f.daily))
  );
}

/** The runs finished, the newest first, none when nothing valid is saved or the storage is blocked. */
export function readHistory(store: Store): Finished[] {
  const saved = parsed(store, HISTORY_KEY);
  return Array.isArray(saved) ? saved.filter(isFinished) : [];
}

/** What the daily run of `day` has: its `score`, null while its try is on; null when it was not tried that day. */
export interface DailyTry {
  score: number | null;
}
export function readDaily(store: Store, day: string): DailyTry | null {
  const saved = parsed(store, DAILY_KEY) as { day?: unknown; score?: unknown } | null;
  const ok = saved !== null && typeof saved === 'object' && saved.day === day && (saved.score === null || isInt(saved.score, 0, 9_999_999));
  return ok ? { score: saved.score as number | null } : null;
}

/** Spends the try of `day`: the daily run is on, with no score yet. Only the current day is kept. */
export const startDailyTry = (store: Store, day: string): void => write(store, DAILY_KEY, JSON.stringify({ day, score: null }));

/** Keeps a run over in the history, once (by its seed), and the score of a daily run in its day's try. */
export function recordFinished(store: Store, run: Finished): void {
  const history = readHistory(store);
  if (history.some((h) => h.seed === run.seed)) return;
  write(store, HISTORY_KEY, JSON.stringify([run, ...history].slice(0, MAX_HISTORY)));
  if (run.daily && readDaily(store, run.daily)?.score === null) write(store, DAILY_KEY, JSON.stringify({ day: run.daily, score: run.score }));
}

/** What the start screen holds besides the commanders: the daily run of `day` (shut once tried, with its score when it has
 * one), and the history and the compendium. */
export function bookHtml(day: string, tried: DailyTry | null): string {
  const label = tried ? `Daily run ${day} · ${tried.score === null ? 'tried today' : `score ${tried.score}`}, back tomorrow` : `Daily run ${day}`;
  return (
    `<div class="run-book"><button type="button" data-daily="1"${tried ? ' disabled' : ''}>${label}</button>` +
    '<button type="button" data-book="history">Run history</button><button type="button" data-book="compendium">Compendium</button></div>'
  );
}

/** Back, under the title: a long list scrolls inside the plate, and its foot may be out of reach. */
const back = '<button type="button" data-book="map">Back</button>';

/** The history screen: a line per run, the newest first. */
export function historyHtml(history: Finished[]): string {
  const items = history.map((h) => {
    const commander = COMMANDERS[h.commander]?.name ?? 'No commander';
    return `<li>${commander} · ${h.result} · score ${h.score}${h.ascension ? ` · ascension ${h.ascension}` : ''}${h.daily ? ` · daily ${h.daily}` : ''}</li>`;
  });
  return `<p class="run-line">Run history</p>${back}${items.length ? `<ol class="run-history">${items.join('')}</ol>` : '<p class="run-help">No run finished yet</p>'}`;
}

/** What the runs held: the relics, special marbles (by the bridge's kind), tactics (by code) and events (by index) seen. */
export interface Seen {
  relics: number[];
  specials: number[];
  tactics: number[];
  events: number[];
}
const NOTHING: Seen = { relics: [], specials: [], tactics: [], events: [] };
const listOf = (v: unknown, min: number, max: number): number[] | null => (Array.isArray(v) && v.every((x) => isInt(x, min, max)) ? v : null);

/** The compendium's saved lists, none when nothing valid is saved or the storage is blocked. */
export function readSeen(store: Store): Seen {
  const saved = parsed(store, SEEN_KEY) as Record<keyof Seen, unknown> | null;
  if (typeof saved !== 'object' || saved === null) return { ...NOTHING };
  const [relics, specials, tactics, events] = [
    listOf(saved.relics, 0, RELICS.length - 1),
    listOf(saved.specials, 1, SPECIAL_LOOKS.length),
    listOf(saved.tactics, 1, TACTICS.length),
    listOf(saved.events, 0, EVENTS.length - 1),
  ];
  return relics && specials && tactics && events ? { relics, specials, tactics, events } : { ...NOTHING };
}

/** Adds what `run` holds, and the event on its screen, to the compendium. */
export function recordSeen(store: Store, run: Run): void {
  const seen = readSeen(store);
  const event = eventOf(run);
  const held = {
    relics: run.relics,
    specials: SPECIAL_LOOKS.flatMap((_, k) => (run.specials[k] ? [k + 1] : [])),
    tactics: run.tactics,
    events: event ? [EVENTS.indexOf(event)] : [],
  };
  const all = Object.fromEntries((Object.keys(seen) as (keyof Seen)[]).map((k) => [k, [...new Set([...seen[k], ...held[k]])].sort((a, b) => a - b)])) as unknown as Seen;
  if ((Object.keys(seen) as (keyof Seen)[]).some((k) => all[k].length > seen[k].length)) write(store, SEEN_KEY, JSON.stringify(all));
}

/** The compendium screen: the relics, special marbles, tactics and events, each seen one with its rule, the others a silhouette. */
export function compendiumHtml(seen: Seen): string {
  const entry = (kind: string, known: boolean, glyphs: string, text: string): string =>
    known
      ? `<li class="seen">${glyphs}${text}</li>`
      : `<li class="unseen" aria-label="${kind} not seen yet">${glyphs.replace('class="glyph"', 'class="glyph silhouette"')}???</li>`;
  const sections: [string, string[], number][] = [
    ['Relics', RELICS.map((r, i) => entry('Relic', seen.relics.includes(i), lineGlyph(r.icon), `${r.name}: ${r.help}`)), seen.relics.length],
    ['Special marbles', SPECIAL_LOOKS.map((s, k) => entry('Special marble', seen.specials.includes(k + 1), glyph(k + 1), `${s.name}: ${s.help}`)), seen.specials.length],
    ['Tactics', TACTICS.map((t, k) => entry('Tactic', seen.tactics.includes(k + 1), lineGlyph(t.icon), `${t.name}: ${t.help}`)), seen.tactics.length],
    ['Events', EVENTS.map((e, i) => entry('Event', seen.events.includes(i), '', e.title)), seen.events.length],
  ];
  const total = sections.reduce((n, [, items]) => n + items.length, 0);
  const found = sections.reduce((n, [, , count]) => n + count, 0);
  const body = sections.map(([name, items, count]) => `<p class="run-help">${name} ${count} / ${items.length}</p><ul>${items.join('')}</ul>`).join('');
  return `<p class="run-line">Compendium · ${found} of ${total} seen</p>${back}<div class="run-dex">${body}</div>`;
}
