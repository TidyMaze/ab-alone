import { describe, expect, it } from 'vitest';
import {
  askPersist,
  decodeGame,
  encodeGame,
  LOCAL_GAME,
  LocalSaves,
  memoryStore,
  replay,
  SAVE_VERSION,
  type KeyStore,
  type ReplayEngine,
} from './savegame';

const A = [1, 4, 0, 2, 0, 0, 0, 0]; // Black (0, 2) to its NW neighbour
const B = [1, 5, 0, -2, 0, 0, 0, 0]; // White (0, -2) to its SE neighbour
const C = [1, 4, 0, 1, 0, 0, 0, 0]; // Black (0, 1) to its NW neighbour

/** Engine that records what it plays, refuses its `failOn`th move and reports `status` once done. */
function fake({ failOn = -1, status = 0 } = {}) {
  const engines: Array<ReplayEngine & { played: number[][] }> = [];
  const make = () => {
    const played: number[][] = [];
    const engine = {
      played,
      play(mv: Int32Array) {
        if (played.length === failOn) throw 'Move(Illegal)'; // the wasm bridge throws the reason
        played.push(Array.from(mv));
      },
      status: () => status,
    };
    engines.push(engine);
    return engine;
  };
  return { make, engines };
}

const failing = (): KeyStore => ({
  get: () => Promise.reject(new Error('blocked')),
  put: () => Promise.reject(new Error('quota')),
  delete: () => Promise.reject(new Error('blocked')),
});

describe('encodeGame', () => {
  it('writes the versioned format: mode, layout, bot on or off and the move list', () => {
    expect(SAVE_VERSION).toBe(1);
    expect(encodeGame({ bot: true, moves: [A, B] })).toEqual({
      version: 1,
      mode: 'local',
      layout: 'standard',
      bot: true,
      moves: [A, B],
    });
    expect(encodeGame({ bot: false, moves: [] })).toEqual({
      version: 1,
      mode: 'local',
      layout: 'standard',
      bot: false,
      moves: [],
    });
  });

  it('copies the move list, so later moves never change a save already made', () => {
    const moves = [[...A]];
    const saved = encodeGame({ bot: false, moves });
    moves.push(B);
    moves[0]![0] = 3;
    expect(saved.moves).toEqual([A]);
  });
});

describe('decodeGame', () => {
  const good = encodeGame({ bot: false, moves: [A, B, C] });

  it('reads back what encodeGame wrote, through JSON too (the export file of #219)', () => {
    expect(decodeGame(good)).toEqual({ bot: false, moves: [A, B, C] });
    expect(decodeGame(JSON.parse(JSON.stringify(good)))).toEqual({ bot: false, moves: [A, B, C] });
    expect(decodeGame(encodeGame({ bot: true, moves: [] }))).toEqual({ bot: true, moves: [] });
  });

  it('copies the move list it returns', () => {
    const raw = encodeGame({ bot: false, moves: [A] });
    const game = decodeGame(raw)!;
    game.moves[0]![0] = 3;
    expect(raw.moves).toEqual([A]);
  });

  it('refuses anything that is not a save object', () => {
    for (const raw of [undefined, null, 1, 'save', true, [A]]) expect(decodeGame(raw)).toBeNull();
  });

  it('refuses an unknown version', () => {
    for (const version of [undefined, 0, 2, '1']) expect(decodeGame({ ...good, version })).toBeNull();
  });

  it('refuses a game that is not a local game on the standard layout', () => {
    expect(decodeGame({ ...good, mode: 'online' })).toBeNull();
    expect(decodeGame({ ...good, mode: undefined })).toBeNull();
    expect(decodeGame({ ...good, layout: 'belgian-daisy' })).toBeNull();
    expect(decodeGame({ ...good, layout: undefined })).toBeNull();
  });

  it('refuses a bot flag that is not a boolean', () => {
    for (const bot of [undefined, 1, 'off']) expect(decodeGame({ ...good, bot })).toBeNull();
  });

  it('refuses a move list that is not a list of move records', () => {
    expect(decodeGame({ ...good, moves: undefined })).toBeNull();
    expect(decodeGame({ ...good, moves: 'A B' })).toBeNull();
    expect(decodeGame({ ...good, moves: [A, 'B'] })).toBeNull();
    expect(decodeGame({ ...good, moves: [A, [1, 4, 0, 2]] })).toBeNull(); // a record is 8 integers
    expect(decodeGame({ ...good, moves: [[...A, 0]] })).toBeNull();
    expect(decodeGame({ ...good, moves: [[1, 4.5, 0, 2, 0, 0, 0, 0]] })).toBeNull();
    expect(decodeGame({ ...good, moves: [[1, '4', 0, 2, 0, 0, 0, 0]] })).toBeNull();
    expect(decodeGame({ ...good, moves: [[1, 4, 2 ** 31, 2, 0, 0, 0, 0]] })).toBeNull(); // not an int32
    expect(decodeGame({ ...good, moves: [[1, 4, NaN, 2, 0, 0, 0, 0]] })).toBeNull();
  });
});

