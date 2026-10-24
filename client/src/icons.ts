// The icon set (#287): line icons drawn here on a 24 px grid, thin strokes in currentColor, so a button's text colour
// paints them (docs/specs/world.md section 5). The settings menu uses them, the HUD buttons will too (#297).
export const ICONS = {
  fog: 'M3 8c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M3 12c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M3 16c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0',
  sound: 'M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12',
  muted: 'M4 9h4l5-4v14l-5-4H4zM17 9.5l5 5M22 9.5l-5 5',
  export: 'M12 15V4M7.5 8.5 12 4l4.5 4.5M5 14v5h14v-5',
  import: 'M12 4v11M7.5 10.5 12 15l4.5-4.5M5 14v5h14v-5',
} as const;

export type IconName = keyof typeof ICONS;

/** The icon as inline SVG markup, decorative: the button's text names it. */
export const icon = (name: IconName): string =>
  `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[name]}"/></svg>`;
