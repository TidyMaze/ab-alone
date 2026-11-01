// HUD plate markup, see docs/specs/ui.md section 4. The turn and score strings are read by the
// e2e tests: keep them verbatim.
import type { EndBanner } from './endbanner';
import { sideName } from './glass';
import { outOf } from './score';
import type { OnlineStatus } from './presence';

export interface HudState {
  side: number; // the side to move
  status: number; // 0 running, 1 side 1 wins, 2 side 2 wins, 3 draw
  glass: number; // the side wearing the pale glass, named White (sideName)
  score: string; // formatScore output
  ejected: readonly [number, number];
  win: readonly [number, number]; // ejections each side needs: one pip each
  note: string;
  online?: OnlineStatus; // online games only: own color and the opponent's presence
  end?: EndBanner; // once over: the end banner (#282), replaces the turn line text
  rematch?: string; // online games only, once over: who asked for a rematch (rematchText)
  tally?: string; // Tally's line at the start of a match, '' or absent once the first move is made (#294)
  was?: readonly [number, number]; // the ejected counts of the last render: a pip newly out moves once (#1095)
  turn?: string; // co-op, a human ply: Your turn or Partner's turn (coopTurn) in place of "Black to move" (#530)
}

/** A side's marble colour, for its row of pips (#1038): the side wearing the pale glass is White, the others Black. */
const marble = (side: number, glass: number): string => (side === glass ? 'pale' : 'dark');

const pips = (out: number, slots: number, was = out): string =>
  Array.from({ length: Math.max(slots, out) }, (_, i) => `<span class="pip${i < out ? ' out' : ''}${i >= was && i < out ? ' fresh' : ''}"></span>`).join('');

export function hudHtml({ side, status, glass, score, ejected, win, note, online, rematch, end, tally = '', turn: ply, was }: HudState): string {
  const over = status !== 0;
  const turn = end ? end.title : over ? (status === 3 ? 'Draw' : `${sideName(status, glass)} wins`) : (ply ?? `${sideName(side, glass)} to move`);
  const marker = `<span class="marker ${over ? 'over' : side === 1 ? 'black' : 'white'}" aria-hidden="true"></span>`;
  return (
    `<div class="turn">${marker}<span>${turn}</span></div>` +
    (tally ? `<div class="tally">${tally}</div>` : '') +
    (end
      ? `<div class="end" data-anim="${end.anim}">${end.line}</div>`
      : '') +
    (online ? `<div class="presence ${online.tone}">${online.text}</div>` : '') +
    (rematch ? `<div class="rematch">${rematch}</div>` : '') +
    `<div class="score">${score}</div>` +
    `<div class="pips" aria-hidden="true"><span class="${marble(1, glass)}">${pips(ejected[0], win[0], was?.[0])}</span><span class="${marble(2, glass)}">${pips(ejected[1], win[1], was?.[1])}</span></div>` +
    `<small>${note}</small>`
  );
}

export interface FlatHud {
  side: number;
  status: number;
  glass: number;
  ejected: readonly [number, number];
  win: readonly [number, number];
  boss?: { phase: number; phases: number; tell: string }; // boss fights only: the phase (0 is the first) and the tell text
}

/** The flat HUD fallback (#391, world.md section 6 rule 8): every game-critical value as text, one line each. */
export function flatHudHtml({ side, status, glass, ejected, win, boss }: FlatHud): string {
  const lines = [
    status === 0 ? `Turn: ${sideName(side, glass)}` : 'Turn: game over',
    `Ejected: ${sideName(1, glass)} ${outOf(ejected[0], win[0])}, ${sideName(2, glass)} ${outOf(ejected[1], win[1])}`,
  ];
  if (boss) lines.push(`Boss phase: ${boss.phase + 1} of ${boss.phases}`, `Tell: ${boss.tell || 'none'}`);
  return `<div class="flat">${lines.map((line) => `<div>${line}</div>`).join('')}</div>`;
}
