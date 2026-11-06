// The names of the Hub's doors and terminals and of the Open world's towns and gates (#1547, docs/specs/ui.md section 4.5): a name of the ship, and under it a short
// plain line that says what the door does, so a new player still understands at a glance. One table, one fallback. Pure data. Every name uses a place or a word of
// docs/specs/world.md already (the Mess, the ledger, the clamp, table zero, the mining cuts, the muster points) and holds no secret word of the story (world.md
// section 12.2): none depends on the stage, and `doorlabels.test.ts` checks every one against `SECRETS` at every stage.

/** The `name` on the plate, the plain `line` under it, and the `short` label a phone shows alone. */
export interface Label {
  name: string;
  line: string;
  short: string;
}

/** What a door with no name of its own wears, never an empty plate. */
export const FALLBACK: Label = { name: "Ship's door", line: 'a room of the Ballast', short: 'Door' };

/** The rooms that start a mode or open the Medal room, by their `Door` kind (a boss door and a lift are named by `roomLabel`). */
export const MODE_LABELS: Readonly<Record<string, Label>> = {
  hotseat: { name: 'Crew table', line: '2 players, one screen', short: 'Hot-seat' },
  bot: { name: 'House table', line: "play the ship's bot", short: 'Bot' },
  online: { name: 'Comms desk', line: '1v1 online match', short: 'Online' },
  royale: { name: 'Arena', line: 'battle royale', short: 'Royale' },
  medals: { name: 'Medal wall', line: 'medals and best turns', short: 'Medals' },
  daily: { name: 'Morning count', line: 'the boss of the day', short: 'Daily' },
  run: { name: 'Mining cut', line: 'rogue-lite run, 3 acts', short: 'Run' },
  together: { name: 'Shift crew', line: 'co-op against a boss', short: 'Co-op' },
  ranked: { name: 'Clamp list', line: 'ranked 1v1 online', short: 'Ranked' },
  world: { name: 'Airlock', line: 'walk the open world', short: 'World' },
  trainer: { name: 'Table zero', line: 'drill: waves of the bot', short: 'Trainer' },
};

const LOG = 'read the log';
/** The terminals, by the id of the lore entry they open: the first words of the entry's own title (lore.ts). */
export const TERMINAL_LABELS: Readonly<Record<string, Label>> = {
  'mess-house-rule': { name: "Captain's order", line: LOG, short: 'Order' },
  'mess-corner-table': { name: 'Galley log', line: LOG, short: 'Galley' },
  'cargo-assay': { name: 'Assay note', line: LOG, short: 'Assay' },
  'cargo-loadmaster': { name: "Loadmaster's log", line: LOG, short: 'Loadmaster' },
  'furnace-power': { name: 'Maintenance tag', line: LOG, short: 'Tag' },
  'furnace-watch-song': { name: 'Locker door', line: LOG, short: 'Locker' },
  'chapel-door': { name: 'Chapel notice', line: LOG, short: 'Notice' },
  'chapel-sermon': { name: 'Sermon notes', line: LOG, short: 'Sermon' },
  'bridge-clamp': { name: 'Clamp notice', line: LOG, short: 'Clamp notice' },
  'bridge-last-orders': { name: "Captain's console", line: LOG, short: 'Console' },
};

/** The signs of the Open world's places that open the Hub and the run (a tower wears its boss's name). */
export const PLACE_LABELS: Readonly<Record<'town' | 'dungeon', Label>> = {
  town: { name: 'Muster point', line: 'the Hub', short: 'Muster' },
  dungeon: { name: 'Mining cut', line: 'Rogue-lite run', short: 'Cut' },
};

/** The label of a room of kind `kind`, the fallback when none is named. */
export const modeLabel = (kind: string): Label => MODE_LABELS[kind] ?? FALLBACK;

/** The label of the terminal that opens lore entry `lore`, the fallback when none is named. */
export const terminalLabel = (lore: string): Label => TERMINAL_LABELS[lore] ?? FALLBACK;

/** What the sign of a place says: a tower its boss (`boss`), a town and a gate their name and the mode they open. */
export function placeSign(kind: 'tower' | 'town' | 'dungeon', boss: string): string {
  if (kind === 'tower') return boss || FALLBACK.name;
  const { name, line } = PLACE_LABELS[kind];
  return `${name} · ${line}`;
}
