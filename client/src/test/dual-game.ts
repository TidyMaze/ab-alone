// The recorded Dual Room fight of the wasm tests (crates/abalone-core/tests/fixtures/dual.txt, #947), as the move
// records of `Engine.play`, played by the `__playMoves` hook (parseRecorded of chaplain-game.ts reads it). Fight seed 1:
// the boss marble pushed off on ply RETURN_AT is announced on RETURN_CELL and lands there at the end of the next ply;
// the 5th ejection, on ply COLLAPSE_AT (the last), brings the wall down.
export const SEED = 1;
export const RETURN_AT = 27;
export const RETURN_CELL: [number, number] = [-1, -1];
export const COLLAPSE_AT = 79;
