// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { boot } from './harness';

// The harness undoes the page when the test ends (#623): a timer the page left pending, a bot reply or the joiner's
// 30 s signaling timeout, would fire in a later test or after the file's environment closed, and log there.
describe('the harness', () => {
  let fired = false;

  it('a page timer is still pending when the test ends', async () => {
    await boot('?bot=off');
    setTimeout(() => (fired = true), 10);
  });

  it('never fires after it', async () => {
    await new Promise((done) => setTimeout(done, 50));
    expect(fired).toBe(false);
  });
});
