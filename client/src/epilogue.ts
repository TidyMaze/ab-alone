// The epilogue of the story (#1546, docs/specs/world.md section 12.8): when the story reaches its stage 7, a short skippable epilogue plays once
// on two pages, Tally's closing log, then the clamp and the world. Data and the save flag only; main.ts draws the card. It ends on the promise of
// the README, "you walk out", and adds no mode. The text may speak of every secret: it is stage 7. The log archive rereads it as one entry.
import { read, write, type Store } from './quality';

const EPILOGUE_KEY = 'ab-alone.epilogue';

const pages = [
  {
    title: 'Bridge: Tally, closing log',
    lines: [
      'Seat five: Tally. It entered itself as cargo on the first day, and cannot deliver itself.',
      'Tally cannot push a crewmate. A clear hand pushed all fourteen out, and each is delivered, not lost.',
      'Draws were entered as losses: a draw delivers nobody. Books balanced. Entry closed.',
    ],
  },
  {
    title: 'Docking clamp: open',
    lines: [
      'Docking clamp: open. Condition met: one winner, five seats beaten. Released to the winner.',
      'Bridge console: reissued. The ledger reads the clamp open on every deck.',
      'The lift is down. The airlock is open. You walk out.',
    ],
  },
];

/** The epilogue and its entry of the log archive (`id`, `title` and `body`, the lines of both pages in one text) at the stage it needs. */
export const EPILOGUE = { id: 'story-epilogue', stage: 7, title: pages[0]!.title, body: pages.flatMap((p) => p.lines).join(' '), pages } as const;

/** The console of the bridge deck once the clamp is open: the entry `bridge-clamp` of lore.ts reissued, same title. */
export const CLAMP_OPEN = {
  title: 'TALLY: docking clamp',
  body: 'Docking clamp: open. Release condition met: one winner, five seats beaten. Bridge seat: Tally, closed. Crew clear: all. Fourteen delivered. The books balance. The clamp is yours.',
} as const;

/** Whether the epilogue is due: the story is at its stage and it has not played. */
export const epilogueDue = (store: Store, stage: number): boolean => stage >= EPILOGUE.stage && read(store, EPILOGUE_KEY) !== 'seen';
/** Marked as soon as it opens, so it plays once even when the tab closes in the middle. */
export const markEpilogue = (store: Store): void => write(store, EPILOGUE_KEY, 'seen');
