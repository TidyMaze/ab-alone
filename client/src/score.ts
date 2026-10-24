// Score line of the HUD, built from the engine's ejected counts, win thresholds, status and draw
// reason (see the header of crates/abalone-wasm/src/lib.rs). The win rule is the engine's: 6
// ejections, 10 for the player against the Choir (Decision #131).

import { sideName } from './glass';

const DRAW_REASON = ['', 'by threefold repetition', 'after 100 plies without ejection'];

export function formatScore(
  ejected: readonly [number, number],
  win: readonly [number, number],
  status: number,
  drawReason: number,
  glass: number,
): string {
  const line = `${sideName(1, glass)} ejected ${ejected[0]}/${win[0]} · ${sideName(2, glass)} ejected ${ejected[1]}/${win[1]}`;
  if (status === 0) return line;
  const result =
    status === 3 ? `Draw ${DRAW_REASON[drawReason]}` : `${sideName(status, glass)} wins by ${win[status - 1]} ejections`;
  return `${result} · ${line}`;
}
