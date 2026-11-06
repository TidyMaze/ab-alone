// The code of a mode that loads when the player first enters it (#1578): the build splits it off the entry script with `import()`.
// `lazyChunk` runs the load once. A slow load shows the Loading plate of index.html after PLATE_DELAY_MS, so a first entry on a slow
// connection shows something at once and a fast one flashes nothing. A load that fails (offline, a new deploy that removed the old
// file) shows #chunk-error with Retry and Reload instead of a dead page; the caller waits for the Retry, it never sees the failure.

/** How long a load runs before the Loading plate shows. */
export const PLATE_DELAY_MS = 150;

const byId = (id: string): HTMLElement => document.getElementById(id)!;

/** A function that loads `load` at its first call and gives the same promise afterwards. `name` is the mode, in the message. */
export function lazyChunk<T>(name: string, load: () => Promise<T>): () => Promise<T> {
  let loaded: Promise<T> | null = null;
  const attempt = (resolve: (value: T) => void): void => {
    const plate = byId('loading');
    const error = byId('chunk-error');
    let shown = false;
    const timer = setTimeout(() => {
      if (!plate.hidden) return; // a page that opened in the world has its plate up already (#1520)
      plate.classList.remove('done');
      plate.hidden = false;
      shown = true;
    }, PLATE_DELAY_MS);
    load().then(
      (value) => {
        clearTimeout(timer);
        if (shown) plate.hidden = true;
        error.hidden = true;
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        plate.hidden = true; // the plate would sit over the message
        byId('chunk-name').textContent = name;
        byId('chunk-retry').onclick = () => {
          error.hidden = true;
          attempt(resolve);
        };
        byId('chunk-reload').onclick = () => location.reload();
        error.hidden = false;
      },
    );
  };
  return () => (loaded ??= new Promise<T>(attempt));
}
