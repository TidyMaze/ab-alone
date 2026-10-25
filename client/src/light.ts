// Scene light values (docs/specs/world.md section 5). Data only: main.ts builds the three.js lights from them.
export const LIGHT = {
  ambient: { color: 0xffffff, intensity: 0.25 },
  key: {
    color: 0xd9822b,
    intensity: 6,
    position: [-4, 10, 5] as const,
    // Contact shadows (#459): soft shadows cast onto the board, cells and frame.
    shadow: {
      mapSize: 1024,
      camera: { near: 1, far: 25, bounds: 7 },
      bias: -0.0005,
      normalBias: 0.02,
    },
  },
  exposure: 1,
  // Reflections (#376): the prefiltered room (RoomEnvironment) as the marbles' envMap only, low so the key stays the base.
  // glass: the smoked glass is dark, so its reflection lifts it toward the deck; kept low for the 3:1 of #344.
  environment: { intensity: 0.25, glass: 0.1 },
  // Accents (#376): a cold rim from behind, a small warm point at the lamp's side. Each is weaker than the key.
  accents: {
    rim: { color: 0x7fd6e8, intensity: 1.5, position: [5, 6, -6] as const },
    warm: { color: 0xd9822b, intensity: 1.2, distance: 9, position: [-3, 2.5, 4] as const },
  },
};

// The background decor (#376, #432): a dim bulkhead behind the board, darker than the board's steel so it never competes.
export const DECOR = { color: 0x242c33 };
