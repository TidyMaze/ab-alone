// The first-launch guide (#1293, docs/specs/ui.md section 4.7): five pages over the game, the goal, a move, a push, the
// 3:2 rule and the controls, each with an inline SVG of the game's marbles on deck cells. Shown once: a skip or the end
// stores it as seen; the settings menu opens it again. Pure functions and data only: main.ts builds the dialog.
import { read, write, type Store } from './quality';

const GUIDE_KEY = 'ab-alone.guide';

export const guideSeen = (store: Store): boolean => read(store, GUIDE_KEY) === 'seen';
export const writeGuideSeen = (store: Store): void => write(store, GUIDE_KEY, 'seen');

/** Whether the guide opens at start: not seen yet, and not in an automated browser (navigator.webdriver), where every
 * e2e spec boots on a fresh profile, unless `?guide` asks for it as a player's first launch. */
export const guideDue = (store: Store, search: string, automated: boolean): boolean =>
  !guideSeen(store) && (!automated || new URLSearchParams(search).has('guide'));

export type GuideEvent = 'next' | 'back' | 'skip';

export interface GuidePage {
  title: string;
  /** HTML: one paragraph, or on the controls page one per platform, which ui.css shows by the input in use. */
  text: string;
  /** A decorative inline SVG. */
  art: string;
}

// The art is drawn on the deck, dark in both themes as the 3D deck is: fixed colours, the marbles' own gradients.
const AMBER = '#ffb000';
const SODIUM = '#d9822b';
const CELL = 16;
const MARBLE = 13;

const cell = (x: number, y: number): string => `<circle cx="${x}" cy="${y}" r="${CELL}" fill="#0f1214" stroke="#3a4248"/>`;
const marble = (x: number, y: number, side: 'glass' | 'shell', ghost = false): string =>
  `<circle cx="${x}" cy="${y}" r="${MARBLE}" fill="url(#guide-${side})"${ghost ? ' opacity="0.6" stroke="#d8d4c8" stroke-width="1.5" stroke-dasharray="4 3"' : ''}/>`;
/** A row of cells from `x0`, `step` apart: G a glass marble, S a shell, g and s their ghosts (dashed) where they go, . empty. */
const row = (y: number, marks: string, x0: number, step = 40): string =>
  [...marks]
    .map((mark, i) => {
      const x = x0 + i * step;
      const side = mark.toLowerCase() === 'g' ? 'glass' : 'shell';
      return cell(x, y) + (mark === '.' ? '' : marble(x, y, side, mark === mark.toLowerCase()));
    })
    .join('');
const arrow = (x1: number, y: number, x2: number): string =>
  `<path d="M${x1} ${y}H${x2 - 7}" stroke="${AMBER}" stroke-width="3" stroke-linecap="round"/>` +
  `<path d="M${x2 - 9} ${y - 6}L${x2} ${y}L${x2 - 9} ${y + 6}z" fill="${AMBER}"/>`;

const svg = (body: string): string =>
  '<svg viewBox="0 0 260 120" aria-hidden="true" focusable="false">' +
  '<defs><radialGradient id="guide-glass" cx="0.35" cy="0.3" r="0.75"><stop offset="0" stop-color="#ffffff"/>' +
  '<stop offset="0.6" stop-color="#d9d4c7"/><stop offset="1" stop-color="#8f8a7e"/></radialGradient>' +
  '<radialGradient id="guide-shell" cx="0.35" cy="0.3" r="0.75"><stop offset="0" stop-color="#6a6f73"/>' +
  '<stop offset="0.45" stop-color="#1e2123"/><stop offset="1" stop-color="#050607"/></radialGradient></defs>' +
  '<rect x="1" y="1" width="258" height="118" rx="6" fill="#1b2023" stroke="#4a5258"/>' +
  body +
  '</svg>';

// The goal: three glass push the last shell over the rim, the first of the six to win.
const goalArt = svg(
  `<path d="M192 16V104" stroke="${SODIUM}" stroke-width="3" stroke-dasharray="6 4"/>` +
    row(60, 'GGGS', 50) +
    marble(222, 60, 'shell', true) +
    arrow(50, 26, 222) +
    [0, 1, 2, 3, 4, 5].map((i) => `<circle cx="${20 + i * 14}" cy="104" r="5" ${i ? 'fill="none" stroke="#9aa3a8"' : 'fill="url(#guide-shell)"'}/>`).join(''),
);
// A move: a line of three glass rolls one cell along its line, to an empty cell.
const moveArt = svg(row(64, 'GGGg.S', 30) + arrow(30, 26, 150));
// A push: two glass push one shell back a cell.
const pushArt = svg(row(64, 'GGSs', 70) + arrow(70, 26, 190));
// The 3:2 rule: three push two; two against two do not move.
const ruleArt = svg(
  row(34, 'GGGSSs', 26, 36) +
    `<path d="M228 34l6 6 12-12" fill="none" stroke="#7fd6e8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` +
    row(88, 'GGSS.', 26, 36) +
    `<path class="no" d="M230 82l12 12M242 82l-12 12" stroke="#ff6b5a" stroke-width="3" stroke-linecap="round"/>`,
);
// The controls: a selected marble with the ring of arrows to its six neighbours.
const SIX = [0, 60, 120, 180, 240, 300];
const controlsArt = svg(
  SIX.map((a) => cell(130 + 40 * Math.cos((a * Math.PI) / 180), 60 + 40 * Math.sin((a * Math.PI) / 180))).join('') +
    cell(130, 60) +
    marble(130, 60, 'glass') +
    `<circle cx="130" cy="60" r="18" fill="none" stroke="${AMBER}" stroke-width="2"/>` +
    SIX.map((a) => `<g transform="rotate(${a} 130 60)">${arrow(152, 60, 168)}</g>`).join(''),
);

export const GUIDE: readonly GuidePage[] = [
  {
    title: 'Push them into the void',
    text: '<p>You are the pale glass. Push six of their black shells off the edge of the board to win. Lose six of yours and you lose.</p>',
    art: goalArt,
  },
  {
    title: 'Move',
    text: '<p>On your turn, move one, two or three of your marbles in a line, one cell in any of the six directions.</p>',
    art: moveArt,
  },
  {
    title: 'Push',
    text: '<p>Move your line into theirs to push it: their marbles go back one cell. A marble pushed past the edge is gone.</p>',
    art: pushArt,
  },
  {
    title: 'Out-number them',
    text: '<p>A line pushes only a shorter line: 3 push 2 or 1, 2 push 1. Equal lines never push.</p>',
    art: ruleArt,
  },
  {
    title: 'Controls',
    text:
      '<p data-controls="mouse">Click your marbles, up to three in a line, then the cell they go to. Drag the board to turn the camera, scroll to zoom. Keys: Tab picks a group, Q W E A S D a direction, Enter plays, Esc backs out.</p>' +
      '<p data-controls="touch">Tap your marbles, up to three in a line, then the cell they go to, or drag them there. Drag the board to turn the camera, pinch to zoom.</p>' +
      '<p data-controls="pad">RB and LB pick a group, the D-pad or the left stick a direction, A plays, B backs out. The right stick turns the camera, the triggers zoom, Start opens the settings.</p>',
    art: controlsArt,
  },
];

/** The page after `event` on page `at`, or null when the guide closes: a skip, or Next on the last page. */
export const guideStep = (at: number, event: GuideEvent): number | null => {
  if (event === 'skip' || (event === 'next' && at === GUIDE.length - 1)) return null;
  return event === 'next' ? at + 1 : Math.max(0, at - 1);
};
