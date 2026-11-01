import { describe, expect, it } from 'vitest';
import { EVAC_MS, SWARM_TURNS, evacAt, parseSwarm, swarmText } from './swarm';

describe('The Swarm helpers (#1008, #1266, game-design.md section 7.14)', () => {
  it('reads [turns_left, passed, jump, q, r, ...] of swarm(), null for the other bosses', () => {
    expect(parseSwarm(Int32Array.from([40, 0, 0, 0, -4]))).toEqual({ left: 40, passed: false, jump: 0, cells: [[0, -4]] });
    expect(parseSwarm([2, 1, 2, 0, -4, -4, 0])).toEqual({ left: 2, passed: true, jump: 2, cells: [[0, -4], [-4, 0]] });
    expect(parseSwarm([])).toBeNull();
    expect(SWARM_TURNS).toBe(40);
  });

  it('says the turns to the evac, the jump of a swarm ejection, the next wave on its marks, a pass and the loss line', () => {
    expect(swarmText(parseSwarm([40, 0, 0, 0, -4]), 2)).toBe(
      '40 turns to the evac · 1 marble lands on its mark next turn · the swarm wins after it ejects 2 of your marbles',
    );
    expect(swarmText(parseSwarm([1, 1, 0, 0, -4, 1, -4]), 2)).toBe(
      '1 turn to the evac · 2 marbles land on their marks next turn · the swarm passed · the swarm wins after it ejects 2 of your marbles',
    );
    expect(swarmText(parseSwarm([28, 0, 2, 0, 4]), 2)).toBe(
      '28 turns to the evac (-2) · 1 marble lands on its mark next turn · the swarm wins after it ejects 2 of your marbles',
    );
    expect(swarmText(parseSwarm([3, 0, 0]), 1)).toBe('3 turns to the evac · the swarm wins after it ejects 1 of your marbles'); // a full rim
    expect(swarmText(parseSwarm([0, 0, 2]), 2)).toBe('The evac lifts you out');
    expect(swarmText(null, 6)).toBe('');
  });

  it('lights the board and lifts the marbles over the evac, a fade with reduced motion', () => {
    expect(evacAt(0, false)).toEqual({ light: 0, lift: 0, done: false });
    expect(evacAt(EVAC_MS / 2, false)).toMatchObject({ light: 0.5, done: false });
    expect(evacAt(EVAC_MS / 2, false).lift).toBeGreaterThan(0);
    expect(evacAt(EVAC_MS * 2, false)).toMatchObject({ light: 1, done: true });
    expect(evacAt(EVAC_MS / 2, true)).toEqual({ light: 0.5, lift: 0, done: false }); // no motion, the light fades in
    expect(evacAt(-5, true).light).toBe(0);
  });
});
