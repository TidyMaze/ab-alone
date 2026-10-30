import text from '../../../crates/abalone-core/tests/fixtures/dual.txt?raw';
import { parseRecorded } from './chaplain-game';

/** The plies of the recorded Dual Room fight of the wasm tests (see dual-game.ts). */
export const dualGame = (): number[][] => parseRecorded(text);
