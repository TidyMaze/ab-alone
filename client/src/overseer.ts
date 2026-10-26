// The Overseer (docs/specs/game-design.md section 7.11, #635): stubbed.
import type { Axial } from './board';
import type { EjectTrack } from './eject';

export const TOXIN_TURNS = 0;
export const TAUNTS: readonly string[] = [];

export interface Burn {
  cell: Axial;
  side: number;
}

export function parseBurns(_flat: ArrayLike<number>): Burn[] {
  return [];
}

export function toxinText(_left: number): string {
  return '';
}

export function burnTrack(cell: Axial, _reduced: boolean): EjectTrack {
  return { kind: 'fade', from: { x: cell[0], z: cell[1] }, dir: { x: 0, z: 0 }, durationMs: 0 };
}
