// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  ACT_PERCENT,
  actBoss,
  actsWon,
  choices,
  fightBudget,
  fightOver,
  FINAL_BOSS,
  foePlan,
  foesOf,
  Key,
  keysHtml,
  loadRun,
  mapHtml,
  newRun,
  offers,
  relicHtml,
  relicMask,
  relicOffers,
  Relic,
  readBest,
  recordBest,
  RELICS,
  rest,
  restHtml,
  saveRun,
  shopStock,
  takeKey,
  visit,
  type MapNode,
  type NodeKind,
  type Run,
} from './roguelite';
import { memoryStore } from './savegame';
import type { Store } from './quality';

// Four acts in the bridge's shape: acts 1 to 3 hold a fight, then elites (or a rest and a treasure), then a boss; the
// fourth holds an elite and its boss. Act 1: 0 fight, 1 elite, 2 rest, 3 treasure, 4 boss. Act 2: 5 fight, 6 elite,
// 7 elite, 8 boss. Act 3: 9 fight, 10 elite, 11 boss. Act 4: 12 elite, 13 boss.
const nd = (act: number, row: number, col: number, kind: NodeKind, links: number[] = [0]): MapNode => ({ act, row, col, kind, links, skips: [], formation: 0, elite: kind === 'elite' ? 1 : 0 });
const MAP: MapNode[] = [
  nd(0, 0, 0, 'fight', [0, 1, 2]),
  nd(0, 1, 0, 'elite'),
  nd(0, 1, 1, 'rest'),
  nd(0, 1, 2, 'treasure'),
  nd(0, 2, 0, 'boss', []),
  nd(1, 0, 0, 'fight', [0, 1]),
  nd(1, 1, 0, 'elite'),
  nd(1, 1, 1, 'elite'),
  nd(1, 2, 0, 'boss', []),
  nd(2, 0, 0, 'fight'),
  nd(2, 1, 0, 'elite'),
  nd(2, 2, 0, 'boss', []),
  nd(3, 0, 0, 'elite'),
  nd(3, 1, 0, 'boss', []),
];
const ALL_KEYS = [Key.Ruby, Key.Sapphire, Key.Emerald];
const at = (run: Run, ...path: number[]): Run => ({ ...run, path });
const base = (): Run => newRun(5, 3, []);
const fighting = (run: Run, ...path: number[]): Run => ({ ...at(run, ...path), fighting: true });

describe('the keys and the fourth act', () => {
  it('a new run holds no key, and the keys are the Ruby, Sapphire and Emerald', () => {
    expect(base().keys).toEqual([]);
    expect([Key.Ruby, Key.Sapphire, Key.Emerald]).toEqual([0, 1, 2]);
  });

  it('after the third act boss the run ends without the three keys and goes on to act 4 with them', () => {
    const won = (keys: number[]): Run => fightOver(MAP, { ...fighting(base(), 0, 1, 4, 5, 6, 8, 9, 10, 11), keys }, true, 0);
    expect(won([Key.Ruby, Key.Sapphire]).end).toBe('won');
    expect(won(ALL_KEYS).end).toBe('');
    expect(won(ALL_KEYS).reward || won(ALL_KEYS).relic).toBe(true);
    const lost = fightOver(MAP, { ...fighting(base(), 0, 1, 4, 5, 6, 8, 9, 10, 11), keys: ALL_KEYS }, false, 0);
    expect(lost.end).toBe('lost');
  });

  it('the act 3 boss leads to no exit with the keys, and the act 4 boss ends the run won', () => {
    const run = { ...fighting(base(), 0, 1, 4, 5, 6, 8, 9, 10, 11), keys: ALL_KEYS };
    expect(fightOver(MAP, run, true, 0).exit).toBe(false);
    const final = fightOver(MAP, { ...fighting(base(), 0, 1, 4, 5, 6, 8, 9, 10, 11, 12, 13), keys: ALL_KEYS }, true, 0);
    expect(final).toMatchObject({ end: 'won', relic: false, reward: false, collector: false });
  });

  it('the map walks to act 4 only with the three keys', () => {
    const done = at(base(), 0, 1, 4, 5, 6, 8, 9, 10, 11);
    expect(choices(MAP, done)).toEqual([]);
    expect(choices(MAP, { ...done, keys: [Key.Ruby, Key.Emerald] })).toEqual([]);
    expect(choices(MAP, { ...done, keys: ALL_KEYS })).toEqual([12]);
    expect(choices(MAP, { ...at(base(), 0, 1, 4, 5, 6, 8, 9, 10, 11, 12), keys: ALL_KEYS })).toEqual([13]);
  });

  it('a win of the act 3 boss counts three acts and the fourth boss four, which unlock nothing more than three', () => {
    const keys = ALL_KEYS;
    expect(actsWon(MAP, { ...at(base(), 0, 1, 4, 5, 6, 8, 9, 10, 11), keys })).toBe(3);
    expect(actsWon(MAP, { ...at(base(), 0, 1, 4, 5, 6, 8, 9, 10, 11, 12, 13), keys, end: 'won' })).toBe(4);
    const data = new Map<string, string>();
    const store: Store = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
    recordBest(store, 4);
    expect(readBest(store)).toBe(3);
  });

  it('the fourth act boss is The Ballast Mind at 300 % of its strength, whatever the biome', () => {
    expect(FINAL_BOSS).toBe('ballast');
    const run = { ...fighting(base(), 0, 1, 4, 5, 6, 8, 9, 10, 11, 12, 13), keys: ALL_KEYS, biomes: [1, 2] };
    const boss = actBoss(MAP, run, ['hull', 'ballast', 'echo'])!;
    expect(boss.id).toBe('ballast');
    expect(boss.percent).toBe(300);
    expect(ACT_PERCENT).toEqual([50, 100, 200, 300]);
    expect(actBoss(MAP, run, ['hull', 'echo'])!.id).not.toBe('ballast'); // a roster without it keeps the dealt boss
    expect(actBoss(MAP, fighting(base(), 0, 1, 4), ['hull', 'ballast'])!.percent).toBe(50);
  });
});

