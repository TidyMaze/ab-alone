// The Rail Yard tell (docs/specs/game-design.md section 7.8, #626). Stubbed: railyard.test.ts describes it.
import type { Axial, Move } from './board';

export interface Train {
  line: number;
  left: number;
  cells: Axial[];
  dir: number;
}

export interface TrainPart {
  id: string;
  type: 'box' | 'wheel' | 'ore';
  size: readonly number[];
  position: readonly [number, number, number];
  color: number;
}

export const TRAIN_LEAD = 5;
export const PASS_MS = 1600;
export const JUMP_MS = 500;
export const APPROACH = 3;
export const CHEVRON_COLOR = 0;
export const CHEVRON_SHAPE: readonly [number, number][] = [];
export const TRAIN_LENGTH = 0;
export const TRAIN_PARTS: readonly TrainPart[] = [];

export const parseTrains = (_flat: ArrayLike<number>): Train[] => [];
export const trainText = (_trains: readonly Train[]): string => '';
export const passedTrains = (_before: readonly Train[], _after: readonly Train[]): Train[] => [];
export const knockedMarbles = (_before: ArrayLike<number>, _mv: Move, _train: Train): { cell: Axial; side: number; at: number }[] => [];
export const trainAt = (_train: Train, _elapsedMs: number, _reduced: boolean) => ({ x: 0, z: 0, yaw: 0, done: true });
export const reachMs = (_train: Train, _at: number, _reduced: boolean): number => 0;
export const chevronSpots = (_train: Train): { x: number; z: number; yaw: number; edge: boolean }[] => [];
export const railSpan = (_train: Train) => ({ x: 0, z: 0, yaw: 0, length: 0 });
