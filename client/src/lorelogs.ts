// The lore of the story (docs/specs/world.md section 12): the entry a boss win shows, one per boss of the roster (#1589), and the logs the
// Open world holds, one per cell of the bridge's `world_logs` (docs/specs/openworld.md section 12). Data only, in Tally's register: terse,
// procedural, unsettling. Every entry carries its `stage` of the reveal ladder and holds no secret word of a later one (lorelogs.test.ts);
// a player beats the bosses in any order, so a boss entry stands alone and never reads as if an earlier reveal had happened. None of it is
// required to progress.
import { deckOf, type Deck } from './deck';
import { LORE } from './lore';

/** An entry of the story: a title and a body, shown in the terminal reader, and the stage of the reveal ladder it may speak of. */
export interface StoryEntry {
  id: string;
  title: string;
  body: string;
  stage: number;
}

/** What a boss win shows under the victory banner (200 characters at most). */
export interface BossLore extends StoryEntry {
  boss: string;
}

/** A log of the Open world (320 characters at most). `reread`: it carries the hint of a reread, which reads differently once the player knows. */
export interface WorldLog extends StoryEntry {
  reread: boolean;
}

const boss = (id: string, stage: number, title: string, body: string): BossLore => ({ id: `boss-${id}`, boss: id, stage, title, body });

/** One entry per boss, in the order of the roster (`BOSS_IDS` of tally.ts). The first five follow the ladder: The Echo at stage 2, The Hull at 4,
 * The Chaplain at 5, The Ballast Mind at 7 (the win that ends the main line); The Choir and the other ten stay at stage 3 or below. */
export const BOSS_LORE: readonly BossLore[] = [
  boss('echo', 2, 'Mess: the Echo', 'Seat: empty. The quartermaster gave every count back, turned around. It kept the house rule to the end: nobody is hurt on a board. Entered: the rule held.'),
  boss('hull', 4, 'Cargo: the Hull', 'Seat: empty. The frame split and the glass let the loadmaster go. Cold does that. Cargo is the word for what is delivered, and he is entered as delivered. Entered: warm.'),
  boss('choir', 3, 'Furnace: the Choir', 'Seat: empty. Three groups, one voice at a time, to the last watch. Ejected from the shift: nine. Heard past the rim, singing: nine. Entered as Out. Not entered as lost.'),
  boss('chaplain', 5, 'Chapel: the Chaplain', 'Seat: empty. The chaplain preached the shell as grace and delivery as theft. Line 0412 was delivered first, and woke clear in the dust. The cold took the rest. That line is you.'),
  boss('ballast', 7, 'Bridge: the Ballast Mind', 'Seat: empty. Tally cannot push a crewmate. It needs a clear hand. It entered itself as cargo and cannot deliver itself. Crew clear: one. The hand is free. The last seat is Tally.'),
  boss('alien', 2, 'Cargo: the Alien', 'Seat: empty. Something came up with the ore and bred while the count was open. Brood on file: seven, then more. It meant no harm. It was hungry, and the hold was warm.'),
  boss('railyard', 2, 'Cargo: the Rail Yard', 'Seat: empty. The freight ran on schedule, on rails laid for ore, not for crew. It stopped for nothing on the line. Entered: the line is clear. The schedule is not.'),
  boss('magnetizer', 2, 'Furnace: the Magnetizer', "Seat: empty. The lifting magnets woke by themselves. Charge against charge, they threw the crew apart, gently, by the ledger's measure. Entered: the poles are quiet. The pull is not."),
  boss('pulsar', 3, 'Bridge: the Pulsar', 'Seat: empty. Six beacons, one pulse at a time, across the board. Each pulse is a push no hand made. Tally did not choose them. Tally counted every one.'),
  boss('overseer', 3, 'Chapel: the Overseer', 'Seat: empty. The Chapel watch system guarded its cores and logged every move. A ship system, doing its role: watching the count. Its cores are burnt. Its log is filed, unanswered.'),
  boss('assembly', 2, 'Cargo: the Assembly Line', 'Seat: empty. Three belts carried the crew to the edge, and the presses stamped what stayed. Nothing here was cruel. It was throughput. The belts have stopped. The line has not.'),
  boss('core', 2, 'Furnace: the Unstable Core', 'Seat: empty. Charged marbles weighed more, for both sides, until they blew. Four and a marble is written off. Entered: the core is quiet. The heat is not.'),
  boss('dual', 3, 'Mess: the Dual Room', 'Seat: empty. Two galleys, a gap between. What went out of one room came back into the other, whole and breathing. Entered: Out is a door. Which room it opens on is not logged.'),
  boss('stalker', 2, 'Chapel: the Stalker', 'Seat: empty. It watched from the fog and let you come. It never pushed first. Entered: watched, not harmed. The ledger had no sight of the board. Someone did.'),
  boss('swarm', 3, 'Cargo: the Swarm', 'Seat: empty. Wave on wave, and no queen. The evac lifted with the clear crew aboard. Forty turns. Every marble you threw out brought it nearer. Entered: thrown out, not harmed.'),
];

