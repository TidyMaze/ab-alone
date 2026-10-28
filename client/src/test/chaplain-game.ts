import { encodeMove } from '../board';

// The recorded Chaplain win of the core tests (crates/abalone-core/tests/fixtures/chaplain.txt, #748), as the move records
// of `Engine.play`: both sides' plies, played by the `__playMoves` hook. The fight seed, and the plies after which the
// first marble is converted, the martyr is announced and the martyr exploded (checked in crates/abalone-wasm).
export const SEED = 10040;
export const CONVERTED_AT = 24;
export const ANNOUNCED_AT = 52;
export const EXPLODED_AT = 54;

const DIRECTIONS = ['E', 'W', 'NE', 'SW', 'NW', 'SE'];

/** The plies of the fixture file `text`, one record each. */
export function parseRecorded(text: string): number[][] {
  return text
    .split('moves:\n')[1]!
    .trim()
    .split('\n')
    .map((line: string) => {
      const [cells, dir] = line.split(' ') as [string, string];
      return encodeMove({ cells: cells.split(';').map((c) => c.split(',').map(Number) as [number, number]), dir: DIRECTIONS.indexOf(dir) });
    });
}
