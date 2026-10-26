// Hub progress (docs/specs/game-design.md section 3.5): where the marble stands and the bosses beaten, saved in
// localStorage as versioned JSON. A save that does not read back (corrupt, another version) starts over from the Mess.
// The lifts read `beaten` through hub.ts canEnter and step. Pure functions only: main.ts gives the storage.
import { DECK_NAMES } from './deck';
import { HUB_CELLS, START, type Spot } from './hub';
import { read, write, type Store } from './quality';

export interface Progress {
  at: Spot;
  beaten: string[]; // boss ids, in the order they were first beaten
}

const KEY = 'ab-alone.progress';
const VERSION = 1;

function parse(text: string): Progress | null {
  try {
    const { version, deck, cell, beaten } = JSON.parse(text) ?? {};
    const onMap = Array.isArray(cell) && cell.length === 2 && HUB_CELLS.some(([q, r]) => q === cell[0] && r === cell[1]);
    const bosses = Array.isArray(beaten) && beaten.every((id) => typeof id === 'string');
    return version === VERSION && DECK_NAMES.includes(deck) && onMap && bosses ? { at: { deck, cell: [cell[0], cell[1]] }, beaten } : null;
  } catch {
    return null;
  }
}

/** The saved progress, or a new one on the centre cell of the Mess with no boss beaten. */
export function loadProgress(store: Store): Progress {
  return parse(read(store, KEY) ?? '') ?? { at: START, beaten: [] };
}

export function saveProgress(store: Store, { at, beaten }: Progress): void {
  write(store, KEY, JSON.stringify({ version: VERSION, deck: at.deck, cell: at.cell, beaten }));
}

/** Adds a beaten boss to the saved progress, once. */
export function recordWin(store: Store, boss: string): void {
  const progress = loadProgress(store);
  if (!progress.beaten.includes(boss)) saveProgress(store, { ...progress, beaten: [...progress.beaten, boss] });
}
