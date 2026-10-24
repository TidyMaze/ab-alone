// End-of-game banner (#282): from the result, the draw reason, the mode and the viewer's side to the
// banner texts and the animation id the page puts in `body[data-over]`. Pure, so every combination is
// unit tested. Texts are short, in TALLY's accounting tone (world.md section 2).
import { sideName } from './glass';

export type EndMode = 'local' | 'bot' | 'boss' | 'online';
export type EndAnim = 'win' | 'loss' | 'draw';

export interface EndInput {
  status: number; // 0 running, 1 Black wins, 2 White wins, 3 draw
  reason: number; // draw reason: 1 threefold repetition, 2 anti-stalling (engine draw_reason)
  win: number; // ejections the winner needed (6, 10 for the player against the Choir)
  mode: EndMode;
  side: number; // the viewer's side: 1 Black, 2 White, 0 both or none (hot-seat, spectator)
  glass: number; // the side wearing the pale glass, named White (sideName)
}

export interface EndBanner {
  title: string;
  line: string; // the reason
  anim: EndAnim;
}

export function endBanner({ status, reason, win, mode, side, glass }: EndInput): EndBanner | null {
  if (status === 0) return null;
  const boss = mode === 'boss';
  if (status === 3) {
    // The plate may not grow over the board (phone-layout e2e): the boss line fits one line of the plate.
    if (boss) return { title: 'Defeat', line: reason === 2 ? '100 plies idle: a defeat.' : 'Repeated 3 times: a defeat.', anim: 'loss' };
    const what = reason === 2 ? '100 plies, nothing ejected. Tally calls it even.' : 'Same position three times. Tally closes the page.';
    return { title: 'Draw', line: what, anim: 'draw' };
  }
  if (side === 0) return { title: `${sideName(status, glass)} wins`, line: `${win} out. The books balance.`, anim: 'win' };
  if (status === side) {
    return boss
      ? { title: 'Victory', line: `${win} out. The seat is empty.`, anim: 'win' }
      : { title: 'You win', line: `${win} out. The books balance.`, anim: 'win' };
  }
  return boss
    ? { title: 'Defeat', line: `${win} out. The seat holds.`, anim: 'loss' }
    : { title: 'You lose', line: `${win} out. Tally strikes your name.`, anim: 'loss' };
}
