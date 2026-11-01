// The gamepad (#1252, game-design.md section 2 item 7): a pad of the browser's `standard` layout, read once per frame,
// turned into actions that main.ts plays on the keyboard's paths. No game logic here.

export type PadAction =
  | { kind: 'confirm' | 'back' | 'menu' | 'prev' | 'next' }
  /** The D-pad or the left stick: the nearest board direction (as KEY_DIRS) and a focus step (up and left -1). */
  | { kind: 'move'; hex: number; step: 1 | -1 }
  /** The right stick: pixels of a pointer drag, for camera.ts orbit. */
  | { kind: 'orbit'; dx: number; dy: number }
  /** The triggers: a zoom scale, for camera.ts zoom. */
  | { kind: 'zoom'; scale: number };

export const REPEAT_DELAY = 400; // ms a held aim, LB or RB waits before it repeats
export const REPEAT_EVERY = 150;
const BUTTONS = [['confirm', 0], ['back', 1], ['prev', 4], ['next', 5], ['menu', 9]] as const;
const ONCE = new Set(['confirm', 'back', 'menu']); // these never repeat
const AIM_DEAD = 0.5; // the left stick aims past half way
const ORBIT_DEAD = 0.2;
const ORBIT_PX_PER_MS = 0.3;
const TRIGGER_DEAD = 0.1;
const ZOOM_PER_MS = 0.002;
const MAX_FRAME_MS = 50;
// Board direction codes (E, W, NE, SW, NW, SE) by 60 degree steps from east, counterclockwise.
const HEX = [0, 2, 4, 1, 3, 5];

/** The aim of the D-pad, else of the left stick past its dead zone, else null. */
function aim(pad: Gamepad): { hex: number; step: 1 | -1 } | null {
  const on = (i: number): number => Number(pad.buttons[i]!.pressed);
  let x = on(15) - on(14);
  let y = on(13) - on(12);
  if (x === 0 && y === 0) [x, y] = [pad.axes[0]!, pad.axes[1]!];
  if (Math.hypot(x, y) <= AIM_DEAD) return null;
  const deg = ((Math.atan2(-y, x) * 180) / Math.PI + 360) % 360;
  return { hex: HEX[Math.round(deg / 60) % 6]!, step: deg > 45 && deg < 225 ? -1 : 1 };
}

/** A poller to call once per frame: it reads the first connected standard pad and calls `act` for each action. A press
 * acts once, a held aim, LB or RB repeats. A pad that is gone acts on nothing (#1252: a disconnect changes no state). */
export function gamepad(act: (action: PadAction) => void): (now: number) => void {
  const held = new Map<string, number>(); // what is held, and the time of its next repeat
  let last = -1;
  return (now) => {
    const ms = last < 0 ? 0 : Math.min(now - last, MAX_FRAME_MS);
    last = now;
    const pad = (navigator.getGamepads?.() ?? []).find((p) => p?.connected && p.mapping === 'standard');
    if (!pad) return held.clear();
    const down = new Map<string, PadAction>();
    for (const [kind, i] of BUTTONS) if (pad.buttons[i]!.pressed) down.set(kind, { kind });
    const at = aim(pad);
    if (at) down.set(`move ${at.hex} ${at.step}`, { kind: 'move', ...at });
    for (const id of held.keys()) if (!down.has(id)) held.delete(id);
    for (const [id, action] of down) {
      const due = held.get(id);
      if (due === undefined) held.set(id, ONCE.has(id) ? Infinity : now + REPEAT_DELAY);
      else if (now >= due) held.set(id, now + REPEAT_EVERY);
      else continue;
      act(action);
    }
    const [, , rx, ry] = pad.axes as [number, number, number, number];
    if (Math.hypot(rx, ry) > ORBIT_DEAD) act({ kind: 'orbit', dx: rx * ORBIT_PX_PER_MS * ms, dy: ry * ORBIT_PX_PER_MS * ms });
    const pull = pad.buttons[7]!.value - pad.buttons[6]!.value;
    if (Math.abs(pull) > TRIGGER_DEAD) act({ kind: 'zoom', scale: Math.exp(-pull * ZOOM_PER_MS * ms) });
  };
}

const shown = (el: HTMLElement): boolean => !el.closest('[hidden]') && (el.checkVisibility?.() ?? true); // jsdom has no checkVisibility
/** The next (`step` 1) or previous tab stop from `from` in page order, shown and enabled, wrapping at both ends; the
 * body when there is none. */
export function nextFocus(from: Element | null, step: 1 | -1): HTMLElement {
  const stops = [...document.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]')].filter(
    (el) => el.tabIndex >= 0 && !(el as HTMLButtonElement).disabled && shown(el),
  );
  const at = stops.indexOf(from as HTMLElement);
  const from0 = at < 0 ? (step > 0 ? -1 : 0) : at;
  return stops[(from0 + step + stops.length) % stops.length] ?? document.body;
}
