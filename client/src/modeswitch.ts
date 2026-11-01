// The clean base of a mode switch (#1275, docs/specs/ui.md section "One mode at a time"): what no mode owns but a mode
// leaves on the page. Every mode's start leaves the mode on (main.ts leaveMode), then clears these: the fight's controls
// and sheets, which only a fight's HUD hides again, and the body data the board's draw writes, which the hub never writes.
// main.modeswitch.test.ts compares each mode, left, with the page after the boot: a new leak fails it.

/** The fight's controls and sheets, and the Overseer's speech bubble: hidden. */
export const STRAY_CONTROLS = ['boss-retry', 'boss-goal', 'goal-sheet', 'boss-bar', 'daily-card', 'bubble'] as const;

/** The body data of the board's draw and its effects (main.ts refresh, afterPlay), read by the e2e tests: dropped. */
export const STRAY_DATA = [
  'announceBlink', 'armies', 'beltCounter', 'beltDirs', 'beltStrikes', 'beltTurns', 'blood', 'bonusSlides', 'boss', 'bridge',
  'burns', 'bursts', 'converted', 'cracks', 'dualRoom', 'echoBonus', 'echoFree', 'echoFreeTarget', 'echoLanded', 'echoSkipped',
  'eggCounters', 'eggs', 'ejecting', 'ejections', 'exploding', 'explosions', 'fired', 'flips', 'ghosts', 'haze', 'hazeY',
  'knock', 'lastMove', 'martyr', 'nextArmy', 'over', 'passing', 'pulseCounter', 'pulses', 'pulsing', 'repulsions', 'returns',
  'ripples', 'shockwaves', 'slams', 'sliding', 'sparks', 'specials', 'sunk', 'swarmMarks', 'trainCounters', 'trains', 'vanished',
] as const;

/** Hides the stray controls of `doc` and drops its stray body data. */
export function clearStray(doc: Document): void {
  for (const id of STRAY_CONTROLS) doc.getElementById(id)!.hidden = true;
  for (const key of STRAY_DATA) delete doc.body.dataset[key];
}
