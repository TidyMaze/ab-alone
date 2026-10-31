import { describe, expect, it, vi } from 'vitest';
import { skinKinds, startOnce } from './skinmaps';

// Bug #925: a skin's maps start with the first wave, so the same map is asked for once and every later ask gets its request.
describe('startOnce', () => {
  it('starts a key once and hands the same request to every later ask', () => {
    const started = new Map<string, object>();
    const start = vi.fn(() => ({ request: true }));
    const first = startOnce(started, 'pbr/skin-Leather027-albedo.ktx2', start);
    const again = startOnce(started, 'pbr/skin-Leather027-albedo.ktx2', start);
    expect(again).toBe(first);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('starts each key on its own', () => {
    const started = new Map<string, string>();
    expect(startOnce(started, 'a', () => 'A')).toBe('A');
    expect(startOnce(started, 'b', () => 'B')).toBe('B');
    expect(started.size).toBe(2);
  });
});

describe('skinKinds', () => {
  it('dresses every skin in its albedo, normal and roughness maps', () => {
    expect(skinKinds([])).toEqual(['albedo', 'normal', 'roughness']);
  });

  it('adds the extra maps the asset ships, in their order', () => {
    expect(skinKinds(['metalness', 'ao', 'emission'])).toEqual(['albedo', 'normal', 'roughness', 'metalness', 'ao', 'emission']);
  });
});
