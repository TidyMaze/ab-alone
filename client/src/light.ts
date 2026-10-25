// Scene light values (docs/specs/world.md section 5). Data only: main.ts builds the three.js lights from them.
export const LIGHT = {
  ambient: { color: 0xffffff, intensity: 0.25 },
  key: { color: 0xd9822b, intensity: 6, position: [-4, 10, 5] as const },
  exposure: 1,
  // Reflections (#376): the prefiltered room (RoomEnvironment) on the marbles, low so the key stays the base.
  environment: { intensity: 0.2 },
  // Accents (#376): a cold rim from behind, a small warm point at the lamp's side. Each is weaker than the key.
  accents: {
    rim: { color: 0x7fd6e8, intensity: 1.5, position: [5, 6, -6] as const },
    warm: { color: 0xd9822b, intensity: 1.2, distance: 9, position: [-3, 2.5, 4] as const },
  },
};

// The background decor (#376): a dim bulkhead behind the board, darker than the board's steel so it never competes.
export const DECOR = { color: 0x1d2328 };
