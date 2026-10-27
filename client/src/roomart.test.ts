// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  createCanvasTexture,
  drawDeckGrating,
  drawHazardStripes,
  drawHollowMoon,
  drawWallPanel,
} from './roomart';

const fakeContext = () => {
  const calls: string[] = [];
  const g = new Proxy({} as Record<string, unknown>, {
    get: (t, k: string) => (k in t ? t[k] : (...a: unknown[]) => { calls.push(k); void a; }),
  });
  return { g: g as unknown as CanvasRenderingContext2D, calls };
};

describe('roomart procedural spaceship textures (#478)', () => {
  it('drawWallPanel paints a dark steel panel with seam lines and rivet dots', () => {
    const { g, calls } = fakeContext();
    drawWallPanel(g, 512, 512);
    expect(calls[0]).toBe('fillRect');
    expect(calls).toContain('stroke');
    expect(calls).toContain('arc');
  });

  it('drawHazardStripes paints angled warning chevrons and border lines', () => {
    const { g, calls } = fakeContext();
    drawHazardStripes(g, 256, 64);
    expect(calls[0]).toBe('fillRect');
    expect(calls).toContain('fill');
    expect(calls).toContain('stroke');
  });

  it('drawDeckGrating paints industrial floor tile seams and tread lines', () => {
    const { g, calls } = fakeContext();
    drawDeckGrating(g, 512, 512);
    expect(calls[0]).toBe('fillRect');
    expect(calls).toContain('stroke');
  });

  it('drawHollowMoon paints celestial disc with dark maria, impact craters and glass veins', () => {
    const { g, calls } = fakeContext();
    drawHollowMoon(g, 512, 512);
    expect(calls[0]).toBe('fillRect');
    expect(calls).toContain('arc');
    expect(calls).toContain('stroke');
    expect(calls).toContain('fill');
  });

  it('createCanvasTexture renders the drawer onto an HTMLCanvasElement', () => {
    const { g } = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => g as unknown as RenderingContext);
    let invoked = false;
    const canvas = createCanvasTexture(64, 64, () => {
      invoked = true;
    });
    expect(canvas.width).toBe(64);
    expect(canvas.height).toBe(64);
    expect(invoked).toBe(true);
  });

  it('createCanvasTexture uses provided canvas factory when supplied', () => {
    let invoked = false;
    const { g } = fakeContext();
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: () => g,
    } as unknown as HTMLCanvasElement;

    const canvas = createCanvasTexture(
      32,
      16,
      () => {
        invoked = true;
      },
      (w, h) => {
        fakeCanvas.width = w;
        fakeCanvas.height = h;
        return fakeCanvas;
      },
    );
    expect(canvas.width).toBe(32);
    expect(canvas.height).toBe(16);
    expect(invoked).toBe(true);
  });

  it('handles null canvas context gracefully without throwing', () => {
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: () => null,
    } as unknown as HTMLCanvasElement;
    let drawn = false;
    createCanvasTexture(
      10,
      10,
      () => {
        drawn = true;
      },
      () => fakeCanvas,
    );
    expect(drawn).toBe(false);
  });
});
