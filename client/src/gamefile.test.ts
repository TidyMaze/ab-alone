import { describe, expect, it } from 'vitest';
import { gameFileName, gameFileText, MAX_FILE_BYTES, readGameFile, REFUSED, type GameFile } from './gamefile';
import { encodeGame, type ReplayEngine } from './savegame';

const A = [1, 4, 0, 2, 0, 0, 0, 0]; // Black (0, 2) to its NW neighbour
const B = [1, 5, 0, -2, 0, 0, 0, 0]; // White (0, -2) to its SE neighbour
const C = [1, 4, 0, 1, 0, 0, 0, 0]; // Black (0, 1) to its NW neighbour

/** Engine that records what it plays, refuses its `failOn`th move and reports `status`. */
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

/** A picked file holding `text`, as a File gives it. */
const file = (text: string): GameFile & { reads: number } => {
  const f = {
    reads: 0,
    size: new TextEncoder().encode(text).length,
    text: async () => (f.reads++, text),
  };
  return f;
};

describe('gameFileName', () => {
  it('names the file with the local date', () => {
    expect(gameFileName(new Date(2026, 9, 24, 23, 59))).toBe('ab-alone-2026-10-24.json');
    expect(gameFileName(new Date(2026, 0, 5, 0, 0))).toBe('ab-alone-2026-01-05.json');
  });
});

describe('gameFileText', () => {
  it('writes the save format of the resume task as JSON, one line', () => {
    const text = gameFileText({ bot: true, moves: [A, B] });
    expect(JSON.parse(text)).toEqual(encodeGame({ bot: true, moves: [A, B] }));
    expect(text).toBe('{"version":1,"mode":"local","layout":"standard","bot":true,"moves":[[1,4,0,2,0,0,0,0],[1,5,0,-2,0,0,0,0]]}\n');
  });
});

describe('readGameFile', () => {
  it('replays the moves of an exported file through the engine', async () => {
    const { make, engines } = fake();
    const read = await readGameFile(file(gameFileText({ bot: false, moves: [A, B, C] })), make);
    expect(read).toEqual({ engine: engines[0], moves: [A, B, C] });
    expect(engines[0]!.played).toEqual([A, B, C]);
  });

  it('reads a game with no move yet', async () => {
    const { make, engines } = fake();
    expect(await readGameFile(file(gameFileText({ bot: true, moves: [] })), make)).toEqual({
      engine: engines[0],
      moves: [],
    });
  });

  it('reads a finished game: it shows at its last ply, over', async () => {
    const { make, engines } = fake({ status: 3 });
    const read = await readGameFile(file(gameFileText({ bot: true, moves: [A, B] })), make);
    expect(read).toEqual({ engine: engines[0], moves: [A, B] });
  });

  it('refuses a file that is not JSON, or not a game', async () => {
    for (const text of ['', 'not json', '{"version":1', 'null', '1', '"save"', '[]', '{}', '{"moves":[]}']) {
      expect(await readGameFile(file(text), fake().make)).toEqual({ refused: REFUSED.notGame });
    }
  });

  it('refuses a game of another mode or layout, or with a bad record', async () => {
    const good = encodeGame({ bot: false, moves: [A] });
    for (const raw of [
      { ...good, mode: 'online' },
      { ...good, layout: 'belgian-daisy' },
      { ...good, bot: 'off' },
      { ...good, moves: [[1, 4, 0, 2]] },
    ]) {
      expect(await readGameFile(file(JSON.stringify(raw)), fake().make)).toEqual({ refused: REFUSED.notGame });
    }
  });

  it('refuses an unknown version', async () => {
    const good = encodeGame({ bot: false, moves: [A] });
    for (const version of [0, 2, '1', null]) {
      const read = await readGameFile(file(JSON.stringify({ ...good, version })), fake().make);
      expect(read).toEqual({ refused: REFUSED.version });
    }
  });

  it('refuses a game with a move the engine refuses: the engine is the only judge', async () => {
    const read = await readGameFile(file(gameFileText({ bot: false, moves: [A, B, C] })), fake({ failOn: 2 }).make);
    expect(read).toEqual({ refused: REFUSED.illegal });
  });

  it('refuses a file too big to be a game without reading it', async () => {
    const big = { ...file(gameFileText({ bot: false, moves: [A] })), size: MAX_FILE_BYTES + 1 };
    expect(await readGameFile(big, fake().make)).toEqual({ refused: REFUSED.notGame });
    expect(big.reads).toBe(0);
    expect(MAX_FILE_BYTES).toBe(1 << 20);
  });

  it('refuses a file the browser cannot read', async () => {
    const broken: GameFile = { size: 10, text: () => Promise.reject(new Error('NotReadableError')) };
    expect(await readGameFile(broken, fake().make)).toEqual({ refused: REFUSED.notGame });
  });

  it('says why in a short HUD note, never with the file content in it', () => {
    expect(REFUSED).toEqual({
      notGame: 'import refused: not a game file',
      version: 'import refused: unknown file version',
      illegal: 'import refused: illegal move in the file',
    });
  });
});
