// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { bootFailed } from './bootfail';

describe('bootFailed, #737', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="loading"></div><div id="boot-error" role="alert" hidden><p id="boot-reason"></p></div>';
  });

  it('shows the box with the reason and rethrows, so the start stops', () => {
    const err = new Error('wasm fetch failed');
    expect(() => bootFailed(err)).toThrow(err);
    expect(document.getElementById('boot-error')!.hidden).toBe(false);
    expect(document.getElementById('boot-reason')!.textContent).toBe('wasm fetch failed');
    expect(document.getElementById('loading')!.hidden).toBe(true); // the plate would sit over the message
  });

  it('shows what a thrown string says', () => {
    expect(() => bootFailed('no webgpu')).toThrow('no webgpu');
    expect(document.getElementById('boot-reason')!.textContent).toBe('no webgpu');
  });
});
