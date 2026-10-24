// Scene light values (docs/specs/world.md section 5). Data only: main.ts builds the three.js lights from them.
export const LIGHT = {
  ambient: { color: 0xffffff, intensity: 0.25 },
  key: { color: 0xd9822b, intensity: 6, position: [-4, 10, 5] as const },
  exposure: 1,
};
