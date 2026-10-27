// Score line of the HUD, built from the engine's ejected counts, win thresholds, status and draw
// reason (see the header of crates/abalone-wasm/src/lib.rs). The win rule is the engine's: 6
// ejections.

import { sideName } from './glass';

export function formatScore(
  ejected: readonly [number, number],
  win: readonly [number, number],
  _status: number,
  _drawReason: number,
  glass: number,
): string {
  return `${sideName(1, glass)} ejected ${ejected[0]}/${win[0]} · ${sideName(2, glass)} ejected ${ejected[1]}/${win[1]}`;
}
