// The dev server's sockets (hot reload) are in the page's Content-Security-Policy for dev and e2e only: the built page cannot reach a local WebSocket.
export const DEV_SOCKETS = ' ws://localhost:* ws://127.0.0.1:*';

/** Build only. Fails the build when the sockets are not found, so a changed policy string cannot ship them silently. */
export function cspNoDevSockets() {
  return {
    name: 'csp-no-dev-sockets',
    apply: 'build',
    transformIndexHtml(html) {
      if (!html.includes(DEV_SOCKETS)) throw new Error('csp-no-dev-sockets: the dev sockets are not in the page policy, update scripts/csp-no-dev-sockets.mjs');
      return html.replace(DEV_SOCKETS, '');
    },
  };
}
