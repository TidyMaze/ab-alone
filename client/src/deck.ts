// The deck each mode and boss plays on (docs/specs/world.md sections 1, 3 and 5). Data only: main.ts sets the deck's
// light and fog (light.ts) when a mode starts. The deck never changes the rules or the cell size.
export const DECK_NAMES = ['mess', 'cargo', 'furnace', 'chapel', 'bridge'] as const;
export type Deck = (typeof DECK_NAMES)[number];
export type Mode = 'local' | 'bot' | 'online' | 'boss';

const MODE_DECK: Record<Exclude<Mode, 'boss'>, Deck> = { local: 'mess', bot: 'mess', online: 'cargo' };
// One boss per deck (world.md section 3). A daily is a fight against one of them, so it plays on that boss's deck.
const BOSS_DECK: Record<string, Deck> = { echo: 'mess', hull: 'cargo', choir: 'furnace', chaplain: 'chapel', ballast: 'bridge' };

/** The deck of a mode, or of a boss fight: the Mess for a boss the client does not know. */
export function deckOf(mode: Mode, boss?: string): Deck {
  return mode === 'boss' ? (BOSS_DECK[boss ?? ''] ?? 'mess') : MODE_DECK[mode];
}