describe('the Emerald key: a marked elite', () => {
  const first = (run: Run, ...path: number[]): Run => fighting(run, ...path);
  it('beating the first elite of an act takes the Emerald key and says so', () => {
    const run = fightOver(MAP, first(base(), 0, 1), true, 0);
    expect(run.keys).toEqual([Key.Emerald]);
    expect(run.told).toContain('Emerald');
    expect(fightOver(MAP, first(base(), 0, 1, 4, 5, 6), true, 0).keys).toEqual([Key.Emerald]); // act 2: its first elite
  });
  it('only the first elite of an act is marked, and no more once the key is held', () => {
    expect(fightOver(MAP, first(base(), 0, 1, 4, 5, 7), true, 0).keys).toEqual([]);
    expect(fightOver(MAP, first({ ...base(), keys: [Key.Emerald] }, 0, 1, 4, 5, 6), true, 0).keys).toEqual([Key.Emerald]);
    expect(fightOver(MAP, first({ ...base(), keys: [Key.Emerald], runes: 7 }, 0, 1, 4, 5, 6), true, 0).told).toBe(''); // the runes are owned: nothing to tell
  });
  it('a lost marked elite, a plain fight and the act 4 elite give no key', () => {
    expect(fightOver(MAP, first(base(), 0, 1), false, 0).keys).toEqual([]);
    expect(fightOver(MAP, first(base(), 0), true, 0).keys).toEqual([]);
    expect(fightOver(MAP, first({ ...base(), keys: [Key.Ruby, Key.Sapphire] }, 0, 1, 4, 5, 6, 8, 9, 10, 11, 12), true, 0).keys).toEqual([Key.Ruby, Key.Sapphire]);
  });
  it('the marked elite is a stronger bot: 3 times the positions of a fight, not 2', () => {
    expect(fightBudget(MAP, first(base(), 0, 1), 100)).toBe(300);
    expect(fightBudget(MAP, first(base(), 0, 1, 4, 5, 7), 100)).toBe(200);
    expect(fightBudget(MAP, first({ ...base(), keys: [Key.Emerald] }, 0, 1, 4, 5, 6), 100)).toBe(200);
  });
  it('on top of ascension level 1 the marked elite searches one more time again', () => {
    expect(fightBudget(MAP, { ...first(base(), 0, 1), ascension: 1 }, 100)).toBe(400);
    expect(fightBudget(MAP, { ...first(base(), 0, 1, 4, 5, 7), ascension: 1 }, 100)).toBe(300);
  });
  it('the map shows the marked elite and the keys held', () => {
    const html = mapHtml(MAP, base());
    expect(html.match(/class="node elite marked"/g)).toHaveLength(3); // one per act, none in act 4
    expect(html).toContain('aria-label="Act 1, elite, The Wall, marked: its key"');
    expect(mapHtml(MAP, { ...base(), keys: [Key.Emerald] })).not.toContain('marked');
  });
});

