// Score line of the HUD, built from the engine's ejected counts, win thresholds, status and draw
// reason (see the header of crates/abalone-wasm/src/lib.rs). The win rule is the engine's: 6
// ejections, 10 for the player against the Choir (Decision #131).

const DRAW_REASON = ['', 'by threefold repetition', 'after 100 plies without ejection'];
const SIDES = ['', 'Black', 'White'];

export function formatScore(
  ejected: readonly [number, number],
  win: readonly [number, number],
  status: number,
  drawReason: number,
): string {
  const line = `Black ejected ${ejected[0]}/${win[0]} · White ejected ${ejected[1]}/${win[1]}`;
  if (status === 0) return line;
  const result =
    status === 3 ? `Draw ${DRAW_REASON[drawReason]}` : `${SIDES[status]} wins by ${win[status - 1]} ejections`;
  return `${result} · ${line}`;
}
