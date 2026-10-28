// Pure logic of the drag play (#794): the path of a pointer over the player's marbles and the direction of its release.
import { type Axial, DIRECTIONS, axialTo3D, isGroup } from './board';

/** The path once the pointer passes over `cell`, an own marble: it joins when it keeps a straight line of at most 3
 * marbles, else the very same path comes back. */
export function extendPath(path: Axial[], cell: Axial): Axial[] {
  if (path.some((c) => c[0] === cell[0] && c[1] === cell[1])) return path;
  const next = [...path, cell];
  return isGroup(next) ? next : path;
}

/** Closer than this (a marble is about 0.8 wide at spacing 1) to a marble of the group, the pointer has not left it. */
const ON_MARBLE = 0.5;

/** The direction code from the centre of the group to the pointer, both on the board plane (x, z), the nearest of the 6;
 * null while the pointer is still on a marble of the group. */
export function releaseDir(group: readonly Axial[], x: number, z: number): number | null {
  const cells = group.map(([q, r]) => axialTo3D(q, r));
  if (cells.some((c) => Math.hypot(x - c.x, z - c.z) < ON_MARBLE)) return null;
  const cx = cells.reduce((s, c) => s + c.x, 0) / cells.length;
  const cz = cells.reduce((s, c) => s + c.z, 0) / cells.length;
  const dots = DIRECTIONS.map(([q, r]) => {
    const d = axialTo3D(q, r);
    return (x - cx) * d.x + (z - cz) * d.z;
  });
  return dots.indexOf(Math.max(...dots));
}
