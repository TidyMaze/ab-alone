// The Magnetizer (docs/specs/game-design.md section 7.9, #645). Stubbed: the tests come first.
import type { Axial, Move } from './board';

export const REPULSION_STRIDE = 0;

export interface Repulsion {
  pair: [Axial, Axial];
  board: number[];
  poles: number[];
}

export function parseRepulsions(_flat: ArrayLike<number>): Repulsion[] {
  return [];
}

export function repulsionMoves([a, b]: [Axial, Axial]): [Move, Move] {
  return [
    { cells: [a], dir: -1 },
    { cells: [b], dir: -1 },
  ];
}

export function polarityText(_phase: number, _plies: number): string {
  return '';
}

export function drawGlyph(_g: CanvasRenderingContext2D, _sign: number, _size: number): void {}
