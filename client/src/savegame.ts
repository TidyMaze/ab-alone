// The saved local game, see docs/specs/tech.md section 8. A game is its ruleset plus its move list:
// on load the engine replays the moves and stays the only judge. Online and boss games are not saved.

import { MOVE_STRIDE } from './board';

/** Version of the save format: a save of any other version is dropped. */
export const SAVE_VERSION = 1;
/** Key of the local game in the store. */
export const LOCAL_GAME = 'local';

/** A local game: against the bot (`bot` true) or hot-seat, and the move records played so far. */
export interface LocalGame {
  bot: boolean;
  moves: number[][];
}

/** The stored form, also the export file of #219. */
export interface SavedGame {
  version: typeof SAVE_VERSION;
  mode: 'local';
  layout: 'standard';
  bot: boolean;
  moves: number[][];
}

export function encodeGame({ bot, moves }: LocalGame): SavedGame {
  return { version: SAVE_VERSION, mode: 'local', layout: 'standard', bot, moves: moves.map((mv) => [...mv]) };
}

/** A move record of the bridge: `MOVE_STRIDE` 32-bit integers. The engine judges the rest. */
const isRecord = (mv: unknown): mv is number[] =>
  Array.isArray(mv) && mv.length === MOVE_STRIDE && mv.every((v) => typeof v === 'number' && v === (v | 0));

/** The local game in `raw`, or null when it is not a save of this version. */
export function decodeGame(raw: unknown): LocalGame | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const save = raw as Record<keyof SavedGame, unknown>;
  if (save.version !== SAVE_VERSION || save.mode !== 'local' || save.layout !== 'standard') return null;
  if (typeof save.bot !== 'boolean' || !Array.isArray(save.moves) || !save.moves.every(isRecord)) return null;
  return { bot: save.bot, moves: save.moves.map((mv) => [...mv]) };
}

export interface ReplayEngine {
  play(mv: Int32Array): void; // throws on a move the engine refuses
  status(): number; // 0 while the game runs
}

/** A new engine after `moves`, or null when the engine refuses one of them. The game may be over. */
export function replayMoves<E extends ReplayEngine>(moves: number[][], make: () => E): E | null {
  const engine = make();
  try {
    for (const mv of moves) engine.play(Int32Array.from(mv));
  } catch {
    return null;
  }
  return engine;
}

/** A new engine after `moves`, or null when the engine refuses one of them or the game is over. */
export function replay<E extends ReplayEngine>(moves: number[][], make: () => E): E | null {
  const engine = replayMoves(moves, make);
  return engine?.status() === 0 ? engine : null;
}

/** A small async key-value store: IndexedDB in the browser (idb.ts), memory in the unit tests. */
export interface KeyStore {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

/** A store in memory that keeps copies, like IndexedDB does. */
export function memoryStore(): KeyStore & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    get: async (key) => structuredClone(data.get(key)),
    put: async (key, value) => void data.set(key, structuredClone(value)),
    delete: async (key) => void data.delete(key),
  };
}

/** The part of `navigator.storage` used here, missing in some browsers. */
export interface PersistApi {
  persisted?(): Promise<boolean>;
  persist?(): Promise<boolean>;
}

/** Asks the browser not to clear the save under storage pressure. True when storage is persistent. */
export async function askPersist(storage: PersistApi | undefined): Promise<boolean> {
  try {
    if (await storage?.persisted?.()) return true;
    return (await storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/** The saved local game: written after every move, deleted once the game is over, replayed on load.
 * A storage error loses the save, never the game: it just does not survive the next reload. */
export class LocalSaves {
  private asked = false;
  private mine = false; // the save holds the game of this page: resumed or saved here

  constructor(
    private readonly store: KeyStore,
    private readonly storage?: PersistApi,
  ) {}

  /** The saved game of this mode (bot on or off), or of either mode when `bot` is undefined, replayed, with its mode.
   * A save that does not decode or replay is deleted, never shown half-done. A save of the other mode is left alone. */
  async load<E extends ReplayEngine>(
    bot: boolean | undefined,
    make: () => E,
  ): Promise<{ engine: E; moves: number[][]; bot: boolean } | null> {
    try {
      const raw = await this.store.get(LOCAL_GAME);
      if (raw === undefined) return null;
      const game = decodeGame(raw);
      if (game && bot !== undefined && game.bot !== bot) return null;
      const engine = game && replay(game.moves, make);
      this.mine = engine !== null;
      if (engine) return { engine, moves: game.moves, bot: game.bot };
      await this.store.delete(LOCAL_GAME);
    } catch {
      // Storage blocked: a new game.
    }
    return null;
  }

  /** Saves `game` after a move, or deletes the save once the game is `over`. Persistent storage is asked
   * for once, at the first save; a refusal changes nothing. */
  async save(game: LocalGame, over: boolean): Promise<void> {
    const value = encodeGame(game); // copied now: the caller's move list goes on growing
    this.mine = true;
    if (!this.asked) {
      this.asked = true;
      void askPersist(this.storage);
    }
    try {
      await (over ? this.store.delete(LOCAL_GAME) : this.store.put(LOCAL_GAME, value));
    } catch {
      // Storage blocked or full: this game does not survive a reload.
    }
  }

  /** Deletes the save of this page's game, for New game (#230): the next load starts a new game. A save this
   * page neither resumed nor wrote, the game of the other mode, is left alone. */
  async clear(): Promise<void> {
    if (!this.mine) return;
    try {
      await this.store.delete(LOCAL_GAME);
    } catch {
      // Storage blocked: nothing more can be done.
    }
  }
}
