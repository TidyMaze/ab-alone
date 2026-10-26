// The lore entries read (#512), saved locally for the log archive of the lore terminals (docs/specs/world.md section 4):
// their ids in one key, joined by commas (an id is lowercase words and dashes, lore.test.ts).
import { read, write, type Store } from './quality';

const KEY = 'ab-alone.lore-read';

/** The ids of the entries read, in the order first read. */
export const readLore = (store: Store): string[] => (read(store, KEY) ?? '').split(',').filter(Boolean);

/** Saves an entry as read; one read before keeps its place. */
export function markRead(store: Store, id: string): void {
  const ids = readLore(store);
  if (!ids.includes(id)) write(store, KEY, [...ids, id].join(','));
}
