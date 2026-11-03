// Test hooks live in test builds only (dev, vitest, `vite build --mode e2e`, or `VITE_TEST_HOOKS=1` for the offline spec): the
// production build exposes no `window.__*` function and ignores `?net=hook`, so a page opened by a player can be driven by no one.

/** Whether this build carries the test hooks. */
export const testHooks = import.meta.env.MODE !== 'production' || import.meta.env.VITE_TEST_HOOKS === '1';

/** Where main.ts hangs its `__` hooks: the window in a test build, a throwaway object in production. */
export const hookHost: Record<string, unknown> = testHooks ? (globalThis as Record<string, unknown>) : {};

/** `?net=hook`: the e2e transport, honoured in a test build only. */
export const netHook = (search: string): boolean => testHooks && new URLSearchParams(search).get('net') === 'hook';
