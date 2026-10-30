export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface CellDisc {
  name: string;
  centre: { x: number; y: number };
  disc: Box;
}

export interface ElementBox {
  id?: string;
  name: string;
  tag: string;
  box: Box;
  isSettingsButton?: boolean;
}

export interface ViewportCheckInput {
  innerWidth: number;
  innerHeight: number;
  hud: Box;
  cells: CellDisc[];
  elements: ElementBox[];
  isTouch?: boolean;
}

export interface LayoutViolation {
  kind: 'hud-covers-cell' | 'element-covers-hud' | 'element-offscreen' | 'element-covers-cell' | 'touch-target-small';
  description: string;
  elementName?: string;
  targetName?: string;
  overlapPx?: number;
}

export interface ViewportPreset {
  name: string;
  width: number;
  height: number;
  isTouch: boolean;
  scale?: number;
}

export const PRESET_VIEWPORTS: ViewportPreset[] = [
  { name: 'phone-portrait-360', width: 360, height: 780, isTouch: true },
  { name: 'phone-landscape-844', width: 844, height: 390, isTouch: true },
  { name: 'tablet-portrait-768', width: 768, height: 1024, isTouch: true },
  { name: 'desktop-200-scale', width: 1280, height: 800, isTouch: false, scale: 2 },
];

