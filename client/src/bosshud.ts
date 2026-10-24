// Boss block of the HUD: name, phase notches, daily line, tell, result. Draws under the turn plate in
// encounter mode.

export interface BossHud {
  name: string;
  phase: number; // 0 is P1
  phases: number;
  result: number; // 0 playing, 1 won, 2 lost (a draw is a loss)
  tell?: string; // flat fallback of the boss tell on the board, '' when there is none
  daily?: string; // the daily challenge line of a daily fight, '' otherwise
}

const RESULT_TEXT = ['', 'Victory', 'Defeat'];

const escape = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function bossHtml({ name, phase, phases, result, tell = '', daily = '' }: BossHud): string {
  const notches = Array.from(
    { length: phases },
    (_, i) => `<span class="notch${i === phase ? ' active' : ''}">P${i + 1}</span>`,
  ).join('');
  const outcome = result === 0 ? '' : `<div class="result">${RESULT_TEXT[result]}</div>`;
  const told = tell === '' ? '' : `<div class="tell">${escape(tell)}</div>`;
  const day = daily === '' ? '' : `<div class="daily">${escape(daily)}</div>`;
  return `<div class="boss"><strong>${escape(name)}</strong><div class="notches">${notches}</div>${day}${told}${outcome}</div>`;
}
