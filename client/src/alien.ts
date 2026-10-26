// The Alien tell (docs/specs/game-design.md section 7.7, #588): pure helpers over the bridge's `eggs()` records.
import type { Axial } from './board';

export interface Egg {
  cell: Axial;
  left: number;
}

export const COUNTER = { ink: 0, plate: 0 };
export const COUNTER_MAX = 0;

export function parseEggs(_flat: ArrayLike<number>): Egg[] {
  return [];
}

export function eggText(_eggs: readonly Egg[]): string {
  return '';
}

export function eggGlow(_seconds: number, _reduced: boolean): number {
  return 0;
}

export function drawCounter(_g: CanvasRenderingContext2D, _n: number, _size: number): void {}
