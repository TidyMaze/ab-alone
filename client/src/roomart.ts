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

  // Anti-slip tread grooves
  g.strokeStyle = '#232a30';
  g.lineWidth = 1.5;
  const step = w / 16;
  g.beginPath();
  for (let x = step; x < w; x += step) {
    g.moveTo(x, 4);
    g.lineTo(x, h - 4);
  }
  g.stroke();
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
