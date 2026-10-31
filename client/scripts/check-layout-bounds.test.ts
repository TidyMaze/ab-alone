// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  auditPresets,
  auditViewport,
  checkLayoutProblems,
  afterTwoFrames,
  extractViewportInput,
  formatReport,
  main,
  meets,
  onScreen,
  overlapAmount,
  PRESET_VIEWPORTS,
  type Box,
  type EvaluatorPage,
  type ViewportCheckInput,
  type ViewportPreset,
} from './check-layout-bounds';

describe('check-layout-bounds', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    delete (window as any).__cellToScreen;
  });

  describe('meets', () => {
    it('returns true when two boxes overlap', () => {
      const a: Box = { left: 0, top: 0, right: 10, bottom: 10 };
      const b: Box = { left: 5, top: 5, right: 15, bottom: 15 };
      expect(meets(a, b)).toBe(true);
    });

    it('returns false when two boxes are disjoint', () => {
      const a: Box = { left: 0, top: 0, right: 10, bottom: 10 };
      const b: Box = { left: 11, top: 11, right: 20, bottom: 20 };
      expect(meets(a, b)).toBe(false);
    });

    it('returns false when two boxes only touch edges', () => {
      const a: Box = { left: 0, top: 0, right: 10, bottom: 10 };
      const b: Box = { left: 10, top: 0, right: 20, bottom: 10 };
      expect(meets(a, b)).toBe(false);
    });
  });

  describe('overlapAmount', () => {
    it('returns 0 if boxes do not intersect', () => {
      const a: Box = { left: 0, top: 0, right: 10, bottom: 10 };
      const b: Box = { left: 20, top: 0, right: 30, bottom: 10 };
      expect(overlapAmount(a, b)).toBe(0);
    });

    it('returns minimum 1D overlap in pixels when boxes intersect', () => {
      const a: Box = { left: 0, top: 0, right: 10, bottom: 10 };
      const b: Box = { left: 8, top: 5, right: 15, bottom: 15 };
      expect(overlapAmount(a, b)).toBe(2);
    });
  });

  describe('onScreen', () => {
    it('returns true when box is completely within viewport', () => {
      const b: Box = { left: 0, top: 0, right: 360, bottom: 780 };
      expect(onScreen(b, 360, 780)).toBe(true);
    });

    it('returns false if box overflows horizontally or vertically', () => {
      expect(onScreen({ left: -1, top: 0, right: 10, bottom: 10 }, 360, 780)).toBe(false);
      expect(onScreen({ left: 0, top: -1, right: 10, bottom: 10 }, 360, 780)).toBe(false);
      expect(onScreen({ left: 0, top: 0, right: 361, bottom: 10 }, 360, 780)).toBe(false);
      expect(onScreen({ left: 0, top: 0, right: 10, bottom: 781 }, 360, 780)).toBe(false);
    });
  });

  describe('checkLayoutProblems', () => {
    const defaultInput: ViewportCheckInput = {
      innerWidth: 360,
      innerHeight: 780,
      hud: { left: 10, top: 10, right: 150, bottom: 60 },
      cells: [
        { name: 'cell 0,0', centre: { x: 180, y: 390 }, disc: { left: 160, top: 370, right: 200, bottom: 410 } },
        { name: 'cell 0,-4', centre: { x: 110, y: 120 }, disc: { left: 102, top: 110, right: 120, bottom: 130 } },
      ],
      elements: [],
      isTouch: true,
    };

    it('detects no problems on a clean layout', () => {
      const input: ViewportCheckInput = {
        ...defaultInput,
        elements: [
          {
            name: 'Sound',
            tag: 'BUTTON',
            box: { left: 10, top: 70, right: 54, bottom: 114 },
            isSettingsButton: true,
          },
        ],
      };
      expect(checkLayoutProblems(input)).toEqual([]);
    });

    it('detects when HUD covers a cell disc', () => {
      const input: ViewportCheckInput = {
        ...defaultInput,
        hud: { left: 100, top: 100, right: 150, bottom: 150 },
      };
      const problems = checkLayoutProblems(input);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatchObject({
        kind: 'hud-covers-cell',
        targetName: 'cell 0,-4',
      });
    });

    it('detects when an element covers the HUD', () => {
      const input: ViewportCheckInput = {
        ...defaultInput,
        elements: [
          {
            name: 'Overlapping Button',
            tag: 'BUTTON',
            box: { left: 10, top: 10, right: 50, bottom: 50 },
          },
        ],
      };
      const problems = checkLayoutProblems(input);
      expect(problems.some((p) => p.kind === 'element-covers-hud')).toBe(true);
    });

    it("the HUD's own fold button lies on the HUD without covering it (#957)", () => {
      const fold = { id: 'hud-fold', name: 'HUD panel', tag: 'BUTTON', box: { left: 10, top: 10, right: 50, bottom: 50 } };
      const problems = checkLayoutProblems({ ...defaultInput, elements: [fold] });
      expect(problems.some((p) => p.kind === 'element-covers-hud')).toBe(false);
    });

    it('detects when an element is off screen', () => {
      const input: ViewportCheckInput = {
        ...defaultInput,
        elements: [
          {
            name: 'Volume Slider',
            tag: 'INPUT',
            box: { left: 300, top: 100, right: 380, bottom: 140 },
          },
        ],
      };
      const problems = checkLayoutProblems(input);
      expect(problems.some((p) => p.kind === 'element-offscreen')).toBe(true);
    });

    it('detects when an element covers a cell disc and records overlap amount', () => {
      const input: ViewportCheckInput = {
        ...defaultInput,
        elements: [
          {
            name: 'Logs',
            tag: 'BUTTON',
            box: { left: 50, top: 110, right: 105, bottom: 154 },
          },
        ],
      };
      const problems = checkLayoutProblems(input);
      const overlap = problems.find((p) => p.kind === 'element-covers-cell');
      expect(overlap).toBeDefined();
      expect(overlap?.elementName).toBe('Logs');
      expect(overlap?.targetName).toBe('cell 0,-4');
      expect(overlap?.overlapPx).toBe(3);
    });

    it('lets an item of the open settings menu lie over a cell, the owner choice of e2e/phone-layout.spec.ts (#1134)', () => {
      const input: ViewportCheckInput = {
        ...defaultInput,
        elements: [
          {
            name: 'Logs',
            tag: 'BUTTON',
            box: { left: 50, top: 110, right: 105, bottom: 154 },
            isSettingsButton: true,
            inSettingsMenu: true,
          },
        ],
      };
      expect(checkLayoutProblems(input)).toEqual([]);
    });

    it('detects touch targets under 44px for settings buttons on touch devices', () => {
      const input: ViewportCheckInput = {
        ...defaultInput,
        elements: [
          {
            name: 'Compact Button',
            tag: 'BUTTON',
            box: { left: 10, top: 70, right: 40, bottom: 110 },
            isSettingsButton: true,
          },
        ],
      };
      const problems = checkLayoutProblems(input);
      const small = problems.find((p) => p.kind === 'touch-target-small');
      expect(small).toBeDefined();
      expect(small?.elementName).toBe('Compact Button');
    });

    it('ignores small button touch target check when isTouch is false', () => {
      const input: ViewportCheckInput = {
        ...defaultInput,
        isTouch: false,
        elements: [
          {
            name: 'Desktop Button',
            tag: 'BUTTON',
            box: { left: 10, top: 70, right: 40, bottom: 110 },
            isSettingsButton: true,
          },
        ],
      };
      expect(checkLayoutProblems(input)).toEqual([]);
    });
  });

  describe('formatReport', () => {
    it('formats a passing report', () => {
      const report = formatReport('phone-portrait-360', []);
      expect(report).toBe('[PASS] phone-portrait-360: all controls clear HUD, cells, and screen bounds.');
    });

    it('formats a failing report with problem descriptions', () => {
      const report = formatReport('phone-portrait-360', [
        {
          kind: 'element-covers-cell',
          elementName: 'Logs',
          targetName: 'cell 0,-4',
          overlapPx: 4.9,
          description: 'Logs covers cell 0,-4 by 4.9px',
        },
      ]);
      expect(report).toContain('[FAIL] phone-portrait-360 (1 issue):');
      expect(report).toContain('- Logs covers cell 0,-4 by 4.9px');
    });

    it('formats a failing report with plural issues', () => {
      const report = formatReport('phone-portrait-360', [
        { kind: 'element-offscreen', description: 'Btn 1 is off screen' },
        { kind: 'element-offscreen', description: 'Btn 2 is off screen' },
      ]);
      expect(report).toContain('[FAIL] phone-portrait-360 (2 issues):');
    });
  });

  describe('extractViewportInput', () => {
    it('extracts HUD, cells and visible elements with text, aria-label, id and tag fallbacks', () => {
      document.body.innerHTML = `
        <div id="hud"></div>
        <div id="settings-menu">
          <button id="btn-sound">Sound</button>
          <button id="btn-aria" aria-label="Aria Button"></button>
          <button id="btn-id-only"></button>
          <button></button>
        </div>
        <div id="eval"></div>
        <button id="hidden-btn" style="display: none;"></button>
      `;

      const hud = document.getElementById('hud')!;
      hud.getBoundingClientRect = () => ({ left: 10, top: 10, right: 100, bottom: 40, width: 90, height: 30 } as any);

      for (const btn of document.querySelectorAll('button')) {
        btn.scrollIntoView = vi.fn();
        btn.getBoundingClientRect = () => ({ left: 20, top: 50, right: 70, bottom: 95, width: 50, height: 45 } as any);
        btn.getClientRects = () => (btn.id === 'hidden-btn' ? [] : [{}]) as any;
      }

      const evalEl = document.getElementById('eval')!;
      evalEl.getBoundingClientRect = () => ({ left: 5, top: 5, right: 50, bottom: 25, width: 45, height: 20 } as any);
      evalEl.getClientRects = () => [{}] as any;
      evalEl.scrollIntoView = vi.fn();

      (window as any).__cellToScreen = (q: number, r: number) => ({ x: 100 + q * 20, y: 100 + r * 20 });

      const preset: ViewportPreset = { name: 'test', width: 360, height: 780, isTouch: true };
      const res = extractViewportInput(preset);

      expect(res.innerWidth).toBe(window.innerWidth);
      expect(res.hud).toEqual({ left: 10, top: 10, right: 100, bottom: 40 });
      expect(res.cells.length).toBe(61);
      expect(res.elements).toHaveLength(5);
      expect(res.elements.map((e) => e.inSettingsMenu)).toEqual([true, true, true, true, false]);
      expect(res.elements[0].name).toBe('Sound');
      expect(res.elements[1].name).toBe('Aria Button');
      expect(res.elements[2].name).toBe('btn-id-only');
      expect(res.elements[3].name).toBe('BUTTON');
      expect(res.elements[4].name).toBe('the evaluation plate');
    });

    it('falls back gracefully when __cellToScreen or hud is missing', () => {
      document.body.innerHTML = '';
      const preset: ViewportPreset = { name: 'test', width: 360, height: 780, isTouch: false };
      const res = extractViewportInput(preset);
      expect(res.hud).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
      expect(res.cells[0].centre).toEqual({ x: 0, y: 0 });
    });
  });

  describe('auditViewport and auditPresets', () => {
    it('resizes page viewport and runs layout checks', async () => {
      const mockPage: EvaluatorPage = {
        setViewportSize: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockImplementation((fn, arg) => Promise.resolve(fn(arg))),
      };

      const preset: ViewportPreset = { name: 'test-preset', width: 360, height: 780, isTouch: true };
      const res = await auditViewport(mockPage, preset);
      expect(mockPage.setViewportSize).toHaveBeenCalledWith({ width: 360, height: 780 });
      expect(res.viewport).toBe('test-preset');
    });

    it('waits two rendered frames after the resize, so the camera matrices fit the new size (#1134)', async () => {
      const order: string[] = [];
      const mockPage: EvaluatorPage = {
        setViewportSize: vi.fn().mockImplementation(async () => void order.push('resize')),
        evaluate: vi.fn().mockImplementation(async (fn) => {
          order.push(fn.name);
          return fn === extractViewportInput ? { innerWidth: 1, innerHeight: 1, hud: { left: 0, top: 0, right: 0, bottom: 0 }, cells: [], elements: [] } : undefined;
        }),
      };
      await auditViewport(mockPage, { name: 'p', width: 360, height: 780, isTouch: true });
      expect(order).toEqual(['resize', 'afterTwoFrames', 'extractViewportInput']);
    });

    it('afterTwoFrames resolves once two animation frames have run', async () => {
      const frames: FrameRequestCallback[] = [];
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => void frames.push(cb));
      let done = false;
      const waiting = afterTwoFrames().then(() => (done = true));
      frames.shift()!(0);
      await Promise.resolve();
      expect(done).toBe(false);
      frames.shift()!(0);
      await waiting;
      expect(done).toBe(true);
      vi.unstubAllGlobals();
    });

    it('auditPresets runs across all given presets', async () => {
      const mockPage: EvaluatorPage = {
        setViewportSize: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue({
          innerWidth: 360,
          innerHeight: 780,
          hud: { left: 10, top: 10, right: 100, bottom: 50 },
          cells: [],
          elements: [],
          isTouch: false,
        }),
      };

      const presets: ViewportPreset[] = [
        { name: 'p1', width: 360, height: 780, isTouch: true },
        { name: 'p2', width: 844, height: 390, isTouch: false },
      ];

      const res = await auditPresets(mockPage, presets);
      expect(res.totalViolations).toBe(0);
      expect(res.reports).toHaveLength(2);
      expect(res.reports[0]).toContain('[PASS] p1');
      expect(res.reports[1]).toContain('[PASS] p2');
    });
  });

  describe('main', () => {
    it('executes runner with all preset viewports when no args given', async () => {
      const runner = vi.fn().mockResolvedValue(0);
      const code = await main([], runner);
      expect(code).toBe(0);
      expect(runner).toHaveBeenCalledWith(PRESET_VIEWPORTS);
    });

    it('filters presets when matching viewport arg is given', async () => {
      const runner = vi.fn().mockResolvedValue(0);
      const code = await main(['--viewport=portrait-360'], runner);
      expect(code).toBe(0);
      expect(runner).toHaveBeenCalledWith([
        expect.objectContaining({ name: 'phone-portrait-360' }),
      ]);
    });

    it('logs error and returns 1 when unknown viewport arg is given', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const runner = vi.fn();
      const code = await main(['--viewport=unknown-vp'], runner);
      expect(code).toBe(1);
      expect(runner).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith(expect.stringContaining('Unknown viewport filter'));
      error.mockRestore();
    });
  });
});
