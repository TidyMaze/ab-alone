// Procedural canvas textures for spaceship interior panels and hazard trim (#478).
// Pure 2D canvas drawing routines: cached as Three.js CanvasTexture in main.ts.

type Ctx = CanvasRenderingContext2D;

/**
 * Industrial bulkhead wall panel: dark steel base (#14171a), seam divisions,
 * rivet heads, and reinforcing rib seams.
 */
export function drawWallPanel(g: Ctx, w: number, h: number): void {
  // Base steel sheet
  g.fillStyle = '#14171a';
  g.fillRect(0, 0, w, h);

  // Horizontal weld seam line
  g.strokeStyle = '#0e1012';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, h * 0.5);
  g.lineTo(w, h * 0.5);
  g.stroke();

  // Highlight line along weld
  g.strokeStyle = '#22282d';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(0, h * 0.5 + 2);
  g.lineTo(w, h * 0.5 + 2);
  g.stroke();

  // Vertical panel seams
  for (const xRatio of [0.25, 0.75]) {
    g.strokeStyle = '#0e1012';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(w * xRatio, 0);
    g.lineTo(w * xRatio, h);
    g.stroke();

    g.strokeStyle = '#22282d';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(w * xRatio + 1, 0);
    g.lineTo(w * xRatio + 1, h);
    g.stroke();
  }

  // Rivet heads along outer borders and central seams
  g.fillStyle = '#2b333a';
  const rivetY = [h * 0.08, h * 0.28, h * 0.45, h * 0.55, h * 0.72, h * 0.92];
  for (const x of [w * 0.05, w * 0.25, w * 0.75, w * 0.95]) {
    for (const y of rivetY) {
      g.beginPath();
      g.arc(x, y, 2.5, 0, Math.PI * 2);
      g.fill();
    }
  }

  // Corner reinforcement gussets on bulkhead quadrants
  g.fillStyle = '#1c2126';
  for (const [gx, gy] of [[0, 0], [w, 0], [0, h], [w, h]] as const) {
    g.beginPath();
    g.moveTo(gx, gy);
    g.lineTo(gx === 0 ? 32 : w - 32, gy);
    g.lineTo(gx, gy === 0 ? 32 : h - 32);
    g.closePath();
    g.fill();
  }
}

/**
 * Airlock lintel hazard warning chevrons: muted sodium orange (#9a5a18) and dark steel (#14171a)
 * at 45-degree angle.
 */
export function drawHazardStripes(g: Ctx, w: number, h: number): void {
  g.fillStyle = '#14171a';
  g.fillRect(0, 0, w, h);

  const stripeWidth = h * 0.8;
  g.fillStyle = '#9a5a18';
  for (let x = -h; x < w + h; x += stripeWidth * 2) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + stripeWidth, 0);
    g.lineTo(x + stripeWidth + h, h);
    g.lineTo(x + h, h);
    g.closePath();
    g.fill();
  }

  // Dark border trim
  g.strokeStyle = '#0a0d0f';
  g.lineWidth = 2;
  g.beginPath();
  g.rect(0, 0, w, h);
  g.stroke();
}

/**
 * Deck floor plating: modular welded tile joints and anti-slip tread grooves.
 */
export function drawDeckGrating(g: Ctx, w: number, h: number): void {
  g.fillStyle = '#181d22';
  g.fillRect(0, 0, w, h);

  // Modular floor plate grid seams
  g.strokeStyle = '#0f1215';
  g.lineWidth = 4;
  g.beginPath();
  g.rect(0, 0, w, h);
  g.stroke();

  // Anti-slip tread grooves and cross-reinforcing slots
  g.strokeStyle = '#232a30';
  g.lineWidth = 1.5;
  const step = w / 16;
  g.beginPath();
  for (let x = step; x < w; x += step) {
    g.moveTo(x, 4);
    g.lineTo(x, h - 4);
  }
  for (let y = h / 4; y < h; y += h / 4) {
    g.moveTo(4, y);
    g.lineTo(w - 4, y);
  }
  g.stroke();
}

/**
 * Hollow moon celestial disc: airless dead moon regolith (#1c2128), dark basaltic
 * maria basins, layered impact craters with illuminated rims, and silicate glass veins (#478).
 */
