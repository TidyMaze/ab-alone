import { describe, expect, it } from 'vitest';
import { openWorldLeads } from './menuorder';

describe('the mode menu order (#1612, Decision #1513)', () => {
  it('leads with the Open world for a fresh profile: no saved game and no boss beaten', () => {
    expect(openWorldLeads(false, 0)).toBe(true);
  });

  it('keeps the old order for a profile with a saved game or a boss beaten, so existing saves behave as today', () => {
    expect(openWorldLeads(true, 0)).toBe(false);
    expect(openWorldLeads(false, 1)).toBe(false);
    expect(openWorldLeads(true, 3)).toBe(false);
  });
});
