import type { Extra } from './skins';

// The loading of the skin maps (#377, #925). Pure helpers, no Three.js: main.ts asks for a skin's maps with the first wave,
// and dresses its material with the same requests when the material is made.

/** Starts the request of `key` the first time it is asked for, and hands the same request to every later ask. */
export function startOnce<T>(started: Map<string, T>, key: string, start: () => T): T {
  if (!started.has(key)) started.set(key, start());
  return started.get(key)!;
}

/** The maps a skin's material is dressed in: albedo, normal and roughness, then the extra maps its asset ships. */
export function skinKinds(extra: readonly Extra[]): readonly ('albedo' | 'normal' | 'roughness' | Extra)[] {
  return ['albedo', 'normal', 'roughness', ...extra];
}
