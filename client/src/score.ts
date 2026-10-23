// Score line of the HUD, built from the engine's ejected counts, status and draw reason (see the
// header of crates/abalone-wasm/src/lib.rs). The win rule is the engine's: 6 ejections.

const WIN_EJECTIONS = 6;
const RESULT = ['', 'Black wins by 6 ejections', 'White wins by 6 ejections', ''];
const DRAW_REASON = ['', 'by threefold repetition', 'after 100 plies without ejection'];

export function formatScore(
  ejected: readonly [number, number],
  status: number,
  drawReason: number,
): string {
  const line = `Black ejected ${ejected[0]}/${WIN_EJECTIONS} · White ejected ${ejected[1]}/${WIN_EJECTIONS}`;
  if (status === 0) return line;
  const result = status === 3 ? `Draw ${DRAW_REASON[drawReason]}` : RESULT[status];
  return `${result} · ${line}`;
}
