import { describe, expect, it } from 'vitest';
import page from '../index.html?raw';
import manifestText from '../public/manifest.webmanifest?raw';

// #1649 (Decision #1616): the game is Edgefall where a player looks first, the tab and the installed app, and the word Abalone, a mark,
// is gone from them. The address and the save keys keep `ab-alone` (#1650).

describe('the name of the game (#1649)', () => {
  it('is the title of the tab', () => {
    expect(page.match(/<title>(.*)<\/title>/)![1]).toBe('Edgefall');
  });

  it('is the name and short name of the installed app, whose description does not say Abalone', () => {
    const manifest = JSON.parse(manifestText) as Record<string, string>;
    expect([manifest.name, manifest.short_name]).toEqual(['Edgefall', 'Edgefall']);
    expect(manifest.description).not.toMatch(/abalone|ab-alone/i);
  });
});
