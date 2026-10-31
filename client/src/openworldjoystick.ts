// The Open world's virtual joystick (#1025, docs/specs/openworld.md): on a touch screen a touch on the left half of the canvas
// shows a floating base under the thumb. Dragging from it holds the arrow keys of the hex direction the drag points to, so the
// hero rolls the way the keys roll it (`heldCell`, openworldmode.ts), walks on while the thumb is held off the dead zone, and
// stops when the thumb lifts. Only touches claim it: a mouse, a pen, the right half and the other elements keep their own
// behaviour, the pinch of the camera (#976) included.

/** The keys of the stick: the subset the mode reads (`openworldmode.ts`), so a test can stand in for it. */
export interface Stick {
  readonly active: boolean;
  key(key: string): boolean;
  release(key?: string): void;
}

/** Inside this many px of the touch the stick holds nothing: a thumb at rest is no step. */
export const DEAD_ZONE = 14;
/** The farthest the knob travels from the base, in px. */
export const BASE_RADIUS = 48;
/** The time between two steps while the stick is held, in ms. */
export const STEP_MS = 180;

/** The keys of the six hex directions, from 0 degrees (right) counter-clockwise, each on a sector of 60 degrees. A diagonal
 * holds one vertical and one horizontal key, as the keyboard does. */
const SECTORS: string[][] = [
  ['ArrowRight'],
  ['ArrowUp', 'ArrowRight'],
  ['ArrowUp', 'ArrowLeft'],
  ['ArrowLeft'],
  ['ArrowDown', 'ArrowLeft'],
  ['ArrowDown', 'ArrowRight'],
];

/** The keys a drag of `dx`, `dy` px holds: the direction it points to, snapped to the nearest hex direction; none inside the dead
 * zone. Screen y goes down, so the angle is taken on -dy. */
export function heldKeys(dx: number, dy: number): string[] {
  if (Math.hypot(dx, dy) < DEAD_ZONE) return [];
  const degrees = (Math.atan2(-dy, dx) * 180) / Math.PI;
  return SECTORS[(Math.round(degrees / 60) + 6) % 6]!;
}

/** Binds the joystick of `root` (the canvas and the `#joystick` base with its `#joystick-knob`) to `stick`. The steps repeat every
 * `step` ms while held. Returns what removes the binding. */
export function bindJoystick(root: Document, stick: Stick, step = STEP_MS): () => void {
  const pad = root.getElementById('joystick') as HTMLElement;
  const knob = root.getElementById('joystick-knob') as HTMLElement;
  let touch: { id: number; x: number; y: number } | null = null;
  let held: string[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;

  // The keys are held as the drag points: the one that is no longer pointed to is let go. A step rolls the hero by the first key,
  // since the mode reads the other one from the held keys (`heldCell`).
  const hold = (keys: string[]): void => {
    for (const key of held) if (!keys.includes(key)) stick.release(key);
    held = keys;
    if (keys.length) stick.key(keys[0]!);
  };
  const stop = (): void => {
    hold([]);
    clearInterval(timer);
    timer = undefined;
    touch = null;
    pad.hidden = true;
  };
  const down = (e: PointerEvent): void => {
    if (touch || e.pointerType !== 'touch' || !(e.target instanceof HTMLCanvasElement) || e.clientX >= innerWidth / 2 || !stick.active) return;
    e.stopPropagation(); // the press is the stick's: the canvas does not roll the hero on it (#962)
    touch = { id: e.pointerId, x: e.clientX, y: e.clientY };
    pad.style.left = `${e.clientX}px`;
    pad.style.top = `${e.clientY}px`;
    knob.style.transform = 'translate(0px, 0px)';
    pad.hidden = false;
    timer = setInterval(() => {
      if (!stick.active) stop();
      else if (held.length) stick.key(held[0]!);
    }, step);
  };
  const move = (e: PointerEvent): void => {
    if (!touch || e.pointerId !== touch.id) return;
    const dx = e.clientX - touch.x;
    const dy = e.clientY - touch.y;
    const scale = Math.min(1, BASE_RADIUS / Math.hypot(dx, dy));
    knob.style.transform = `translate(${Math.round(dx * scale)}px, ${Math.round(dy * scale)}px)`;
    hold(heldKeys(dx, dy));
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
