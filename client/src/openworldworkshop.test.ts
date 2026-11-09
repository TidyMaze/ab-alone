import { describe, expect, it } from 'vitest';
import { cellIndex, CELLS } from './board';
import { NO_ARMY, NO_RESOURCES, type Army, type Resources } from './openworldresources';
import { BRING_MAX, bring, bringReason, buy, buyReason, leave, leaveReason, lose, OFFERS, OWN_MAX, placeBrought, refund, sell, sellReason, thrownOff, type Stock } from './openworldworkshop';

// The Workshop of the Open world (#1655, Decision #1654, docs/specs/openworld.md section 19.2): prices, buy, sell, loadout and losses, as pure rules.
const rich: Resources = { wood: 20, ore: 20, parts: 40, shards: 3 };
const stockOf = (resources: Resources = rich, army: Partial<Army> = {}): Stock => ({ resources, army: { ...NO_ARMY, ...army } });
const cost = (kind: number) => OFFERS.find((o) => o.kind === kind)!.cost;

describe('the prices (#1655)', () => {
  it('lists the seven special marbles with the cost of the Decision', () => {
    expect(OFFERS.map(({ name, kind }) => `${name}:${kind}`)).toEqual(['Heavy:1', 'Anchor:2', 'Spark:3', 'Shield:8', 'Magnet:7', 'Bomb:9', 'Medic:10']);
    expect(cost(1)).toEqual({ wood: 0, ore: 6, parts: 4, shards: 0 });
    expect(cost(2)).toEqual({ wood: 2, ore: 6, parts: 4, shards: 0 });
    expect(cost(3)).toEqual({ wood: 4, ore: 0, parts: 6, shards: 0 });
    expect(cost(8)).toEqual({ wood: 6, ore: 0, parts: 4, shards: 0 });
    expect(cost(7)).toEqual({ wood: 0, ore: 4, parts: 6, shards: 0 });
    expect(cost(9)).toEqual({ wood: 3, ore: 3, parts: 6, shards: 0 });
    expect(cost(10)).toEqual({ wood: 6, ore: 0, parts: 6, shards: 0 });
  });

  it('a refund is half of each part, rounded down', () => {
    expect(refund(cost(9))).toEqual({ wood: 1, ore: 1, parts: 3, shards: 0 });
    expect(refund(cost(2))).toEqual({ wood: 1, ore: 3, parts: 2, shards: 0 });
  });
});

describe('buying (#1655)', () => {
  it('spends the price and adds the marble to the army, kept in order', () => {
    const one = buy(stockOf(), 10);
    expect(one.resources).toEqual({ wood: 14, ore: 20, parts: 34, shards: 3 });
    expect(buy(one, 1).army.specials).toEqual([1, 10]);
    expect(buyReason(stockOf(), 10)).toBe('');
  });

  it('says what is missing, all of it', () => {
    expect(buyReason(stockOf({ ...NO_RESOURCES, ore: 5, parts: 4 }), 1)).toBe('not enough ore');
    expect(buyReason(stockOf(NO_RESOURCES), 9)).toBe('not enough wood and ore and parts');
    const poor = stockOf(NO_RESOURCES);
    expect(buy(poor, 1)).toBe(poor);
  });

  it('refuses a seventh marble: the army is full', () => {
    const full = stockOf(rich, { specials: [1, 1, 2, 2, 3, 3] });
    expect(full.army.specials.length).toBe(OWN_MAX);
    expect(buyReason(full, 1)).toBe('army full');
    expect(buy(full, 1)).toBe(full);
  });
});