describe('the Ruby key: a rest given up, the Sapphire key: a treasure given up', () => {
  it('the rest site offers the Ruby key in place of the rest, once', () => {
    const site = visit(MAP, at(base(), 0), 2);
    expect(restHtml(site)).toContain('data-key="0"');
    expect(restHtml({ ...site, keys: [Key.Ruby] })).not.toContain('data-key');
    const taken = takeKey(MAP, { ...site, army: 9 }, Key.Ruby);
    expect(taken).toMatchObject({ rest: false, keys: [Key.Ruby], army: 9 });
    expect(taken.told).toContain('Ruby');
    expect(takeKey(MAP, { ...site, keys: [Key.Ruby] }, Key.Ruby)).toEqual({ ...site, keys: [Key.Ruby] });
    expect(takeKey(MAP, at(base(), 0), Key.Ruby).keys).toEqual([]); // no rest site waits
  });
  it('the third key taken says that act 4 is open', () => {
    const site = { ...visit(MAP, at(base(), 0), 2), keys: [Key.Sapphire, Key.Emerald] };
    expect(takeKey(MAP, site, Key.Ruby).told).toBe('Ruby key taken, act 4 is open');
    expect(takeKey(MAP, visit(MAP, at(base(), 0), 2), Key.Ruby).told).toBe('Ruby key taken, 2 more open act 4');
  });
  it('the treasure offers the Sapphire key in place of its relic, once', () => {
    const chest = visit(MAP, at(base(), 0), 3);
    expect(chest.relic).toBe(true);
    expect(relicHtml(MAP, chest)).toContain('data-key="1"');
    expect(relicHtml(MAP, { ...chest, keys: [Key.Sapphire] })).not.toContain('data-key');
    const taken = takeKey(MAP, chest, Key.Sapphire);
    expect(taken).toMatchObject({ relic: false, keys: [Key.Sapphire], relics: [] });
    expect(taken.told).toContain('Sapphire');
    expect(takeKey(MAP, { ...chest, keys: [Key.Sapphire] }, Key.Sapphire).relic).toBe(true);
  });
  it('no other waiting screen gives a key, and the Emerald is never taken', () => {
    const elite = fightOver(MAP, fighting({ ...base(), keys: [Key.Emerald] }, 0, 1), true, 0);
    expect(elite.relic).toBe(true);
    expect(takeKey(MAP, elite, Key.Sapphire)).toBe(elite);
    expect(takeKey(MAP, visit(MAP, at(base(), 0), 3), Key.Emerald).keys).toEqual([]);
    expect(takeKey(MAP, visit(MAP, at(base(), 0), 2), 7).keys).toEqual([]);
  });
  it('the map line counts the keys and what the missing ones ask', () => {
    expect(keysHtml(base())).toBe('');
    const two = keysHtml({ ...base(), keys: [Key.Ruby, Key.Emerald] });
    expect(two).toContain('2 of 3 keys');
    expect(two).toContain('Ruby');
    expect(two).toContain('Emerald');
    expect(two).toContain('Sapphire');
    expect(keysHtml({ ...base(), keys: ALL_KEYS })).toContain('Act 4 is open');
  });
  it('act 4 is on the map only with the three keys', () => {
    const near = at(base(), 0, 1, 4, 5, 6, 8, 9, 10, 11);
    expect(mapHtml(MAP, near).match(/data-node="/g)).toHaveLength(12);
    expect(mapHtml(MAP, near)).toContain('style="--slots:10.5"');
    const open = mapHtml(MAP, { ...near, keys: ALL_KEYS });
    expect(open.match(/data-node="/g)).toHaveLength(14);
    expect(open).toContain('style="--slots:13"'); // the plate grows by act 4's two rows (a header, 3 rows an act, 2 rows in act 4)
    expect(open).toContain('aria-label="Act 4, boss"');
    expect(open).toContain('Act 4 is open');
  });
});

describe('the boss relics', () => {
  const cursed = [Relic.WarBanner, Relic.MendingCore, Relic.StaticShroud, Relic.BossBreaker];
  it('are four, after the twelve, each rule saying its cost', () => {
    expect(cursed).toEqual([12, 13, 14, 15]);
    expect(RELICS.map((r) => r.name).slice(12)).toEqual(['War banner', 'Mending core', 'Static shroud', 'Boss breaker']);
    expect(RELICS.slice(12).every((r) => r.help.includes(' but '))).toBe(true);
    expect(relicMask({ ...base(), relics: [Relic.WarBanner, Relic.Gyroscope] })).toBe(1 | (1 << 12));
  });
  it('one of the three relics after an act boss is a boss relic, the others ordinary', () => {
    for (let seed = 0; seed < 40; seed++) {
      const run = { ...fighting({ ...base(), seed }, 0, 1, 4), fighting: false, relic: true };
      const offered = relicOffers(MAP, run);
      expect(offered).toHaveLength(3);
      expect(offered.filter((r) => r >= 12)).toHaveLength(1);
      expect(offered[2]).toBeGreaterThanOrEqual(12);
      expect(new Set(offered).size).toBe(3);
    }
  });
  it('are offered after an act boss only, never by an elite, a treasure, a shop or an event', () => {
    for (let seed = 0; seed < 40; seed++) {
      const run = { ...base(), seed };
      expect(relicOffers(MAP, { ...at(run, 0, 1), relic: true }).every((r) => r < 12)).toBe(true);
      expect(relicOffers(MAP, { ...at(run, 0, 3), relic: true }).every((r) => r < 12)).toBe(true);
      expect(shopStock({ ...at(run, 0), shop: true }).every((i) => i.kind !== 'relic' || i.code < 12)).toBe(true);
    }
  });
  it('a held boss relic is not offered again, and with all four held the boss offers three ordinary relics', () => {
    const run = { ...at(base(), 0, 1, 4), relic: true, relics: [Relic.WarBanner] };
    expect(relicOffers(MAP, run).filter((r) => r >= 12)).toHaveLength(1);
    expect(relicOffers(MAP, run)).not.toContain(Relic.WarBanner);
    const all = relicOffers(MAP, { ...run, relics: cursed });
    expect(all).toHaveLength(3);
    expect(all.every((r) => r < 12)).toBe(true);
  });
  it('the relic screen marks the boss relic and a treasure of a boss gives no key', () => {
    const html = relicHtml(MAP, { ...at(base(), 0, 1, 4), relic: true });
    expect(html).toContain('Boss beaten · pick a relic');
    expect(html).toContain('data-boss-relic');
    expect(html).not.toContain('data-key');
  });
  it('War banner: the bot has 2 marbles fewer, and act bosses play at 150 % of their strength', () => {
    const run = { ...fighting(base(), 0), relics: [Relic.WarBanner] };
    expect(foesOf(MAP, run)).toBe(6); // the first fight's 8 (#1502)
    expect(foesOf(MAP, { ...run, relics: [Relic.WarBanner, Relic.Saboteur] })).toBe(5);
    const asked: number[] = [];
    foePlan(MAP, { ...run, relics: [Relic.WarBanner, Relic.Saboteur] }, (_n, less) => (asked.push(less), [10, 0, 0]));
    expect(asked).toEqual([3]);
    expect(actBoss(MAP, { ...fighting(base(), 0, 1, 4), relics: [Relic.WarBanner] }, ['hull'])!.percent).toBe(75);
    expect(actBoss(MAP, { ...fighting(base(), 0, 1, 4, 5, 6, 8), relics: [Relic.WarBanner] }, ['hull'])!.percent).toBe(150);
  });
  it('Mending core: a marble back after every won fight, but a rest brings back only 3', () => {
    const run = { ...fighting({ ...base(), army: 10 }, 0), relics: [Relic.MendingCore] };
    expect(fightOver(MAP, run, true, 2).army).toBe(9);
    expect(fightOver(MAP, run, true, 0).army).toBe(11);
    expect(fightOver(MAP, run, true, 0).army).toBe(11);
    expect(fightOver(MAP, { ...run, army: 14 }, true, 0).army).toBe(14);
    expect(fightOver(MAP, { ...fighting({ ...base(), army: 10 }, 0, 1), relics: [Relic.MendingCore, Relic.WarChest] }, true, 0).army).toBe(13);
    expect(fightOver(MAP, { ...run, army: 10 }, false, 0).army).toBe(10);
    const site = { ...visit(MAP, at(base(), 0), 2), army: 6, relics: [Relic.MendingCore] };
    expect(rest(site).army).toBe(9);
    expect(rest({ ...site, army: 13 }).army).toBe(14);
    expect(restHtml(site)).toContain('Rest: 3 marbles back');
    expect(restHtml({ ...site, relics: [] })).toContain(`Rest: back up to 14 marbles`);
    expect(rest({ ...site, ascension: 2, army: 6 }).army).toBe(9);
    expect(rest({ ...site, ascension: 2, army: 11 }).army).toBe(12); // level 2 rests up to 12 only
    expect(restHtml({ ...site, ascension: 2, relics: [] })).toContain('Rest: back up to 12 marbles');
  });
  it('Static shroud: the bot searches half the positions, but rewards offer one choice fewer', () => {
    const run = { ...fighting(base(), 0), relics: [Relic.StaticShroud] };
    expect(fightBudget(MAP, run, 100)).toBe(50);
    expect(fightBudget(MAP, { ...fighting(base(), 0, 1), relics: [Relic.StaticShroud, Relic.Jammer] }, 100)).toBe(113); // 300 x .5 x .75
    expect(fightBudget(MAP, { ...fighting(base(), 0, 1, 4), relics: [Relic.StaticShroud] }, 100)).toBe(100); // not against a boss
    const reward = { ...base(), reward: true, army: 10, path: [0] };
    expect(offers(reward)).toHaveLength(3);
    expect(offers({ ...reward, relics: [Relic.StaticShroud] })).toHaveLength(2);
    expect(offers({ ...reward, relics: [Relic.StaticShroud, Relic.LuckyCoin] })).toHaveLength(3);
  });
  it('Boss breaker: act bosses play at half their strength, but the bot searches 25 % more in fights and elites', () => {
    expect(actBoss(MAP, { ...fighting(base(), 0, 1, 4, 5, 6, 8), relics: [Relic.BossBreaker] }, ['hull'])!.percent).toBe(50);
    expect(actBoss(MAP, { ...fighting(base(), 0, 1, 4, 5, 6, 8), relics: [Relic.BossBreaker, Relic.WarBanner] }, ['hull'])!.percent).toBe(75);
    expect(fightBudget(MAP, { ...fighting(base(), 0), relics: [Relic.BossBreaker] }, 100)).toBe(125);
    expect(fightBudget(MAP, { ...fighting(base(), 0, 1, 4), relics: [Relic.BossBreaker] }, 100)).toBe(100);
  });
});

describe('saving the keys', () => {
  const save = async (run: Run): Promise<Run | null> => {
    const store = memoryStore();
    await saveRun(store, run);
    const loaded = await loadRun(store, () => MAP, () => null as never);
    return loaded && loaded.state;
  };
  it('a run keeps its keys, and a save without them has none', async () => {
    const run = { ...at(base(), 0, 1), keys: [Key.Emerald, Key.Ruby] };
    expect((await save(run))!.keys).toEqual([Key.Emerald, Key.Ruby]);
    const { keys: _keys, ...old } = run;
    const store = memoryStore();
    await store.put('run', old);
    expect((await loadRun(store, () => MAP, () => null as never))!.state.keys).toEqual([]);
  });
  it('a save with a bad key list is refused', async () => {
    for (const keys of [[3], [0, 0], 'ruby', [-1], [1.5]]) {
      const store = memoryStore();
      await store.put('run', { ...at(base(), 0, 1), keys });
      expect(await loadRun(store, () => MAP, () => null as never)).toBeNull();
    }
  });
  it('a save in act 4 loads with the three keys and is refused without them', async () => {
    const path = [0, 1, 4, 5, 6, 8, 9, 10, 11, 12];
    expect((await save({ ...at(base(), ...path), keys: ALL_KEYS }))!.path).toEqual(path);
    expect(await save(at(base(), ...path))).toBeNull();
  });
});
