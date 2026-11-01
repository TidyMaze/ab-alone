// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHUNK } from './openworld';
import { OpenWorldMode, TALLY_CLAIM } from './openworldmode';
import { worldSaves } from './openworldsave';
import { memoryStore } from './savegame';

// Open grass everywhere in the square -3..3 of chunks; 14 lairs on a line along r = 2.
function grass(_seed: number, cx: number, cy: number): Uint8Array {
  if (Math.abs(cx) > 3 || Math.abs(cy) > 3) return new Uint8Array();
  const out = new Uint8Array(CHUNK * CHUNK * 3);
  for (let i = 0; i < CHUNK * CHUNK; i++) out.set([1, 2, 4], i * 3);
  return out;
}
const FOURTEEN = Int32Array.from({ length: 28 }, (_, i) => (i % 2 === 0 ? i / 2 - 7 : 2));

const hud = () => {
  document.body.innerHTML =
    '<div id="openworld-hud"><p>Medals <output id="openworld-medals"></output></p><p id="openworld-tally" hidden></p><p id="openworld-live"></p></div>';
};
const mode = (medals: () => number, claim: () => boolean) =>
  new OpenWorldMode(grass, () => new Int32Array(), async () => ({ low: {}, high: {} }), () => true, () => new Int32Array(), worldSaves(memoryStore(), 1), () => FOURTEEN, () => {}, undefined, medals, claim);

afterEach(() => {
  document.body.innerHTML = '';
  for (const key of Object.keys(document.body.dataset)) delete document.body.dataset[key];
});

describe('the Open world HUD counts the medals out of the lairs (#1171)', () => {
  it('shows the medals read from the shared store out of the 14 lairs, and publishes the count', () => {
    hud();
    let medals = 3;
    const m = mode(() => medals, () => false);
    m.enter(7, 800, 600);
    expect(document.body.dataset.openworldLairs!.split(' ')).toHaveLength(14);
    expect(document.getElementById('openworld-medals')!.textContent).toBe('3 / 14');
    expect(document.body.dataset.openworldMedals).toBe('3/14');
    medals = 4; // a lair won, back to the world: the count is read again
    m.enter(7, 800, 600);
    expect(document.getElementById('openworld-medals')!.textContent).toBe('4 / 14');
  });

  it('works on a page with no medal row and clears the count on leaving', () => {
    document.body.innerHTML = '';
    const m = mode(() => 0, () => true);
    m.enter(7, 800, 600);
    expect(document.body.dataset.openworldMedals).toBe('0/14');
    m.leave();
    expect(document.body.dataset.openworldMedals).toBeUndefined();
  });
});

describe("Tally's relayed line (#1171)", () => {
  it('says "Claim 0412: unworked." the first time and never again', () => {
    hud();
    expect(TALLY_CLAIM).toBe('Claim 0412: unworked.');
    const claim = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);
    const m = mode(() => 0, claim);
    m.enter(7, 800, 600);
    const line = document.getElementById('openworld-tally')!;
    expect(line.hidden).toBe(false);
    expect(line.textContent).toBe(`Tally: ${TALLY_CLAIM}`);
    expect(document.getElementById('openworld-live')!.textContent).toContain(TALLY_CLAIM);
    m.enter(7, 800, 600);
    expect(line.hidden).toBe(true);
    expect(line.textContent).toBe('');
    expect(claim).toHaveBeenCalledTimes(2);
  });

  it('says nothing and counts no medal for a page that gives no ledger', () => {
    hud();
    const m = new OpenWorldMode(grass, () => new Int32Array(), async () => ({ low: {}, high: {} }), () => true, () => new Int32Array(), worldSaves(memoryStore(), 1));
    m.enter(7, 800, 600);
    expect(document.getElementById('openworld-medals')!.textContent).toBe('0 / 0');
    expect(document.getElementById('openworld-tally')!.hidden).toBe(true);
  });

  it('does not touch the live region when it has nothing to say', () => {
    hud();
    mode(() => 0, () => false).enter(7, 800, 600);
    expect(document.getElementById('openworld-live')!.textContent).toBe('');
  });
});
