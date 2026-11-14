// The notice board of the Hub (#1528, docs/specs/ui.md section 4.5): a card with today's daily and its status, the next boss, the medals still missing
// and the local daily streak. Pure text, in Tally's flat register: plain short words, a fact and no remark, no secret word of the story ladder
// (world.md section 12.2, `hubboard.test.ts` checks every state against `SECRETS`). A streak that is broken shows no line.
import { dailyRecord, dailyStreak, type DayRecord } from './daily';
import { nextBossTitle } from './hubview';
import type { Medals } from './medals';
import type { Store } from './quality';
import { BOSS_IDS } from './tally';

export interface BoardState {
  /** Today's daily boss, by name. */
  boss: string;
  /** How the daily of today went, null when it is not played. */
  record: DayRecord | null;
  /** The first boss not beaten, in deck order, null when none is left. */
  next: string | null;
  /** The bosses of the roster without a medal. */
  missing: number;
  /** The days in a row a daily was played, 0 when the streak is broken. */
  streak: number;
}

const turns = (n: number): string => `${n} turn${n === 1 ? '' : 's'}`;
const STATUS = {
  won: ({ turns: n }: DayRecord) => `Won in ${turns(n)}.`,
  lost: ({ turns: n }: DayRecord) => `Lost in ${turns(n)}.`,
  started: () => 'Started, not finished.',
};

/** The four lines of the board; the streak is '' when there is none. */
export function boardLines({ boss, record, next, missing, streak }: BoardState, waiting = false): { daily: string; next: string; medals: string; streak: string } {
  return {
    daily: `Daily: ${boss}. ${record ? STATUS[record.result](record) : 'Not played.'}`,
    next: waiting ? 'Next: win your first game vs the bot.' : `Next boss: ${next ?? 'none left'}.`, // until the first win (#1665) the boss is not the next thing
    medals: `Medals missing: ${missing === 0 ? 'none' : missing}.`,
    streak: streak === 0 ? '' : `Streak: ${streak} day${streak === 1 ? '' : 's'}.`,
  };
}

/** The card: its title and the lines in a list, the streak left out when there is none. A phone keeps the daily and the streak (ui.css). */
export function boardHtml(state: BoardState, waiting = false): string {
  const { daily, next, medals, streak } = boardLines(state, waiting);
  const rows = [['daily', daily], ['next', next], ['medals', medals], ['streak', streak]] as const;
  return `<h2>Notice board</h2><ul>${rows.filter(([, text]) => text).map(([name, text]) => `<li class="${name}">${text}</li>`).join('')}</ul>`;
}

/** The card of `day`, today, from what the player has done: the daily's `boss` and how it went, the next boss of the `beaten` ones, the roster's bosses with no medal, the streak. */
export const noticeBoard = (store: Store, day: string, boss: string, beaten: readonly string[], medals: Medals, waiting = false): string =>
  boardHtml(
    {
      boss,
      record: dailyRecord(store, day),
      next: nextBossTitle(beaten),
      missing: BOSS_IDS.filter((id) => medals[id] === undefined).length,
      streak: dailyStreak(store, day),
    },
    waiting,
  );
