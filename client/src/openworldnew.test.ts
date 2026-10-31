// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindNewWorld } from './openworldnew';
import indexHtml from '../index.html?raw';

// The HUD's New world control (#1021): an in-page confirmation before the save is discarded, the new seed in the URL.
const hud = `
  <button id="openworld-new" type="button">New world</button>
  <div id="openworld-confirm" hidden>
    <button id="openworld-keep" type="button">Keep this world</button>
    <button id="openworld-discard" type="button">Discard and start new</button>
  </div>`;
const $ = (id: string) => document.getElementById(id)!;
const settle = () => new Promise((done) => setTimeout(done));

afterEach(() => {
  document.body.innerHTML = '';
  delete document.body.dataset.openworld;
  history.replaceState(null, '', '/');
});

// #1038: the sheet asks once. The button already says Discard and start new, so the question does not repeat it.
describe('the New world sheet wording (#1038)', () => {
  it("asks Discard this world's save? and keeps the button's name", () => {
    expect(indexHtml).toContain("<p>Discard this world's save?</p>");
    expect(indexHtml).toContain('>Discard and start new</button>');
    expect(indexHtml).not.toContain('start a new one');
  });
});

describe('the New world control of the Open world HUD (#1021)', () => {
  const setup = (start = vi.fn(async () => 42)) => {
    history.replaceState(null, '', '/?bot=off&openworld=7');
    document.body.innerHTML = hud;
    document.body.dataset.openworld = '7';
    bindNewWorld(document, start);
    return start;
  };

  it('asks for a confirmation in the page first: nothing is discarded before the button of the confirmation', () => {
    const start = setup();
    $('openworld-new').click();
    expect(($('openworld-confirm') as HTMLElement).hidden).toBe(false);
    expect($('openworld-new').hidden).toBe(true);
    expect(document.activeElement).toBe($('openworld-keep')); // the safe choice has the focus
    expect(start).not.toHaveBeenCalled();
  });

  it('keep closes the confirmation, the button comes back with the focus, and the world goes on', () => {
    const start = setup();
    $('openworld-new').click();
    $('openworld-keep').click();
    expect(($('openworld-confirm') as HTMLElement).hidden).toBe(true);
    expect($('openworld-new').hidden).toBe(false);
    expect(document.activeElement).toBe($('openworld-new'));
    expect(start).not.toHaveBeenCalled();
  });

  it('discard starts a new world at the window size, and the URL takes its seed, the other parameters kept', async () => {
    const start = setup();
    $('openworld-new').click();
    $('openworld-discard').click();
    expect(start).toHaveBeenCalledWith(innerWidth, innerHeight);
    expect(($('openworld-confirm') as HTMLElement).hidden).toBe(true);
    await settle();
    expect(location.search).toBe('?bot=off&openworld=42');
  });

  it('leaving the mode closes an open confirmation, a roll inside the mode does not', async () => {
    setup();
    $('openworld-new').click();
    document.body.dataset.openworld = '7'; // a roll: the world is marked again
    await settle();
    expect(($('openworld-confirm') as HTMLElement).hidden).toBe(false);
    delete document.body.dataset.openworld; // left
    await settle();
    expect(($('openworld-confirm') as HTMLElement).hidden).toBe(true);
    expect($('openworld-new').hidden).toBe(false);
  });
});
