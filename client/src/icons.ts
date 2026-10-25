// The icon set (#287): line icons drawn here on a 24 px grid, thin strokes in currentColor, so a button's text colour
// paints them (docs/specs/world.md section 5). The settings menu uses them, the HUD buttons will too (#297).
export const ICONS = {
  fog: 'M3 8c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M3 12c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M3 16c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0',
  sound: 'M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12',
  muted: 'M4 9h4l5-4v14l-5-4H4zM17 9.5l5 5M22 9.5l-5 5',
  export: 'M12 15V4M7.5 8.5 12 4l4.5 4.5M5 14v5h14v-5',
  import: 'M12 4v11M7.5 10.5 12 15l4.5-4.5M5 14v5h14v-5',
  newgame: 'M5 12a7 7 0 1 0 2.05-4.95M5 4v4h4',
  online: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18',
  modes: 'M8 5v14l11-7z',
  diagnostics: 'M9 4h6v3H9zM8 5H5v15h14V5h-3M9 12h6M9 16h6',
  theme: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 3v18',
  skin: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M8 8.5a5 5 0 0 1 3-2',
  safe: 'M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z',
  scale: 'M10 4.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11M14.5 14.5 20 20M10 7.5v5M7.5 10h5',
  motion: 'M17 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M3 9h7M2 12h8M3 15h7',
  flat: 'M4 5h16v14H4zM7 9h10M7 12h10M7 15h6',
} as const;

export type IconName = keyof typeof ICONS;

/** The icon as inline SVG markup, decorative: the button's text names it. */
export const icon = (name: IconName): string =>
  `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[name]}"/></svg>`;
