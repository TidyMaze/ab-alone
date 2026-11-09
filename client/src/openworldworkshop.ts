// The Workshop of the Open world (#1655, Decision #1654, docs/specs/openworld.md section 19.2): the special marbles of the rogue-lite bought with the
// resources, refunded for half, and the loadout the army brings to a wild fight. Pure rules over a stock (the resources and the army): the page and the
// saves apply them, and nothing here loads the engine.
import { cellIndex, CELLS, type Axial } from './board';
import { NO_RESOURCES, type Army, type Resources } from './openworldresources';
import { Relic, RELICS, SPECIAL_LOOKS } from './roguelite';

/** What the Workshop changes: the counts and the army. */
export interface Stock {
  resources: Resources;
  army: Army;
}

/** The special marbles the army owns at most, and the ones it brings to a fight (the rogue-lite's placement cap, `FIGHT_CAP`, one more with the Quartermaster brought). */
export const OWN_MAX = 6;
export const BRING_MAX = 3;
/** The relics the army brings to a fight at most. */
export const RELIC_MAX = 2;
/** The special marbles the army brings: 3, or 4 with the Quartermaster in its relics brought. */
export const bringMax = (army: Army): number => BRING_MAX + Number(army.relicsBrought.includes(Relic.Quartermaster));

/** A special marble on sale: the bridge's kind, its name and its price. */
export interface Offer {
  kind: number;
  name: string;
  cost: Resources;
}

const price = (wood: number, ore: number, parts: number): Resources => ({ ...NO_RESOURCES, wood, ore, parts });
/** The prices (TUNE), in the bridge's kinds: Heavy 1, Anchor 2, Spark 3, Magnet 7, Shield 8, Bomb 9, Medic 10. */
const COSTS: readonly (readonly [number, Resources])[] = [
  [1, price(0, 6, 4)],
  [2, price(2, 6, 4)],
  [3, price(4, 0, 6)],
  [8, price(6, 0, 4)],
  [7, price(0, 4, 6)],
  [9, price(3, 3, 6)],
  [10, price(6, 0, 6)],
];
export const OFFERS: readonly Offer[] = COSTS.map(([kind, cost]) => ({ kind, name: SPECIAL_LOOKS[kind - 1]!.name, cost }));

/** The `+` of an upgraded type: the plain kind it comes from (Heavy 1, Anchor 2, Spark 3) and the kind it becomes, 3 more. */
const UPGRADED = 3;
const upgraded = (kind: number): boolean => kind > UPGRADED && kind <= 2 * UPGRADED;
/** What an upgrade costs (TUNE): 3 shards and 10 of the type's main resource, ore for a Heavy and an Anchor, wood for a Spark. */
export const upgradeCost = (kind: number): Resources => ({ ...NO_RESOURCES, shards: 3, ...(kind === 3 ? { wood: 10 } : { ore: 10 }) });
const add = (a: Resources, b: Resources): Resources => ({ wood: a.wood + b.wood, ore: a.ore + b.ore, parts: a.parts + b.parts, shards: a.shards + b.shards });
/** The whole price of a kind: an upgraded type is worth its plain marble and its upgrade. */
const priceOf = (kind: number): Resources => (upgraded(kind) ? add(offerOf(kind - UPGRADED).cost, upgradeCost(kind - UPGRADED)) : offerOf(kind).cost);

const RESOURCES = ['wood', 'ore', 'parts', 'shards'] as const;
/** A refund: half of each part of a price, rounded down. */
export const refund = (cost: Resources): Resources => ({ wood: cost.wood >> 1, ore: cost.ore >> 1, parts: cost.parts >> 1, shards: cost.shards >> 1 });
const offerOf = (kind: number): Offer => OFFERS.find((offer) => offer.kind === kind)!;
const count = (list: readonly number[], kind: number): number => list.filter((k) => k === kind).length;
const without = (list: readonly number[], kind: number): number[] => {
  const at = list.indexOf(kind);
  return list.filter((_, i) => i !== at);
};
const withArmy = (stock: Stock, army: Partial<Army>): Stock => ({ ...stock, army: { ...stock.army, ...army } });

/** The names of what `cost` asks more than `resources` has: "ore and shards". */
const missing = (resources: Resources, cost: Resources): string => RESOURCES.filter((name) => resources[name] < cost[name]).join(' and ');
const spend = (resources: Resources, cost: Resources): Resources => ({ wood: resources.wood - cost.wood, ore: resources.ore - cost.ore, parts: resources.parts - cost.parts, shards: resources.shards - cost.shards });

