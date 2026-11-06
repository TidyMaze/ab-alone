// The score of a run's army fight on the HUD (docs/specs/roguelite.md section 31, #1540): the army on the board, the army the run
// ends below, the marbles lost this fight in red, and the bot's ejections. Every number is the engine's own count, read from its
// board and its ejections (`army_game_against` sets the thresholds), never a rule of its own.

/** The Black marbles of `board`, the army's. */
export const armyOnBoard = (board: ArrayLike<number>): number => Array.from(board).filter((cell) => cell === 1).length;

/** The HTML of the score: a line for the army and one for the bot. The army the run ends below is the army on the board less the
 * ejections the bot still needs (`win[1]` less the marbles lost), plus one: 9 for an army of 14 (the bot wins at 6), 4 up to an army of 9. */
export function runScoreHtml(board: ArrayLike<number>, ejected: readonly [number, number], win: readonly [number, number]): string {
  const army = armyOnBoard(board);
  const lost = ejected[1];
  const below = army - (win[1] - lost) + 1;
  return `<div>Army ${army} (run ends below ${below}) · ${lost ? `<span class="lost">lost ${lost}</span>` : 'lost 0'}</div><div>Bot ejected ${ejected[0]}/${win[0]}</div>`;
}
