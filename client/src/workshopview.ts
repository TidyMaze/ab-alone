// The Workshop sheet of the Hub of a town (#1655, docs/specs/openworld.md section 19.2 and 19.3): the stock, and a row for each special marble on sale with what it
// costs, how many the army owns and brings, and its buttons: Buy, Upgrade (Heavy, Anchor and Spark), Sell, Bring and Leave, then a row for each relic. A button that cannot be
// pressed is disabled and says why (its title and label; the Buy reason is on the row too). Pure text: the page draws it and listens to the buttons by their `data-act`
// and `data-kind` (a special marble) or `data-relic` (a relic).
import { resourceLine, type Resources } from './openworldresources';
import {
  bringMax, bringReason, bringRelicReason, buyReason, buyRelicReason, leaveReason, leaveRelicReason, OFFERS, OWN_MAX, RELIC_MAX, RELIC_OFFERS, sellReason, sellRelicReason, upgradeCost, upgradeReason,
  type Offer, type RelicOffer, type Stock,
} from './openworldworkshop';
import { RELICS, SPECIAL_LOOKS } from './roguelite';

/** The buttons of a row, in tab order. */
export const ACTS = ['buy', 'upgrade', 'sell', 'bring', 'leave'] as const;
export type Act = (typeof ACTS)[number];
const LABEL: Record<Act, string> = { buy: 'Buy', upgrade: 'Upgrade', sell: 'Sell', bring: 'Bring', leave: 'Leave' };
const REASON: Record<Act, (stock: Stock, kind: number) => string> = { buy: buyReason, upgrade: upgradeReason, sell: sellReason, bring: bringReason, leave: leaveReason };
const RELIC_REASON: Record<Exclude<Act, 'upgrade'>, (stock: Stock, code: number) => string> = { buy: buyRelicReason, sell: sellRelicReason, bring: bringRelicReason, leave: leaveRelicReason };

/** A price as words: "6 ore + 4 parts". */
export const costLine = (cost: Resources): string =>
  (['wood', 'ore', 'parts', 'shards'] as const)
    .filter((name) => cost[name] > 0)
    .map((name) => `${cost[name]} ${name}`)
    .join(' + ');

const button = (act: Act, why: string, name: string, id: string): string => {
  const label = why ? `${LABEL[act]} ${name}: ${why}` : `${LABEL[act]} ${name}`;
  return `<button type="button" data-act="${act}" ${id} aria-label="${label}"${why ? ` disabled title="${why}"` : ''}>${LABEL[act]}</button>`;
};
const count = (list: readonly number[], code: number): number => list.filter((c) => c === code).length;

const line = (cost: string, owned: number, brought: number): string => `<div class="w-line"><span class="w-cost">${cost}</span> · <span class="w-own">Owned ${owned} · Bringing ${brought}</span></div>`;
const name = (title: string, help: string): string => `<div class="w-name"><b>${title}</b> <small>${help}</small></div>`;

/** The row of a special marble on sale: Buy, and Upgrade for a Heavy, an Anchor and a Spark, then Sell, Bring and Leave. */
const row = (stock: Stock, { kind, name: title, cost }: Offer): string => {
  const acts = ACTS.filter((act) => act !== 'upgrade' || kind <= 3);
  const price = kind <= 3 ? `${costLine(cost)} · Upgrade: ${costLine(upgradeCost(kind))}` : costLine(cost);
  const buttons = acts.map((act) => button(act, REASON[act](stock, kind), title, `data-kind="${kind}"`)).join('');
  return `<li data-kind="${kind}">${name(title, SPECIAL_LOOKS[kind - 1]!.help)}${line(price, count(stock.army.specials, kind), count(stock.army.brought, kind))}<div class="w-btns">${buttons}</div><small class="w-why">${buyReason(stock, kind)}</small></li>`;
};

/** The row of an upgraded type (Heavy+, Anchor+, Spark+), which only an upgrade makes: Sell, Bring and Leave. */
const plusRow = (stock: Stock, kind: number): string => {
  const title = SPECIAL_LOOKS[kind - 1]!.name;
  const buttons = (['sell', 'bring', 'leave'] as const).map((act) => button(act, REASON[act](stock, kind), title, `data-kind="${kind}"`)).join('');
  return `<li data-kind="${kind}">${name(title, SPECIAL_LOOKS[kind - 1]!.help)}${line(`Upgrade: ${costLine(upgradeCost(kind - 3))}`, count(stock.army.specials, kind), count(stock.army.brought, kind))}<div class="w-btns">${buttons}</div><small class="w-why"></small></li>`;
};

/** The row of a relic: Buy, Sell, Bring and Leave. */
const relicRow = (stock: Stock, { code, name: title, cost }: RelicOffer): string => {
  const buttons = (['buy', 'sell', 'bring', 'leave'] as const).map((act) => button(act, RELIC_REASON[act](stock, code), title, `data-relic="${code}"`)).join('');
  return `<li data-relic="${code}">${name(title, RELICS[code]!.help)}${line(costLine(cost), count(stock.army.relics, code), count(stock.army.relicsBrought, code))}<div class="w-btns">${buttons}</div><small class="w-why">${buyRelicReason(stock, code)}</small></li>`;
};

/** The body of the sheet: the counts, the army and the loadout, then the rows of the special marbles, the upgraded types and the relics. */
export function workshopHtml(stock: Stock): string {
  const { army } = stock;
  const marbles = `Army ${army.specials.length} / ${OWN_MAX} · Bringing ${army.brought.length} / ${bringMax(army)}`;
  const relics = `Relics ${army.relics.length} · Bringing ${army.relicsBrought.length} / ${RELIC_MAX}`;
  const plus = [4, 5, 6].map((kind) => plusRow(stock, kind)).join('');
  return `<p id="workshop-stock">${resourceLine(stock.resources)}</p><p id="workshop-army">${marbles}</p><p id="workshop-relics">${relics}</p><ul>${OFFERS.map((offer) => row(stock, offer)).join('')}${plus}</ul><h3>Relics</h3><ul class="w-relics">${RELIC_OFFERS.map((offer) => relicRow(stock, offer)).join('')}</ul>`;
}
