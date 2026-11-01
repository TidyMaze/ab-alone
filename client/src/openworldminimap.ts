// The Open world's minimap (#1410, docs/specs/openworld.md section 8): the cells round the hero, drawn on a 2D canvas from plain data,
// turned with the camera so up on the map is up on screen. No DOM and no three.js here: the mode hands over the data when a step, a
// push or a camera turn changed it, and the map is redrawn then, never every frame.
import type { Axial } from './board';
import type { Terrain } from './openworld';
import { LOOK, PROPS, WATER } from './openworldview';

/** The cells from the hero to the edge of the map: a window of three chunks across. */
export const RADIUS = 24;
/** The lairs out of the window that get an arrow on the edge: the nearest unbeaten ones. */
const ARROWS = 3;

/** A cell of the window: `q, r` and its terrain. */
export type MinimapCell = readonly [number, number, Terrain];

export interface MinimapData {
  cells: readonly MinimapCell[];
  hero: Axial;
  troop: readonly Axial[];
  enemies: readonly Axial[];
  /** The boss lairs, in or out of the window, and whether each is beaten. */
  lairs: readonly { cell: Axial; beaten: boolean }[];
  /** The camera's yaw, in radians (`OpenWorldView.yaw`). */
  yaw: number;
}

/** The colours of the map that are not terrain. */
export const COLOURS = {
  hero: '#ffffff',
  troop: '#f2c14e',
  enemy: '#e0453b',
  lair: '#ffb020',
  lairBeaten: '#6f7a72',
  back: '#0b0d0f',
  edge: '#0b0d0f',
} as const;

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

/** The colour of a terrain: the one the 3D view draws it in (`LOOK`, `WATER`, `PROPS`), so the map has no palette of its own. */
export function terrainColour(terrain: Terrain): string {
  if (terrain === 'water') return hex(WATER.shore);
  if (terrain === 'tree' || terrain === 'boulder' || terrain === 'wall') return hex(PROPS[terrain].color);
  return hex(LOOK[terrain].color);
}

/** Where `cell` is from the hero on the map, in cells and canvas axes (y down): the ground layout of the 3D view (`axialTo3D`) turned by
 * the camera, whose screen up is `(-sin yaw, -cos yaw)` on the ground (`lookAtHero`). */
export function screenOffset(hero: Axial, cell: Axial, yaw: number): { x: number; y: number } {
  const dq = cell[0] - hero[0];
  const dr = cell[1] - hero[1];
  const dx = dq + dr / 2;
  const dz = (Math.sqrt(3) / 2) * dr;
  return { x: dx * Math.cos(yaw) - dz * Math.sin(yaw), y: dx * Math.sin(yaw) + dz * Math.cos(yaw) };
}

/** The cells of the hex disc of RADIUS round `hero`, read with `tile`; the cells off the world are left out. */
export function windowCells(tile: (q: number, r: number) => Terrain | undefined, hero: Axial): MinimapCell[] {
  const cells: MinimapCell[] = [];
  for (let dq = -RADIUS; dq <= RADIUS; dq++) {
    for (let dr = Math.max(-RADIUS, -dq - RADIUS); dr <= Math.min(RADIUS, -dq + RADIUS); dr++) {
      const [q, r] = [hero[0] + dq, hero[1] + dr];
      const terrain = tile(q, r);
      if (terrain) cells.push([q, r, terrain]);
    }
  }
  return cells;
}

const dot = (ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, colour: string): void => {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI);
  ctx.fill();
};

/** A closed shape through `points`, filled. */
const shape = (ctx: CanvasRenderingContext2D, points: readonly (readonly [number, number])[], colour: string): void => {
  ctx.fillStyle = colour;
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fill();
};

/** Draws the map on a square canvas of `size` px: the hero in the middle, `data.yaw` up. A lair out of the window is an arrow on the
 * edge, pointing to it. */
export function drawMinimap(ctx: CanvasRenderingContext2D, size: number, data: MinimapData): void {
  const half = size / 2;
  const unit = half / (RADIUS + 1); // px a cell
  const put = (cell: Axial): { x: number; y: number } => {
    const { x, y } = screenOffset(data.hero, cell, data.yaw);
    return { x: half + x * unit, y: half + y * unit };
  };
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(half, half, half - 1, 0, 2 * Math.PI);
  ctx.clip();
  ctx.fillStyle = COLOURS.back;
  ctx.fillRect(0, 0, size, size);
  const side = unit * 1.3; // a little over a cell, so the turned squares leave no gap
  for (const [q, r, terrain] of data.cells) {
    const { x, y } = put([q, r]);
    ctx.fillStyle = terrainColour(terrain);
    ctx.fillRect(x - side / 2, y - side / 2, side, side);
  }
  const edge = half - 8;
  const away = (cell: Axial): number => Math.hypot(put(cell).x - half, put(cell).y - half);
  const out = data.lairs.filter(({ cell, beaten }) => !beaten && away(cell) > edge).sort((a, b) => away(a.cell) - away(b.cell));
  const arrows = new Set(out.slice(0, ARROWS).map((lair) => lair.cell));
  for (const { cell, beaten } of data.lairs) {
    const colour = beaten ? COLOURS.lairBeaten : COLOURS.lair;
    const { x, y } = put(cell);
    const [ox, oy] = [x - half, y - half];
    const dist = away(cell);
    if (dist <= edge) {
      shape(ctx, [[x, y - 4], [x + 4, y], [x, y + 4], [x - 4, y]], colour);
      continue;
    }
    if (!arrows.has(cell)) continue; // out of the window: an arrow for the nearest few only
    const [ux, uy] = [ox / dist, oy / dist]; // the arrow sits on the edge, its tip toward the lair
    const [px, py] = [half + ux * edge, half + uy * edge];
    shape(ctx, [[px + ux * 5, py + uy * 5], [px - ux * 5 - uy * 4, py - uy * 5 + ux * 4], [px - ux * 5 + uy * 4, py - uy * 5 - ux * 4]], colour);
  }
  for (const cell of data.enemies) {
    const { x, y } = put(cell);
    dot(ctx, x, y, 2.5, COLOURS.enemy);
  }
  for (const cell of data.troop) {
    const { x, y } = put(cell);
    dot(ctx, x, y, 2, COLOURS.troop);
  }
  dot(ctx, half, half, 3, COLOURS.hero);
  ctx.restore();
  ctx.strokeStyle = COLOURS.edge;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(half, half, half - 1, 0, 2 * Math.PI);
  ctx.stroke();
}
