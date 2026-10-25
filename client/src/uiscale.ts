// UI scale (#382, docs/specs/world.md section 8): the HUD and the settings menu grow in steps, the board does not.
export const UI_SCALES = [100, 125, 150, 175, 200] as const;
export type UiScale = (typeof UI_SCALES)[number];

/** The choice after a press on the UI scale item: 100, 125, 150, 175, 200, then 100 again. */
export const nextUiScale = (scale: UiScale): UiScale => UI_SCALES[(UI_SCALES.indexOf(scale) + 1) % UI_SCALES.length]!;

/** The value of the `--ui-scale` custom property for a step: 100 % is 1, 200 % is 2. */
export const uiScaleFactor = (scale: UiScale): string => String(scale / 100);