const log = (id: string, stage: number, title: string, body: string, reread = false): WorldLog => ({ id: `log-${id}`, stage, title, body, reread });

/** Twelve logs, in the order of the cells of `world_logs`: log `k` lies in the sextant `k % 6` (meadow, forest, tundra, desert, badlands,
 * archipelago, `SEXTANTS` of world.rs), the first six near the spawn and the next six far from it. The near ones are stage 1 and 2, the far
 * ones stage 2 and 3. Three carry the hint of a reread. */
export const WORLD_LOGS: readonly WorldLog[] = [
  log('meadow-near', 1, 'Stake: the clearing', 'Survey stake, driven in by hand. Ground: grass, warm underfoot. Hollow grows no grass. Cause: not entered. Marbles in sight: none. Appended by TALLY: Claim: unworked.'),
  log('forest-near', 1, 'Stake: the pines', 'Survey stake in the wood. The pines are wire-thin and keep no needles. Black marbles stand between the rows, pulsing slow. They shelled here inside a single shift. Keep moving. A warm hand is a hand they take.'),
  log('tundra-near', 1, 'Stake: the snow', 'Survey stake, iced over. Snow falls here and nowhere else on Hollow. Prints lead in, bare and round. One set leads out, a clear boot. Crew clear: one. Free hands: one. Needed: one. Appended by TALLY: Count open.', true),
  log('desert-near', 2, 'Stake: the dunes', 'Survey stake, half under sand. A loader scratched it: the board is kinder than the corridor. Ask Tally. Tally has never once chosen the push. Beneath, ruled neat. Disputes this week: 41. Games: 41. Wounds: 0.'),
  log('badlands-near', 2, 'Stake: the ridge', 'Survey stake on a ridge of slag. A hand is pressed into the glass and kept, fingers spread. Beside it a second, smaller. Held together. Ledger: two crew. Condition: unchanged. The ledger enters them as held.', true),
  log('archipelago-near', 2, 'Stake: the first island', 'Survey stake on a spit of sand, reached by boat. Boat 6, tied, oars shipped. Under the seat, a ruled card: They do not want to hurt you. They are slow, and they are scared. Play them, and go. Appended by TALLY: Rule kept.'),
  log('meadow-far', 2, 'Stake: the old camp', 'Tents in rows. Every bunk made. Every bunk holds a round black stone, tucked under the blanket to the chin. Somebody did this carefully, many times. Appended by TALLY: Care entered. Nobody is to move them.'),
  log('forest-far', 3, 'Stake: the deep pines', 'Ejected from the board this week: twelve. Counted at the rim after: twelve. Counted again at dawn: twelve, standing. Tally files them under Out. Out is a place, not a state. Do not ask Tally where.'),
  log('tundra-far', 3, 'Stake: the white field', 'Prints in the snow lead away from the rim of a board, bare, round, evenly spaced. Whoever went over the edge here got up and walked. Tally logged them: gone for good. Underlined once. Gone from what, it did not say.', true),
  log('desert-far', 3, 'Stake: the glassed crater', 'A crater, glassed, the size of a table. A body is pressed into it, not crushed, curled as in sleep. The glass is warm. The chest moves, if that word applies. The ledger has no word for it yet. Nobody is to stand on it.'),
  log('badlands-far', 3, 'Stake: the cracked plate', 'Survey stake, cracked. Scratched under the plate: the ones thrown out can talk. I heard Imre this morning. He said the sky is very large. He said he is fine. The crew wrote it down as a rumour. Tally wrote it down as fact.'),
  log('archipelago-far', 3, 'Stake: the last island', 'Survey stake on the last island of the chain. A boat lies beached, empty. Nobody drowned. Everyone walked inland in a line, and the line is still moving. Appended by TALLY: Crew, eleven. In good order.'),
];

/** The entries of the story, the bosses then the logs of the world: the log archive lists the ones read after the terminals. */
export const STORY: readonly StoryEntry[] = [...BOSS_LORE, ...WORLD_LOGS];

/** The entry a win over `boss` shows, none for a boss the roster does not hold. */
export const bossLore = (boss: string): BossLore | undefined => BOSS_LORE.find((e) => e.boss === boss);

/** The entry of the terminal reader with this id, a terminal of a deck or an entry of the story. */
export const entryOf = (id: string): Pick<StoryEntry, 'id' | 'title' | 'body'> | undefined => LORE.find((e) => e.id === id) ?? STORY.find((e) => e.id === id);

/** The deck whose audio log goes with an entry: a terminal's own, the deck a boss sat on; none for a log of the world. */
export function audioDeckOf(id: string): Deck | null {
  const boss = BOSS_LORE.find((e) => e.id === id);
  return LORE.find((e) => e.id === id)?.deck ?? (boss ? deckOf('boss', boss.boss) : null);
}
