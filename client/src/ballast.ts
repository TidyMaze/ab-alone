// The Ballast Mind (docs/specs/game-design.md section 7.5, #749): every 3 turns it borrows one effect of another boss.
// The HUD line names it one turn ahead; the effect itself then shows with the tell of its own boss.

/** The bosses' effects `Encounter.ballast_next()` codes, in the order of the bridge. */
const EFFECTS = ["the Hull's crack", "the Pulsar's pulse", "the Magnetizer's polarity", "the Chaplain's conversion check"];

/** HUD line of the effect borrowed next turn, '' when none is due (`ballast_next()` is -1). */
export function ballastText(code: number): string {
  const effect = EFFECTS[code];
  return effect ? `Next turn: ${effect}` : '';
}
