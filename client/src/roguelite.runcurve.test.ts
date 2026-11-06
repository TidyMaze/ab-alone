import { describe, expect, it } from 'vitest';
import { RUN_START_PERCENT, runPercent } from './botrating';
import { fightBudget, newRun, runNodes, type MapNode, type NodeKind, type Run } from './roguelite';
import { LEGACY_UNLOCKED } from './collector';

// The bot of a run grows from its first fight to the last ones, by the act and the row of the node (#1611).
const nd = (act: number, row: number, kind: NodeKind): MapNode => ({ act, row, col: 0, kind, links: [], skips: [], formation: 0, elite: kind === 'elite' ? 1 : 0 });
const MAP: MapNode[] = [
  nd(0, 0, 'fight'),
  nd(0, 1, 'fight'),
  nd(0, 2, 'elite'),
  nd(0, 3, 'boss'),
  nd(1, 0, 'fight'),
  nd(1, 3, 'fight'),
  nd(2, 0, 'fight'),
  nd(2, 3, 'fight'),
  nd(3, 0, 'elite'),
  nd(3, 1, 'boss'),
];
const fighting = (node: number, fight = true): Run => ({ ...newRun(1, 3, LEGACY_UNLOCKED), path: [node], fighting: fight });

describe('the bot of a run, by act and row (#1611)', () => {
  it('the first fight is the start of the curve, and the fights after it never search less', () => {
    expect(runNodes(MAP, fighting(0), 1000)).toBe(Math.round((1000 * RUN_START_PERCENT) / 100));
    const fights = [0, 1, 4, 5, 6, 7].map((i) => runNodes(MAP, fighting(i), 1000));
    for (let i = 1; i < fights.length; i++) expect(fights[i]).toBeGreaterThan(fights[i - 1]!);
    expect(fights[fights.length - 1]).toBeGreaterThan(900); // the last fights are near the peak
  });
  it('the fourth act is the peak', () => {
    expect(runNodes(MAP, fighting(8), 1000)).toBe(1000);
  });
  it('an elite stays above the fights of its row, the relics and the ascension factors still apply on top', () => {
    const row2 = runNodes(MAP, fighting(2), 1000);
    expect(fightBudget(MAP, fighting(2), row2)).toBeGreaterThan(fightBudget(MAP, fighting(1), runNodes(MAP, fighting(1), 1000)));
    expect(fightBudget(MAP, fighting(2), row2)).toBeGreaterThan(row2);
    expect(fightBudget(MAP, { ...fighting(0), ascension: 10 }, runNodes(MAP, fighting(0), 1000))).toBe(Math.round(250 * 1.25));
  });
  it('a boss, and a node with no fight on, keep the budget they are given', () => {
    expect(runNodes(MAP, fighting(3), 1000)).toBe(1000);
    expect(runNodes(MAP, fighting(0, false), 1000)).toBe(1000);
  });
  it('a run saved before the pacing, with fewer rows to an act, still has a curve, and never searches less than one position', () => {
    const short: MapNode[] = [nd(0, 0, 'fight'), nd(0, 1, 'boss')];
    const early = runNodes(short, fighting(0), 1000);
    expect(early).toBe(Math.round((1000 * RUN_START_PERCENT) / 100));
    expect(runNodes(short, fighting(0), 1)).toBe(1);
    expect(runPercent(0.5)).toBeGreaterThan(RUN_START_PERCENT);
  });
});
