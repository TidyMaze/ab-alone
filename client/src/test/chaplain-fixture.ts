import text from '../../../crates/abalone-core/tests/fixtures/chaplain.txt?raw';
import { parseRecorded } from './chaplain-game';

/** The plies of the recorded Chaplain win of the core tests (see chaplain-game.ts). */
export const recordedGame = (): number[][] => parseRecorded(text);
