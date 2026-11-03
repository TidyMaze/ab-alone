import { afterEach, describe, expect, it, vi } from 'vitest';

const load = async (mode: string, flag = '') => {
  vi.resetModules();
  vi.stubEnv('MODE', mode);
  vi.stubEnv('VITE_TEST_HOOKS', flag);
  return import('./hooks');
};
afterEach(() => vi.unstubAllEnvs());

describe('test hooks', () => {
  it('hang on the window in a test build and honour ?net=hook', async () => {
    const h = await load('test');
    expect(h.testHooks).toBe(true);
    expect(h.hookHost).toBe(globalThis);
    expect(h.netHook('?net=hook')).toBe(true);
    expect(h.netHook('?net=x')).toBe(false);
  });
  it('are off in the production build: nothing reaches the window, ?net=hook is ignored', async () => {
    const h = await load('production');
    expect(h.testHooks).toBe(false);
    h.hookHost.__royale = () => 1;
    expect((globalThis as Record<string, unknown>).__royale).toBeUndefined();
    expect(h.netHook('?net=hook')).toBe(false);
  });
  it('come back in production with VITE_TEST_HOOKS=1 (the offline spec)', async () => {
    expect((await load('production', '1')).testHooks).toBe(true);
  });
});
