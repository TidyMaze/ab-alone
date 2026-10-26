// The lore entries read (#512) and the audio logs collected (#517), saved locally for the log archive of the lore
// terminals (docs/specs/world.md section 4): each list in one key, its ids joined by commas (an id is lowercase words
// and dashes, lore.test.ts, audiologs.test.ts).
import { read, write, type Store } from './quality';

const READ = 'ab-alone.lore-read';
const COLLECTED = 'ab-alone.logs-collected';

const ids = (store: Store, key: string): string[] => (read(store, key) ?? '').split(',').filter(Boolean);
function add(store: Store, key: string, id: string): void {
  const saved = ids(store, key);
  if (!saved.includes(id)) write(store, key, [...saved, id].join(','));
}

/** The ids of the entries read, in the order first read. */
export const readLore = (store: Store): string[] => ids(store, READ);

/** Saves an entry as read; one read before keeps its place. */
export const markRead = (store: Store, id: string): void => add(store, READ, id);

/** The ids of the audio logs collected, in the order first collected. */
export const collectedLogs = (store: Store): string[] => ids(store, COLLECTED);

/** Saves an audio log as collected; one collected before keeps its place. */
export const markCollected = (store: Store, id: string): void => add(store, COLLECTED, id);
