// The Open world's New world control (#1021, docs/specs/openworld.md): a button in the HUD asks for a confirmation in the page,
// never a browser dialog, before the save of the world is discarded and a random world starts. The URL takes the new seed, so a
// reload enters that world, and the seed is shown by the HUD (openworldmode.ts).

/** Binds the HUD's New world control of `root`: its confirmation stays hidden until the button is pressed. `start` discards the
 * world left and gives the seed of the new one for the window size it is given. */
export function bindNewWorld(root: Document, start: (width: number, height: number) => Promise<number>): void {
  const button = root.getElementById('openworld-new') as HTMLButtonElement;
  const confirm = root.getElementById('openworld-confirm') as HTMLElement;
  const keep = root.getElementById('openworld-keep') as HTMLButtonElement;
  const discard = root.getElementById('openworld-discard') as HTMLButtonElement;
  const live = root.getElementById('openworld-live') as HTMLElement; // the new seed, read once (#1038)
  const hide = (): void => {
    confirm.hidden = true;
    button.hidden = false;
  };
  button.addEventListener('click', () => {
    confirm.hidden = false;
    button.hidden = true;
    keep.focus(); // the choice that keeps the world has the focus
  });
  keep.addEventListener('click', () => {
    hide();
    button.focus();
  });
  discard.addEventListener('click', () => {
    hide();
    button.focus();
    void start(innerWidth, innerHeight).then((seed) => {
      const url = new URL(location.href);
      url.searchParams.set('openworld', String(seed));
      history.replaceState(history.state, '', url);
      live.textContent = `New world, seed ${seed}`;
    });
  });
  // The mode left (Escape, or the menu) removes its seed from the body: a confirmation still open is closed then, so it does
  // not wait for the next entry. A roll marks the body again and keeps it open.
  new MutationObserver(() => {
    if (!root.body.dataset.openworld) hide();
  }).observe(root.body, { attributes: true, attributeFilter: ['data-openworld'] });
}
