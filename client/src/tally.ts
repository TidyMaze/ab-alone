// Tally's line when a match starts (#294): one short line in its accounting voice, per mode and per
// boss (world.md section 2 and section 4). Pure data, so every mode and every boss is unit tested.
// The lines are proposed on #294 for the owner to accept or adjust.

export type TallyMode = 'local' | 'bot' | 'online' | 'boss';

/** The bosses of the roster, in play order (boss_ids() in crates/abalone-wasm). */
export const BOSS_IDS = ['echo', 'hull', 'choir', 'chaplain', 'ballast', 'alien', 'railyard', 'magnetizer', 'pulsar', 'overseer', 'assembly', 'core', 'dual', 'stalker'] as const;

const MODE_LINES: Record<'local' | 'bot' | 'online', string> = {
  local: 'Mess: two crews, one table. Ledger open.',
  bot: 'Mess: one seat filled. The other is counted.',
  online: 'Link: two crews, one ledger. Both counted.',
};

const BOSS_LINES: Record<(typeof BOSS_IDS)[number], string> = {
  echo: 'Mirror logged. Six out to balance the books.',
  hull: 'Rim on file. Six out to balance the books.',
  choir: 'Six out to balance the books.',
  chaplain: 'Conversions on file. Six out to balance.',
  ballast: 'The ledger plays itself. Twelve out to balance.',
  alien: 'Brood on file. Six out to balance the books.',
  railyard: 'Freight on schedule. Six out to balance the books.',
  magnetizer: 'Charges on file. Six out to balance the books.',
  pulsar: 'Beacons on schedule. Six out to balance the books.',
  overseer: 'Cores on file. Six burnt to balance the books.',
  assembly: 'Throughput on file. Six out to balance the books.',
  core: 'Charges on file. Four and a marble is written off.',
  dual: 'Returns on file. Six out to balance the books.',
  stalker: 'Sightings on file. Six out to balance the books.',
};

/** The line Tally says at the start of a match: a boss fight takes its boss, other modes their mode. */
export function tallyLine({ mode, boss = '' }: { mode: TallyMode; boss?: string }): string {
  if (mode === 'boss') return BOSS_LINES[boss as (typeof BOSS_IDS)[number]] ?? '';
  return MODE_LINES[mode];
}
