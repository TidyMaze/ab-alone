// Tally's line when a match starts (#294): one short line in its accounting voice, per mode and per
// boss (world.md section 2 and section 4). Pure data, so every mode and every boss is unit tested.
// The lines are proposed on #294 for the owner to accept or adjust.

export type TallyMode = 'local' | 'bot' | 'online' | 'boss';

/** The bosses of the roster, in play order (boss_ids() in crates/edgefall-wasm). */
export const BOSS_IDS = ['echo', 'hull', 'choir', 'chaplain', 'ballast', 'alien', 'railyard', 'magnetizer', 'pulsar', 'overseer', 'assembly', 'core', 'dual', 'stalker', 'swarm'] as const;

const MODE_LINES: Record<'local' | 'bot' | 'online', string> = {
  local: 'Mess: two crews, one table. Ledger open.',
  bot: 'Mess: one seat filled. The other is counted.',
  online: 'Link: two crews, one ledger. Both counted.',
};

/** Tally's line for each boss (#294, #1544). A boss menu starts any fight at any time, so a line holds no secret word of the story (world.md
 * section 12.2): it is stage 1 for good (`tally.test.ts`). The ten later bosses each say something no other boss says. */
const BOSS_LINES: Record<(typeof BOSS_IDS)[number], string> = {
  echo: 'Mirror logged. Six out to balance the books.',
  hull: 'Rim on file. Six out to balance the books.',
  choir: 'Six out to balance the books.',
  chaplain: 'Conversions on file. Six out to balance.',
  ballast: 'The ledger plays itself. Twelve out to balance.',
  alien: 'Brood on file. It bred while the count was open.',
  railyard: 'Freight on schedule. Nothing on the line stops it.',
  magnetizer: 'Poles on file. Charge against charge, entered as a push.',
  pulsar: 'Beacons on schedule. One pulse at a time, each counted.',
  overseer: 'Cores on file. Watch closes at six burnt.',
  assembly: 'Throughput on file. Every belt runs to the edge.',
  core: 'Charges on file. Four and a marble is written off.',
  dual: 'Returns on file. Two rooms, one void, one count.',
  stalker: 'Sightings on file. The fog keeps its own count.',
  swarm: 'Waves on file. Forty turns to the evac.',
};

/** The Ballast Mind's line as its fight starts, from stage 6: it says its limit (#1588). Below, the fight keeps its line of `BOSS_LINES`. */
const BALLAST_LINE_6 = 'I cannot push. Rule four. You can. Count carefully.';

/** The line of the bot table once the story reached its stage 2, the first boss beaten (#1584): the one line the story changes in a match. */
const BOT_LINE_2 = `${MODE_LINES.bot} It was never an enemy.`;

/** The line Tally says at the start of a match: a boss fight takes its boss, other modes their mode. `stage` is the stage of the story (story.ts). */
export function tallyLine({ mode, boss = '', stage = 1 }: { mode: TallyMode; boss?: string; stage?: number }): string {
  if (mode === 'boss') return boss === 'ballast' && stage >= 6 ? BALLAST_LINE_6 : (BOSS_LINES[boss as (typeof BOSS_IDS)[number]] ?? '');
  return mode === 'bot' && stage >= 2 ? BOT_LINE_2 : MODE_LINES[mode];
}

/** Tally's line once the hero has entered every lair of the Open world (#1175): one line, no speech. `crew` is the crew attached. The clamp is open
 * from stage 7 of the story, the epilogue (#1546); the MCP server keeps no story and passes none: a world with every lair beaten has its clamp open. */
export const endingLine = (crew: number, stage = 7): string => `Variance noted. Clamp: ${stage >= 7 ? 'open' : 'locked'}. Crew attached: ${crew}.`;

/** Tally's line while some lairs of the Open world are beaten and not all (#1315): the seats on file out of the lairs, and one line of
 * lore (world.md section 2, what happened), which gives way to the open clamp from stage 7 (#1546). One line, no speech, nothing gated. */
export const ledgerLine = (filed: number, total: number, stage = 1): string => `Seats on file: ${filed} of ${total}. ${stage >= 7 ? 'Clamp: open.' : 'Slag-glass remembers heat.'}`;

/** Tally's ledger line of a town of the Open world (#1516, world.md section 13), by the town's index: the spawn town first, then the towns of the
 * forest, the tundra, the desert and the badlands. Towns hold the delivered, so each line comes with the stage that may speak of it: `townLine`
 * says nothing before it, and no line holds a secret word of a later stage (`tally.test.ts`). */
export const TOWN_LINES: readonly { stage: number; line: string }[] = [
  { stage: 2, line: 'Muster: table zero, laid. Seats: six. Counted, every one. Nobody here is hurt.' },
  { stage: 3, line: 'Muster: the pines. Residents entered as Out. They breathe, eat and wait.' },
  { stage: 4, line: 'Muster: the white field. Cold lets go. Residents entered as delivered, in good order.' },
  { stage: 4, line: 'Muster: the dunes. Residents arrive clear and dazed, no name on file. Entered: delivered.' },
  { stage: 5, line: 'Muster: the ridge. Line 0412 was first. The rest came after, one hand free each.' },
];

/** The ledger line of the town with this index, once the story is at its stage; '' before it, and for a town the table does not hold. */
export function townLine(index: number, stage: number): string {
  const town = TOWN_LINES[index];
  return town && stage >= town.stage ? town.line : '';
}
