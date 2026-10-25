/**
 * The side that wears the player's smoked glass (world.md section 5), every other side the enemy shell.
 * Against the bot and in boss fights the human plays side 1. Hot-seat and online keep side 2: the
 * spec does not pick a side for them yet (#286).
 */
export const glassSide = ({ online, bot, fight }: { online: boolean; bot: boolean; fight: boolean }): number =>
  !online && (bot || fight) ? 1 : 2;

/** The colour word of a side: the side wearing the pale glass is White, the enemy shell is Black. */
export const sideName = (side: number, glass: number): string => (side === glass ? 'White' : 'Black');
