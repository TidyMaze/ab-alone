import { describe, expect, it } from 'vitest';
import page from '../index.html?raw';
// @ts-expect-error plain Node script, no type declarations (the client has no Node types)
import { cspNoDevSockets, DEV_SOCKETS } from './csp-no-dev-sockets.mjs';

describe('csp-no-dev-sockets', () => {
  const plugin = cspNoDevSockets();
  it('runs on build only', () => expect(plugin.apply).toBe('build'));
  it('leaves no WebSocket in the policy of the built page', () => {
    const built: string = plugin.transformIndexHtml(page);
    expect(page).toContain(DEV_SOCKETS);
    expect(/Content-Security-Policy" content="([^"]+)"/.exec(built)![1]).not.toMatch(/ws:|localhost|127\.0\.0\.1/);
  });
  it('fails the build when the sockets are not in the page', () => {
    expect(() => plugin.transformIndexHtml('<html></html>')).toThrow(/csp-no-dev-sockets/);
  });
});
