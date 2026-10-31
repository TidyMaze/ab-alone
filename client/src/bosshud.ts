// Boss block of the HUD: name, phase notches, goal, daily line, tell, result. Draws under the turn plate
// in encounter mode.

export interface BossHud {
  phase: number; // 0 is P1
  phases: number;
  result: number; // 0 playing, 1 won, 2 lost (a draw is a loss)
  goal?: string; // the boss goal, '' when there is none or when it is folded away
  tell?: string; // flat fallback of the boss tell on the board, '' when there is none
  daily?: string; // the daily challenge line of a daily fight, '' otherwise
}

/** The goal line shows before the first move, then only while the Goal control has it open. */
export const goalShown = (plies: number, open: boolean): boolean => plies === 0 || open;

const RESULT_TEXT = ['', 'Victory', 'Defeat'];

const escape = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function bossHtml({ phase, phases, result, goal = '', tell = '', daily = '' }: BossHud): string {
  const notches = Array.from(
    { length: phases },
    (_, i) => `<span class="notch${i === phase ? ' active' : ''}">P${i + 1}</span>`,
  ).join('');
  const outcome = result === 0 ? '' : `<div class="result">${RESULT_TEXT[result]}</div>`;
  const told = tell === '' ? '' : `<div class="tell">${escape(tell)}</div>`;
  const aim = goal === '' ? '' : `<div class="goal">Goal: ${escape(goal)}</div>`;
  const day = daily === '' ? '' : `<div class="daily">${escape(daily)}</div>`;
  return `<div class="boss"><div class="notches">${notches}</div>${aim}${day}${told}${outcome}</div>`;
}
