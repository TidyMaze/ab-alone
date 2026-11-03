// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { LEGACY_UNLOCKED } from './collector';
import { EVENTS, newRun, parseMap, Relic, RELICS, SPECIAL_LOOKS, TACTICS, type Run } from './roguelite';
import {
  bookHtml,
  compendiumHtml,
  finished,
  historyHtml,
  MAX_HISTORY,
  readDaily,
  readHistory,
  readSeen,
  recordFinished,
  recordSeen,
  startDailyTry,
  type Finished,
} from './runbook';

// The run history, the daily run's try and the compendium (#1466, docs/specs/roguelite.md section 20).
const memoryStorage = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
};
const throwing = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('denied');
  },
};
const parse = (html: string): Document => new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
// Act 1: a fight 0 leads to an elite 1, then the boss 2 (the last act).
const MAP = parseMap([[0, 0, 0, 0, 1, 0, 0], [0, 1, 0, 2, 1, 0, 1], [0, 2, 0, 1, 0, 0, 0]].flat());
const fresh = (state: Partial<Run> = {}): Run => ({ ...newRun(1, 3, LEGACY_UNLOCKED), ...state });
const entry = (state: Partial<Finished> = {}): Finished => ({ seed: 1, commander: 0, ascension: 0, result: 'lost', score: 100, daily: '', ...state });

describe('finished', () => {
  it('is null while the run is on, else the line of the history', () => {
    expect(finished(MAP, fresh({ path: [0] }))).toBeNull();
    expect(finished(MAP, fresh({ seed: 9, path: [0, 1, 2], army: 10, flawless: 1, end: 'won', commander: 2 }))).toEqual({
      seed: 9, commander: 2, ascension: 0, result: 'won', score: 100 + 25 + 100 + 15, daily: '',
    });
    expect(finished(MAP, fresh({ path: [0], army: 3, end: 'lost', daily: '2026-11-03' }))).toMatchObject({ result: 'lost', score: 30, daily: '2026-11-03' });
  });
});

describe('the history', () => {
  it('keeps the last runs, the newest first, and each run once', () => {
    const store = memoryStorage();
    expect(readHistory(store)).toEqual([]);
    for (let seed = 1; seed <= MAX_HISTORY + 2; seed++) recordFinished(store, entry({ seed, score: seed }));
    recordFinished(store, entry({ seed: MAX_HISTORY + 2, score: 999 })); // the same run again: not twice
    const history = readHistory(store);
    expect(history).toHaveLength(MAX_HISTORY);
    expect(history.map((h) => h.seed)).toEqual(Array.from({ length: MAX_HISTORY }, (_, i) => MAX_HISTORY + 2 - i));
    expect(history[0]!.score).toBe(MAX_HISTORY + 2);
  });

  it.each([
    ['not JSON', 'x'],
    ['not a list', '{}'],
    ['a list of nothing', '[1]'],
  ])('reads nothing from %s', (_, saved) => {
    expect(readHistory({ getItem: () => saved, setItem: () => undefined })).toEqual([]);
  });

  it.each([
    ['a bad seed', { seed: -1 }],
    ['a bad commander', { commander: 4 }],
    ['a bad ascension', { ascension: 11 }],
    ['a bad result', { result: 'draw' }],
    ['a bad score', { score: 1.5 }],
    ['a bad day', { daily: 'today' }],
  ])('drops an entry with %s', (_, bad) => {
    const store = memoryStorage();
    store.setItem('ab-alone.roguelite.history', JSON.stringify([entry({ seed: 1 }), { ...entry({ seed: 2 }), ...bad }]));
    expect(readHistory(store).map((h) => h.seed)).toEqual([1]);
  });

  it('survives a blocked storage', () => {
    expect(readHistory(throwing)).toEqual([]);
    expect(() => recordFinished(throwing, entry())).not.toThrow();
    expect(readHistory(null)).toEqual([]);
  });

  it('is drawn newest first: commander, result, score, the ascension and the daily when there is one', () => {
    const doc = parse(historyHtml([entry({ seed: 2, commander: 1, result: 'won', score: 640, ascension: 2 }), entry({ daily: '2026-11-03', score: 80 }), entry({ commander: -1 })]));
    expect(doc.querySelector('.run-line')!.textContent).toBe('Run history');
    expect([...doc.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'The Warden · won · score 640 · ascension 2',
      'The Captain · lost · score 80 · daily 2026-11-03',
      'No commander · lost · score 100',
    ]);
    expect(doc.querySelector<HTMLButtonElement>('button[data-book="map"]')!.textContent).toBe('Back');
    expect(parse(historyHtml([])).querySelector('.run-help')!.textContent).toBe('No run finished yet');
  });
});

