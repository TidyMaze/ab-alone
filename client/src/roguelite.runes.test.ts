// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  choices,
  ELITES,
  earned,
  exitHtml,
  exitOffers,
  fightOver,
  Key,
  lastAct,
  loadRun,
  mapHtml,
  newRun,
  dailyRun,
  parseMap,
  pick,
  readRunes,
  recordRunes,
  relicHtml,
  RUNES,
  saveRun,
  visit,
  type MapNode,
  type NodeKind,
  type Run,
} from './roguelite';
import { LEGACY_UNLOCKED } from './collector';
import { memoryStore } from './savegame';
import type { Store } from './quality';

const nd = (act: number, row: number, col: number, kind: NodeKind, links: number[] = [0], skips: number[] = [], elite = 0): MapNode => ({ act, row, col, kind, links, skips, formation: 0, elite });
// Act 1 with the branches the runes open: 0 and 1 fight (0 skips to the rest 6), 2 fight, 3 treasure, 4 the secret room, 5 The Wall, 6 rest, 7 boss.
const MAP: MapNode[] = [
  nd(0, 0, 0, 'fight', [0], [1]),
  nd(0, 0, 1, 'fight', [1, 2]),
  nd(0, 1, 0, 'fight'),
  nd(0, 1, 1, 'treasure', [1]),
  nd(0, 1, 2, 'secret', [1]),
  nd(0, 2, 0, 'elite', [0], [], 1),
  nd(0, 2, 1, 'rest'),
  nd(0, 3, 0, 'boss', []),
];
const parse = (html: string): Document => new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
const fresh = (state: Partial<Run> = {}): Run => ({ ...newRun(1, 3, LEGACY_UNLOCKED), ...state });
const memory = (): NonNullable<Store> => {
  const kept = new Map<string, string>();
  return { getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => void kept.set(k, v) };
};

describe('the runes (#1476)', () => {
  it('there are three, one per elite archetype in the order of their codes, each opening one kind of hidden branch', () => {
    expect(RUNES.map((r) => r.name)).toEqual(['Rune of Stone', 'Rune of Spark', 'Rune of Might']);
    expect(RUNES.map((r) => r.opens)).toEqual(['a secret room in every act', 'a shortcut in every act that skips a row', 'a third, secret exit between acts']);
    expect(ELITES.map((e) => e.name)).toEqual(['The Wall', 'The Artificer', 'The Brute']);
    expect(new Set(RUNES.map((r) => r.icon)).size).toBe(3);
  });

  it('a new run owns none and has found none, the runes of the record are its own, the daily run has none', () => {
    expect(newRun(5, 3, [])).toMatchObject({ runes: 0, found: 0 });
    expect(newRun(5, 3, [], 0, 5)).toMatchObject({ runes: 5, found: 0 });
    expect(dailyRun('2026-11-03', 9)).toMatchObject({ runes: 0, found: 0 });
  });

  it('the map records carry the secret room (kind 8) and the shortcut (bits 8 and up of the links)', () => {
    const [room, shortcut] = parseMap([0, 1, 2, 8, 0b10, 0, 0, 0, 0, 0, 0, 0b101 | (0b110 << 8), 0, 0]);
    expect(room).toMatchObject({ kind: 'secret', links: [1], skips: [] });
    expect(shortcut).toMatchObject({ kind: 'fight', links: [0, 2], skips: [1, 2] });
    expect(parseMap([0, 0, 0, 0, 1, 0, 0])[0]!.skips).toEqual([]);
  });

  it('the shortcut leads two rows down, the secret room is reached by its link', () => {
    expect(choices(MAP, fresh())).toEqual([0, 1]);
    expect(choices(MAP, fresh({ path: [0] }))).toEqual([2, 6]);
    expect(choices(MAP, fresh({ path: [1] }))).toEqual([3, 4]);
    expect(choices(MAP, fresh({ path: [1, 4] }))).toEqual([6]);
    expect(choices(MAP, fresh({ path: [0, 6] }))).toEqual([7]);
  });

  it('a secret room at the end of the map does not hide the fourth act', () => {
    const four = [nd(0, 0, 0, 'fight'), nd(0, 1, 0, 'boss', []), nd(1, 0, 0, 'boss', []), nd(2, 0, 0, 'boss', []), nd(3, 0, 0, 'elite'), nd(3, 1, 0, 'boss', []), nd(0, 0, 1, 'secret')];
    expect(lastAct(four, fresh())).toBe(2);
    expect(lastAct(four, fresh({ keys: [Key.Ruby, Key.Sapphire, Key.Emerald] }))).toBe(3);
    expect(choices(four, fresh({ path: [0, 1, 2, 3], keys: [Key.Ruby, Key.Sapphire, Key.Emerald] }))).toEqual([4]);
  });

  it('a secret room is played as a treasure: a relic to take', () => {
    const entered = visit(MAP, fresh({ path: [1] }), 4);
    expect(entered).toMatchObject({ path: [1, 4], relic: true, fighting: false });
    expect(parse(relicHtml(MAP, entered)).querySelector('.run-line')!.textContent).toBe('Treasure · a chest holds a relic');
  });
});

