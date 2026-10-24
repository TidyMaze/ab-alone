// HUD plate markup, see docs/specs/ui.md section 4. The turn and score strings are read by the
// e2e tests: keep them verbatim.
import type { EndBanner } from './endbanner';
import { sideName } from './glass';
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
}

const pips = (out: number, slots: number): string =>
  Array.from({ length: slots }, (_, i) => `<span class="pip${i < out ? ' out' : ''}"></span>`).join('');

export function hudHtml({ side, status, glass, score, ejected, win, note, online, rematch, end }: HudState): string {
  const over = status !== 0;
  const turn = end ? end.title : over ? (status === 3 ? 'Draw' : `${sideName(status, glass)} wins`) : `${sideName(side, glass)} to move`;
  const marker = `<span class="marker ${over ? 'over' : side === 1 ? 'black' : 'white'}" aria-hidden="true"></span>`;
  return (
    `<div class="turn">${marker}<span>${turn}</span></div>` +
    (end
      ? `<div class="end" data-anim="${end.anim}">${end.line}</div>`
      : '') +
    (online ? `<div class="presence ${online.tone}">${online.text}</div>` : '') +
    (rematch ? `<div class="rematch">${rematch}</div>` : '') +
    `<div class="score">${score}</div>` +
    `<div class="pips" aria-hidden="true"><span>${pips(ejected[0], win[0])}</span><span>${pips(ejected[1], win[1])}</span></div>` +
    `<small>${note}</small>`
  );
}