describe('replay', () => {
  it('plays every move on a new engine and returns it', () => {
    const { make, engines } = fake();
    const engine = replay([A, B, C], make);
    expect(engine).toBe(engines[0]);
    expect(engines[0]!.played).toEqual([A, B, C]);
  });

  it('returns a new engine for an empty move list', () => {
    const { make, engines } = fake();
    expect(replay([], make)).toBe(engines[0]);
  });

  it('gives nothing when the engine refuses a move: the engine is the only judge', () => {
    const { make } = fake({ failOn: 1 });
    expect(replay([A, B, C], make)).toBeNull();
  });

  it('gives nothing for a game that is over', () => {
    for (const status of [1, 2, 3]) expect(replay([A, B], fake({ status }).make)).toBeNull();
  });
});

describe('askPersist', () => {
  it('asks for persistent storage and says what the browser answered', async () => {
    const asked: string[] = [];
    const storage = (granted: boolean) => ({
      persisted: async () => (asked.push('persisted'), false),
      persist: async () => (asked.push('persist'), granted),
    });
    expect(await askPersist(storage(true))).toBe(true);
    expect(await askPersist(storage(false))).toBe(false);
    expect(asked).toEqual(['persisted', 'persist', 'persisted', 'persist']);
  });

  it('does not ask again when storage is already persistent', async () => {
    let asked = 0;
    const storage = { persisted: async () => true, persist: async () => (asked++, true) };
    expect(await askPersist(storage)).toBe(true);
    expect(asked).toBe(0);
  });

  it('is false without the storage API, or when it throws', async () => {
    expect(await askPersist(undefined)).toBe(false);
    expect(await askPersist({})).toBe(false);
    expect(await askPersist({ persisted: async () => false })).toBe(false);
    expect(await askPersist({ persist: async () => true })).toBe(true);
    expect(await askPersist({ persisted: () => Promise.reject(new Error('no')) })).toBe(false);
  });
});

describe('memoryStore', () => {
  it('gets, puts and deletes values by key, as copies like IndexedDB', async () => {
    const store = memoryStore();
    expect(await store.get('k')).toBeUndefined();
    const value = { moves: [A] };
    await store.put('k', value);
    value.moves.push(B);
    const read = (await store.get('k')) as { moves: number[][] };
    expect(read).toEqual({ moves: [A] });
    read.moves.push(C);
    expect(await store.get('k')).toEqual({ moves: [A] });
    await store.delete('k');
    expect(await store.get('k')).toBeUndefined();
    expect(store.data.size).toBe(0);
  });
});

