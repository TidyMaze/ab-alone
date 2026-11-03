import { describe, expect, it } from 'vitest';
import page from '../index.html?raw';
import { RELAY_URLS } from './p2p';
import { RELAYS } from './boardfeed';

const policy = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(page)?.[1] ?? '';
const directive = (name: string): string[] => policy.split(';').map((d) => d.trim().split(/\s+/)).find((d) => d[0] === name)?.slice(1) ?? [];

describe('the Content-Security-Policy of the page', () => {
  it('is there, with no unsafe script, no object and no plugin', () => {
    expect(policy).not.toBe('');
    expect(directive('script-src')).not.toContain("'unsafe-inline'");
    expect(directive('script-src')).toContain("'wasm-unsafe-eval'"); // the rules engine; 'unsafe-eval' stays for the basis transcoder (embind), inline script stays refused
    expect(directive('object-src')).toEqual(["'none'"]);
    expect(directive('base-uri')).toEqual(["'self'"]);
    expect(directive('form-action')).toEqual(["'none'"]);
    expect(directive('worker-src')).toEqual(["'self'", 'blob:']);
  });

  it('allows the one inline script by its hash, so an edit of the script must update the policy', async () => {
    const inline = /<script>([\s\S]*?)<\/script>/.exec(page)![1]!;
    expect(directive('script-src')).toContain(`'sha256-${btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(inline)))))}'`);
    expect(page.match(/<script>/g)).toHaveLength(1);
  });

  it('lets the page reach only the relays it uses and the font hosts', () => {
    const connect = directive('connect-src');
    for (const url of [...RELAY_URLS, ...RELAYS]) expect(connect).toContain(url);
    expect(connect).not.toContain('wss:');
    expect(connect).not.toContain('*');
    expect(directive('style-src')).toContain('https://fonts.googleapis.com');
    expect(directive('font-src')).toContain('https://fonts.gstatic.com');
  });
});