describe('the daily run', () => {
  it('is one try a day, its score kept when the run ends', () => {
    const store = memoryStorage();
    expect(readDaily(store, '2026-11-03')).toBeNull();
    startDailyTry(store, '2026-11-03');
    expect(readDaily(store, '2026-11-03')).toEqual({ score: null });
    recordFinished(store, entry({ daily: '2026-11-03', score: 420 }));
    expect(readDaily(store, '2026-11-03')).toEqual({ score: 420 });
    expect(readDaily(store, '2026-11-04')).toBeNull(); // the next day tries afresh
  });

  it('keeps the score only for the day of the try, a run of another day leaves it', () => {
    const store = memoryStorage();
    startDailyTry(store, '2026-11-03');
    recordFinished(store, entry({ seed: 2, daily: '2026-11-02', score: 5 }));
    expect(readDaily(store, '2026-11-03')).toEqual({ score: null });
    recordFinished(store, entry({ seed: 3, score: 5 })); // not a daily run
    expect(readDaily(store, '2026-11-03')).toEqual({ score: null });
  });

  it.each(['x', '[]', '{"day":"2026-11-03","score":"high"}', '{"day":3,"score":null}', '{"day":"2026-11-03","score":-1}'])('reads no try from %s', (saved) => {
    expect(readDaily({ getItem: () => saved, setItem: () => undefined }, '2026-11-03')).toBeNull();
  });

  it('survives a blocked storage', () => {
    expect(readDaily(throwing, '2026-11-03')).toBeNull();
    expect(() => startDailyTry(throwing, '2026-11-03')).not.toThrow();
  });

  it('is a button on the start screen: open, then disabled with its score or while it is on', () => {
    const button = (tried: ReturnType<typeof readDaily>): HTMLButtonElement => parse(bookHtml('2026-11-03', tried)).querySelector<HTMLButtonElement>('button[data-daily]')!;
    expect([button(null).textContent, button(null).disabled]).toEqual(['Daily run 2026-11-03', false]);
    expect([button({ score: 420 }).textContent, button({ score: 420 }).disabled]).toEqual(['Daily run 2026-11-03 · score 420, back tomorrow', true]);
    expect([button({ score: null }).textContent, button({ score: null }).disabled]).toEqual(['Daily run 2026-11-03 · tried today, back tomorrow', true]);
    expect([...parse(bookHtml('2026-11-03', null)).querySelectorAll('button[data-book]')].map((b) => [b.textContent, (b as HTMLElement).dataset.book])).toEqual([
      ['Run history', 'history'],
      ['Compendium', 'compendium'],
    ]);
  });
});

