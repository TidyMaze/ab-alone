import { describe, expect, it } from 'vitest';
import { CONSENT_TEXT, consentGiven, consentNeeded, writeConsent } from './consent';

const memory = (): Storage => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) } as Storage;
};

describe('online consent (#1338)', () => {
  it('is needed until the player accepts, then never again', () => {
    const store = memory();
    expect(consentGiven(store)).toBe(false);
    expect(consentNeeded(store, '', false)).toBe(true);
    writeConsent(store);
    expect(consentGiven(store)).toBe(true);
    expect(consentNeeded(store, '', false)).toBe(false);
  });

  it('is not needed for the e2e hook transport, which touches no network', () => {
    expect(consentNeeded(memory(), '?net=hook', false)).toBe(false);
  });

  it('is skipped under navigator.webdriver unless ?consent asks for it', () => {
    expect(consentNeeded(memory(), '?bot=off', true)).toBe(false);
    expect(consentNeeded(memory(), '?consent', true)).toBe(true);
    expect(consentNeeded(memory(), '?consent&net=hook', true)).toBe(false);
  });

  it('keeps the text decided in docs/specs/multiplayer.md section 7', () => {
    expect(CONSENT_TEXT).toContain('Google, Cloudflare');
    expect(CONSENT_TEXT).toContain('I am 16 or older.');
  });
});
