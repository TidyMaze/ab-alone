// The prop each boss row of art/blender/coverage.md wears on the terrace (#1374): one piece of the boss kit (kit_boss.glb),
// off the dish. The Pulsar's pylons, the Assembly press, the Rail Yard's buffer stop and the Ballast Mind's core have their own
// code (main.ts, the slab), so they are not here. Pure data: the mesh and its draw are main.ts's.
import { PULSAR_DISTANCE } from './pulsar';

/** Where it stands: the south-east edge of the slab, 55 degrees round from east toward the camera, 0.3 inside the pulsars' distance. The far corners sit under the
 * top bar and the near ones under the controls and the goal panel, this edge is clear on a desktop and a phone. */
const SPOT_DISTANCE = PULSAR_DISTANCE - 0.3;
const SPOT = { x: SPOT_DISTANCE * Math.cos((55 * Math.PI) / 180), z: SPOT_DISTANCE * Math.sin((55 * Math.PI) / 180) };

/** The kit piece of each boss that has one prop here. */
export const BOSS_PROPS = {
  echo: 'kit_prop_bench',
  hull: 'kit_prop_hullplate',
  alien: 'kit_prop_oresacks',
  choir: 'kit_prop_tuningfork',
  magnetizer: 'kit_prop_magnetcrane',
  core: 'kit_prop_reactorstack',
  chaplain: 'kit_prop_confessional',
  stalker: 'kit_prop_watchlamp',
  swarm: 'kit_prop_evacpad',
} as const;

/** The pieces to take out of the kit file. */
export const BOSS_PROP_PIECES: readonly string[] = Object.values(BOSS_PROPS);

/** The piece of fight `id` and where it stands, off the south-east edge of the board where a pulsar stands (a fight has one
 * boss, so the spots never meet); `null` for a boss with no piece here, or no fight. */
export function bossProp(id: string | null | undefined): { piece: string; x: number; z: number } | null {
  const piece = (BOSS_PROPS as Record<string, string>)[id ?? ''];
  if (!piece) return null;
  return { piece, ...SPOT };
}
