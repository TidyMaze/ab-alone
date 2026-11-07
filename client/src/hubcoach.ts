// The first minutes in the Hub (#1522, docs/specs/ui.md sections 4.5 and 4.7): a coach line that says how to move, which goes once the player
// rolled, and a one-tap confirm the first time a mode is entered from the Hub. Pure data and functions: main.ts shows the plates. Stage 1
// of the story (world.md section 12.2): no secret word, White and Black as the HUD says.
import type { Deck } from './deck';
import type { Door } from './hub';
import { bossTitle, roomLabel } from './hubview';
import { read, write, type Store } from './quality';

const COACH_KEY = 'ab-alone.hubcoach';
const ENTERED_KEY = 'ab-alone.entered';

/** The one lesson of the roll (#1604): the Hub's coach line and the Open world's controls both say it, until the player rolled once in either. */
export const WALK_LESSON = 'Tap or click a next cell to roll. The arrow keys or the stick do the same.';
export const HUB_COACH = WALK_LESSON;

/** Whether the coach line and the confirm are on: for a player, and in an automated browser (every e2e spec boots in one) only when
 * `?firstrun` asks for a player's first launch, so the specs that walk into rooms boot as before. */
export const hubHelpOn = (search: string, automated: boolean): boolean => !automated || new URLSearchParams(search).has('firstrun');

/** The coach line shows until the player rolled once (`markHubCoachDone`), never to one who beat a boss. */
export const hubCoachDue = (store: Store, beaten: readonly string[]): boolean => beaten.length === 0 && walkLessonDue(store);
/** The lesson of the roll is due until the player rolled once, in the Hub or the Open world (the one key, `ab-alone.hubcoach`). */
export const walkLessonDue = (store: Store): boolean => read(store, COACH_KEY) !== 'done';
export const markHubCoachDone = (store: Store): void => write(store, COACH_KEY, 'done');

/** The confirm asks until the player entered a mode once (`markEntered`), never a returning player who beat a boss. */
export const entryConfirmDue = (store: Store, beaten: readonly string[]): boolean => beaten.length === 0 && read(store, ENTERED_KEY) !== 'yes';
export const markEntered = (store: Store): void => write(store, ENTERED_KEY, 'yes');

/** Whether rolling onto the room starts a mode: a lift, a terminal and the Medal room start none (the reader opens and Esc leaves it). */
export const needsConfirm = (door: Door): boolean => door.kind !== 'lift' && door.kind !== 'terminal' && door.kind !== 'medals';

/** The name the confirm gives the mode: a boss by its name, else the plate's own name and its plain line (#1547), so the one tap still says what it starts. */
export const entryName = (deck: Deck, door: Door): string => {
  if (door.kind === 'boss') return bossTitle(door.boss);
  const { name, state } = roomLabel(deck, door, []);
  return `${name} (${state})`;
};
