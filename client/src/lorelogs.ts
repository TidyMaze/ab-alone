// The lore of the story (docs/specs/world.md section 12): the entry a boss win shows, one per boss of the roster, and the logs the Open
// world holds, one per cell of `world_logs`. Stub of the red test.
export interface StoryEntry {
  id: string;
  title: string;
  body: string;
  stage: number;
}
export interface BossLore extends StoryEntry {
  boss: string;
}
export interface WorldLog extends StoryEntry {
  reread: boolean;
}

export const BOSS_LORE: readonly BossLore[] = [];
export const WORLD_LOGS: readonly WorldLog[] = [];
