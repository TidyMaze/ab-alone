// The icon of a boss tower on the Open world map and minimap (#1438, docs/specs/openworld.md sections 8 and 9): a crenellated tower on a
// dark plate with an outline, in the colour of its boss and with its initial when it is big enough; a beaten tower is grey with a check mark.
// Plain canvas 2D paths, no image: a pure helper `drawMap` calls for each lair.

/** The colour of each boss's tower, by boss id: fifteen hues, alternating dark and light so two next to each other differ. */
export const BOSS_COLOURS: Readonly<Record<string, string>> = {
  echo: '#ec5151',
  hull: '#f2b288',
  choir: '#eccd51',
  chaplain: '#ddf288',
  ballast: '#8fec51',
  alien: '#88f288',
  railyard: '#51ec8f',
  magnetizer: '#88f2dd',
  pulsar: '#51cdec',
  overseer: '#88b2f2',
  assembly: '#5151ec',
  core: '#b288f2',
  dual: '#cd51ec',
  stalker: '#f288dd',
  swarm: '#ec518f',
};

/** The rest of the icon. The halo (dark) and the rim (light) outline the plate: one of the two reads 3:1 on any terrain. */
export const ICON = {
  plate: '#0b0d0f',
  halo: '#0b0d0f',
  rim: '#f4f4f4',
  ink: '#0b0d0f',
  unknown: '#ffb020',
  done: '#8d9792',
  check: '#ffffff',
} as const;

/** The icon's side in px: on the map it keeps a minimum when zoomed out and grows with the zoom, on the minimap it is smaller and fixed. */
const MAP_MIN = 28;
const MINIMAP_SIZE = 20;
/** The side from which the initial is written on the tower. */
const LETTER_FROM = 26;
export const iconSize = (unit: number, round: boolean): number => (round ? MINIMAP_SIZE : Math.max(MAP_MIN, unit * 1.5));

/** The tower, in half-sides from the middle of the icon: a body with a crenellated top. */
const TOWER = [[-0.45, 0.7], [0.45, 0.7], [0.45, -0.6], [0.25, -0.6], [0.25, -0.4], [0.1, -0.4], [0.1, -0.6], [-0.1, -0.6], [-0.1, -0.4], [-0.25, -0.4], [-0.25, -0.6], [-0.45, -0.6]] as const;
const CHECK = [[-0.28, 0.05], [-0.06, 0.3], [0.3, -0.25]] as const;

/** Draws the icon of the lair of `boss` (an id, none or unknown for a plain tower) centred on `x, y`, `size` px across. */
export function lairIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, boss: string | undefined, beaten: boolean): void {
  const h = size / 2;
  const at = (points: readonly (readonly [number, number])[]): void => {
    ctx.beginPath();
    points.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(x + px * h, y + py * h) : ctx.lineTo(x + px * h, y + py * h)));
  };
  const plate = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;
  at(plate);
  ctx.closePath();
  ctx.fillStyle = ICON.plate;
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ICON.halo;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.strokeStyle = ICON.rim;
  ctx.lineWidth = 2;
  ctx.stroke();
  const colour = BOSS_COLOURS[boss ?? ''];
  at(TOWER);
  ctx.closePath();
  ctx.fillStyle = beaten ? ICON.done : (colour ?? ICON.unknown);
  ctx.fill();
  if (beaten) {
    at(CHECK);
    ctx.strokeStyle = ICON.check;
    ctx.lineWidth = Math.max(2, size / 8);
    ctx.stroke();
  } else if (colour && size >= LETTER_FROM) {
    ctx.fillStyle = ICON.ink;
    ctx.font = `bold ${Math.round(size * 0.4)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(boss!.charAt(0).toUpperCase(), x, y + h * 0.15);
  }
}