describe('selling (#1655)', () => {
  it('gives back half the price and takes one marble of the kind', () => {
    const sold = sell(stockOf(NO_RESOURCES, { specials: [1, 9, 9] }), 9);
    expect(sold.resources).toEqual({ wood: 1, ore: 1, parts: 3, shards: 0 });
    expect(sold.army.specials).toEqual([1, 9]);
  });

  it('takes the marble out of the loadout when the loadout held more than the army keeps', () => {
    expect(sell(stockOf(NO_RESOURCES, { specials: [1], brought: [1] }), 1).army.brought).toEqual([]);
    expect(sell(stockOf(NO_RESOURCES, { specials: [1, 1], brought: [1] }), 1).army.brought).toEqual([1]);
  });

  it('refuses a kind the army does not own', () => {
    const none = stockOf(rich, { specials: [2] });
    expect(sellReason(none, 1)).toBe('none to sell');
    expect(sell(none, 1)).toBe(none);
    expect(sellReason(none, 2)).toBe('');
  });
});

describe('the loadout (#1655)', () => {
  it('brings owned marbles, at most three, one per owned marble of a kind', () => {
    let stock = stockOf(rich, { specials: [1, 1, 2, 3] });
    stock = bring(bring(stock, 2), 1);
    expect(stock.army.brought).toEqual([1, 2]);
    expect(bringReason(stock, 1)).toBe('');
    stock = bring(stock, 1);
    expect(stock.army.brought).toEqual([1, 1, 2]);
    expect(BRING_MAX).toBe(3);
    expect(bringReason(stock, 3)).toBe('3 already brought');
    expect(bring(stock, 3)).toBe(stock);
  });

  it('refuses more of a kind than the army owns', () => {
    const stock = stockOf(rich, { specials: [1], brought: [1] });
    expect(bringReason(stock, 1)).toBe('none left to bring');
    expect(bringReason(stock, 2)).toBe('none left to bring');
    expect(bring(stock, 1)).toBe(stock);
  });

  it('leaves a brought marble at home', () => {
    const stock = stockOf(rich, { specials: [1, 2], brought: [1, 2] });
    expect(leave(stock, 1).army.brought).toEqual([2]);
    expect(leaveReason(stock, 1)).toBe('');
    expect(leaveReason(stock, 3)).toBe('none brought');
    expect(leave(stock, 3)).toBe(stock);
  });
});

describe('what a fight takes (#1655)', () => {
  it('the kinds thrown off are the brought ones the board no longer holds', () => {
    const kept = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // one Heavy left
    expect(thrownOff([1, 1, 2], kept)).toEqual([1, 2]);
    expect(thrownOff([1], kept)).toEqual([]);
    expect(thrownOff([], kept)).toEqual([]);
  });

  it('a marble lost leaves what the army owns and what it brings', () => {
    const army: Army = { ...NO_ARMY, specials: [1, 1, 2, 9], brought: [1, 2, 9] };
    expect(lose(army, [1, 9])).toEqual({ ...NO_ARMY, specials: [1, 2], brought: [2] });
    expect(lose(army, [])).toEqual(army);
  });
});

describe('placing the loadout (#1655)', () => {
  /** A board of the bridge's array with the Black marbles of the standard start: the 14 of the two lowest rows. */
  const board = (): number[] => {
    const cells = Array.from({ length: 61 }, () => 0);
    for (const [q, r] of CELLS) if (r >= 1 && r <= 3 && Math.abs(q) <= 3) cells[cellIndex(q, r)] = 1;
    cells[cellIndex(0, 0)] = 2; // a White marble is never chosen
    return cells;
  };

  it('puts each marble on a marble of the army, the nearest to the centre first, none twice', () => {
    const placed = placeBrought(board(), [10, 1, 2]);
    expect(placed.map(([, , kind]) => kind)).toEqual([10, 1, 2]);
    expect(new Set(placed.map(([q, r]) => `${q},${r}`)).size).toBe(3);
    for (const [q, r] of placed) expect(board()[cellIndex(q!, r!)]).toBe(1);
    expect(placed[0]).toEqual([-1, 1, 10]); // the nearest ones, by q then r
    expect(placeBrought(board(), [])).toEqual([]);
  });
});
