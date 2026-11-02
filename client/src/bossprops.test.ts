import { describe, expect, it } from 'vitest';
import { BOSS_IDS } from './tally';
import { RADIUS } from './board';
import { PULSAR_DISTANCE } from './pulsar';
import { BOSS_PROPS, BOSS_PROP_PIECES, bossProp } from './bossprops';

// Each boss row of art/blender/coverage.md names one prop of the boss kit (kit_boss.glb); the terrace wears the piece of the
// boss in the fight, off the dish, and no other (#1374).

describe('bossProp', () => {
  it('names the piece of each boss that the kit has a prop for', () => {
    expect(BOSS_PROPS).toEqual({
      echo: 'kit_prop_bench',
      hull: 'kit_prop_hullplate',
      alien: 'kit_prop_oresacks',
      choir: 'kit_prop_tuningfork',
      magnetizer: 'kit_prop_magnetcrane',
      core: 'kit_prop_reactorstack',
      chaplain: 'kit_prop_confessional',
      stalker: 'kit_prop_watchlamp',
      swarm: 'kit_prop_evacpad',
    });
    expect([...BOSS_PROP_PIECES].sort()).toEqual(Object.values(BOSS_PROPS).sort());
  });
  it('only knows real bosses, the ones with a prop of their own elsewhere are left out', () => {
    for (const id of Object.keys(BOSS_PROPS)) expect(BOSS_IDS as readonly string[]).toContain(id);
    for (const id of ['pulsar', 'railyard', 'assembly', 'overseer', 'ballast', 'dual']) expect(bossProp(id)).toBeNull();
  });
  it('stands off the dish, on the east corner of the board, and shows nothing outside a fight', () => {
    const prop = bossProp('echo')!;
    expect(prop.piece).toBe('kit_prop_bench');
    expect(prop.x).toBeGreaterThan(0); // east of the centre
    expect(prop.z).toBeGreaterThan(0); // toward the camera
    expect(Math.hypot(prop.x, prop.z)).toBeGreaterThan(RADIUS);
    expect(Math.hypot(prop.x, prop.z)).toBeCloseTo(PULSAR_DISTANCE - 0.3, 5);
    expect(bossProp(undefined)).toBeNull();
    expect(bossProp(null)).toBeNull();
  });
});
