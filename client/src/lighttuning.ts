/**
 * The lights' power and the bloom as tuned with ?lights (2026-10-29): by family, the panel's names (lightpanel.ts
 * `family`), over what the code and each deck set. The neon tubes' rows light the room; the key and the fill,
 * the spotlights on the gantries (#864), give the marbles their shadow and their shading without washing the cells out
 * (the lights slider scales them: at its default, 215 %, they are 3.2 and 1.1); the bloom is nearly off.
 * Applied when the lights are made again (main.ts), on every deck.
 */
export const LIGHT_TUNING: Readonly<Record<string, number>> = {
  key: 1.5,
  fill: 0.5,
  'corner-neon': 110,
  'neon-airlock': 110,
  'neon-column': 110,
  'neon-gantry': 110,
  'neon-observation': 110,
  'pedestal-neon': 110,
  'corner-neon light': 100,
  'neon-airlock light': 100,
  'neon-column light': 100,
  'neon-gantry light': 100,
  'neon-observation light': 100,
  'pedestal-neon light': 100,
  kioskGreenLight: 100,
  viewportRimLight: 100,
  'bloom strength': 0.06,
  'bloom radius': 0.008,
  'bloom threshold': 3,
};
