import { describe, expect, it } from 'vitest';
import { BOSS_IDS, tallyLine } from './tally';

describe('tallyLine', () => {
  it('has a non-empty line for every mode', () => {
    for (const mode of ['local', 'bot', 'online'] as const) {
      expect(tallyLine({ mode })).not.toBe('');
    }
  });

  it('has a non-empty line for every boss id of the roster', () => {
    expect(BOSS_IDS).toEqual(['echo', 'hull', 'choir', 'chaplain', 'ballast', 'alien', 'railyard']);
    for (const id of BOSS_IDS) {
      expect(tallyLine({ mode: 'boss', boss: id })).not.toBe('');
    }
  });

  it('says nothing for an unknown boss id', () => {
    expect(tallyLine({ mode: 'boss', boss: 'nobody' })).toBe('');
  });

  it('gives a boss its own line, not the mode line', () => {
    expect(tallyLine({ mode: 'boss', boss: 'echo' })).not.toBe(tallyLine({ mode: 'local' }));
  });

  it('stays one short line, no newline', () => {
    for (const id of BOSS_IDS) {
      const line = tallyLine({ mode: 'boss', boss: id });
      expect(line).not.toContain('\n');
      expect(line.length).toBeLessThanOrEqual(72);
    }
  });
});