export function meets(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

export function overlapAmount(a: Box, b: Box): number {
  if (!meets(a, b)) return 0;
  const xOverlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const yOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return Math.min(xOverlap, yOverlap);
}

export function onScreen(b: Box, width: number, height: number): boolean {
  return b.left >= 0 && b.top >= 0 && b.right <= width && b.bottom <= height;
}

export function checkLayoutProblems(input: ViewportCheckInput): LayoutViolation[] {
  const violations: LayoutViolation[] = [];

  // 1. HUD covers cell
  for (const cell of input.cells) {
    if (meets(input.hud, cell.disc)) {
      const px = overlapAmount(input.hud, cell.disc);
      violations.push({
        kind: 'hud-covers-cell',
        targetName: cell.name,
        overlapPx: px,
        description: `the HUD covers ${cell.name} by ${px.toFixed(1)}px`,
      });
    }
  }

  // 2. Element checks
  for (const el of input.elements) {
    // The HUD's own fold button (#957) lies on it by design, in its corner when the plate spans a window held upright.
    if (el.id !== 'hud-fold' && meets(el.box, input.hud)) {
      violations.push({
        kind: 'element-covers-hud',
        elementName: el.name,
        description: `${el.name} covers the HUD`,
      });
    }

    if (!onScreen(el.box, input.innerWidth, input.innerHeight)) {
      violations.push({
        kind: 'element-offscreen',
        elementName: el.name,
        description: `${el.name} is off screen`,
      });
    }

    for (const cell of input.cells) {
      if (meets(el.box, cell.disc)) {
        const px = overlapAmount(el.box, cell.disc);
        violations.push({
          kind: 'element-covers-cell',
          elementName: el.name,
          targetName: cell.name,
          overlapPx: px,
          description: `${el.name} covers ${cell.name} by ${px.toFixed(1)}px`,
        });
      }
    }

    if (input.isTouch && el.isSettingsButton) {
      const width = el.box.right - el.box.left;
      const height = el.box.bottom - el.box.top;
      if (width < 44 || height < 44) {
        violations.push({
          kind: 'touch-target-small',
          elementName: el.name,
          description: `${el.name} under 44px touch target (${width.toFixed(1)}x${height.toFixed(1)}px)`,
        });
      }
    }
  }

  return violations;
}

export function formatReport(viewportName: string, violations: LayoutViolation[]): string {
  if (violations.length === 0) {
    return `[PASS] ${viewportName}: all controls clear HUD, cells, and screen bounds.`;
  }
  const countMsg = `${violations.length} issue${violations.length > 1 ? 's' : ''}`;
  const lines = violations.map((v) => `  - ${v.description}`);
  return `[FAIL] ${viewportName} (${countMsg}):\n${lines.join('\n')}`;
}

export function extractViewportInput(preset: ViewportPreset): ViewportCheckInput {
  type Rect = { left: number; top: number; right: number; bottom: number };
  const toScreen = (q: number, r: number) =>
    (window as any).__cellToScreen ? (window as any).__cellToScreen(q, r) : { x: 0, y: 0 };
  const cells: { name: string; centre: { x: number; y: number }; disc: Rect }[] = [];
  for (let r = -4; r <= 4; r++) {
    for (let q = Math.max(-4, -4 - r); q <= Math.min(4, 4 - r); q++) {
      const p = toScreen(q, r);
      const east = toScreen(q + 1, r);
      const radius = 0.46 * Math.hypot(east.x - p.x, east.y - p.y);
      cells.push({
        name: `cell ${q},${r}`,
        centre: p,
        disc: { left: p.x - radius, top: p.y - radius, right: p.x + radius, bottom: p.y + radius },
      });
    }
  }
  const hudEl = document.getElementById('hud');
  const hudRect = hudEl ? hudEl.getBoundingClientRect() : { left: 0, top: 0, right: 0, bottom: 0 };
  const elements: ElementBox[] = [];
  for (const el of document.querySelectorAll('button, input, label, textarea, select, #eval, #transcript')) {
    if (el.getClientRects().length === 0) continue;
    const box = el.getBoundingClientRect();
    const id = (el as HTMLElement).id;
    const ariaLabel = el.getAttribute('aria-label');
    const text = el.textContent?.trim();
    const name = id === 'eval' ? 'the evaluation plate' : text || ariaLabel || id || el.tagName;
    const isSettingsButton = Boolean(el.closest('#settings-menu') && el.tagName === 'BUTTON');
    elements.push({
      id,
      name,
      tag: el.tagName,
      box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
      isSettingsButton,
    });
  }
  return {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    hud: { left: hudRect.left, top: hudRect.top, right: hudRect.right, bottom: hudRect.bottom },
    cells,
    elements,
    isTouch: preset.isTouch,
  };
}

export interface EvaluatorPage {
  setViewportSize(size: { width: number; height: number }): Promise<void>;
  evaluate<T>(fn: any, arg?: any): Promise<T>;
}

export async function auditViewport(
  page: EvaluatorPage,
  preset: ViewportPreset,
): Promise<{ viewport: string; violations: LayoutViolation[] }> {
  await page.setViewportSize({ width: preset.width, height: preset.height });
  const input = await page.evaluate(extractViewportInput, preset);
  const violations = checkLayoutProblems(input);
  return { viewport: preset.name, violations };
}

export async function auditPresets(
  page: EvaluatorPage,
  presets: ViewportPreset[] = PRESET_VIEWPORTS,
): Promise<{ totalViolations: number; reports: string[] }> {
  const reports: string[] = [];
  let totalViolations = 0;
  for (const preset of presets) {
    const res = await auditViewport(page, preset);
    totalViolations += res.violations.length;
    reports.push(formatReport(res.viewport, res.violations));
  }
  return { totalViolations, reports };
}

/* v8 ignore start */
export async function defaultPlaywrightRunner(targetPresets: ViewportPreset[]): Promise<number> {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const url = process.env.AUDIT_URL || 'http://localhost:5173/';
    await page.goto(url, { waitUntil: 'networkidle' });
    const cog = page.getByRole('button', { name: 'Settings' });
    await cog.click();
    const result = await auditPresets(page as any, targetPresets);
    for (const r of result.reports) console.log(r);
    return result.totalViolations === 0 ? 0 : 1;
  } finally {
    await browser.close();
  }
}
/* v8 ignore stop */

export async function main(
  argv: string[] = process.argv.slice(2),
  runner: (presets: ViewportPreset[]) => Promise<number> = defaultPlaywrightRunner,
): Promise<number> {
  let targetPresets = PRESET_VIEWPORTS;
  if (argv.length > 0) {
    const filter = argv[0].replace(/^--viewport=/, '');
    const matched = PRESET_VIEWPORTS.filter((p) => p.name.includes(filter));
    if (matched.length > 0) {
      targetPresets = matched;
    } else {
      console.error(`Unknown viewport filter: "${filter}". Available: ${PRESET_VIEWPORTS.map((p) => p.name).join(', ')}`);
      return 1;
    }
  }

  return runner(targetPresets);
}

/* v8 ignore start */
if (process.argv[1]?.endsWith('check-layout-bounds.ts')) {
  main().then((code) => process.exit(code));
}
/* v8 ignore stop */
