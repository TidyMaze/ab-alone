// The exit of the dock (#1517, docs/specs/ui.md section "One door grammar"): one control in the dock's first slot that leaves the mode
// shown, in every mode. Its label names where it leads: the Open world when the player came from it, otherwise the Hub.

/** Where the exit leads, or none: the plain table and the Hub (the home of the game) have no exit, and nor has an online room. */
export type Exit = 'world' | 'hub' | null;

/** What the page shows. `online` is an online room no Hub door started (a door's table keeps its way back to the Hub). `place` is the
 * Hub or the run of a town or a gate (not a table played from it). `mode` is any mode with its own screen: a fight, a run, the Trainer,
 * a battle royale, a table of a Hub door. */
export interface Where {
  online: boolean;
  world: boolean;
  wild: boolean;
  lair: boolean;
  place: boolean;
  mode: boolean;
}

/** The short word the dock shows, and the name a screen reader hears. */
export const EXIT_LABEL = { world: 'World', hub: 'Hub' } as const;
export const EXIT_NAME = { world: 'Back to the Open world', hub: 'Back to the hub' } as const;

/** Where the exit of the screen shown leads. Browser Back goes to the same place (backnav.ts). */
export function exitOf(w: Where): Exit {
  if (w.online) return null; // a room keeps its Lobby and the Hub of the mode menu
  if (w.world) return 'hub';
  if (w.wild || w.lair || w.place) return 'world';
  return w.mode ? 'hub' : null;
}