describe('LocalSaves', () => {
  it('saves the game after a move in the versioned format, under one key', async () => {
    const store = memoryStore();
    const saves = new LocalSaves(store);
    await saves.save({ bot: true, moves: [A, B] }, false);
    expect([...store.data.keys()]).toEqual([LOCAL_GAME]);
    expect(store.data.get(LOCAL_GAME)).toEqual(encodeGame({ bot: true, moves: [A, B] }));
  });

  it('replaces the save at every move', async () => {
    const store = memoryStore();
    const saves = new LocalSaves(store);
    await saves.save({ bot: false, moves: [A] }, false);
    await saves.save({ bot: false, moves: [A, B] }, false);
    expect(store.data.get(LOCAL_GAME)).toEqual(encodeGame({ bot: false, moves: [A, B] }));
  });

  it('saves the moves as they were when asked, not as they are once storage answers', async () => {
    const store = memoryStore();
    const moves = [A];
    const done = new LocalSaves(store).save({ bot: false, moves }, false);
    moves.push(B); // the bot replied before the write landed
    await done;
    expect(store.data.get(LOCAL_GAME)).toEqual(encodeGame({ bot: false, moves: [A] }));
  });

  it('deletes the save once the game is over, so the next load starts a new game', async () => {
    const store = memoryStore();
    const saves = new LocalSaves(store);
    await saves.save({ bot: false, moves: [A] }, false);
    await saves.save({ bot: false, moves: [A, B] }, true);
    expect(store.data.size).toBe(0);
    expect(await saves.load(false, fake().make)).toBeNull();
  });

  it('clears the game it saved (New game, #230), so the next load starts a new game', async () => {
    const store = memoryStore();
    const saves = new LocalSaves(store);
    await saves.save({ bot: true, moves: [A, B] }, false);
    await saves.clear();
    expect(store.data.size).toBe(0);
    expect(await saves.load(true, fake().make)).toBeNull();
  });

  it('clears the game it resumed', async () => {
    const store = memoryStore();
    await new LocalSaves(store).save({ bot: false, moves: [A] }, false);
    const saves = new LocalSaves(store);
    await saves.load(false, fake().make);
    await saves.clear();
    expect(store.data.size).toBe(0);
  });

  it('clears nothing it did not save or resume: a save of the other mode stays', async () => {
    const store = memoryStore();
    await new LocalSaves(store).save({ bot: true, moves: [A, B] }, false);
    const saves = new LocalSaves(store);
    await saves.load(false, fake().make); // the bot game is left alone
    await saves.clear();
    expect(store.data.get(LOCAL_GAME)).toEqual(encodeGame({ bot: true, moves: [A, B] }));
  });

  it('loads the saved game of the same mode, replayed through the engine', async () => {
    const store = memoryStore();
    await new LocalSaves(store).save({ bot: false, moves: [A, B, C] }, false);
    const { make, engines } = fake();
    const loaded = await new LocalSaves(store).load(false, make);
    expect(loaded).toEqual({ engine: engines[0], moves: [A, B, C] });
    expect(engines[0]!.played).toEqual([A, B, C]);
    expect(store.data.has(LOCAL_GAME)).toBe(true);
  });

  it('loads nothing when nothing is saved', async () => {
    const store = memoryStore();
    const { make, engines } = fake();
    expect(await new LocalSaves(store).load(true, make)).toBeNull();
    expect(engines).toEqual([]);
  });

  it('leaves the game of the other mode (bot on or off) alone', async () => {
    const store = memoryStore();
    await new LocalSaves(store).save({ bot: true, moves: [A, B] }, false);
    expect(await new LocalSaves(store).load(false, fake().make)).toBeNull();
    expect(store.data.get(LOCAL_GAME)).toEqual(encodeGame({ bot: true, moves: [A, B] }));
  });

  it('drops a save of an unknown version, never shown half-done', async () => {
    const store = memoryStore();
    await store.put(LOCAL_GAME, { ...encodeGame({ bot: false, moves: [A] }), version: 2 });
    expect(await new LocalSaves(store).load(false, fake().make)).toBeNull();
    expect(store.data.size).toBe(0);
  });

  it('drops a save with a move the engine refuses', async () => {
    const store = memoryStore();
    await store.put(LOCAL_GAME, encodeGame({ bot: false, moves: [A, B, C] }));
    expect(await new LocalSaves(store).load(false, fake({ failOn: 2 }).make)).toBeNull();
    expect(store.data.size).toBe(0);
  });

  it('drops a save of a game that is over', async () => {
    const store = memoryStore();
    await store.put(LOCAL_GAME, encodeGame({ bot: true, moves: [A, B] }));
    expect(await new LocalSaves(store).load(true, fake({ status: 3 }).make)).toBeNull();
    expect(store.data.size).toBe(0);
  });

  it('plays on without storage: a blocked or full store loses the save, never the game', async () => {
    const saves = new LocalSaves(failing());
    await expect(saves.save({ bot: false, moves: [A] }, false)).resolves.toBeUndefined();
    await expect(saves.save({ bot: false, moves: [A] }, true)).resolves.toBeUndefined();
    await expect(saves.clear()).resolves.toBeUndefined();
    await expect(saves.load(false, fake().make)).resolves.toBeNull();
    const broken = { ...memoryStore(), delete: failing().delete };
    await broken.put(LOCAL_GAME, 'not a save');
    await expect(new LocalSaves(broken).load(false, fake().make)).resolves.toBeNull();
  });

  it('asks for persistent storage once, at the first save, and a refusal changes nothing', async () => {
    const store = memoryStore();
    let asked = 0;
    const saves = new LocalSaves(store, { persist: async () => (asked++, false) });
    await saves.load(false, fake().make);
    expect(asked).toBe(0);
    await saves.save({ bot: false, moves: [A] }, false);
    await saves.save({ bot: false, moves: [A, B] }, false);
    expect(asked).toBe(1);
    expect(store.data.get(LOCAL_GAME)).toEqual(encodeGame({ bot: false, moves: [A, B] }));
  });

  it('saves even when the persistence request throws', async () => {
    const store = memoryStore();
    const saves = new LocalSaves(store, {
      persist: () => {
        throw new Error('no');
      },
    });
    await saves.save({ bot: false, moves: [A] }, false);
    expect(store.data.get(LOCAL_GAME)).toEqual(encodeGame({ bot: false, moves: [A] }));
  });
});
