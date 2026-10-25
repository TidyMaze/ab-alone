// Photosensitivity safe mode (#380, docs/specs/world.md section 8): on by default, it caps what could flash at 3 per
// second and a brightness swing at 0.2 of the full range. The client has one such effect, the end-of-game light
// (main.ts sets its peak and duration from limitFlash, ui.css reads them); nothing else in the client flashes.
export const SAFE_MAX_RATE = 3;
export const SAFE_MAX_AMPLITUDE = 0.2;

export interface Flash {
  rate: number; // flashes per second
  amplitude: number; // brightness swing, 0 to 1 of the full range
}

/** The flash to draw: capped in safe mode, unchanged otherwise. */
export const limitFlash = (flash: Flash, safe: boolean): Flash =>
  safe
    ? { rate: Math.min(flash.rate, SAFE_MAX_RATE), amplitude: Math.min(flash.amplitude, SAFE_MAX_AMPLITUDE) }
    : flash;
