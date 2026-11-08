// The HUD subtitle at the start of a match (#1568): who plays and the goal, in plain words. The turn, the score and the
// ejected count already have their place on the plate (ui.md section 4), so this line names neither. Tally's flavour
// line of the story is not shown here any more; it still goes to the ledger (sawLines).

/** One line per match mode: the player's opponent, then the ejections to win. The bot's level is not named here: the rating in the
 * pips row says it (#1611), on its own scale, and a second name ("normal" beside "Easy") would contradict it. */
export function matchLine({ mode, win }: { mode: 'local' | 'bot' | 'online' | 'run' | 'trainer'; win: number }): string {
  const goal = `Eject ${win} to win.`;
  if (mode === 'bot') return `You vs Bot. ${goal}`;
  if (mode === 'trainer') return `Trainer vs Bot. ${goal}`;
  if (mode === 'run') return `Rogue-lite fight vs Bot. ${goal}`;
  if (mode === 'online') return `You vs your opponent, online. ${goal}`;
  return `Two players, one board. ${goal}`;
}
