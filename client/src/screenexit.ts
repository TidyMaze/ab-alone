/**
 * The exit of a screen (#1562, docs/specs/motion.md story 12): when the screen changes (the table, the Hub, a mode, an online room) a dim over
 * the new screen starts opaque and lifts in about 120 ms (`--motion-fast`), next to the fade the Open world canvas already plays. The new screen
 * is live and takes every press from its first frame: the layer is a CSS animation on opacity, takes no press, and nothing waits for it. It is
 * not the old scene leaving (that would need the canvas read back or the old scene kept alive); it is the change of place read as one dip. Under
 * reduced motion it stays still, and it gives way to the transition of a place (`placetransition.ts`), which has its own.
 */

/** The length of the exit; `--motion-fast` in ui.css says the same. */
export const EXIT_MS = 120;

export class ScreenExit {
  private seen: string | null = null;
  private readonly layer = document.createElement('div');

  /** Makes the layer, clear and still, once at boot: a layer made at the first change would be a leftover of the mode for the leak checks (#1275). */
  constructor(private readonly reduced: () => boolean) {
    this.layer.id = 'screen-exit';
    this.layer.setAttribute('aria-hidden', 'true');
    document.body.append(this.layer);
  }

  /** Called once a frame with the screen shown: a change plays the exit. */
  sync(screen: string): void {
    const before = this.seen;
    this.seen = screen;
    if (before === null || before === screen || this.reduced() || document.body.dataset.placeTransition !== undefined) return;
    this.layer.dataset.flip = this.layer.dataset.flip === 'a' ? 'b' : 'a'; // the other keyframes restart the animation
  }
}
