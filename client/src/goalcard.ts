// The goal card of The Echo (#1524, docs/specs/ui.md section 4.8): two short steps and a picture of the game's marbles, in place of the boss's one long
// goal line. It shows in the HUD before the first move and in the Goal sheet after it. Later bosses keep their line. Pure data: main.ts shows it.
// The picture uses flat colours, with no gradient id: an id of another inline picture (the guide's) may sit in a hidden dialog, where it paints nothing.

/** The two steps: how the fight is won and lost, then what the Echo does, in the words of the HUD (White, Black, eject). */
export const ECHO_STEPS = [
  'Eject 6 Black marbles to win; a draw loses.',
  'Moves are mirrored for free: take the ringed mirror, then play your own.',
] as const;

const AMBER = '#ffb000';
const cell = (x: number): string => `<circle cx="${x}" cy="22" r="15" fill="#0f1214" stroke="#3a4248"/>`;
const marble = (x: number, side: 'white' | 'black', ghost = false): string =>
  `<circle cx="${x}" cy="22" r="12" fill="${side === 'white' ? '#e9e4d6' : '#3b4147'}" stroke="${ghost ? AMBER : '#8f8a7e'}" stroke-width="${ghost ? 2 : 1.5}"${ghost ? ' stroke-dasharray="4 3"' : ''}/>`;

// White rolls a line of three on the left of the mirror line, and the Echo's marbles stand in the point-symmetric cells on the right, dashed in amber:
// the free move. A thin strip: the plate of the HUD has room for a few lines, no more (the HUD covers no cell, phone-layout.spec.ts).
const WHITE = [24, 58, 92];
const MIRROR = [168, 202, 236];
const PICTURE =
  '<svg viewBox="0 0 260 44" aria-hidden="true" focusable="false">' +
  '<rect x="1" y="1" width="258" height="42" rx="6" fill="#1b2023" stroke="#4a5258"/>' +
  `<path d="M130 4V40" stroke="${AMBER}" stroke-width="2" stroke-dasharray="5 4"/>` +
  [...WHITE, ...MIRROR].map(cell).join('') +
  WHITE.map((x) => marble(x, 'white')).join('') +
  MIRROR.map((x) => marble(x, 'black', true)).join('') +
  '</svg>';

/** The card of the boss `id`: its two steps as an ordered list under the picture, or '' for a boss with no card, which keeps its goal line. */
export const goalCardHtml = (id: string | undefined): string =>
  id === 'echo' ? `${PICTURE}<ol class="goal-steps">${ECHO_STEPS.map((step) => `<li>${step}</li>`).join('')}</ol>` : '';
