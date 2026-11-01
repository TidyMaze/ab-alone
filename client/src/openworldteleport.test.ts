import { describe, expect, it } from 'vitest';
import type { Axial } from './board';
import { arrival, pairs, teleport, teleporterNear } from './openworldteleport';

// The rules of the teleporters (#1412, docs/specs/openworld.md section 10), shared by the client and the MCP server.

const NETWORK: Axial[] = [[2, -1], [60, 5], [-70, 40]];
const seenAll = (_q: number, _r: number): boolean => true;
const open = (_cell: Axial): boolean => true;

describe('teleport', () => {
  it('moves the hero from a teleporter to another discovered one, the troop on the free cells round it, the nearest first', () => {
    expect(teleport(NETWORK, seenAll, [2, -1], [60, 5], 3, open)).toEqual({ hero: [60, 5], troop: [[59, 5], [59, 6], [60, 4]] });
  });

  it('puts the troop past a cell that is not free, farther out when the six next cells are taken', () => {
    const away = (cell: Axial): number => (Math.abs(cell[0] - 60) + Math.abs(cell[1] - 5) + Math.abs(cell[0] - 60 + cell[1] - 5)) / 2;
    const moved = teleport(NETWORK, seenAll, [2, -1], [60, 5], 2, (cell) => away(cell) !== 1); // the six next cells are taken
    expect(moved).toEqual({ hero: [60, 5], troop: [[58, 5], [58, 6]] });
  });

  it('refuses off a teleporter, onto no teleporter, onto the same one, onto one not discovered, onto an enemy and with no room', () => {
    const refused = (at: Axial, to: Axial, seen = seenAll, free = open, size = 6) => teleport(NETWORK, seen, at, to, size, free);
    expect(refused([0, 0], [60, 5])).toEqual({ refused: 'the hero stands on no teleporter' });
    expect(refused([2, -1], [61, 5])).toEqual({ refused: 'no teleporter on (61,5)' });
    expect(refused([2, -1], [2, -1])).toEqual({ refused: 'the hero stands on that teleporter' });
    expect(refused([2, -1], [60, 5], (q) => q !== 60)).toEqual({ refused: 'the teleporter on (60,5) is not discovered yet' });
    expect(refused([2, -1], [60, 5], seenAll, (cell) => cell[0] !== 60 || cell[1] !== 5)).toEqual({ refused: 'an enemy stands on the teleporter on (60,5)' });
    expect(refused([2, -1], [60, 5], seenAll, (cell) => cell[0] === 60 && cell[1] === 5, 1)).toEqual({ refused: 'no room for the troop round the teleporter on (60,5)' });
  });
});

describe('arrival', () => {
  it('gives the free cells within 3 of a cell, nearest first, the cell left out', () => {
    const cells = arrival([0, 0], 40, open);
    expect(cells).toHaveLength(36);
    expect(cells.slice(0, 6)).toEqual([[-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0]]);
  });
});

describe('teleporterNear', () => {
  it('finds the teleporter nearest a cell within 2 cells of it, none farther', () => {
    expect(teleporterNear(NETWORK, [61, 4])).toEqual([60, 5]);
    expect(teleporterNear(NETWORK, [2, -1])).toEqual([2, -1]);
    expect(teleporterNear(NETWORK, [63, 5])).toBeNull();
    expect(teleporterNear([[0, 0], [3, 0]], [2, 0])).toEqual([3, 0]);
  });
});

describe('pairs', () => {
  it('reads the q, r pairs of a flat list', () => {
    expect(pairs(Int32Array.of(2, -1, 60, 5))).toEqual([[2, -1], [60, 5]]);
  });
});
