import { describe, expect, it } from 'vitest';
import { CLAMP_OPEN, EPILOGUE, epilogueDue, markEpilogue } from './epilogue';

// #1546: the epilogue of the story, at stage 7: Tally's closing log, the clamp's state change and a change in the world, on two short pages. It
// plays once, and the log archive rereads it.
describe('EPILOGUE (#1546)', () => {
  it('is two short pages that end on "You walk out."', () => {
    expect(EPILOGUE.stage).toBe(7);
    expect(EPILOGUE.pages).toHaveLength(2);
    for (const page of EPILOGUE.pages) {
      expect(page.title.length).toBeGreaterThan(0);
      expect(page.lines.length).toBeGreaterThanOrEqual(2);
      for (const line of page.lines) {
        expect(line.length).toBeLessThanOrEqual(110);
        expect(line).not.toMatch(/[<>&\n]/);
      }
    }
    expect(EPILOGUE.pages[1]!.lines.at(-1)).toMatch(/You walk out\.$/);
  });

  it('says the clamp is open and what changed in the world, in the ledger\'s words: no UI term', () => {
    const text = EPILOGUE.pages.flatMap((p) => p.lines).join(' ');
    expect(text).toContain('Docking clamp: open.');
    expect(text).toMatch(/Bridge console/);
    expect(text).not.toMatch(/Open world|panel/);
  });

  it('has no duplicate line', () => {
    const lines = EPILOGUE.pages.flatMap((p) => p.lines);
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('is the entry of the archive: its body is every line, in order', () => {
    expect(EPILOGUE.id).toBe('story-epilogue');
    expect(EPILOGUE.title).toBe(EPILOGUE.pages[0]!.title);
    expect(EPILOGUE.body).toBe(EPILOGUE.pages.flatMap((p) => p.lines).join(' '));
  });
});

describe('CLAMP_OPEN (#1546)', () => {
  it('is the bridge console reissued with the clamp open, at stage 7, in the same title', () => {
    expect(CLAMP_OPEN.title).toBe('TALLY: docking clamp');
    expect(CLAMP_OPEN.body).toMatch(/^Docking clamp: open\./);
    expect(CLAMP_OPEN.body).not.toMatch(/locked/i);
  });
});

describe('epilogueDue (#1546)', () => {
  it('is due from stage 7, until it is marked, and never before', () => {
    const items = new Map<string, string>();
    const store = { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v) } as Storage;
    for (const stage of [1, 2, 6]) expect(epilogueDue(store, stage)).toBe(false);
    expect(epilogueDue(store, 7)).toBe(true);
    markEpilogue(store);
    expect(epilogueDue(store, 7)).toBe(false);
  });
});
