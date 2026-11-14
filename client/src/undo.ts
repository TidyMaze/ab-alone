// Undo (#1672, docs/specs/ui.md): in a normal casual bot game the player takes back a move and the bot's reply. Never in a boss, the Daily, a run,
// the Trainer, an Open world fight, a ranked or online game, the first match (#1663) or the hot-seat table. Pure rules: main.ts holds the game.
export const UNDO_LABEL = 'Undo';

/** What decides whether Undo is there. */
export interface UndoGame {
  bot: boolean;
  fight: boolean; // a boss, the Daily and the Open world's lairs are fights
  run: boolean;
  trainer: boolean;
  online: boolean;
  wild: boolean;
  replaying: boolean;
  first: boolean; // the guided first match
  auto: boolean; // auto-play plays the player's side
  thinking: boolean; // the bot's reply is not in yet
  over: boolean;
  hub: boolean;
  plies: number;
}

/** Whether the button is there (absent otherwise, not disabled): a casual bot game on the player's turn with a move to take back. */
export const undoAllowed = (g: UndoGame): boolean =>
  g.bot && !g.fight && !g.run && !g.trainer && !g.online && !g.wild && !g.replaying && !g.first && !g.auto && !g.thinking && !g.over && !g.hub && g.plies > 0;

/** The log length after Undo: the last position before the end where it is the player's turn (the player's move and the bot's reply go). `toMove(ply)` is the side to move after `ply` plies. */
export function undoLength(plies: number, toMove: (ply: number) => number, player: number): number {
  let to = plies - 1;
  while (to > 0 && toMove(to) !== player) to--;
  return to;
}
