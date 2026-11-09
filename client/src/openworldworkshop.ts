// The Workshop of the Open world (#1655, Decision #1654, docs/specs/openworld.md section 19.2): the special marbles of the rogue-lite bought with the
// resources, refunded for half, and the loadout the army brings to a wild fight. Pure rules over a stock (the resources and the army): the page and the
// saves apply them, and nothing here loads the engine.
import { cellIndex, CELLS, type Axial } from './board';
import { NO_RESOURCES, type Army, type Resources } from './openworldresources';
import { SPECIAL_LOOKS } from './roguelite';

/** What the Workshop changes: the counts and the army. */
export interface Stock {
  resources: Resources;
  army: Army;
}

/** The special marbles the army owns at most, and the ones it brings to a fight (the rogue-lite's placement cap, `FIGHT_CAP`). */
export const OWN_MAX = 6;
export const BRING_MAX = 3;

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

const RESOURCES = ['wood', 'ore', 'parts'] as const;
/** A refund: half of each part of a price, rounded down. */
export const refund = (cost: Resources): Resources => ({ wood: cost.wood >> 1, ore: cost.ore >> 1, parts: cost.parts >> 1, shards: cost.shards >> 1 });
const offerOf = (kind: number): Offer => OFFERS.find((offer) => offer.kind === kind)!;
const count = (list: readonly number[], kind: number): number => list.filter((k) => k === kind).length;
const without = (list: readonly number[], kind: number): number[] => {
  const at = list.indexOf(kind);
  return list.filter((_, i) => i !== at);
};
const withArmy = (stock: Stock, army: Partial<Army>): Stock => ({ ...stock, army: { ...stock.army, ...army } });

/** Why a `kind` cannot be bought, '' when it can: the army is full, or what is missing ("not enough ore and parts"). */
export function buyReason({ resources, army }: Stock, kind: number): string {
  if (army.specials.length >= OWN_MAX) return 'army full';
  const cost = offerOf(kind).cost;
  const short = RESOURCES.filter((name) => resources[name] < cost[name]);
  return short.length ? `not enough ${short.join(' and ')}` : '';
}

/** The stock once a `kind` is bought (the stock itself when it cannot be). */
export function buy(stock: Stock, kind: number): Stock {
  if (buyReason(stock, kind)) return stock;
  const cost = offerOf(kind).cost;
  const resources = { ...stock.resources };
  for (const name of RESOURCES) resources[name] -= cost[name];
  return { resources, army: { ...stock.army, specials: [...stock.army.specials, kind].sort((a, b) => a - b) } };
}

/** Why a `kind` cannot be sold, '' when it can. */
export const sellReason = ({ army }: Stock, kind: number): string => (count(army.specials, kind) === 0 ? 'none to sell' : '');

/** The stock once a `kind` is sold for half its price: one less owned, and one less brought when the loadout held more than the army keeps. */
export function sell(stock: Stock, kind: number): Stock {
  if (sellReason(stock, kind)) return stock;
  const cost = refund(offerOf(kind).cost);
  const specials = without(stock.army.specials, kind);
  const brought = count(stock.army.brought, kind) > count(specials, kind) ? without(stock.army.brought, kind) : stock.army.brought;
  const resources = { wood: stock.resources.wood + cost.wood, ore: stock.resources.ore + cost.ore, parts: stock.resources.parts + cost.parts, shards: stock.resources.shards };
  return { resources, army: { ...stock.army, specials, brought } };
}

/** Why a `kind` cannot join the loadout, '' when it can. */
export function bringReason({ army }: Stock, kind: number): string {
  if (army.brought.length >= BRING_MAX) return `${BRING_MAX} already brought`;
  return count(army.brought, kind) >= count(army.specials, kind) ? 'none left to bring' : '';
}

/** The stock with a `kind` added to the loadout. */
export const bring = (stock: Stock, kind: number): Stock => (bringReason(stock, kind) ? stock : withArmy(stock, { brought: [...stock.army.brought, kind].sort((a, b) => a - b) }));

/** Why a `kind` cannot leave the loadout, '' when it can. */
export const leaveReason = ({ army }: Stock, kind: number): string => (count(army.brought, kind) === 0 ? 'none brought' : '');

/** The stock with a `kind` out of the loadout. */
export const leave = (stock: Stock, kind: number): Stock => (leaveReason(stock, kind) ? stock : withArmy(stock, { brought: without(stock.army.brought, kind) }));

/** The army once the special marbles of the kinds `lost` are thrown off in a fight: gone from what it owns and from what it brings. */
export function lose(army: Army, lost: readonly number[]): Army {
  let { specials, brought } = army;
  for (const kind of lost) {
    specials = without(specials, kind);
    brought = without(brought, kind);
  }
  return { ...army, specials, brought };
}

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
