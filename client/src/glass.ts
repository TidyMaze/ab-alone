/**
 * The side that wears the player's smoked glass (world.md section 5), every other side the enemy shell.
 * Against the bot and in boss fights the human plays Black (1). Hot-seat and online keep White (2): the
 * spec does not pick a side for them yet (#286).
 */
export const glassSide = ({ online, bot, fight }: { online: boolean; bot: boolean; fight: boolean }): number =>
  !online && (bot || fight) ? 1 : 2;
