import { describe, expect, it } from 'vitest';
import { boardHtml, boardLines } from './hubboard';
import { SECRETS } from './story';
import { BOSS_IDS } from './tally';

// The notice board of the Hub (#1528, docs/specs/ui.md section 4.5): today's daily with its status, the next boss, the medals missing and the
// local daily streak, in Tally's flat register.

const base = { boss: 'The Hull', record: null, next: 'The Echo', missing: 15, streak: 0 } as const;

describe('the lines of the board', () => {
  it('says the daily is not played, names the next boss and counts the medals missing', () => {
    expect(boardLines(base)).toEqual({ daily: 'Daily: The Hull. Not played.', next: 'Next boss: The Echo.', medals: 'Medals missing: 15.', streak: '' });
  });

  it('points to the first win instead of the next boss while the lock is on (#1665)', () => {
    expect(boardLines(base, true).next).toBe('Next: win your first game vs the bot.');
    expect(boardLines(base, false).next).toBe('Next boss: The Echo.');
    expect(boardHtml(base, true)).not.toContain('Echo');
  });

  it('gives the status of a daily played: won or lost in its player turns, or started and not finished', () => {
    expect(boardLines({ ...base, record: { result: 'won', turns: 12 } }).daily).toBe('Daily: The Hull. Won in 12 turns.');
    expect(boardLines({ ...base, record: { result: 'won', turns: 1 } }).daily).toBe('Daily: The Hull. Won in 1 turn.');
    expect(boardLines({ ...base, record: { result: 'lost', turns: 9 } }).daily).toBe('Daily: The Hull. Lost in 9 turns.');
    expect(boardLines({ ...base, record: { result: 'started', turns: 0 } }).daily).toBe('Daily: The Hull. Started, not finished.');
  });

  it('says none when no boss is left and no medal is missing', () => {
    const done = boardLines({ ...base, next: null, missing: 0 });
    expect(done.next).toBe('Next boss: none left.');
    expect(done.medals).toBe('Medals missing: none.');
  });

  it('counts the streak in days, and shows nothing at all for a streak that is broken', () => {
    expect(boardLines({ ...base, streak: 1 }).streak).toBe('Streak: 1 day.');
    expect(boardLines({ ...base, streak: 12 }).streak).toBe('Streak: 12 days.');
    expect(boardLines({ ...base, streak: 0 }).streak).toBe('');
  });

  it('holds no secret word of a stage above the player\'s, in any state of the board, at any stage', () => {
    const records = [null, { result: 'won', turns: 7 }, { result: 'lost', turns: 7 }, { result: 'started', turns: 0 }] as const;
    const bosses = ['The Echo', 'The Hull', 'The Choir', 'The Chaplain', 'The Ballast Mind', null];
    for (const record of records)
      for (const next of bosses)
        for (const missing of [0, 1, BOSS_IDS.length])
          for (const streak of [0, 1, 30]) {
            const text = Object.values(boardLines({ boss: 'The Alien', record, next, missing, streak })).join(' ');
            for (const { word, from } of SECRETS) expect(from > 1 && word.test(text), `${word} in "${text}"`).toBe(false);
          }
  });

  it('shames nothing: a broken streak or a lost daily is a plain fact, with no word of failure', () => {
    const text = Object.values(boardLines({ ...base, record: { result: 'lost', turns: 4 }, streak: 0 })).join(' ');
    expect(text).not.toMatch(/broke|lost your|missed|fail|only|again|!/i);
  });
});

describe('the board as markup', () => {
  it('is a titled list of its four lines, the first and last kept on a phone (classes), and leaves out an empty streak', () => {
    const html = boardHtml({ ...base, streak: 3 });
    expect(html).toBe(
      '<h2>Notice board</h2><ul><li class="daily">Daily: The Hull. Not played.</li><li class="next">Next boss: The Echo.</li><li class="medals">Medals missing: 15.</li><li class="streak">Streak: 3 days.</li></ul>',
    );
    expect(boardHtml(base)).not.toContain('streak');
  });
});
