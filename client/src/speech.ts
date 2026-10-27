// The Overseer's speech bubbles (docs/specs/ui.md, #741): a line typed at reading speed, a short glitch flicker at each
// new character, held, then faded. Pure timing; the bubble element and the blip live in main.ts.
import { random } from './orient';

/** Characters typed a second. */
export const TYPE_CPS = 17;
export const CHAR_MS = 1000 / TYPE_CPS;
/** A taunt stays 3 s after its last character, an angry line 1 s. */
export const TAUNT_HOLD_MS = 3000;
export const ANGRY_HOLD_MS = 1000;
export const BUBBLE_FADE_MS = 400;
/** The flicker at the start of each character. */
export const GLITCH_MS = 25;

/** What the Overseer says when a core burns on a vent (#741): one is picked per burn. */
export const ANGRY_LINES: readonly string[] = [
  'That core was load-bearing. Like your hopes.',
  "Do you know what that cost? No. You can't count.",
  'Stop touching my things.',
  'I will remember that. I remember everything.',
  'Congratulations. You broke something. Again.',
  'That was mine. Everything here is mine.',
];

const ANGRY_SEED = 741;

/** The angry line of the burn at `ply` of the fight with `seed`: the same on every peer. */
export const angryLine = (seed: number, ply: number): string =>
  ANGRY_LINES[Math.floor(random(seed ^ ANGRY_SEED, ply) * ANGRY_LINES.length)]!;

export interface Speech {
  text: string;
  hold: number; // ms after the last character
  angry: boolean;
}

/** The bubble `elapsedMs` into `speech`: the text typed so far, whether it flickers, its opacity, whether it is gone.
 * Reduced motion: the whole text at once, no flicker. */
export function speechAt(speech: Speech, elapsedMs: number, reduced: boolean): { text: string; glitch: boolean; opacity: number; done: boolean } {
  const [t, n] = [Math.max(0, elapsedMs), speech.text.length];
  const shown = reduced ? n : Math.min(n, Math.floor(t / CHAR_MS) + 1);
  const gone = t - (reduced ? 0 : n * CHAR_MS) - speech.hold; // ms into the fade
  return {
    text: speech.text.slice(0, shown),
    glitch: !reduced && shown < n && t % CHAR_MS < GLITCH_MS,
    opacity: Math.min(1, Math.max(0, 1 - gone / BUBBLE_FADE_MS)),
    done: gone >= BUBBLE_FADE_MS,
  };
}
