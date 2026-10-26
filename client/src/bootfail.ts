// A failed start (#737): the wasm or the renderer cannot come up. Without this the page stays blank. Shows the hidden
// #boot-error box of index.html with the reason, then rethrows so the rest of main.ts does not run on a broken base.
export function bootFailed(err: unknown): never {
  document.getElementById('boot-reason')!.textContent = err instanceof Error ? err.message : String(err);
  document.getElementById('boot-error')!.hidden = false;
  throw err;
}
