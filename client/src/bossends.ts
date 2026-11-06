// The victory and defeat line of each boss (#1546, docs/specs/world.md section 12.8): the line the end banner shows after a fight, one of each
// per boss of the roster, in Tally's flat, procedural register (section 12.7). Data only. Every line declares the `stage` of the story that may
// speak it; a boss menu starts any fight at any time, so the lines of stage 1 hold no secret word (`bossends.test.ts`). The Ballast Mind alone
// has a second win line, the answer of the story (#1588), served only from stage 7: below it the fight keeps the old banner.

/** What a fight can end in on the banner: the player's win or a defeat. */
export type EndKind = 'win' | 'loss';

export interface BossEnd {
  boss: string;
  kind: EndKind;
  stage: number;
  line: string;
}

const end = (boss: string, kind: EndKind, line: string, stage = 1): BossEnd => ({ boss, kind, stage, line });

/** In the order of the roster (`BOSS_IDS` of tally.ts). */
export const BOSS_ENDS: readonly BossEnd[] = [
  end('echo', 'win', 'Mirror closed. The count is yours.'),
  end('echo', 'loss', 'Mirror holds. The count is its own.'),
  end('hull', 'win', 'Bay released. The frame lets go.'),
  end('hull', 'loss', 'Bay held. The frame keeps its keeper.'),
  end('choir', 'win', 'Shift ended. The last voice is out.'),
  end('choir', 'loss', 'Shift goes on. Three groups, one voice.'),
  end('chaplain', 'win', 'Sermon ended. The three stand quiet.'),
  end('chaplain', 'loss', 'Sermon goes on. Three around one.'),
  end('ballast', 'win', 'The seat is empty.'),
  end('ballast', 'win', 'Delivered: fourteen. Crew clear: all. Seat five: Tally. Books balanced. Clamp: yours.', 7),
  end('ballast', 'loss', 'The seat holds.'),
  end('alien', 'win', 'Brood cleared. The hold is quiet.'),
  end('alien', 'loss', 'Brood grows. The hold is warm.'),
  end('railyard', 'win', 'Line cleared. Freight stands still.'),
  end('railyard', 'loss', 'Freight on time. Nothing stopped it.'),
  end('magnetizer', 'win', 'Poles quiet. Nothing pulls.'),
  end('magnetizer', 'loss', 'Poles live. The pull took the board.'),
  end('pulsar', 'win', 'Beacons dark. No pulse left to count.'),
  end('pulsar', 'loss', 'Beacons keep time. One more pulse filed.'),
  end('overseer', 'win', 'Watch ended. The cores are burnt.'),
  end('overseer', 'loss', 'Watch closed. The slag fill is entered.'),
  end('assembly', 'win', 'Belts stopped. The presses are idle.'),
  end('assembly', 'loss', 'Belts run. The edge is fed.'),
  end('core', 'win', 'Core quiet. Charge written off.'),
  end('core', 'loss', 'Core blown. Charge entered as loss.'),
  end('dual', 'win', 'Both galleys clear. The gap is counted.'),
  end('dual', 'loss', 'Two rooms, one void. It took the count.'),
  end('stalker', 'win', 'Fog lifted. The watcher is seen.'),
  end('stalker', 'loss', 'Fog keeps its count. You were seen first.'),
  end('swarm', 'win', 'Evac lifted. The last wave is behind.'),
  end('swarm', 'loss', 'Waves go on. The evac left without you.'),
];

/** The line of `boss` for `kind` at `stage` of the story: the one of the highest stage the story has reached. None for a boss the roster does not hold. */
export const bossEndLine = (boss: string, kind: EndKind, stage: number): string | undefined =>
  BOSS_ENDS.filter((e) => e.boss === boss && e.kind === kind && e.stage <= stage).at(-1)?.line;
