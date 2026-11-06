// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { LEGACY_UNLOCKED } from './collector';
import { mapHtml, newRun, scrollMap, type MapNode, type NodeKind, type Run } from './roguelite';

// The links of the map keep clear of the labels (#1543): they run in the band between two rows, from under the labels of a row to above
// the icons of the next, and a shortcut goes down the gap between two nodes of the row it skips.
const nd = (act: number, row: number, col: number, kind: NodeKind, links: number[], skips: number[] = [], elite = 0): MapNode => ({ act, row, col, kind, links, skips, formation: 0, elite });
/** An act of three rows of three nodes and its boss: elites in the two last rows, the first of the first row skipping to the third node of the last. */
const act = (a: number): MapNode[] => [
  nd(a, 0, 0, 'fight', [0], [2]), nd(a, 0, 1, 'fight', [1]), nd(a, 0, 2, 'fight', [2]),
  nd(a, 1, 0, 'fight', [0]), nd(a, 1, 1, 'elite', [1], [], 2), nd(a, 1, 2, 'rest', [2]),
  nd(a, 2, 0, 'rest', [0]), nd(a, 2, 1, 'elite', [0], [], 1), nd(a, 2, 2, 'shop', [0]),
  nd(a, 3, 0, 'boss', []),
];
const MAP = [...act(0), ...act(1)];
const html = (run: Run): Document => new DOMParser().parseFromString(`<div>${mapHtml(MAP, run)}</div>`, 'text/html');
const fresh = (): Run => ({ ...newRun(1, 3, LEGACY_UNLOCKED), path: [9] }); // the act 1 boss beaten: act 2 to pick

/** The label of a node below its icon, in rem under its centre: the name, and under it a note. */
const NAME_BELOW = 2.1;
const NOTE_BELOW = 2.75;

describe('the links of the map keep clear of the labels (#1543)', () => {
  const doc = html(fresh());
  const height = Number(doc.querySelector('svg')!.getAttribute('viewBox')!.split(' ')[3]); // rem
  const nodes = [...doc.querySelectorAll<HTMLButtonElement>('button[data-node]')].map((b) => ({
    x: Number(/left:([\d.]+)%/.exec(b.getAttribute('style')!)![1]),
    y: (Number(/top:([\d.]+)%/.exec(b.getAttribute('style')!)![1]) * height) / 100,
    note: b.querySelector('small') !== null,
    boss: b.dataset.nodeKind === 'boss',
  }));
  const rowNote = (y: number): boolean => nodes.some((n) => n.y === y && n.note);
  const segments = [...doc.querySelectorAll('line, polyline')].flatMap((l) => {
    const points = l.tagName === 'line' ? [[+l.getAttribute('x1')!, +l.getAttribute('y1')!], [+l.getAttribute('x2')!, +l.getAttribute('y2')!]] : l.getAttribute('points')!.split(' ').map((p) => p.split(',').map(Number));
    return points.slice(1).map((p, i) => ({ from: points[i]!, to: p, shortcut: l.classList.contains('shortcut') }));
  });

  it('names an elite under its kind, with a note under it for the key', () => {
    expect(nodes.some((n) => n.note)).toBe(true);
    expect(nodes.length).toBe(MAP.length);
    expect(segments.length).toBeGreaterThan(10);
  });

  it('draws no link between two acts, and a link only between two rows', () => {
    expect(doc.querySelectorAll('line')).toHaveLength(2 * (3 + 3 + 3)); // the links of the three rows of each act to the next, none from a boss
    expect(doc.querySelectorAll('polyline.shortcut')).toHaveLength(2); // and the shortcut of each act
  });

  it('a link leaves from under the labels of its row and arrives above the icon of the next, so no link crosses a label', () => {
    for (const { from, to } of segments) {
      const [y1, y2] = [Math.min(from[1]!, to[1]!), Math.max(from[1]!, to[1]!)];
      for (const n of nodes) {
        const top = n.y - (n.boss ? 1.375 : 1.125);
        const bottom = n.y + (rowNote(n.y) ? NOTE_BELOW : NAME_BELOW);
        expect(y2 <= top || y1 >= bottom, `a link from ${from} to ${to} crosses the node at ${n.x}, ${n.y}`).toBe(true);
      }
    }
  });

  it('a shortcut goes down the gap between two nodes of the row it skips', () => {
    const shortcut = html(fresh()).querySelector('polyline.shortcut')!;
    const points = shortcut.getAttribute('points')!.split(' ').map((p) => p.split(',').map(Number));
    expect(points).toHaveLength(4);
    const [, a, b] = points as [number[], number[], number[], number[]];
    expect(a[0]).toBe(b[0]); // straight down the gap
    expect(b[1]! - a[1]!).toBeGreaterThan(2.25); // past the icons and their labels
    const gaps = [100 / 3, 200 / 3];
    expect(gaps.some((g) => Math.abs(g - a[0]!) < 0.01)).toBe(true);
    for (const n of nodes.filter((o) => o.y > a[1]! && o.y < b[1]!)) expect(Math.abs(n.x - a[0]!)).toBeGreaterThanOrEqual(10);
  });
});

describe('the plate opens on the act of the node to pick (#1569)', () => {
  /** A plate of `height` px whose content is the map's: each header, node and the plate itself at the rect the test gives it. */
  function plate(height: number, nodeTop: number, headTop: number, scroll = 0): HTMLElement {
    const panel = document.createElement('div');
    panel.innerHTML = '<span class="act-head">Act 2</span><button class="node">x</button>';
    const rect = (top: number, h: number) => () => ({ top: top - panel.scrollTop, height: h, bottom: top - panel.scrollTop + h }) as DOMRect;
    Object.defineProperty(panel, 'clientHeight', { value: height });
    panel.getBoundingClientRect = rect(0, height);
    panel.querySelector<HTMLElement>('.act-head')!.getBoundingClientRect = rect(headTop, 20);
    panel.querySelector<HTMLElement>('button')!.getBoundingClientRect = rect(nodeTop, 40);
    panel.scrollTop = scroll;
    return panel;
  }

  it('puts the header of the act of the node at the top of the plate, whole', () => {
    const panel = plate(300, 460, 400);
    scrollMap(panel);
    expect(panel.scrollTop).toBe(396); // 4 px above the header
  });

  it('keeps the node in view when the act is taller than the plate: it stands at the bottom', () => {
    const panel = plate(300, 780, 400);
    scrollMap(panel);
    expect(panel.scrollTop).toBe(780 + 40 - 300 + 4);
  });

  it('works from where the plate was scrolled, and a map with no node to pick or no header is left as it is', () => {
    const panel = plate(300, 460, 400, 250);
    scrollMap(panel);
    expect(panel.scrollTop).toBe(396);
    const bare = document.createElement('div');
    scrollMap(bare);
    expect(bare.scrollTop).toBe(0);
    const headless = plate(300, 460, 400, 10);
    headless.querySelector('.act-head')!.remove();
    scrollMap(headless);
    expect(headless.scrollTop).toBe(310); // the node in the middle, as before the headers
  });

  it('keeps the top of the map when the act starts above it', () => {
    const panel = plate(300, 60, 2);
    scrollMap(panel);
    expect(panel.scrollTop).toBe(0);
  });
});
