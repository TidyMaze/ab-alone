// The choice before a tower fight (#1620): once The Echo is beaten, a fight that takes the mirror asks whether the player brings
// the Echo's mirror into it. Pure over the page's dialog: main.ts gives the elements, the store and what starts the fight.
import { loadTraitPick, MIRROR_COST, saveTraitPick, traitOffer, type TraitPick } from './medals';
import type { Store } from './quality';

export interface TraitChoiceDom {
  panel: HTMLElement;
  text: HTMLElement;
  yes: HTMLButtonElement;
  no: HTMLButtonElement;
}

/** Starts the fight at once without the mirror when it is not offered; otherwise shows the choice, and `start` gets the pick once chosen. */
export function askMirror(dom: TraitChoiceDom, store: Store, takesMirror: boolean, start: (mirror: boolean) => void): void {
  if (!traitOffer(store, takesMirror)) return start(false);
  const pick: TraitPick = loadTraitPick(store);
  const answer = (mirror: boolean): void => {
    saveTraitPick(store, mirror ? 'mirror' : 'none');
    dom.panel.hidden = true;
    start(mirror);
  };
  dom.text.textContent = 'Before the tower: bring the Echo’s mirror into this fight?';
  dom.yes.textContent = MIRROR_COST;
  dom.no.textContent = 'Fight without';
  dom.yes.onclick = () => answer(true);
  dom.no.onclick = () => answer(false);
  dom.panel.hidden = false;
  (pick === 'mirror' ? dom.yes : dom.no).focus();
}
