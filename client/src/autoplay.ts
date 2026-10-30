// Auto-play (#792, docs/specs/ui.md section 4.3): a toggle in the fight HUD lets the bot play the player's side. This is
// the rule of when the toggle is shown and when it is greyed; main.ts holds the loop.

/** The pause before each auto-played move, so the player can follow the game and stop it. */
export const AUTO_DELAY_MS = 700;

export interface AutoMode {
  /** A versus room, a co-op fight or an online battle royale: never auto-played. */
  online: boolean;
  /** The name of the boss when the fight is a boss fight, null otherwise. */
  boss: string | null;
  /** A rogue-lite run's fight (#798): the run is the player's own army, never auto-played. */
  run?: boolean;
  /** A Stalker game (#998): the bot sees the hidden marbles, it would play the player's side knowing them. */
  stalker?: boolean;
}

/** Not shown, or shown with `reason` when it is greyed. */
export type AutoState = { shown: false } | { shown: true; reason: string | null };

/** The state of the toggle: hidden online, greyed in a rogue-lite run, in a Stalker game and against a boss whose medal (#791) the player has
 * not earned yet. */
export function autoPlayState(mode: AutoMode, medal: boolean): AutoState {
  if (mode.online) return { shown: false };
  if (mode.run) return { shown: true, reason: 'Not in a rogue-lite run' };
  if (mode.stalker) return { shown: true, reason: 'Not in a Stalker game' };
  if (mode.boss !== null && !medal) return { shown: true, reason: `Beat ${mode.boss} once to unlock Auto-play against it` };
  return { shown: true, reason: null };
}
