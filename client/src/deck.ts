// The deck each mode and boss plays on (docs/specs/world.md sections 1, 3 and 5). Data only: main.ts sets the deck's
// light and fog (light.ts) when a mode starts. The deck never changes the rules or the cell size.
export const DECK_NAMES = ['mess', 'cargo', 'furnace', 'chapel', 'bridge'] as const;
export type Deck = (typeof DECK_NAMES)[number];
export type Mode = 'local' | 'bot' | 'online' | 'boss' | 'royale';

export interface DeckParticles {
  kind: 'dust' | 'ore' | 'steam' | 'smoke' | 'none';
  count: number;
  drift: [number, number, number];
  color: number;
  size: number;
  opacity: number;
}

export const DECK_PARTICLES: Record<Deck, DeckParticles> = {
  mess: { kind: 'dust', count: 144, drift: [0.03, 0.015, 0.01], color: 0xc8bea8, size: 0.07, opacity: 0.35 },
  cargo: { kind: 'ore', count: 192, drift: [-0.03, -0.04, 0.02], color: 0x9e7c5b, size: 0.08, opacity: 0.4 },
  furnace: { kind: 'steam', count: 240, drift: [0.02, 0.12, -0.02], color: 0xe08438, size: 0.14, opacity: 0.32 },
  chapel: { kind: 'smoke', count: 150, drift: [-0.02, 0.07, 0.01], color: 0xd4cebf, size: 0.11, opacity: 0.28 },
  bridge: { kind: 'none', count: 0, drift: [0, 0, 0], color: 0xffffff, size: 0, opacity: 0 },
};

const MODE_DECK: Record<Exclude<Mode, 'boss'>, Deck> = { local: 'mess', bot: 'mess', online: 'cargo', royale: 'furnace' };
// One boss per deck (world.md section 3), and the extra bosses: The Alien and The Rail Yard in the Cargo hold too
// (game-design.md sections 7.7 and 7.8), The Magnetizer in the Furnace, by its magnet cranes (section 7.9), The Pulsar
// on the Bridge, by the ship mind's navigation beacons (section 7.10), The Overseer in the Chapel, its test chamber
// (section 7.11), and The Assembly Line in the Cargo hold again, by its conveyor belts (section 7.12). A daily is a
// fight against one of them, so it plays on that boss's deck.
const BOSS_DECK: Record<string, Deck> = {
  echo: 'mess',
  hull: 'cargo',
  choir: 'furnace',
  chaplain: 'chapel',
  ballast: 'bridge',
  alien: 'cargo',
  railyard: 'cargo',
  magnetizer: 'furnace',
  pulsar: 'bridge',
  overseer: 'chapel',
  assembly: 'cargo',
  core: 'furnace',
};

/** The deck of a mode, or of a boss fight: the Mess for a boss the client does not know. */
export function deckOf(mode: Mode, boss?: string): Deck {
  return mode === 'boss' ? (BOSS_DECK[boss ?? ''] ?? 'mess') : MODE_DECK[mode];
}
