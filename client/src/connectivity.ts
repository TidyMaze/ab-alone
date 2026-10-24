/** Play online needs the network: disabled with a HUD notice while the browser is offline (#194). */
export function playOnlineState(onLine: boolean, ready: boolean): { disabled: boolean; notice: string } {
  return { disabled: !ready || !onLine, notice: onLine ? '' : ' · online play needs a connection' };
}
