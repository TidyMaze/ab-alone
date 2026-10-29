// Scene light values (docs/specs/world.md section 5). Data only: scene.ts reads them.
import type { Deck } from './deck';

export interface DeckLight {
  exposure: number;
  /** Fog density: 1 is the Mess haze, 2 is twice as thick (quality.ts fogSettings). */
  fog: number;
}

// One preset per deck (world.md sections 1 and 5): exposure and haze. The room's neon tubes and lamps light the scene.
export const DECKS: Record<Deck, DeckLight> = {
  // A light haze (#290).
  mess: { exposure: 1, fog: 1 },
  // A medium haze.
  cargo: { exposure: 1, fog: 1.3 },
  // Steam.
  furnace: { exposure: 1, fog: 1.5 },
  // Candle smoke.
  chapel: { exposure: 1, fog: 1.3 },
  // Clean, almost no fog.
  bridge: { exposure: 0.9, fog: 0.3 },
};

// Shared by every deck.
export const LIGHT = {
  // Reflections (#376, #864): the bay as the marbles' envMap only, low so the room's lights stay the base.
  environment: { intensity: 0.25 },
};
