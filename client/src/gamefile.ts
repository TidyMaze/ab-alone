// The game file: a local game exported as JSON and imported back, see docs/specs/tech.md section 8. It is
// the save format of savegame.ts. On import the engine replays the moves and stays the only judge.

import { decodeGame, encodeGame, replayMoves, SAVE_VERSION, type LocalGame, type ReplayEngine } from './savegame';

/** Largest file read: a game file is a few kilobytes, anything bigger is not a game. */
export const MAX_FILE_BYTES = 1 << 20;

/** Why a file is refused, a short HUD note. Never built from the file: the HUD is HTML. */
export const REFUSED = {
  notGame: 'import refused: not a game file',
  version: 'import refused: unknown file version',
  illegal: 'import refused: illegal move in the file',
} as const;

const pad = (n: number): string => String(n).padStart(2, '0');

/** `ab-alone-2026-10-24.json`, with the local date of `now`. */
export function gameFileName(now: Date): string {
  return `ab-alone-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

/** The content of the exported file. */
export function gameFileText(game: LocalGame): string {
  return `${JSON.stringify(encodeGame(game))}\n`;
}

/** The part of a picked File read here. */
export interface GameFile {
  size: number;
  text(): Promise<string>;
}

/** The game in `file`, replayed on a new engine from `make`, finished or not, or why it is refused. */
export async function readGameFile<E extends ReplayEngine>(
  file: GameFile,
  make: () => E,
): Promise<{ engine: E; moves: number[][] } | { refused: string }> {
  if (file.size > MAX_FILE_BYTES) return { refused: REFUSED.notGame };
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    return { refused: REFUSED.notGame }; // not JSON, or the browser cannot read the file
  }
  if (typeof raw !== 'object' || raw === null || !('version' in raw)) return { refused: REFUSED.notGame };
  if (raw.version !== SAVE_VERSION) return { refused: REFUSED.version };
  const game = decodeGame(raw);
  if (!game) return { refused: REFUSED.notGame };
  const engine = replayMoves(game.moves, make);
  return engine ? { engine, moves: game.moves } : { refused: REFUSED.illegal };
}
