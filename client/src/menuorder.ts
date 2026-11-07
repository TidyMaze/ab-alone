// The order of the mode menu for a fresh profile (#1612, Decision #1513, docs/specs/openworld.md section 13): the Open world is the
// map of the whole game, so a profile that has never played sees it first. A profile with a saved game or a boss beaten keeps the
// menu it has.

/** Whether the Open world leads the mode menu: a profile with no saved game and no boss beaten is fresh. */
export const openWorldLeads = (saved: boolean, beaten: number): boolean => !saved && beaten === 0;
