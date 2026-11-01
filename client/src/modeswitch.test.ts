// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { clearStray, STRAY_CONTROLS, STRAY_DATA } from './modeswitch';

describe('clearStray (#1275)', () => {
  it('hides the stray controls and drops the stray body data, and keeps the rest', () => {
    document.body.innerHTML = [...STRAY_CONTROLS, 'hud'].map((id) => `<div id="${id}"></div>`).join('');
    for (const key of [...STRAY_DATA, 'deck']) document.body.dataset[key] = '1';
    clearStray(document);
    expect(STRAY_CONTROLS.map((id) => document.getElementById(id)!.hidden)).toEqual(STRAY_CONTROLS.map(() => true));
    expect(document.getElementById('hud')!.hidden).toBe(false);
    expect(Object.keys(document.body.dataset)).toEqual(['deck']);
  });
});
