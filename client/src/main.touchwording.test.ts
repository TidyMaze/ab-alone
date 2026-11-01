// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { boot } from './test/harness';

// The replay buttons name their key on a keyboard and not on a touch screen (#1379).
const byId = (id: string): HTMLElement => document.getElementById(id)!;

describe('the replay buttons wording', () => {
  it('names Left, Right and Esc with a fine pointer', async () => {
    await boot('?bot=off');
    expect(byId('replay-prev').title).toBe('Previous move (Left)');
    expect(byId('replay-prev').getAttribute('aria-label')).toBe('Previous move (Left)');
    expect(byId('replay-next').title).toBe('Next move (Right)');
    expect(byId('replay-live').title).toBe('Back to the live game (Esc)');
  });

  it('names no key on a touch screen', async () => {
    await boot('?bot=off', { touch: true });
    expect(byId('replay-prev').title).toBe('Previous move');
    expect(byId('replay-prev').getAttribute('aria-label')).toBe('Previous move');
    expect(byId('replay-next').title).toBe('Next move');
    expect(byId('replay-next').getAttribute('aria-label')).toBe('Next move');
    expect(byId('replay-live').title).toBe('Back to the live game');
  });
});