describe('the compendium', () => {
  it('sees what a run holds: its relics, special marbles and tactics', () => {
    const store = memoryStorage();
    expect(readSeen(store)).toEqual({ relics: [], specials: [], tactics: [], events: [] });
    recordSeen(store, fresh({ relics: [Relic.Gyroscope, Relic.Jammer], specials: [2, 0, 0, 0, 0, 0, 0, 1, 0, 0], tactics: [2] }));
    recordSeen(store, fresh({ relics: [Relic.Jammer, Relic.Bunks], specials: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0], tactics: [2, 3] }));
    expect(readSeen(store)).toEqual({ relics: [0, 3, 5], specials: [1, 3, 8], tactics: [2, 3], events: [] });
  });

  it('sees the event on the screen', () => {
    const store = memoryStorage();
    const run = fresh({ path: [0], event: true });
    recordSeen(store, run);
    expect(readSeen(store).events).toHaveLength(1);
    expect(readSeen(store).events[0]).toBeLessThan(EVENTS.length);
    recordSeen(store, { ...run, event: false });
    expect(readSeen(store).events).toHaveLength(1);
  });

  it('writes nothing when nothing is new', () => {
    const store = memoryStorage();
    recordSeen(store, fresh());
    expect(store.data.size).toBe(0);
  });

  it.each([
    ['not JSON', 'x'],
    ['not an object', '[]'],
    ['a relic that does not exist', JSON.stringify({ relics: [12], specials: [], tactics: [], events: [] })],
    ['a special marble that does not exist', JSON.stringify({ relics: [], specials: [0], tactics: [], events: [] })],
    ['a tactic that does not exist', JSON.stringify({ relics: [], specials: [], tactics: [5], events: [] })],
    ['an event that does not exist', JSON.stringify({ relics: [], specials: [], tactics: [], events: [EVENTS.length] })],
    ['a list that is no list', JSON.stringify({ relics: 1, specials: [], tactics: [], events: [] })],
    ['a missing list', JSON.stringify({ relics: [] })],
  ])('reads nothing from %s', (_, saved) => {
    expect(readSeen({ getItem: () => saved, setItem: () => undefined })).toEqual({ relics: [], specials: [], tactics: [], events: [] });
  });

  it('survives a blocked storage', () => {
    expect(readSeen(throwing)).toEqual({ relics: [], specials: [], tactics: [], events: [] });
    expect(() => recordSeen(throwing, fresh({ relics: [1] }))).not.toThrow();
  });

  it('draws what is seen with its rule and the rest as silhouettes, with the counts', () => {
    const doc = parse(compendiumHtml({ relics: [0], specials: [2], tactics: [1], events: [0] }));
    const total = RELICS.length + SPECIAL_LOOKS.length + TACTICS.length + EVENTS.length;
    expect(doc.querySelector('.run-line')!.textContent).toBe(`Compendium · 4 of ${total} seen`);
    expect([...doc.querySelectorAll('.run-dex > p')].map((p) => p.textContent)).toEqual([
      `Relics 1 / ${RELICS.length}`,
      `Special marbles 1 / ${SPECIAL_LOOKS.length}`,
      `Tactics 1 / ${TACTICS.length}`,
      `Events 1 / ${EVENTS.length}`,
    ]);
    const items = [...doc.querySelectorAll('.run-dex li')];
    expect(items).toHaveLength(total);
    expect(items[0]!.textContent).toBe(`${RELICS[0]!.name}: ${RELICS[0]!.help}`);
    expect(items[0]!.className).toBe('seen');
    expect(items[1]!.textContent).toBe('???');
    expect(items[1]!.className).toBe('unseen');
    expect(items[1]!.getAttribute('aria-label')).toBe('Relic not seen yet');
    expect(items[RELICS.length + 1]!.textContent).toBe(`${SPECIAL_LOOKS[1]!.name}: ${SPECIAL_LOOKS[1]!.help}`);
    expect(items[RELICS.length + SPECIAL_LOOKS.length]!.textContent).toBe(`${TACTICS[0]!.name}: ${TACTICS[0]!.help}`);
    expect(items[total - EVENTS.length]!.textContent).toBe(EVENTS[0]!.title);
    expect(items[total - 1]!.getAttribute('aria-label')).toBe('Event not seen yet');
    expect(doc.querySelectorAll('li.unseen svg.silhouette')).toHaveLength(RELICS.length + SPECIAL_LOOKS.length + TACTICS.length - 3); // an event has no glyph
    expect(doc.querySelector<HTMLButtonElement>('button[data-book="map"]')!.textContent).toBe('Back');
  });

  it('draws nothing but silhouettes when nothing is seen', () => {
    const doc = parse(compendiumHtml({ relics: [], specials: [], tactics: [], events: [] }));
    expect(doc.querySelectorAll('li.seen')).toHaveLength(0);
  });
});
