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
  mess: { kind: 'dust', count: 48, drift: [0.03, 0.015, 0.01], color: 0xc8bea8, size: 0.07, opacity: 0.35 },
  cargo: { kind: 'ore', count: 64, drift: [-0.03, -0.04, 0.02], color: 0x9e7c5b, size: 0.08, opacity: 0.4 },
  furnace: { kind: 'steam', count: 80, drift: [0.02, 0.12, -0.02], color: 0xe08438, size: 0.14, opacity: 0.32 },
  chapel: { kind: 'smoke', count: 50, drift: [-0.02, 0.07, 0.01], color: 0xd4cebf, size: 0.11, opacity: 0.28 },
  bridge: { kind: 'none', count: 0, drift: [0, 0, 0], color: 0xffffff, size: 0, opacity: 0 },
};

const MODE_DECK: Record<Exclude<Mode, 'boss'>, Deck> = { local: 'mess', bot: 'mess', online: 'cargo', royale: 'furnace' };
// One boss per deck (world.md section 3), and The Alien, an extra boss, in the Cargo hold too (game-design.md
// section 7.7). A daily is a fight against one of them, so it plays on that boss's deck.
const BOSS_DECK: Record<string, Deck> = {
  echo: 'mess',
  hull: 'cargo',
  choir: 'furnace',
  chaplain: 'chapel',
  ballast: 'bridge',
  alien: 'cargo',
};

/** The deck of a mode, or of a boss fight: the Mess for a boss the client does not know. */
export function deckOf(mode: Mode, boss?: string): Deck {
  return mode === 'boss' ? (BOSS_DECK[boss ?? ''] ?? 'mess') : MODE_DECK[mode];
}
