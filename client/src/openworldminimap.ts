// The Open world's minimap (#1410, docs/specs/openworld.md section 8): the cells round the hero, drawn on a 2D canvas from plain data,
// turned with the camera so up on the map is up on screen. No DOM and no three.js here: the mode hands over the data when a step, a
// push or a camera turn changed it, and the map is redrawn then, never every frame. The full screen map (#1411, openworldmap.ts) is the
// same drawing on another frame (`drawMap`).
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
  /** The teleporters to draw (#1412): the discovered ones. */
  teleporters: readonly Axial[];
  /** The teleporter the map's choice would pick (#1412), ringed; none outside the choice. */
  chosen?: Axial | null;
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
  teleporter: '#b36bff',
  chosen: '#ffffff',
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

/** The offset in cells (`dq, dr`) of the point `x, y` cells from the middle of the map, in canvas axes: `screenOffset` undone. */
export function groundOffset(x: number, y: number, yaw: number): Axial {
  const dx = x * Math.cos(yaw) + y * Math.sin(yaw);
  const dz = -x * Math.sin(yaw) + y * Math.cos(yaw);
  const dr = dz / (Math.sqrt(3) / 2);
  return [dx - dr / 2, dr];
}

/** The cells of the hex disc of `radius` (RADIUS: the minimap's window) round `hero`, read with `tile`; the cells off the world, or
 * hidden (not discovered, #1411), are left out. */
export function windowCells(tile: (q: number, r: number) => Terrain | undefined, hero: Axial, radius = RADIUS): MinimapCell[] {
  const cells: MinimapCell[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
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

/** The corners of a teleporter's mark, 5 px out from its cell. */
const HEXAGON = Array.from({ length: 6 }, (_, i) => [5 * Math.cos((i * Math.PI) / 3), 5 * Math.sin((i * Math.PI) / 3)] as const);

/** Where a map is drawn: a canvas of `width` x `height` px with the cell `centre` (fractions allowed) in the middle, `unit` px a cell.
 * `round` is the minimap: a disc, its edge drawn, and an arrow on the edge for the lairs out of it. */
export interface MapFrame {
  width: number;
  height: number;
  centre: Axial;
  unit: number;
  round: boolean;
}

/** Draws the minimap on a square canvas of `size` px: the hero in the middle, `data.yaw` up. A lair out of the window is an arrow on
 * the edge, pointing to it. */
export function drawMinimap(ctx: CanvasRenderingContext2D, size: number, data: MinimapData): void {
  drawMap(ctx, { width: size, height: size, centre: data.hero, unit: size / 2 / (RADIUS + 1), round: true }, data);
}

/** Draws `data` on `frame`, `data.yaw` up: the cells given, then the lairs, the teleporters, the enemies, the troop and the hero. */
export function drawMap(ctx: CanvasRenderingContext2D, { width, height, centre, unit, round }: MapFrame, data: MinimapData): void {
  const [midX, midY] = [width / 2, height / 2];
  const put = (cell: Axial): { x: number; y: number } => {
    const { x, y } = screenOffset(centre, cell, data.yaw);
    return { x: midX + x * unit, y: midY + y * unit };
  };
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  if (round) {
    ctx.beginPath();
    ctx.arc(midX, midY, midX - 1, 0, 2 * Math.PI);
    ctx.clip();
  }
  ctx.fillStyle = COLOURS.back;
  ctx.fillRect(0, 0, width, height);
  const side = unit * 1.3; // a little over a cell, so the turned squares leave no gap
  for (const [q, r, terrain] of data.cells) {
    const { x, y } = put([q, r]);
    ctx.fillStyle = terrainColour(terrain);
    ctx.fillRect(x - side / 2, y - side / 2, side, side);
  }
  const edge = round ? midX - 8 : Infinity; // the full map has no edge: every lair is drawn where it is
  const away = (cell: Axial): number => Math.hypot(put(cell).x - midX, put(cell).y - midY);
  const out = data.lairs.filter(({ cell, beaten }) => !beaten && away(cell) > edge).sort((a, b) => away(a.cell) - away(b.cell));
  const arrows = new Set(out.slice(0, ARROWS).map((lair) => lair.cell));
  for (const { cell, beaten } of data.lairs) {
    const colour = beaten ? COLOURS.lairBeaten : COLOURS.lair;
    const { x, y } = put(cell);
    const [ox, oy] = [x - midX, y - midY];
    const dist = away(cell);
    if (dist <= edge) {
      shape(ctx, [[x, y - 4], [x + 4, y], [x, y + 4], [x - 4, y]], colour);
      continue;
    }
    if (!arrows.has(cell)) continue; // out of the window: an arrow for the nearest few only
    const [ux, uy] = [ox / dist, oy / dist]; // the arrow sits on the edge, its tip toward the lair
    const [px, py] = [midX + ux * edge, midY + uy * edge];
    shape(ctx, [[px + ux * 5, py + uy * 5], [px - ux * 5 - uy * 4, py - uy * 5 + ux * 4], [px - ux * 5 + uy * 4, py - uy * 5 - ux * 4]], colour);
  }
  for (const cell of data.teleporters) {
    if (away(cell) > edge) continue; // the minimap draws the ones in its window only
    const { x, y } = put(cell);
    shape(ctx, HEXAGON.map(([dx, dy]) => [x + dx, y + dy] as const), COLOURS.teleporter);
  }
  if (data.chosen) {
    const { x, y } = put(data.chosen);
    ctx.strokeStyle = COLOURS.chosen;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, 2 * Math.PI);
    ctx.stroke();
  }
  for (const cell of data.enemies) {
    const { x, y } = put(cell);
    dot(ctx, x, y, 2.5, COLOURS.enemy);
  }
  for (const cell of data.troop) {
    const { x, y } = put(cell);
    dot(ctx, x, y, 2, COLOURS.troop);
  }
  const hero = put(data.hero);
  dot(ctx, hero.x, hero.y, 3, COLOURS.hero);
  ctx.restore();
  if (!round) return;
  ctx.strokeStyle = COLOURS.edge;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(midX, midY, midX - 1, 0, 2 * Math.PI);
  ctx.stroke();
}