/** Why a `kind` cannot be bought, '' when it can: the army is full, or what is missing ("not enough ore and parts"). */
export function buyReason({ resources, army }: Stock, kind: number): string {
  if (army.specials.length >= OWN_MAX) return 'army full';
  const short = missing(resources, offerOf(kind).cost);
  return short && `not enough ${short}`;
}

/** The stock once a `kind` is bought (the stock itself when it cannot be). */
export function buy(stock: Stock, kind: number): Stock {
  if (buyReason(stock, kind)) return stock;
  return { resources: spend(stock.resources, offerOf(kind).cost), army: { ...stock.army, specials: [...stock.army.specials, kind].sort((a, b) => a - b) } };
}

/** Why an owned `kind` (Heavy, Anchor or Spark) cannot be upgraded to its + type, '' when it can. */
export function upgradeReason({ resources, army }: Stock, kind: number): string {
  if (count(army.specials, kind) === 0) return 'none to upgrade';
  const short = missing(resources, upgradeCost(kind));
  return short && `not enough ${short}`;
}

/** The stock once an owned `kind` is upgraded: the + type takes its place in the army, and in the loadout when the loadout held more of the kind than the army keeps. */
export function upgrade(stock: Stock, kind: number): Stock {
  if (upgradeReason(stock, kind)) return stock;
  const specials = [...without(stock.army.specials, kind), kind + UPGRADED].sort((a, b) => a - b);
  const swap = count(stock.army.brought, kind) > count(specials, kind);
  const brought = swap ? [...without(stock.army.brought, kind), kind + UPGRADED].sort((a, b) => a - b) : stock.army.brought;
  return { resources: spend(stock.resources, upgradeCost(kind)), army: { ...stock.army, specials, brought } };
}

/** Why a `kind` cannot be sold, '' when it can. */
export const sellReason = ({ army }: Stock, kind: number): string => (count(army.specials, kind) === 0 ? 'none to sell' : '');

/** The stock once a `kind` is sold for half its whole price: one less owned, and one less brought when the loadout held more than the army keeps. */
export function sell(stock: Stock, kind: number): Stock {
  if (sellReason(stock, kind)) return stock;
  const specials = without(stock.army.specials, kind);
  const brought = count(stock.army.brought, kind) > count(specials, kind) ? without(stock.army.brought, kind) : stock.army.brought;
  return { resources: add(stock.resources, refund(priceOf(kind))), army: { ...stock.army, specials, brought } };
}

/** Why a `kind` cannot join the loadout, '' when it can. */
export function bringReason({ army }: Stock, kind: number): string {
  if (army.brought.length >= bringMax(army)) return `${bringMax(army)} already brought`;
  return count(army.brought, kind) >= count(army.specials, kind) ? 'none left to bring' : '';
}

/** The stock with a `kind` added to the loadout. */
export const bring = (stock: Stock, kind: number): Stock => (bringReason(stock, kind) ? stock : withArmy(stock, { brought: [...stock.army.brought, kind].sort((a, b) => a - b) }));

/** Why a `kind` cannot leave the loadout, '' when it can. */
export const leaveReason = ({ army }: Stock, kind: number): string => (count(army.brought, kind) === 0 ? 'none brought' : '');

/** The stock with a `kind` out of the loadout. */
export const leave = (stock: Stock, kind: number): Stock => (leaveReason(stock, kind) ? stock : withArmy(stock, { brought: without(stock.army.brought, kind) }));

/** An army whose loadout fits what it may bring: without the Quartermaster, the fourth marble stays at home. */
const fitted = (army: Army): Army => ({ ...army, brought: army.brought.slice(0, bringMax(army)) });

/** A relic on sale: its code on the bridge, its name and its price. */
export interface RelicOffer {
  code: number;
  name: string;
  cost: Resources;
}
/** The relics that act inside one fight and that the Workshop sells (TUNE): 5 shards and 15 parts each. */
export const RELIC_OFFERS: readonly RelicOffer[] = [Relic.Gyroscope, Relic.HullPlating, Relic.Detonator, Relic.Saboteur, Relic.Quartermaster].map((code) => ({
  code,
  name: RELICS[code]!.name,
  cost: { ...NO_RESOURCES, shards: 5, parts: 15 },
}));
const relicCost = RELIC_OFFERS[0]!.cost;

/** Why a relic cannot be bought, '' when it can: one of each, and the price. */
export function buyRelicReason({ resources, army }: Stock, code: number): string {
  if (army.relics.includes(code)) return 'already owned';
  const short = missing(resources, relicCost);
  return short && `not enough ${short}`;
}

/** The stock once a relic is bought. */
export const buyRelic = (stock: Stock, code: number): Stock =>
  buyRelicReason(stock, code) ? stock : { resources: spend(stock.resources, relicCost), army: { ...stock.army, relics: [...stock.army.relics, code].sort((a, b) => a - b) } };

