// What the Open world HUD reads from the rest of the game (#1171): the medals of the shared `ab-alone.medals` and whether Tally's
// relayed line has been said. Pure functions: main.ts gives the storage.
import { hasMedal } from './medals';
import { read, write, type Store } from './quality';

const CLAIM_KEY = 'ab-alone.openworld-claim';

/** How many of the bosses `ids` have a medal, in whatever mode it was won. */
export const medalCount = (store: Store, ids: readonly string[]): number => ids.filter((id) => hasMedal(store, id)).length;

/** True the first time, then false: Tally's claim line is said once. With no storage it is said on every visit. */
export function claimOnce(store: Store): boolean {
  if (read(store, CLAIM_KEY) !== null) return false;
  write(store, CLAIM_KEY, '1');
  return true;
}
