// End-of-game banner (#282): from the result, the draw reason, the mode and the viewer's side to the
// banner texts and the animation id the page puts in `body[data-over]`. Pure, so every combination is
// unit tested. Texts are short, in TALLY's accounting tone (world.md section 2).

export type EndMode = 'local' | 'bot' | 'boss' | 'online';
export type EndAnim = 'win' | 'loss' | 'draw';

export interface EndInput {
  status: number; // 0 running, 1 Black wins, 2 White wins, 3 draw
  reason: number; // draw reason: 1 threefold repetition, 2 anti-stalling (engine draw_reason)
  win: number; // ejections the winner needed (6, 10 for the player against the Choir)
  mode: EndMode;
  side: number; // the viewer's side: 1 Black, 2 White, 0 both or none (hot-seat, spectator)
}

export interface EndBanner {
  title: string;
  line: string; // the reason
  next: string; // the one action offered, '' when there is none
  anim: EndAnim;
}

const NEXT: Record<EndMode, string> = {
  local: 'New game to play again.',
  bot: 'New game to play again.',
  boss: 'Retry to fight again.',
  online: 'Rematch to play again.',
};

export function endBanner({ status, reason, win, mode, side }: EndInput): EndBanner | null {
  if (status === 0) return null;
  const next = mode === 'online' && side === 0 ? '' : NEXT[mode];
  const boss = mode === 'boss';
  if (status === 3) {
    const what = reason === 2 ? '100 plies, nothing ejected' : 'Same position three times';
    if (boss) return { title: 'Defeat', line: `${what}. A draw is a defeat here.`, next, anim: 'loss' };
    const tail = reason === 2 ? 'Tally calls it even.' : 'Tally closes the page.';
    return { title: 'Draw', line: `${what}. ${tail}`, next, anim: 'draw' };
  }
  if (side === 0) return { title: `${status === 1 ? 'Black' : 'White'} wins`, line: `${win} out. The books balance.`, next, anim: 'win' };
  if (status === side) {
    return boss
      ? { title: 'Victory', line: `${win} out. The seat is empty.`, next, anim: 'win' }
      : { title: 'You win', line: `${win} out. The books balance.`, next, anim: 'win' };
  }
  return boss
    ? { title: 'Defeat', line: `${win} out. The seat holds.`, next, anim: 'loss' }
    : { title: 'You lose', line: `${win} out. Tally strikes your name.`, next, anim: 'loss' };
}