describe('earning a rune', () => {
  const ELITE_MAP = [nd(0, 0, 0, 'fight'), nd(0, 1, 0, 'elite', [], [], 1), nd(0, 1, 1, 'elite', [], [], 2), nd(0, 1, 2, 'elite', [], [], 3), nd(0, 1, 3, 'fight'), nd(0, 2, 0, 'boss', [])];
  // The Emerald key is held, so the first elite of the act (The Wall) is no marked one.
  const against = (node: number, state: Partial<Run> = {}, won = true): Run => fightOver(ELITE_MAP, { ...pick(fresh({ keys: [Key.Emerald] }), node), ...state }, won, 0);

  it('beating an elite of an archetype for the first time finds its rune and says what it opens on the next runs', () => {
    expect(against(1)).toMatchObject({ found: 1, told: 'Rune of Stone found: a secret room in every act, on the maps of your next runs' });
    expect(against(2)).toMatchObject({ found: 2, told: 'Rune of Spark found: a shortcut in every act that skips a row, on the maps of your next runs' });
    expect(against(3).found).toBe(4);
  });

  it('a rune the player owns or found earlier in the run is not found again', () => {
    expect(against(1, { runes: 1 })).toMatchObject({ found: 0, told: '' });
    expect(against(2, { runes: 1 })).toMatchObject({ found: 2 });
    const again = against(1, { found: 1, told: 'x' });
    expect(again).toMatchObject({ found: 1, told: 'x' });
    expect(against(1, { found: 4 }).found).toBe(5);
  });

  it('a lost elite, a fight, a boss or a run with the plain army finds none', () => {
    expect(against(1, {}, false)).toMatchObject({ found: 0, told: '' });
    expect(against(4).found).toBe(0);
    expect(against(5).found).toBe(0);
    expect(against(1, { enemies: false }).found).toBe(0);
  });

  it('a rune found with the Emerald key says both', () => {
    const both = fightOver([nd(0, 0, 0, 'elite', [], [], 2)], pick(fresh(), 0), true, 0);
    expect(both.keys).toEqual([Key.Emerald]);
    expect(both.told).toBe('Emerald key taken, 2 more open act 4. Rune of Spark found: a shortcut in every act that skips a row, on the maps of your next runs');
  });

  it('the summary of a run lists the runes it found, not the ones it owned', () => {
    const over = (state: Partial<Run>): Run => fresh({ path: [0, 1], end: 'lost', ...state });
    expect(earned(ELITE_MAP, over({ found: 3 }))).toEqual(['Rune of Stone', 'Rune of Spark']);
    expect(earned(ELITE_MAP, over({ found: 0, runes: 7 }))).toEqual([]);
  });
});

describe('keeping the runes between runs', () => {
  it('none is kept at first; a rune found is kept for good with the ones before it', () => {
    const kept = memory();
    expect(readRunes(kept)).toBe(0);
    recordRunes(kept, 0);
    expect(readRunes(kept)).toBe(0);
    recordRunes(kept, 2);
    recordRunes(kept, 1);
    expect(readRunes(kept)).toBe(3);
    recordRunes(kept, 0);
    expect(readRunes(kept)).toBe(3);
  });

  it('a blocked storage or a bad value reads as none', () => {
    expect(readRunes(null)).toBe(0);
    recordRunes(null, 7);
    for (const bad of ['8', '-1', '1.5', 'x']) {
      const kept = memory();
      kept.setItem('ab-alone.roguelite.runes', bad);
      expect(readRunes(kept)).toBe(0);
    }
  });
});

