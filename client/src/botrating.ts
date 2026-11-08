// The bot's estimated rating and level (#1611, docs/specs/roguelite.md section 32), and how its strength grows: with the bosses beaten
// in a plain game, and along a rogue-lite run. Pure: the page asks it for numbers.
//
// The rating comes from self-play between search budgets (crates/edgefall-core/examples/bot_rating.rs): a doubling of the budget is
// worth RATING_PER_DOUBLING points. Only that difference is measured. The absolute number is a decision: the plain bot at BOT_NODES
// (bot.ts) is ANCHOR_RATING, the starting rating of Board Game Arena, where no Abalone average is published. So every rating is an
// estimate, and not comparable with the Ranked rating (elo.ts), which has its own scale.

import { DIFFICULTY_PERCENT, type Difficulty } from './difficulty';

/** The search budget that is the anchor, BOT_NODES of bot.ts (a test keeps the two equal). */
const ANCHOR_NODES = 20000;
export const ANCHOR_RATING = 1500;
/** Rating points a doubling of the search budget is worth, the slope of a line fitted to the measured ladder (section 32). */
export const RATING_PER_DOUBLING = 65;

/** The estimated rating of a bot that searches `nodes` positions, to the nearest ten. */
export function ratingOfBudget(nodes: number): number {
  const rating = ANCHOR_RATING + RATING_PER_DOUBLING * Math.log2(Math.max(1, nodes) / ANCHOR_NODES);
  return Math.round(rating / 10) * 10;
}

/** The levels of the bot and the rating each starts at. */
export const BOT_LEVELS = [
  { name: 'Easy', from: 0 },
  { name: 'Normal', from: 1300 },
  { name: 'Hard', from: 1600 },
  { name: 'Very hard', from: 1800 },
  { name: 'Master', from: 2000 },
] as const;

export type BotLevel = (typeof BOT_LEVELS)[number]['name'];

export const levelOfRating = (rating: number): BotLevel => BOT_LEVELS.filter((l) => l.from <= rating).pop()!.name;

const lineOf = (who: string, nodes: number): string => {
  const rating = ratingOfBudget(nodes);
  return `${who} ~${rating} · ${levelOfRating(rating)}`;
};

/** What the HUD shows for the bot: `Bot ~1340 · Normal`. */
export const botLine = (nodes: number): string => lineOf('Bot', nodes);

/** What the HUD shows for a boss, from its own search budget: `Boss ~1650 · Hard`. */
export const bossLine = (nodes: number): string => lineOf('Boss', nodes);

/** The tooltip of the line: what the number is and is not. */
export const BOT_NOTE =
  'An estimate, from games between bots of different search strengths: the plain bot is set at 1500. It is not your Ranked rating, which is on another scale. A boss has rules of its own that are not in it: it counts the search only.';

/** The bot's search in a plain game, as a percent of BOT_NODES, by the bosses beaten (the medals, 0 to 15): from 200 positions, the bottom of
 * Easy, geometrically to 60000, the 300 % of the fourth act's boss. Master (2000) would need over four million. */
export const PROGRESS_PERCENT: readonly number[] = [1, 1.5, 2.1, 3.1, 4.6, 6.7, 9.8, 14.3, 21, 30.6, 44.8, 65.5, 95.8, 140, 205, 300];

/** The search budget of the bot after `medals` bosses beaten, from `base` (BOT_NODES), times the difficulty setting (50, 100 or 200 %). */
export function progressBudget(base: number, difficulty: Difficulty, medals: number): number {
  const percent = PROGRESS_PERCENT[Math.min(PROGRESS_PERCENT.length - 1, Math.max(0, medals))]!;
  return Math.max(1, Math.round((base * percent * DIFFICULTY_PERCENT[difficulty]) / 10000));
}

/** What a run's first fight searches, as a percent of the peak. */
export const RUN_START_PERCENT = 25;

/** The bot of a run as a percent of its peak at `t`, 0 for the first fight to 1 for the last ones, geometrically. */
export const runPercent = (t: number): number => Math.round(RUN_START_PERCENT * (100 / RUN_START_PERCENT) ** Math.min(1, Math.max(0, t)));
