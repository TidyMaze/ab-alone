// The Open world's virtual joystick (#1025, #1026, docs/specs/openworld.md): on a touch screen a touch on the left half of the canvas
// shows a floating base under the thumb. Dragging from it points the hero's step: the arrows of the drag's screen direction, read in
// the yaw of the camera, so the hero rolls to the hex the drag points to on the screen (`heldKeys`, `stepOf`, openworldmode.ts). It
// walks on while the thumb is held off the dead zone, and stops when the thumb lifts or a second finger comes down: a pinch or a
// twist of the camera (#976, #1026) is the canvas's, not the stick's.

/** The stick the joystick drives: the Open world mode, through the methods it reads. */
export interface Stick {
  readonly active: boolean;
  /** The yaw of the camera round the hero, in radians: the drag is read in it. */
  readonly yaw: number;
  /** Rolls the hero one step in the direction of the arrows held together (both of a diagonal at once). */
  step(keys: readonly string[]): void;
}

/** Inside this many px of the touch the stick holds nothing: a thumb at rest is no step. */
export const DEAD_ZONE = 14;
/** The farthest the knob travels from the base, in px. */
export const BASE_RADIUS = 48;
/** The time between two steps while the stick is held, in ms. */
export const STEP_MS = 180;

/** The hex directions are 60 degrees apart; the keys are 45 degrees apart (eight of them, a diagonal being two keys). */
const HEX = Math.PI / 3;
const KEYS: string[][] = [
  ['ArrowRight'],
  ['ArrowUp', 'ArrowRight'],
  ['ArrowUp'],
  ['ArrowUp', 'ArrowLeft'],
  ['ArrowLeft'],
  ['ArrowDown', 'ArrowLeft'],
  ['ArrowDown'],
  ['ArrowDown', 'ArrowRight'],
];

/** The keys of the screen direction `angle` (radians, counter-clockwise from the right), the nearest of the eight. */
const keysAt = (angle: number): string[] => KEYS[(((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8)]!;

/** The keys a drag of `dx`, `dy` px holds, in the camera's yaw (radians, 0 at the default angle): the hex of the ground the drag
 * points to on the screen, which a neighbour shows at its ground angle minus the yaw, is the one nearest to the drag plus the yaw;
 * the keys of its screen direction are then the step (the hero rolls the way the keys do, `stepOf`). None inside the dead zone.
 * Screen y goes down, so the angle is taken on -dy. */
export function heldKeys(dx: number, dy: number, yaw = 0): string[] {
  if (Math.hypot(dx, dy) < DEAD_ZONE) return [];
  const hex = Math.round((Math.atan2(-dy, dx) + yaw) / HEX) * HEX;
  return keysAt(hex - yaw);
}

/** Binds the joystick of `root` (the canvas and the `#joystick` base with its `#joystick-knob`) to `stick`. The hero steps again every
 * `step` ms while the thumb holds the same direction. Returns what removes the binding. */
export function bindJoystick(root: Document, stick: Stick, step = STEP_MS): () => void {
  const pad = root.getElementById('joystick') as HTMLElement;
  const knob = root.getElementById('joystick-knob') as HTMLElement;
  let touch: { id: number; x: number; y: number } | null = null;
  let held: readonly string[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;

  // A new direction steps the hero at once; the same one steps it on the timer.
  const hold = (keys: string[]): void => {
    if (keys.join() === held.join()) return;
    held = keys;
    if (keys.length) stick.step(keys);
  };
  const stop = (): void => {
    held = [];
    clearInterval(timer);
    timer = undefined;
    touch = null;
    pad.hidden = true;
  };
  const down = (e: PointerEvent): void => {
    if (touch) {
      if (e.pointerType === 'touch' && e.pointerId !== touch.id) stop(); // a second finger: a pinch or a twist, the stick lets go
      return;
    }
    if (e.pointerType !== 'touch' || !(e.target instanceof HTMLCanvasElement) || e.clientX >= innerWidth / 2 || !stick.active) return;
    e.stopPropagation(); // the press is the stick's: the canvas does not roll the hero on it (#962)
    touch = { id: e.pointerId, x: e.clientX, y: e.clientY };
    pad.style.left = `${e.clientX}px`;
    pad.style.top = `${e.clientY}px`;
    knob.style.transform = 'translate(0px, 0px)';
    pad.hidden = false;
    timer = setInterval(() => {
      if (!stick.active) stop();
      else if (held.length) stick.step(held);
    }, step);
  };
  const move = (e: PointerEvent): void => {
    if (!touch || e.pointerId !== touch.id) return;
    const dx = e.clientX - touch.x;
    const dy = e.clientY - touch.y;
    const scale = Math.min(1, BASE_RADIUS / Math.hypot(dx, dy));
    knob.style.transform = `translate(${Math.round(dx * scale)}px, ${Math.round(dy * scale)}px)`;
    hold(heldKeys(dx, dy, stick.yaw));
  };
  const end = (e: PointerEvent): void => {
    if (touch && e.pointerId === touch.id) stop();
  };
  root.addEventListener('pointerdown', down, { capture: true });
  root.addEventListener('pointermove', move);
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
  return () => {
    root.removeEventListener('pointerdown', down, { capture: true });
    root.removeEventListener('pointermove', move);
    root.removeEventListener('pointerup', end);
    root.removeEventListener('pointercancel', end);
    if (touch) stop();
  };
}
