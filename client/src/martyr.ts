// The Chaplain's martyr (docs/specs/game-design.md section 7.3, #748): the boss marble announced to explode at the end
// of the next boss turn, and the explosion. Pure helpers over the bridge's `martyr()` and `removed()`, the meshes live
// in main.ts.
import type { Axial } from './board';
import { parseBurns } from './overseer';

/** The board code of a boss marble. */
export const BOSS_CODE = 2;
/** Milliseconds the explosion takes, and its flash with reduced motion. */
export const BLAST_MS = 900;
export const FLASH_MS = 450;
/** Shards in the ring, and the radius they reach. */
export const BLAST_SHARDS = 8;
export const BLAST_RADIUS = 1.6;
const FLASH_RADIUS = 0.9;
const FLASH_OPACITY = 0.9;
const SHARD_LIFT = 0.4;

/** The cell of the announced martyr from `Encounter.martyr()`, none when empty. */
export function parseMartyr(flat: ArrayLike<number>): Axial | null {
  return flat.length === 2 ? [flat[0]!, flat[1]!] : null;
}

/** HUD line of the tell while a martyr waits. */
export const martyrText = (martyr: Axial | null): string => (martyr ? 'Martyr marked: it explodes at the end of the next boss turn' : '');

/** The cell of the boss marble the last ply removed (the martyr that just exploded), from `Encounter.removed()`. */
export function parseBlast(removed: ArrayLike<number>): Axial | null {
  return parseBurns(removed).find((b) => b.side === BOSS_CODE)?.cell ?? null;
}

/** The explosion `elapsedMs` in: the flash disc and the ring of shards, their radius, opacity and the shards' lift, and
 * whether it is over. Reduced motion: a static flash that fades, no shard. */
export function blastAt(
  elapsedMs: number,
  reduced: boolean,
): { flashRadius: number; flashOpacity: number; shardRadius: number; shardLift: number; shardOpacity: number; done: boolean } {
  const t = Math.min(1, Math.max(0, elapsedMs) / (reduced ? FLASH_MS : BLAST_MS));
  const out = 1 - (1 - t) ** 2;
  return {
    flashRadius: reduced ? FLASH_RADIUS : FLASH_RADIUS * (0.4 + 0.6 * out),
    flashOpacity: FLASH_OPACITY * (1 - t),
    shardRadius: reduced ? 0 : BLAST_RADIUS * out,
    shardLift: reduced ? 0 : SHARD_LIFT * Math.sin(Math.PI * t),
    shardOpacity: reduced ? 0 : 1 - t,
    done: t >= 1,
  };
}
