// The two angle helpers the page itself needs for the Open world's camera (#1026), apart from openworldview.ts so the page does not pull
// the view into the entry script (#1578).

/** An angle in radians turned into (-pi, pi]: the shortest turn of the camera around the hero (#1026). */
export const wrapPi = (angle: number): number => {
  const turn = ((((angle + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
  return turn === -Math.PI ? Math.PI : turn;
};

/** The turn of the camera a twist of two fingers makes, from the angle the two fingers made to the new one: the shortest way. */
export const twistOf = (prev: number, next: number): number => wrapPi(next - prev);
