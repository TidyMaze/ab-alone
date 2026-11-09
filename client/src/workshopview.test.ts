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
  it('says the counts, the army and the loadout, then a row for each of the seven marbles with its price', () => {
    const host = page(stock({ wood: 12, ore: 7, parts: 20, shards: 2 }, { specials: [1, 1, 9], brought: [9] }));
    expect(host.querySelector('#workshop-stock')!.textContent).toBe('Wood 12 · Ore 7 · Parts 20 · Shards 2');
    expect(host.querySelector('#workshop-army')!.textContent).toBe('Army 3 / 6 · Bringing 1 / 3');
    const rows = [...host.querySelectorAll('li')];
    expect(rows.length).toBe(OFFERS.length);
    expect(rows[0]!.querySelector('b')!.textContent).toBe('Heavy');
    expect(rows[0]!.querySelector('small')!.textContent).toBe('weighs 2 in a push');
    expect(rows[0]!.querySelector('.w-cost')!.textContent).toBe('6 ore + 4 parts');
    expect(rows[0]!.querySelector('.w-own')!.textContent).toBe('Owned 2 · Bringing 0');
    expect(rows[5]!.querySelector('.w-cost')!.textContent).toBe('3 wood + 3 ore + 6 parts');
    expect(rows[5]!.querySelector('.w-own')!.textContent).toBe('Owned 1 · Bringing 1');
  });

  it('gives each row its four buttons in tab order, Buy, Sell, Bring, Leave', () => {
    const row = page(stock()).querySelector('li')!;
    expect([...row.querySelectorAll('button')].map((b) => b.dataset.act)).toEqual([...ACTS]);
    expect(ACTS).toEqual(['buy', 'sell', 'bring', 'leave']);
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
  });
});
