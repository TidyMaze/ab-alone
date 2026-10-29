// Scene light values (docs/specs/world.md section 5). Data only: main.ts builds the three.js lights from them.
import type { Deck } from './deck';

export interface DeckLight {
  /** The fill's colour and power: a weaker spotlight on the south gantry (#864). */
  fill: { color: number; intensity: number };
  /** The key's colour and power: a spotlight on the north gantry (#864), its place is the gantry's. */
  key: { color: number; intensity: number };
  exposure: number;
  /** Fog density: 1 is the Mess haze, 2 is twice as thick (quality.ts fogSettings). */
  fog: number;
}

// One low-key preset per deck (world.md sections 1 and 5): one hard key over a weaker fill. Each keeps both
// marbles and the cell edges at 3:1 on the deck (e2e/contrast.spec.ts).
export const DECKS: Record<Deck, DeckLight> = {
  // A warm sodium lamp overhead, a light haze (#290).
  mess: { fill: { color: 0xffffff, intensity: 1.5 }, key: { color: 0xd9822b, intensity: 6 }, exposure: 1, fog: 1 },
  // Cold work lights high above the ore bays, a medium haze.
  cargo: { fill: { color: 0xc8d4dc, intensity: 1 }, key: { color: 0x94aec4, intensity: 4 }, exposure: 1, fog: 1.3 },
  // The orange glow of the smelters, steam.
  furnace: { fill: { color: 0xffd8b0, intensity: 1.6 }, key: { color: 0xe0672a, intensity: 6.5 }, exposure: 1, fog: 1.5 },
  // Candlelight, dim and yellow, candle smoke.
  chapel: { fill: { color: 0xffe8c8, intensity: 1.1 }, key: { color: 0xe3b25e, intensity: 4.5 }, exposure: 1, fog: 1.3 },
  // Cold white, clean, almost no fog.
  bridge: { fill: { color: 0xf0f2f4, intensity: 0.8 }, key: { color: 0xeef1f4, intensity: 3 }, exposure: 0.9, fog: 0.3 },
};

// Shared by every deck.
export const LIGHT = {
  // The key's contact shadows (#459), the same on every deck: the key's colour and intensity are the deck's.
  key: {
    shadow: {
      mapSize: 1024,
      camera: { near: 1, far: 25 },
      bias: -0.0005,
      normalBias: 0.02,
    },
  },
  // The key and the fill are spotlights on the gantries (#864), aimed at the board's centre. A cone holds the board (radius
  // 5 with its rim, seen from 15 m up) and fades at its edge. Their decay and distance are 0: no falloff, so a power reads
  // as the directional key's did.
  spots: {
    key: { angle: 0.45, penumbra: 0.5 },
    fill: { angle: 0.55, penumbra: 0.8 },
  },
  // Reflections (#376, #864): the bay as the marbles' envMap only, low so the key stays the base.
  environment: { intensity: 0.25 },
};

// The background decor (#376, #432): a dim bulkhead behind the board, darker than the board's steel so it never competes.
export const DECOR = { color: 0x242c33 };
