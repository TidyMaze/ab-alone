// The Swarm (#1008, game-design.md section 7.14): its wave announced one turn ahead, the turns to the evac, and the evac
// that lights the whole board once the 30th boss reply is done.
import type { Axial } from './board';

/** Boss replies the player must outlast (SWARM_TURNS in crates/abalone-core/src/encounter/swarm.rs). */
export const SWARM_TURNS = 30;
/** How long the evac light takes to come up, and how high it lifts the surviving marbles. */
export const EVAC_MS = 1200;
const EVAC_LIFT = 0.6;

export interface SwarmState {
  left: number;
  passed: boolean;
  cells: Axial[];
}

/** `Encounter.swarm()`: `[turns_left, passed, q, r, ...]`, null for the other bosses. */
export function parseSwarm(flat: ArrayLike<number>): SwarmState | null {
  if (flat.length === 0) return null;
  const [left, passed, ...rest] = Array.from(flat);
  const cells = Array.from({ length: rest.length / 2 }, (_, i): Axial => [rest[2 * i]!, rest[2 * i + 1]!]);
  return { left: left!, passed: passed === 1, cells };
}

/** The HUD line: the turns to the evac, the next wave on its marks, a pass, and how the swarm wins (`need` ejections). */
export function swarmText(state: SwarmState | null, need: number): string {
  if (!state) return '';
  if (state.left === 0) return 'The evac lifts you out';
  const n = state.cells.length;
  return [
    `${state.left} ${state.left === 1 ? 'turn' : 'turns'} to the evac`,
    n === 0 ? '' : n === 1 ? '1 marble lands on its mark next turn' : `${n} marbles land on their marks next turn`,
    state.passed ? 'the swarm passed' : '',
    `the swarm wins after it ejects ${need} of your marbles`,
  ]
    .filter((part) => part !== '')
    .join(' · ');
}

/** The evac `elapsedMs` in: the board's light from 0 to 1 and the marbles' lift. Reduced motion: the light fades in alone. */
export function evacAt(elapsedMs: number, reduced: boolean): { light: number; lift: number; done: boolean } {
  const t = Math.min(1, Math.max(0, elapsedMs / EVAC_MS));
  return { light: t, lift: reduced ? 0 : EVAC_LIFT * t * t, done: t === 1 };
}
