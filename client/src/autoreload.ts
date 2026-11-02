// Automatic refresh (#1437): when a new build has taken over, the page reloads by itself unless something is at stake.

/** What a reload would lose. A local hot-seat or bot game is saved on every move and resumes (#218): it is not here. */
export interface Stake {
  online: boolean; // an online room
  ranked: boolean; // waiting in or playing the ranked queue
  fight: boolean; // a boss fight, a daily or a lair
  royale: boolean;
  run: boolean; // a rogue-lite run
  trainer: boolean; // a Trainer run
  replaying: boolean;
  openWorld: boolean;
  sheetOpen: boolean; // the lobby sheet
  typing: boolean; // a text field the player is filling
}

export const atStake = (s: Stake): boolean => Object.values(s).some(Boolean);

/** True once per build: the key remembers the build the page ran when it reloaded, so a page that still runs it never reloads again. */
export function claimReload(store: () => Pick<Storage, 'getItem' | 'setItem'> | null, build: string): boolean {
  try {
    const kept = store();
    if (!kept || kept.getItem('ab-alone-auto-reload') === build) return false;
    kept.setItem('ab-alone-auto-reload', build);
    return true;
  } catch {
    return false;
  }
}
