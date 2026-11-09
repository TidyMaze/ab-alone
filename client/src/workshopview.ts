// The Workshop sheet of the Hub of a town (#1655, docs/specs/openworld.md section 19.2): the stock, and a row for each special marble on sale with what it
// costs, how many the army owns and brings, and its four buttons: Buy, Sell, Bring and Leave. A button that cannot be pressed is disabled and says why (its
// title and label; the Buy reason is on the row too). Pure text: the page draws it and listens to the buttons by their `data-act` and `data-kind`.
import { resourceLine, type Resources } from './openworldresources';
import { BRING_MAX, bringReason, buyReason, leaveReason, OFFERS, OWN_MAX, sellReason, type Offer, type Stock } from './openworldworkshop';
import { SPECIAL_LOOKS } from './roguelite';

/** The buttons of a row, in tab order. */
export const ACTS = ['buy', 'sell', 'bring', 'leave'] as const;
export type Act = (typeof ACTS)[number];
const LABEL: Record<Act, string> = { buy: 'Buy', sell: 'Sell', bring: 'Bring', leave: 'Leave' };
const REASON: Record<Act, (stock: Stock, kind: number) => string> = { buy: buyReason, sell: sellReason, bring: bringReason, leave: leaveReason };

/** A price as words: "6 ore + 4 parts". */
export const costLine = (cost: Resources): string =>
  (['wood', 'ore', 'parts'] as const)
    .filter((name) => cost[name] > 0)
    .map((name) => `${cost[name]} ${name}`)
    .join(' + ');

const row = (stock: Stock, { kind, name, cost }: Offer): string => {
  const owned = stock.army.specials.filter((k) => k === kind).length;
  const brought = stock.army.brought.filter((k) => k === kind).length;
  const buttons = ACTS.map((act) => {
    const why = REASON[act](stock, kind);
    const label = why ? `${LABEL[act]} ${name}: ${why}` : `${LABEL[act]} ${name}`;
    return `<button type="button" data-act="${act}" data-kind="${kind}" aria-label="${label}"${why ? ` disabled title="${why}"` : ''}>${LABEL[act]}</button>`;
  }).join('');
  const why = buyReason(stock, kind);
  return `<li data-kind="${kind}"><div class="w-name"><b>${name}</b> <small>${SPECIAL_LOOKS[kind - 1]!.help}</small></div><div class="w-line"><span class="w-cost">${costLine(cost)}</span> · <span class="w-own">Owned ${owned} · Bringing ${brought}</span></div><div class="w-btns">${buttons}</div><small class="w-why">${why}</small></li>`;
};

/** The body of the sheet: the counts, the army and the loadout, then the rows. */
export function workshopHtml(stock: Stock): string {
  const army = `Army ${stock.army.specials.length} / ${OWN_MAX} · Bringing ${stock.army.brought.length} / ${BRING_MAX}`;
  return `<p id="workshop-stock">${resourceLine(stock.resources)}</p><p id="workshop-army">${army}</p><ul>${OFFERS.map((offer) => row(stock, offer)).join('')}</ul>`;
}
