// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BASE_RADIUS, bindJoystick, DEAD_ZONE, heldKeys, STEP_MS } from './openworldjoystick';
import { heldCell } from './openworldmode';

// The virtual joystick of the Open world on a touch screen (#1025): a touch on the left half of the canvas holds the arrow keys
// of the hex direction its drag points to, the hero walks on while it is held, and it stops when the thumb lifts.
const pad = () => document.getElementById('joystick') as HTMLElement;
const knob = () => document.getElementById('joystick-knob') as HTMLElement;
const canvas = () => document.querySelector('canvas') as HTMLCanvasElement;
const LEFT = { x: 100, y: 300 };

// jsdom has no PointerEvent: a mouse event carries the pointer fields the joystick reads.
function pointer(type: string, target: EventTarget, at: { x: number; y: number; id?: number; kind?: string }): void {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y });
  Object.defineProperties(event, { pointerId: { value: at.id ?? 1 }, pointerType: { value: at.kind ?? 'touch' } });
  target.dispatchEvent(event);
}

const stick = (active = true) => ({ active, key: vi.fn((_key: string) => true), release: vi.fn((_key?: string) => {}) });

let dispose: () => void = () => {};
const bind = (s = stick(), step = STEP_MS) => {
  dispose = bindJoystick(document, s, step);
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

  it('holds the key of each of the six hex directions at its centre angle', () => {
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
});

describe('bindJoystick: a touch on the left half holds the direction, the hero walks while it is held (#1025)', () => {
  it('shows the base under the thumb and holds the key of the drag, rolling the hero once at once', () => {
    const s = bind();
    pointer('pointerdown', canvas(), LEFT);
    expect(pad().hidden).toBe(false);
    expect(pad().style.left).toBe('100px');
    expect(pad().style.top).toBe('300px');
    pointer('pointermove', canvas(), { x: 150, y: 300 }); // 50 px to the right: 0 degrees
    expect(s.key).toHaveBeenCalledWith('ArrowRight');
  });

  it('keeps stepping while the thumb is held on the direction, one roll per step', () => {
    const s = bind();
    pointer('pointerdown', canvas(), LEFT);
    pointer('pointermove', canvas(), { x: 150, y: 300 });
    s.key.mockClear();
    vi.advanceTimersByTime(STEP_MS * 3);
    expect(s.key).toHaveBeenCalledTimes(3);
    expect(s.key).toHaveBeenLastCalledWith('ArrowRight');
  });

  it('a diagonal drag holds both keys and rolls on the diagonal by the step key', () => {
    const s = bind();
    pointer('pointerdown', canvas(), LEFT);
    pointer('pointermove', canvas(), { x: 125, y: 257 }); // up-right
    expect(s.key).toHaveBeenLastCalledWith('ArrowUp');
    expect(s.release).not.toHaveBeenCalled();
  });

  it('a change of direction releases the key it leaves and holds the new one', () => {
    const s = bind();
    pointer('pointerdown', canvas(), LEFT);
    pointer('pointermove', canvas(), { x: 150, y: 300 }); // right
    pointer('pointermove', canvas(), { x: 50, y: 300 }); // left
    expect(s.release).toHaveBeenCalledWith('ArrowRight');
    expect(s.key).toHaveBeenLastCalledWith('ArrowLeft');
  });

  it('the knob follows the thumb and is kept inside the base', () => {
    bind();
    pointer('pointerdown', canvas(), LEFT);
    pointer('pointermove', canvas(), { x: 120, y: 300 });
    expect(knob().style.transform).toBe('translate(20px, 0px)');
    pointer('pointermove', canvas(), { x: 300, y: 300 }); // 200 px away: clamped to the base
    expect(knob().style.transform).toBe(`translate(${BASE_RADIUS}px, 0px)`);
  });

  it('inside the dead zone the knob moves and the hero does not', () => {
    const s = bind();
    pointer('pointerdown', canvas(), LEFT);
    pointer('pointermove', canvas(), { x: 105, y: 300 });
    expect(knob().style.transform).toBe('translate(5px, 0px)');
    vi.advanceTimersByTime(STEP_MS * 2);
    expect(s.key).not.toHaveBeenCalled();
  });

  it('lifting the thumb releases the held keys, hides the base and stops the steps', () => {
    const s = bind();
    pointer('pointerdown', canvas(), LEFT);
    pointer('pointermove', canvas(), { x: 150, y: 300 });
    pointer('pointerup', canvas(), LEFT);
    expect(s.release).toHaveBeenCalledWith('ArrowRight');
    expect(pad().hidden).toBe(true);
    s.key.mockClear();
    vi.advanceTimersByTime(STEP_MS * 3);
    expect(s.key).not.toHaveBeenCalled();
  });

  it('a cancelled touch stops the stick the same way', () => {
    const s = bind();
    pointer('pointerdown', canvas(), LEFT);
    pointer('pointermove', canvas(), { x: 150, y: 300 });
    pointer('pointercancel', canvas(), LEFT);
    expect(s.release).toHaveBeenCalledWith('ArrowRight');
    expect(pad().hidden).toBe(true);
  });

  it('a move of another finger is not the stick', () => {
    const s = bind();
    pointer('pointerdown', canvas(), LEFT);
    pointer('pointermove', canvas(), { x: 150, y: 300, id: 2 });
    pointer('pointerup', canvas(), { ...LEFT, id: 2 });
    expect(s.key).not.toHaveBeenCalled();
    expect(pad().hidden).toBe(false);
  });

  it('the touch is the stick alone: the canvas does not get the press, so it does not roll the hero (#962)', () => {
    bind();
    const onCanvas = vi.fn();
    canvas().addEventListener('pointerdown', onCanvas);
    pointer('pointerdown', canvas(), LEFT);
    expect(onCanvas).not.toHaveBeenCalled();
  });

  it('the stick stops when the Open world is left under the thumb', () => {
    const s = bind();
    pointer('pointerdown', canvas(), LEFT);
    pointer('pointermove', canvas(), { x: 150, y: 300 });
    s.active = false;
    vi.advanceTimersByTime(STEP_MS);
    expect(s.release).toHaveBeenCalledWith('ArrowRight');
    expect(pad().hidden).toBe(true);
    expect(s.key).toHaveBeenCalledTimes(1); // only the roll of the drag itself
  });

  it('disposing removes the stick: a touch is no stick any more, and a held thumb is let go', () => {
    const s = bind();
    pointer('pointerdown', canvas(), LEFT);
    pointer('pointermove', canvas(), { x: 150, y: 300 });
    dispose();
    expect(s.release).toHaveBeenCalledWith('ArrowRight');
    expect(pad().hidden).toBe(true);
    const onCanvas = vi.fn();
    canvas().addEventListener('pointerdown', onCanvas);
    pointer('pointerdown', canvas(), LEFT);
    expect(onCanvas).toHaveBeenCalled();
  });

  it('disposing with no touch down only removes the listeners', () => {
    bind();
    dispose();
    expect(pad().hidden).toBe(true);
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
    expect(s.key).not.toHaveBeenCalled();
  });

  it('a mouse or a pen never shows the stick: it is for touch screens only', () => {
    const s = bind();
    pointer('pointerdown', canvas(), { ...LEFT, kind: 'mouse' });
    pointer('pointerdown', canvas(), { ...LEFT, kind: 'pen' });
    expect(pad().hidden).toBe(true);
    expect(s.key).not.toHaveBeenCalled();
  });

  it('a touch on something other than the canvas (a button, the HUD) is left to that element', () => {
    bind();
    const button = document.createElement('button');
    document.body.append(button);
    pointer('pointerdown', button, LEFT);
    expect(pad().hidden).toBe(true);
  });

  it('a second finger while the stick is held is not a second stick', () => {
    const s = bind();
    pointer('pointerdown', canvas(), LEFT);
    pointer('pointerdown', canvas(), { ...LEFT, id: 2 });
    pointer('pointermove', canvas(), { x: 150, y: 300, id: 2 });
    expect(s.key).not.toHaveBeenCalled();
  });

  it('the stick is off while the Open world is not on', () => {
    bind(stick(false));
    pointer('pointerdown', canvas(), LEFT);
    expect(pad().hidden).toBe(true);
  });
});