describe('the runes on the screens', () => {
  const html = (run: Run, map = MAP): Document => parse(mapHtml(map, run));

  it('the secret room and the shortcut are drawn once owned: its own icon and look, a shortcut link of its own', () => {
    const doc = html(fresh({ runes: 3 }));
    const secret = doc.querySelector<HTMLButtonElement>('button[data-node-kind="secret"]')!;
    expect(secret.dataset.node).toBe('4');
    expect(secret.className).toBe('node secret');
    expect(secret.textContent).toBe('Secret');
    expect(secret.getAttribute('aria-label')).toBe('Act 1, secret');
    expect(secret.disabled).toBe(true);
    const icons = [...doc.querySelectorAll('button[data-node] > svg.glyph path')].map((p) => p.getAttribute('d'));
    expect(icons.filter((d) => d === secret.querySelector('path')!.getAttribute('d'))).toHaveLength(1);
    const lines = [...doc.querySelectorAll('line')];
    expect(lines.filter((l) => l.classList.contains('shortcut'))).toHaveLength(1);
    expect(lines).toHaveLength(MAP.reduce((n, m) => n + m.links.length + m.skips.length, 0)); // a link each, the shortcut too
  });

  it('the secret room opens in the legend only with its rune, and picking it works from the node before', () => {
    const legend = (run: Run): string[] => [...html(run).querySelectorAll('.run-legend li')].map((li) => li.textContent!);
    expect(legend(fresh())).not.toContain('Secret');
    expect(legend(fresh({ runes: 2 }))).not.toContain('Secret');
    expect(legend(fresh({ runes: 1 }))).toEqual(['Fight', 'Elite', 'Rest', 'Treasure', 'Shop', 'Unknown', 'Secret', 'Boss', 'Open', 'Taken']);
    const next = html(fresh({ runes: 1, path: [1] }));
    expect([...next.querySelectorAll<HTMLButtonElement>('button[data-node]:not(:disabled)')].map((b) => b.dataset.node)).toEqual(['3', '4']);
  });

  it('the map names the runes owned, and nothing without one', () => {
    expect(html(fresh()).querySelector('.run-runes')).toBeNull();
    const text = html(fresh({ runes: 5, path: [0] })).querySelector('.run-runes')!.textContent;
    expect(text).toBe('Runes: Rune of Stone (a secret room in every act) · Rune of Might (a third, secret exit between acts)');
  });

  it('the start screen says how to find the runes still to find', () => {
    const helps = (run: Run): string[] => [...html(run).querySelectorAll('.run-help')].map((p) => p.textContent!);
    expect(helps(fresh())).toContain('Runes to find: Rune of Stone (beat The Wall: a secret room in every act) · Rune of Spark (beat The Artificer: a shortcut in every act that skips a row) · Rune of Might (beat The Brute: a third, secret exit between acts)');
    expect(helps(fresh({ runes: 3 }))).toContain('Runes to find: Rune of Might (beat The Brute: a third, secret exit between acts)');
    expect(helps(fresh({ runes: 7 })).join()).not.toContain('Runes to find');
    expect(helps(fresh({ path: [0] })).join()).not.toContain('Runes to find'); // the run is on
  });

  it('the third exit is the secret one', () => {
    const ACT = [nd(0, 0, 0, 'fight'), nd(0, 1, 0, 'boss', [])];
    const exitsOf = (): number[] => [2, 3, 5];
    const room = fresh({ path: [0, 1], exit: true, runes: 4 });
    const three = parse(exitHtml(ACT, room, exitsOf, String));
    const buttons = [...three.querySelectorAll<HTMLButtonElement>('button[data-exit]')];
    expect(buttons.map((b) => b.dataset.exit)).toEqual(['2', '3', '5']);
    expect(buttons.map((b) => 'secret' in b.dataset)).toEqual([false, false, true]);
    expect(buttons[2]!.textContent).toMatch(/^Secret exit · Archipelago · /);
    expect(buttons[0]!.textContent).toMatch(/^Tundra · /);
    expect(exitOffers(ACT, room, exitsOf)).toEqual([2, 3, 5]);
    const two = parse(exitHtml(ACT, room, () => [2, 3], String));
    expect([...two.querySelectorAll<HTMLButtonElement>('button[data-exit]')].some((b) => 'secret' in b.dataset)).toBe(false);
  });
});

describe('saving the runes', () => {
  const save = async (run: Run, runes: number[] = []): Promise<Run | null> => {
    const store = memoryStore();
    await saveRun(store, run);
    const loaded = await loadRun(store, (_seed, owned) => (runes.push(owned), MAP), () => null as never);
    return loaded && loaded.state;
  };

  it('a run keeps the runes it started with and the ones it found; its map is the one of its seed and runes', async () => {
    const asked: number[] = [];
    const run = fresh({ path: [1], runes: 5, found: 2 });
    expect(await save(run, asked)).toEqual(run);
    expect(asked).toEqual([5]);
  });

  it('a run saved before the runes owns and found none and loads the map of no rune', async () => {
    const store = memoryStore();
    const { runes: _runes, found: _found, ...old } = fresh({ path: [1] });
    await store.put('run', old);
    const asked: number[] = [];
    const loaded = await loadRun(store, (_seed, owned) => (asked.push(owned), MAP), () => null as never);
    expect(loaded!.state).toMatchObject({ runes: 0, found: 0 });
    expect(asked).toEqual([0]);
  });

  it('a save with a bad rune mask is refused', async () => {
    for (const bad of [8, -1, 1.5, '3', null]) {
      for (const key of ['runes', 'found']) {
        const store = memoryStore();
        await store.put('run', { ...fresh({ path: [1] }), [key]: bad });
        expect(await loadRun(store, () => MAP, () => null as never)).toBeNull();
      }
    }
  });
});
