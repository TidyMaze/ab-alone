// UI scale (#382, docs/specs/world.md section 8): the HUD and the settings menu grow in steps, the board does not.
// The HUD plate sits at the top left at a fixed place, so at 200 % it covers board cells in every window but a large
// desktop: the steps offered stop at the cap of the window (maxUiScale).
export const UI_SCALES = [100, 125, 150, 175, 200] as const;
export type UiScale = (typeof UI_SCALES)[number];

/** The largest step the window has room for: 200 % from a 1600 by 900 window up, 150 % from 800 px wide, 125 % on a phone (#927). */
export const maxUiScale = (width: number, height: number): UiScale => (width >= 1600 && height >= 900 ? 200 : width >= 800 ? 150 : 125);

/** A stored step, applied at the cap when it is above it. */
export const clampUiScale = (scale: UiScale, max: UiScale): UiScale => (scale > max ? max : scale);

/** The choice after a press on the UI scale item: the next step up to the cap, then 100 again. */
export const nextUiScale = (scale: UiScale, max: UiScale): UiScale => UI_SCALES.find((s) => s > scale && s <= max) ?? 100;

/** The value of the `--ui-scale` custom property for a step: 100 % is 1, 200 % is 2. */
export const uiScaleFactor = (scale: UiScale): string => String(scale / 100);
