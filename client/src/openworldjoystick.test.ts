// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BASE_RADIUS, bindJoystick, DEAD_ZONE, heldKeys } from './openworldjoystick';
import { heldCell } from './openworldmode';
import { GLIDE_MS } from './openworldglide';

// The virtual joystick of the Open world on a touch screen (#1025, #1026): a touch on the left half of the canvas holds the arrow
// keys of the hex direction its drag points to, in the yaw of the camera. The stick holds them and lets go; the hero walks on the
// cadence of the held arrows (#1059, no timer of the stick's own), and it stops when the thumb lifts or a second finger comes down
// (a pinch or a twist of the camera).
const pad = () => document.getElementById('joystick') as HTMLElement;
const knob = () => document.getElementById('joystick-knob') as HTMLElement;
const canvas = () => document.querySelector('canvas') as HTMLCanvasElement;
const LEFT = { x: 100, y: 300 };
const DEG = Math.PI / 180;

// jsdom has no PointerEvent: a mouse event carries the pointer fields the joystick reads.
function pointer(type: string, target: EventTarget, at: { x: number; y: number; id?: number; kind?: string }): void {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y });
  Object.defineProperties(event, { pointerId: { value: at.id ?? 1 }, pointerType: { value: at.kind ?? 'touch' } });
  target.dispatchEvent(event);
}

const stick = (active = true, yaw = 0) => ({ active, yaw, hold: vi.fn((_keys: readonly string[]) => {}) });

let dispose: () => void = () => {};
const bind = (s = stick()) => {
  dispose = bindJoystick(document, s);
  return s;
};

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = `<canvas></canvas><div id="joystick" hidden><span id="joystick-knob"></span></div>`;
});