export function drawHollowMoon(g: Ctx, w: number, h: number): void {
  // Base cold lunar regolith
  g.fillStyle = '#1c2128';
  g.fillRect(0, 0, w, h);

  // Basaltic maria basins (dark volcanic plains)
  const maria: readonly [number, number, number, number][] = [
    [w * 0.35, h * 0.38, w * 0.28, h * 0.22],
    [w * 0.65, h * 0.32, w * 0.22, h * 0.18],
    [w * 0.48, h * 0.68, w * 0.32, h * 0.25],
    [w * 0.22, h * 0.62, w * 0.18, h * 0.16],
    [w * 0.78, h * 0.58, w * 0.16, h * 0.20],
  ];

  g.fillStyle = '#101317';
  for (const [mx, my, rx, ry] of maria) {
    g.beginPath();
    g.ellipse(mx, my, rx, ry, 0.2, 0, Math.PI * 2);
    g.fill();
  }

  // Radial ejecta ray systems from major impacts
  g.strokeStyle = '#2d3742';
  g.lineWidth = 1.2;
  const rayOrigins: readonly [number, number][] = [
    [w * 0.32, h * 0.35],
    [w * 0.68, h * 0.72],
  ];
  for (const [ox, oy] of rayOrigins) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      g.beginPath();
      g.moveTo(ox, oy);
      g.lineTo(ox + Math.cos(a) * w * 0.4, oy + Math.sin(a) * h * 0.4);
      g.stroke();
    }
  }

  // Impact craters (position, radius, hasCentralPeak)
  const craters: readonly [number, number, number, boolean][] = [
    [w * 0.32, h * 0.35, w * 0.08, true],
    [w * 0.68, h * 0.72, w * 0.07, true],
    [w * 0.52, h * 0.22, w * 0.05, false],
    [w * 0.20, h * 0.42, w * 0.045, false],
    [w * 0.75, h * 0.38, w * 0.04, false],
    [w * 0.42, h * 0.55, w * 0.035, false],
    [w * 0.60, h * 0.48, w * 0.03, false],
    [w * 0.36, h * 0.78, w * 0.04, false],
    [w * 0.82, h * 0.70, w * 0.03, false],
    [w * 0.15, h * 0.75, w * 0.035, false],
  ];

  for (const [cx, cy, r, peak] of craters) {
    // Sunlit elevated rim
    g.strokeStyle = '#b8c6d4';
    g.lineWidth = Math.max(1.5, r * 0.18);
    g.beginPath();
    g.arc(cx, cy, r, -Math.PI * 0.8, Math.PI * 0.2);
    g.stroke();

    // Dark shadow basin floor
    g.fillStyle = '#0a0d10';
    g.beginPath();
    g.arc(cx + r * 0.12, cy + r * 0.12, r * 0.88, 0, Math.PI * 2);
    g.fill();

    // Shadow rim opposite to sunlight
    g.strokeStyle = '#050709';
    g.lineWidth = Math.max(1.5, r * 0.2);
    g.beginPath();
    g.arc(cx, cy, r, Math.PI * 0.2, -Math.PI * 0.8);
    g.stroke();

    // Central rebound peak in major craters
    if (peak) {
      g.fillStyle = '#c5d3e0';
      g.beginPath();
      g.arc(cx - r * 0.05, cy - r * 0.05, r * 0.18, 0, Math.PI * 2);
      g.fill();
    }
  }

  // Hollow silicate glass fracture veins (lore: "The new vein on Hollow is not slag. It is glass...")
  g.strokeStyle = '#7fd6e8';
  g.lineWidth = 1.5;
  const veins: readonly [number, number, number, number, number, number][] = [
    [w * 0.28, h * 0.30, w * 0.38, h * 0.42, w * 0.48, h * 0.40],
    [w * 0.48, h * 0.40, w * 0.55, h * 0.52, w * 0.68, h * 0.56],
    [w * 0.65, h * 0.68, w * 0.58, h * 0.76, w * 0.50, h * 0.85],
    [w * 0.22, h * 0.50, w * 0.30, h * 0.58, w * 0.35, h * 0.68],
  ];
  for (const [x1, y1, x2, y2, x3, y3] of veins) {
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.lineTo(x3, y3);
    g.stroke();
  }
}

/**
 * Helper to allocate an HTMLCanvasElement and paint it with a drawer.
 */
export function createCanvasTexture(
  w: number,
  h: number,
  draw: (g: Ctx, width: number, height: number) => void,
  createCanvas: (width: number, height: number) => HTMLCanvasElement = (width, height) => {
    const el = document.createElement('canvas');
    el.width = width;
    el.height = height;
    return el;
  },
): HTMLCanvasElement {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx, w, h);
  return canvas;
}
