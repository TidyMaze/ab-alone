// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { NO_ARMY } from './openworldresources';
import { buy, OFFERS, type Stock } from './openworldworkshop';
import { ACTS, costLine, workshopHtml } from './workshopview';

// The Workshop sheet (#1655, docs/specs/openworld.md section 19.2): what each row says and which button is disabled, and why.
const stock = (resources = { wood: 20, ore: 20, parts: 40, shards: 1 }, army = {}): Stock => ({ resources, army: { ...NO_ARMY, ...army } });
const page = (s: Stock): HTMLElement => {
  const host = document.createElement('div');
  host.innerHTML = workshopHtml(s);
  return host;
};
const button = (host: HTMLElement, kind: number, act: string): HTMLButtonElement => host.querySelector(`button[data-kind="${kind}"][data-act="${act}"]`)!;

describe('the Workshop sheet (#1655)', () => {
  it('says the counts, the army and the loadout, then a row for each of the seven marbles with its price (and the + types)', () => {
    const host = page(stock({ wood: 12, ore: 7, parts: 20, shards: 2 }, { specials: [1, 1, 9], brought: [9] }));
    expect(host.querySelector('#workshop-stock')!.textContent).toBe('Wood 12 · Ore 7 · Parts 20 · Shards 2');
    expect(host.querySelector('#workshop-army')!.textContent).toBe('Army 3 / 6 · Bringing 1 / 3');
    const rows = [...host.querySelectorAll('ul:not(.w-relics) > li')];
    expect(rows.length).toBe(OFFERS.length + 3);
    expect(rows[0]!.querySelector('b')!.textContent).toBe('Heavy');
    expect(rows[0]!.querySelector('small')!.textContent).toBe('weighs 2 in a push');
    expect(rows[0]!.querySelector('.w-cost')!.textContent).toBe('6 ore + 4 parts · Upgrade: 10 ore + 3 shards');
    expect(rows[0]!.querySelector('.w-own')!.textContent).toBe('Owned 2 · Bringing 0');
    expect(rows[5]!.querySelector('.w-cost')!.textContent).toBe('3 wood + 3 ore + 6 parts');
    expect(rows[5]!.querySelector('.w-own')!.textContent).toBe('Owned 1 · Bringing 1');
  });

  it('gives each row its buttons in tab order: Buy, Upgrade (Heavy, Anchor and Spark), Sell, Bring, Leave', () => {
    const rows = [...page(stock()).querySelectorAll('ul:not(.w-relics) > li')];
    const acts = (row: Element) => [...row.querySelectorAll('button')].map((b) => b.dataset.act);
    expect(acts(rows[0]!)).toEqual([...ACTS]);
    expect(acts(rows[3]!)).toEqual(['buy', 'sell', 'bring', 'leave']); // a Shield has no + type
    expect(ACTS).toEqual(['buy', 'upgrade', 'sell', 'bring', 'leave']);
  });

  it('adds a row for each + type, with no Buy, that says its upgrade price and what it is', () => {
    const host = page(stock({ wood: 20, ore: 20, parts: 40, shards: 3 }, { specials: [4, 1], brought: [4] }));
    const rows = [...host.querySelectorAll('ul:not(.w-relics) > li')];
    expect(rows.length).toBe(OFFERS.length + 3);
    const plus = rows[OFFERS.length]!;
    expect(plus.querySelector('b')!.textContent).toBe('Heavy+');
    expect(plus.querySelector('small')!.textContent).toBe('weighs 3 in a push');
    expect(plus.querySelector('.w-cost')!.textContent).toBe('Upgrade: 10 ore + 3 shards');
    expect(plus.querySelector('.w-own')!.textContent).toBe('Owned 1 · Bringing 1');
    expect([...plus.querySelectorAll('button')].map((b) => b.dataset.act)).toEqual(['sell', 'bring', 'leave']);
    expect(rows[OFFERS.length + 2]!.querySelector('.w-cost')!.textContent).toBe('Upgrade: 10 wood + 3 shards');
    expect(button(host, 1, 'upgrade').disabled).toBe(false);
    expect(button(host, 1, 'upgrade').getAttribute('aria-label')).toBe('Upgrade Heavy');
  });

  it('disables Upgrade and says why', () => {
    const host = page(stock({ wood: 20, ore: 20, parts: 40, shards: 2 }, { specials: [1], brought: [] }));
    expect(button(host, 1, 'upgrade').title).toBe('not enough shards');
    expect(button(host, 2, 'upgrade').title).toBe('none to upgrade');
    expect(host.querySelector('li[data-kind="1"] .w-cost')!.textContent).toBe('6 ore + 4 parts · Upgrade: 10 ore + 3 shards');
  });

  it('lists the five relics with their price, rule and buttons, and the relics line', () => {
    const host = page(stock({ wood: 0, ore: 0, parts: 14, shards: 5 }, { relics: [11], relicsBrought: [11] }));
    expect(host.querySelector('#workshop-relics')!.textContent).toBe('Relics 1 · Bringing 1 / 2');
    expect(host.querySelector('#workshop-army')!.textContent).toBe('Army 0 / 6 · Bringing 0 / 4'); // the Quartermaster is brought
    const rows = [...host.querySelectorAll('ul.w-relics > li')];
    expect(rows.map((r) => r.querySelector('b')!.textContent)).toEqual(['Gyroscope', 'Hull plating', 'Detonator', 'Saboteur', 'Quartermaster']);
    expect(rows[0]!.querySelector('small')!.textContent).toBe('once per fight, your first push of a tie goes through');
    expect(rows[0]!.querySelector('.w-cost')!.textContent).toBe('15 parts + 5 shards');
    expect(rows[4]!.querySelector('.w-own')!.textContent).toBe('Owned 1 · Bringing 1');
    expect([...rows[0]!.querySelectorAll('button')].map((b) => b.dataset.act)).toEqual(['buy', 'sell', 'bring', 'leave']);
    const relic = (code: number, act: string) => host.querySelector<HTMLButtonElement>(`button[data-relic="${code}"][data-act="${act}"]`)!;
    expect(relic(0, 'buy').title).toBe('not enough parts');
    expect(relic(11, 'buy').title).toBe('already owned');
    expect(relic(0, 'sell').title).toBe('none to sell');
    expect(relic(0, 'bring').title).toBe('not owned');
    expect(relic(11, 'leave').disabled).toBe(false);
    expect(relic(0, 'buy').getAttribute('aria-label')).toBe('Buy Gyroscope: not enough parts');
    expect(host.querySelector('li[data-relic="0"] .w-why')!.textContent).toBe('not enough parts');
  });

  it('disables a button that cannot be pressed and says why, in its title, its label and on the row', () => {
    const host = page(stock({ wood: 0, ore: 5, parts: 9, shards: 0 }, { specials: [2], brought: [] }));
    const heavy = button(host, 1, 'buy');
    expect(heavy.disabled).toBe(true);
    expect(heavy.title).toBe('not enough ore');
    expect(heavy.getAttribute('aria-label')).toBe('Buy Heavy: not enough ore');
    expect(host.querySelector('li[data-kind="1"] .w-why')!.textContent).toBe('not enough ore');
    expect(button(host, 1, 'sell').title).toBe('none to sell');
    expect(button(host, 1, 'bring').title).toBe('none left to bring');
    expect(button(host, 1, 'leave').title).toBe('none brought');
    expect(button(host, 3, 'buy').title).toBe('not enough wood');
  });

  it('leaves a button that can be pressed enabled, with no title and no reason', () => {
    const host = page(stock(undefined, { specials: [1], brought: [] }));
    for (const act of ['buy', 'sell', 'bring']) {
      expect(button(host, 1, act).disabled).toBe(false);
      expect(button(host, 1, act).hasAttribute('title')).toBe(false);
    }
    expect(button(host, 1, 'buy').getAttribute('aria-label')).toBe('Buy Heavy');
    expect(host.querySelector('li[data-kind="1"] .w-why')!.textContent).toBe('');
    expect(button(host, 1, 'leave').disabled).toBe(true);
  });

  it('says the army is full on every Buy once six marbles are owned', () => {
    let s = stock({ wood: 99, ore: 99, parts: 99, shards: 0 });
    for (let i = 0; i < 6; i++) s = buy(s, 1);
    const host = page(s);
    expect(button(host, 10, 'buy').title).toBe('army full');
  });

  it('writes a price without the resources it does not take', () => {
    expect(costLine({ wood: 0, ore: 4, parts: 6, shards: 0 })).toBe('4 ore + 6 parts');
    expect(costLine({ wood: 6, ore: 0, parts: 0, shards: 0 })).toBe('6 wood');
    expect(costLine({ wood: 0, ore: 0, parts: 15, shards: 5 })).toBe('15 parts + 5 shards');
  });
});
