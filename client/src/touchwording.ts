/** Whether the main pointer is coarse (a phone or a tablet): there is no keyboard to name (#1379). */
export const isTouch = (): boolean => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/** `label` with its shortcut in brackets, `label` alone on a touch screen. */
export const keyTip = (label: string, key: string, touch: boolean = isTouch()): string => (touch ? label : `${label} (${key})`);
