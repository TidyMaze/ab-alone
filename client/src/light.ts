// Scene light values (docs/specs/world.md section 5). Data only: main.ts builds the three.js lights from them.
import type { Deck } from './deck';

export interface DeckLight {
  ambient: { color: number; intensity: number };
  key: { color: number; intensity: number; position: readonly [number, number, number] };
  exposure: number;
  /** Fog density: 1 is the Mess haze, 2 is twice as thick (quality.ts fogSettings). */
  fog: number;
}

// One low-key preset per deck (world.md sections 1 and 5): one hard key over a low ambient fill. Each keeps both
// marbles and the cell edges at 3:1 on the deck (e2e/contrast.spec.ts).
export const DECKS: Record<Deck, DeckLight> = {
  // A warm sodium lamp overhead, a light haze (#290).
  mess: { ambient: { color: 0xffffff, intensity: 0.25 }, key: { color: 0xd9822b, intensity: 6, position: [-4, 10, 5] }, exposure: 1, fog: 1 },
  // Cold work lights high above the ore bays, a medium haze.
  cargo: { ambient: { color: 0xc8d4dc, intensity: 0.2 }, key: { color: 0x94aec4, intensity: 4, position: [3, 12, 4] }, exposure: 1, fog: 1.3 },
  // The orange glow of the smelters from low at one side, steam.
  furnace: { ambient: { color: 0xffd8b0, intensity: 0.2 }, key: { color: 0xe0672a, intensity: 6.5, position: [-6, 8, 4] }, exposure: 1, fog: 1.5 },
  // Candlelight, dim and yellow, close over the board, candle smoke.
  chapel: { ambient: { color: 0xffe8c8, intensity: 0.2 }, key: { color: 0xe3b25e, intensity: 4.5, position: [2, 7, 5] }, exposure: 1, fog: 1.3 },
  // Cold white from straight above, clean, almost no fog.
  bridge: { ambient: { color: 0xf0f2f4, intensity: 0.25 }, key: { color: 0xeef1f4, intensity: 3, position: [0, 12, 2] }, exposure: 0.9, fog: 0.3 },
};

// Shared by every deck.
export const LIGHT = {
  // The key's contact shadows (#459), the same on every deck: the key's colour, intensity and place are the deck's.
  key: {
    shadow: {
      mapSize: 1024,
      camera: { near: 1, far: 25, bounds: 7 },
      bias: -0.0005,
      normalBias: 0.02,
    },
  },
  // Reflections (#376): the prefiltered room (RoomEnvironment) as the marbles' envMap only, low so the key stays the base.
  environment: { intensity: 0.25 },
  // Accents (#376): a cold rim from behind, a small warm point at the lamp's side. Each is weaker than the key.
  accents: {
    rim: { color: 0x7fd6e8, intensity: 1.5, position: [5, 6, -6] as const },
    warm: { color: 0xd9822b, intensity: 1.2, distance: 9, position: [-3, 2.5, 4] as const },
  },
};

// The background decor (#376, #432): a dim bulkhead behind the board, darker than the board's steel so it never competes.
export const DECOR = { color: 0x242c33 };
