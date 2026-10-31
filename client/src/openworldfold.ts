// The Open world HUD plate folds up (#1138): it tells the controls and the seed at the entry, then gets out of the way once the player
// has walked a few cells, or a few seconds have passed, and leaves a small chip in its corner that opens it again. The mode is not
// touched: the fold reads the body's `data-openworld` (the world entered, its seed) and `data-openworld-at` (the hero's cell, which
// changes at each step), the same attributes the browser checks read. The fold itself is a CSS transition on `data-folded`, which the
// motion tokens (and Reduced motion, which sets them to 0 ms) already tell.

/** The steps after which the plate folds, and the time from the entry after which it folds if none was taken, in ms. */
export const HUD_FOLD_STEPS = 3;
export const HUD_FOLD_MS = 8000;

/** Whether the plate folds, after `steps` steps taken and `elapsed` ms from the entry: whichever limit comes first. */
export const shouldFold = (steps: number, elapsed: number): boolean => steps >= HUD_FOLD_STEPS || elapsed >= HUD_FOLD_MS;

/** Binds the plate (`#openworld-hud`) and its chip (`#openworld-chip`) of `root`: the plate is shown at each entry, folds by
 * `shouldFold`, and the chip shows it again until the next `HUD_FOLD_STEPS` steps (no clock on a plate the player asked for). */
export function bindHudFold(root: Document): void {
  const hud = root.getElementById('openworld-hud') as HTMLElement;
  const chip = root.getElementById('openworld-chip') as HTMLButtonElement;
  const { body } = root;
  let steps = 0;
  let clock: ReturnType<typeof setTimeout> | undefined;

  const show = (open: boolean): void => {
    if (open) delete hud.dataset.folded;
    else hud.dataset.folded = '1';
    chip.hidden = open;
    chip.setAttribute('aria-expanded', String(open));
  };
  const reset = (): void => {
    clearTimeout(clock);
    clock = undefined;
    steps = 0;
    show(true);
    chip.hidden = true; // out of a world there is no chip
  };
  const begin = (): void => {
    reset();
    clock = setTimeout(() => show(false), HUD_FOLD_MS);
  };

  chip.addEventListener('click', () => {
    clearTimeout(clock); // no clock on a plate the player asked for
    steps = 0;
    show(true);
  });
  new MutationObserver((records) => {
    for (const { attributeName, oldValue } of records) {
      const now = body.getAttribute(attributeName!);
      if (attributeName === 'data-openworld') {
        if (now === null) reset();
        else if (now !== oldValue) begin(); // another seed, or the first entry; a mark of the same seed changes nothing
      } else if (now !== null && oldValue !== null && now !== oldValue && !hud.dataset.folded && shouldFold(++steps, 0)) {
        show(false);
      }
    }
  }).observe(body, { attributes: true, attributeFilter: ['data-openworld', 'data-openworld-at'], attributeOldValue: true });
}
