// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import page from '../index.html?raw';

// Firefox gives a form control back its state on a reload, its `disabled` included: a button the page starts disabled and the script
// enables once its listener is attached would be enabled early and swallow a click (#1486). `autocomplete="off"` turns it off.
describe('The page', () => {
  it('starts every disabled control with autocomplete off, so a reload in Firefox does not enable it before its listener (#1486)', () => {
    const doc = new DOMParser().parseFromString(page, 'text/html');
    const disabled = [...doc.querySelectorAll<HTMLElement>('button[disabled], input[disabled], select[disabled], textarea[disabled]')];
    expect(disabled.length).toBeGreaterThan(10);
    expect(disabled.filter((el) => el.getAttribute('autocomplete') !== 'off').map((el) => el.id)).toEqual([]);
  });
});
