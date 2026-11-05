// The transition into a wild fight (docs/specs/openworld.md section 3c, #1511): a short flash and a hexagon wipe of the game's own that
// closes over the world, the arena under it, and opens on the arena. About a second in all; a plain fade under reduced motion. The cover
// ignores the pointer and the keys, so nothing waits for it once the arena is there.

/** The wipe closes over the world for this long, in ms, and opens on the arena for as long again: 1 s in all. */
export const WIPE_MS = 500;
/** The fade of reduced motion, each way, in ms. */
export const FADE_MS = 250;

/** Plays the transition on `cover` (a fixed element over the page, hidden at rest): it closes, `switchTo` runs when it is closed (the page
 * swaps the world for the arena there), then it opens and hides again. `reduced` fades instead of flashing and wiping. */
export function wipe(cover: HTMLElement, reduced: boolean, switchTo: () => void): void {
  const half = reduced ? FADE_MS : WIPE_MS;
  cover.dataset.motion = reduced ? 'reduced' : 'full';
  cover.dataset.phase = 'closing';
  cover.hidden = false;
  setTimeout(() => {
    switchTo();
    cover.dataset.phase = 'opening';
    setTimeout(() => {
      cover.hidden = true;
      delete cover.dataset.phase;
    }, half);
  }, half);
}
