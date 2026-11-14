// Difficulty setting for AI bot and boss encounters (#704). Scales the search budget
// relative to the baseline configuration (BOT_NODES / boss node_budget).
// Persisted in localStorage under 'ab-alone.difficulty'.

export type Difficulty = 'easy' | 'normal' | 'hard';

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];

export const DIFFICULTY_PERCENT: Record<Difficulty, number> = {
  easy: 50,
  normal: 100,
  hard: 200,
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: '50%',
  normal: '100%',
  hard: '200%',
};

/** When the tells that need a hover show (#1538): the Echo's bonus and the Chaplain's flips, drawn with a move hovered. Easy shows
 * them for every move of the selected marble, hard never. The other bosses' tells are always on the board: only the budget moves. */
export type TellMode = 'always' | 'hover' | 'never';

export const TELL_MODE: Record<Difficulty, TellMode> = {
  easy: 'always',
  normal: 'hover',
  hard: 'never',
};

/** The line of the difficulty control: what each level changes. */
export const DIFFICULTY_NOTES: Record<Difficulty, string> = {
  easy: 'Easy: half the boss search; hover tells always on.',
  normal: 'Normal: full boss search; hover tells on hover.',
  hard: 'Hard: double the boss search; hover tells off.',
};

/** Cycles through difficulty options: Easy -> Normal -> Hard -> Easy. */
export const nextDifficulty = (current: Difficulty): Difficulty =>
  current === 'easy' ? 'normal' : current === 'normal' ? 'hard' : 'easy';

export type Store = Pick<Storage, 'getItem' | 'setItem'> | null;

/** Reads difficulty from storage, defaulting to 'easy' (#1664). */
export function readDifficulty(storage: Store): Difficulty {
  try {
    const value = storage?.getItem('ab-alone.difficulty');
    return value === 'normal' || value === 'hard' ? value : 'easy';
  } catch {
    return 'easy';
  }
}

/** Saves difficulty to storage. */
export function writeDifficulty(storage: Store, difficulty: Difficulty): void {
  try {
    storage?.setItem('ab-alone.difficulty', difficulty);
  } catch {
    // Storage blocked: setting lasts for this session.
  }
}

/** Scales a baseline node budget by the given difficulty setting. Minimum budget is 1. */
export function scaleBudget(baseline: number, difficulty: Difficulty): number {
  return Math.max(1, Math.round((baseline * DIFFICULTY_PERCENT[difficulty]) / 100));
}
