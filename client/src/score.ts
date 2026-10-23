// Score line of the HUD, built from the engine's ejected counts and status (see the header of
// crates/abalone-wasm/src/lib.rs). The win rule is the engine's: 6 ejections. The engine does not
// report why a draw happened, so a draw has no reason here.

const WIN_EJECTIONS = 6;
const RESULT = ['', 'Black wins by 6 ejections', 'White wins by 6 ejections', 'Draw'];

export function formatScore(ejected: readonly [number, number], status: number): string {
  const line = `Black ejected ${ejected[0]}/${WIN_EJECTIONS} · White ejected ${ejected[1]}/${WIN_EJECTIONS}`;
  return status === 0 ? line : `${RESULT[status]} · ${line}`;
}