afterEach(() => {
  dispose();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('heldKeys: the drag direction as the arrow keys of a hex step (#1025)', () => {
  it('holds nothing inside the dead zone, the thumb at rest is no step', () => {
    expect(heldKeys(0, 0)).toEqual([]);
    expect(heldKeys(DEAD_ZONE - 1, 0)).toEqual([]);
    expect(heldKeys(0, DEAD_ZONE - 1)).toEqual([]);
  });

  it('holds the key of each of the six hex directions at its centre angle, at yaw 0', () => {
    expect(heldKeys(50, 0)).toEqual(['ArrowRight']); // 0 degrees
    expect(heldKeys(25, -43)).toEqual(['ArrowUp', 'ArrowRight']); // 60 degrees, up-right
    expect(heldKeys(-25, -43)).toEqual(['ArrowUp', 'ArrowLeft']); // 120 degrees, up-left
    expect(heldKeys(-50, 0)).toEqual(['ArrowLeft']); // 180 degrees
    expect(heldKeys(-25, 43)).toEqual(['ArrowDown', 'ArrowLeft']); // 240 degrees, down-left
    expect(heldKeys(25, 43)).toEqual(['ArrowDown', 'ArrowRight']); // 300 degrees, down-right
  });

  it('the two-key directions are the diagonals heldCell rolls to, the same as the keyboard', () => {
    for (const keys of [heldKeys(25, -43), heldKeys(-25, -43), heldKeys(-25, 43), heldKeys(25, 43)]) {
      expect(heldCell([0, 0], new Set(keys))).not.toBeNull();
    }
  });

  it('at a yaw, the keys are the direction of the hex the drag points to on the screen (#1026)', () => {
    // At 80 degrees of yaw the hex at 60 degrees of the ground shows at -20 degrees on the screen: a drag to the right holds it.
    expect(heldKeys(50, 0, 80 * DEG)).toEqual(['ArrowRight']);
    // A drag up-left (120 degrees) at the same yaw holds the hex at 180 degrees of the ground, which shows at 100: up is nearest.
    expect(heldKeys(-25, -43, 80 * DEG)).toEqual(['ArrowUp']);
  });
});

describe('bindJoystick: a touch on the left half holds the direction, the hero walks while it is held (#1025, #1059)', () => {
  it('shows the base under the thumb and holds the arrows the drag points to, at once', () => {
    const s = bind();
    pointer('pointerdown', canvas(), LEFT);
    expect(pad().hidden).toBe(false);
    expect(pad().style.left).toBe('100px');
    expect(pad().style.top).toBe('300px');
    pointer('pointermove', canvas(), { x: 150, y: 300 }); // 50 px to the right: 0 degrees
    expect(s.hold).toHaveBeenLastCalledWith(['ArrowRight']);
  });

  it('keeps the keys held while the thumb stays on the direction, with no timer of its own: the cadence is the mode\'s', () => {
    const s = bind();
    pointer('pointerdown', canvas(), LEFT);
    pointer('pointermove', canvas(), { x: 150, y: 300 });
    expect(vi.getTimerCount()).toBe(0);
    s.hold.mockClear();
    vi.advanceTimersByTime(GLIDE_MS * 3);
    expect(s.hold).not.toHaveBeenCalled();
  });

  it('a diagonal drag holds both of its keys', () => {
    const s = bind();
    pointer('pointerdown', canvas(), LEFT);
    pointer('pointermove', canvas(), { x: 125, y: 257 }); // up-right
    expect(s.hold).toHaveBeenLastCalledWith(['ArrowUp', 'ArrowRight']);
  });

  it('a change of direction holds the new keys, and a move in the same direction holds the same keys again', () => {
    const s = bind();
    pointer('pointerdown', canvas(), LEFT);
    pointer('pointermove', canvas(), { x: 150, y: 300 }); // right
    pointer('pointermove', canvas(), { x: 160, y: 300 }); // still right
    expect(s.hold).toHaveBeenLastCalledWith(['ArrowRight']);
    pointer('pointermove', canvas(), { x: 50, y: 300 }); // left
    expect(s.hold).toHaveBeenLastCalledWith(['ArrowLeft']);
  });

  it('the drag is read in the yaw of the camera at the time of the move', () => {
    const s = stick(true, 80 * DEG);
    dispose = bindJoystick(document, s);
    pointer('pointerdown', canvas(), LEFT);
    pointer('pointermove', canvas(), { x: 150, y: 300 });
    expect(s.hold).toHaveBeenCalledWith(['ArrowRight']);
  });

  it('the knob follows the thumb and is kept inside the base', () => {
    bind();
    pointer('pointerdown', canvas(), LEFT);
    pointer('pointermove', canvas(), { x: 120, y: 300 });
    expect(knob().style.transform).toBe('translate(20px, 0px)');
    pointer('pointermove', canvas(), { x: 300, y: 300 }); // 200 px away: clamped to the base
    expect(knob().style.transform).toBe(`translate(${BASE_RADIUS}px, 0px)`);
  });

  it('inside the dead zone the knob moves and the stick holds nothing', () => {
    const s = bind();
    pointer('pointerdown', canvas(), LEFT);
    pointer('pointermove', canvas(), { x: 105, y: 300 });
    expect(knob().style.transform).toBe('translate(5px, 0px)');
    expect(s.hold).toHaveBeenLastCalledWith([]);
  });

  it('lifting the thumb hides the base and lets the keys go', () => {
    const s = bind();
    pointer('pointerdown', canvas(), LEFT);
    pointer('pointermove', canvas(), { x: 150, y: 300 });
    pointer('pointerup', canvas(), LEFT);
    expect(pad().hidden).toBe(true);
    expect(s.hold).toHaveBeenLastCalledWith([]);
  });

  it('a cancelled touch stops the stick the same way', () => {
    const s = bind();
    pointer('pointerdown', canvas(), LEFT);
    pointer('pointermove', canvas(), { x: 150, y: 300 });
    pointer('pointercancel', canvas(), LEFT);
    expect(pad().hidden).toBe(true);
    expect(s.hold).toHaveBeenLastCalledWith([]);
  });

  it('a drag back into the dead zone holds nothing: the hero stops at once', () => {
    const s = bind();
    pointer('pointerdown', canvas(), LEFT);
    pointer('pointermove', canvas(), { x: 150, y: 300 });
    pointer('pointermove', canvas(), { x: 102, y: 300 }); // 2 px from the touch: inside the dead zone
    expect(s.hold).toHaveBeenLastCalledWith([]);
    expect(pad().hidden).toBe(false);
  });

  it('a mouse press while a thumb holds the stick is not a second finger: the stick goes on', () => {
    const s = bind();
    pointer('pointerdown', canvas(), LEFT);
    pointer('pointermove', canvas(), { x: 150, y: 300 });
    pointer('pointerdown', canvas(), { x: 200, y: 300, id: 3, kind: 'mouse' });
    expect(pad().hidden).toBe(false);
    expect(s.hold).not.toHaveBeenCalledWith([]);
  });

  it('a move of another finger is not the stick', () => {
    const s = bind();
    pointer('pointerdown', canvas(), LEFT);
    pointer('pointermove', canvas(), { x: 150, y: 300, id: 2 });
    pointer('pointerup', canvas(), { ...LEFT, id: 2 });
    expect(s.hold).not.toHaveBeenCalled();
    expect(pad().hidden).toBe(false);
  });

  it('a second finger ends the stick, so a pinch or a twist of the camera does not roll the hero (#1026)', () => {
    const s = bind();
    pointer('pointerdown', canvas(), LEFT);
    pointer('pointermove', canvas(), { x: 150, y: 300 });
    const onCanvas = vi.fn();
    canvas().addEventListener('pointerdown', onCanvas);
    pointer('pointerdown', canvas(), { x: 200, y: 300, id: 2 }); // the second finger, on the left half too
    expect(pad().hidden).toBe(true);
    expect(onCanvas).toHaveBeenCalled(); // it is the canvas's press: the twist and the pinch
    expect(s.hold).toHaveBeenLastCalledWith([]);
    s.hold.mockClear();
    pointer('pointermove', canvas(), { x: 170, y: 300 });
    expect(s.hold).not.toHaveBeenCalled();
  });

  it('the touch is the stick alone: the canvas does not get the press, so it does not roll the hero (#962)', () => {
    bind();
    const onCanvas = vi.fn();
    canvas().addEventListener('pointerdown', onCanvas);
    pointer('pointerdown', canvas(), LEFT);
    expect(onCanvas).not.toHaveBeenCalled();
  });

  it('disposing removes the stick: a touch is no stick any more, and a held thumb is let go', () => {
    const s = bind();
    pointer('pointerdown', canvas(), LEFT);
    pointer('pointermove', canvas(), { x: 150, y: 300 });
    dispose();
    expect(pad().hidden).toBe(true);
    expect(s.hold).toHaveBeenLastCalledWith([]);
    s.hold.mockClear();
    const onCanvas = vi.fn();
    canvas().addEventListener('pointerdown', onCanvas);
    pointer('pointerdown', canvas(), LEFT);
    expect(onCanvas).toHaveBeenCalled();
    expect(s.hold).not.toHaveBeenCalled();
  });

  it('disposing with no touch down only removes the listeners', () => {
    const s = bind();
    dispose();
    expect(pad().hidden).toBe(true);
    expect(s.hold).not.toHaveBeenCalled();
  });
});

describe('bindJoystick: what is not the stick is left to the page (#1025)', () => {
  it('a touch on the right half is the canvas as before, pinch and taps included (#976)', () => {
    const s = bind();
    const onCanvas = vi.fn();
    canvas().addEventListener('pointerdown', onCanvas);
    pointer('pointerdown', canvas(), { x: 900, y: 300 });
    expect(onCanvas).toHaveBeenCalled();
    expect(pad().hidden).toBe(true);
    expect(s.hold).not.toHaveBeenCalled();
  });

  it('a mouse or a pen never shows the stick: it is for touch screens only', () => {
    const s = bind();
    pointer('pointerdown', canvas(), { ...LEFT, kind: 'mouse' });
    pointer('pointerdown', canvas(), { ...LEFT, kind: 'pen' });
    expect(pad().hidden).toBe(true);
    expect(s.hold).not.toHaveBeenCalled();
  });

  it('a touch on something other than the canvas (a button, the HUD) is left to that element', () => {
    bind();
    const button = document.createElement('button');
    document.body.append(button);
    pointer('pointerdown', button, LEFT);
    expect(pad().hidden).toBe(true);
  });

  it('the stick is off while the Open world is not on', () => {
    const s = bind(stick(false));
    pointer('pointerdown', canvas(), LEFT);
    expect(pad().hidden).toBe(true);
    expect(s.hold).not.toHaveBeenCalled();
  });
});