/** Why a relic cannot be sold, '' when it can. */
export const sellRelicReason = ({ army }: Stock, code: number): string => (army.relics.includes(code) ? '' : 'none to sell');

/** The stock once a relic is sold for half its price, out of the loadout too. */
export const sellRelic = (stock: Stock, code: number): Stock =>
  sellRelicReason(stock, code)
    ? stock
    : {
        resources: add(stock.resources, refund(relicCost)),
        army: fitted({ ...stock.army, relics: stock.army.relics.filter((c) => c !== code), relicsBrought: stock.army.relicsBrought.filter((c) => c !== code) }),
      };

/** Why a relic cannot join the loadout, '' when it can. */
export function bringRelicReason({ army }: Stock, code: number): string {
  if (!army.relics.includes(code)) return 'not owned';
  if (army.relicsBrought.includes(code)) return 'already brought';
  return army.relicsBrought.length >= RELIC_MAX ? `${RELIC_MAX} already brought` : '';
}

/** The stock with a relic added to the loadout. */
export const bringRelic = (stock: Stock, code: number): Stock => (bringRelicReason(stock, code) ? stock : withArmy(stock, { relicsBrought: [...stock.army.relicsBrought, code].sort((a, b) => a - b) }));

/** Why a relic cannot leave the loadout, '' when it can. */
export const leaveRelicReason = ({ army }: Stock, code: number): string => (army.relicsBrought.includes(code) ? '' : 'none brought');

/** The stock with a relic out of the loadout, and the fourth marble with the Quartermaster. */
export const leaveRelic = (stock: Stock, code: number): Stock =>
  leaveRelicReason(stock, code) ? stock : { ...stock, army: fitted({ ...stock.army, relicsBrought: stock.army.relicsBrought.filter((c) => c !== code) }) };

/** The bridge's bit mask of the relics brought (`Engine::set_relics`, the rogue-lite's `relicMask` without affinities). */
export const relicsMask = (relics: readonly number[]): number => relics.reduce((mask, code) => mask | (1 << code), 0);

/** The marbles the bot has in a wild fight: a full army, one fewer with the Saboteur (the rogue-lite's rule, wild fights only). */
export const wildFoes = (relics: readonly number[]): number => 14 - Number(relics.includes(Relic.Saboteur));

/** What the Hull plating does with the kinds `lost` in a fight: it keeps the first one, the others are lost. */
export function hullKeeps(relics: readonly number[], lost: readonly number[]): { lost: number[]; kept: number[] } {
  const keeps = relics.includes(Relic.HullPlating) ? lost.slice(0, 1) : [];
  return { lost: lost.slice(keeps.length), kept: keeps };
}

/** The army once the special marbles of the kinds `lost` are thrown off in a fight: gone from what it owns and from what it brings. */
export function lose(army: Army, lost: readonly number[]): Army {
  let { specials, brought } = army;
  for (const kind of lost) {
    specials = without(specials, kind);
    brought = without(brought, kind);
  }
  return { ...army, specials, brought };
}

/** The marbles `placed` (records `[q, r, kind]`) less one of each kind `lost`: what a retried fight places again. */
export function withoutKinds(placed: readonly number[][], lost: readonly number[]): number[][] {
  let left = [...placed];
  for (const kind of lost) {
    const at = left.findIndex((record) => record[2] === kind);
    left = left.filter((_, i) => i !== at);
  }
  return left;
}

/** Whether a fight brings anything: a special marble placed or a relic set. A fight that brings nothing is the plain game, bit for bit. */
export const armed = ({ placed, relics }: { placed: readonly number[][]; relics: readonly number[] }): boolean => placed.length > 0 || relics.length > 0;

/** The kinds thrown off of a fight: the `brought` ones that `kept` (the counts of each kind left on the board, `armyKept`) does not hold. */
export function thrownOff(brought: readonly number[], kept: readonly number[]): number[] {
  const left = [...kept];
  return brought.filter((kind) => {
    const stays = left[kind - 1]! > 0;
    left[kind - 1]! -= 1;
    return !stays;
  });
}

const distance = ([q, r]: Axial): number => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
/** The special marbles of a loadout placed on the army's marbles (the cells of the army's side on `board`, the bridge's array): the ones nearest the centre, in
 * the order of the loadout, as the records `[q, r, kind]` the engine takes. */
export function placeBrought(board: ArrayLike<number>, brought: readonly number[]): number[][] {
  const mine = CELLS.filter(([q, r]) => board[cellIndex(q, r)] === 1).sort((a, b) => distance(a) - distance(b) || a[0] - b[0] || a[1] - b[1]);
  return brought.map((kind, i) => [mine[i]![0], mine[i]![1], kind]);
}
