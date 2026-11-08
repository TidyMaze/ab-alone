import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { BOARD_CELLS, RADIUS, axialTo3D } from './board';
import { framing, viewPosition, type View } from './camera';
import { TERRACE_VIEW } from './tablezero';
import { DECK_NAMES } from './deck';
import { BEATS, entranceView } from './entrance';
import { BOSS_SPACE } from './bossspace';
import { DECK_KEY, NEON } from './neonlook';
import { PULSAR_DISTANCE } from './pulsar';
import { DECK_PROPS, PROP_BODY_SHARE, deckPropColour, deckPropGeometry, deckPropSpot, partBox, type PropPart } from './deckprop';

// One silhouette prop per deck, standing in the surround outside the board (#1551, art.md Decks): procedural, one merged mesh, a palette mix,
// never between the play camera and a cell or a marble, and in the window at 960x540 and at 390x844.

/** The play cameras of main.ts (syncTableZero): the terrace's own on a desktop, a pitch of 44 on a phone drawn back to 13.8 (neon look) or 18 (terrace look). */
const DESKTOP: View = { ...TERRACE_VIEW };
const PHONES: View[] = [13.8, 18].map((distance) => ({ ...TERRACE_VIEW, polar: (46 * Math.PI) / 180, distance }));
const SKY = new THREE.Color(NEON.sky);
const TERRACE_BACKGROUND = new THREE.Color(0x2c3438);
const luminance = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const contrast = (a: THREE.Color, b: THREE.Color): number => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
const world = (parts: readonly PropPart[], phone: boolean, radius = RADIUS): THREE.Box3[] => {
  const { x, z } = deckPropSpot(radius, phone);
  return parts.map((p) => partBox(p).translate(new THREE.Vector3(x, 0, z)));
};
const corners = (box: THREE.Box3): THREE.Vector3[] =>
  [0, 1].flatMap((i) => [0, 1].flatMap((j) => [0, 1].map((k) => new THREE.Vector3(i ? box.max.x : box.min.x, j ? box.max.y : box.min.y, k ? box.max.z : box.min.z))));
const camera = (view: View, width: number, height: number): THREE.PerspectiveCamera => {
  const cam = new THREE.PerspectiveCamera(framing(width, height), width / height, 0.1, 100);
  const eye = viewPosition(view);
  cam.position.set(eye.x, eye.y, eye.z);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  return cam;
};

describe('the deck props (#1551)', () => {
  it('has one prop for each deck, of at least four parts and as tall as a person at the rail, no taller than the board is wide', () => {
    for (const deck of DECK_NAMES) {
      const parts = DECK_PROPS[deck];
      expect(parts.length, deck).toBeGreaterThanOrEqual(4);
      const top = Math.max(...parts.map((p) => partBox(p).max.y));
      expect(top, deck).toBeGreaterThanOrEqual(1.8);
      expect(top, deck).toBeLessThanOrEqual(3);
      expect(Math.min(...parts.map((p) => partBox(p).min.y)), deck).toBeGreaterThanOrEqual(0); // it stands on the ground
    }
  });

  it('is one merged mesh geometry per deck, built once, with few triangles and no texture coordinate needed', () => {
    const triangles = new Set<number>();
    for (const deck of DECK_NAMES) {
      const geometry = deckPropGeometry(deck);
      expect(deckPropGeometry(deck)).toBe(geometry);
      const count = (geometry.index ? geometry.index.count : geometry.attributes.position!.count) / 3;
      expect(count, deck).toBeLessThanOrEqual(400);
      triangles.add(count);
    }
    expect(triangles.size).toBeGreaterThan(1); // not one shape for all the decks
  });

  it('is a mix of the deck key and the slate, a palette colour that reads 3:1 on the black sky and on the terrace background', () => {
    expect(PROP_BODY_SHARE).toBeGreaterThan(0.5);
    for (const deck of DECK_NAMES) {
      const colour = deckPropColour(deck);
      expect(colour.equals(new THREE.Color(NEON.slab).lerp(new THREE.Color(DECK_KEY[deck].key), PROP_BODY_SHARE)), deck).toBe(true);
      expect(contrast(colour, SKY), deck).toBeGreaterThanOrEqual(3);
      expect(contrast(colour, TERRACE_BACKGROUND), deck).toBeGreaterThanOrEqual(3);
    }
    expect(new Set(DECK_NAMES.map((d) => deckPropColour(d).getHex())).size).toBe(DECK_NAMES.length);
  });

  it('stands outside the board and its posts and beacons, off the south-east where the boss kit piece stands, on a phone and on a desktop', () => {
    for (const phone of [false, true]) {
      for (const radius of [RADIUS, 5]) {
        for (const deck of DECK_NAMES) {
          const near = Math.min(...world(DECK_PROPS[deck], phone, radius).flatMap(corners).map((c) => Math.hypot(c.x, c.z)));
          expect(near, `${deck} ${phone} ${radius}`).toBeGreaterThanOrEqual(Math.max(PULSAR_DISTANCE, radius * 1.3) + 1);
        }
      }
    }
    const [desk, phone] = [deckPropSpot(RADIUS, false), deckPropSpot(RADIUS, true)];
    expect(desk).not.toEqual(phone);
    const south = (s: { x: number; z: number }): boolean => s.x > 0 && s.z > 0; // the kit piece's quarter (bossprops.ts)
    expect(south(desk) || south(phone)).toBe(false);
  });

  it('stands in the window of the play camera, HUD margin kept, at 960x540 and at 390x844', () => {
    for (const [width, height, phone, view] of [[960, 540, false, DESKTOP], [390, 844, true, PHONES[0]!], [390, 844, true, PHONES[1]!]] as const) {
      const cam = camera(view, width, height);
      for (const deck of DECK_NAMES) {
        for (const c of world(DECK_PROPS[deck], phone).flatMap(corners)) {
          const p = c.clone().project(cam);
          expect(Math.abs(p.x), `${deck} ${width} x`).toBeLessThanOrEqual(0.92);
          expect(p.y, `${deck} ${width} y`).toBeLessThanOrEqual(0.8);
          expect(p.y, `${deck} ${width} y`).toBeGreaterThanOrEqual(-0.8);
        }
      }
    }
  });

  it('never hides a cell or a marble from the play camera nor from the entrance beat, turned to any side', () => {
    const views: View[] = [];
    for (const final of [DESKTOP, ...PHONES]) {
      for (let a = 0; a < 12; a++) {
        const azimuth = (a * Math.PI) / 6;
        for (const polar of [final.polar, 1.1]) for (const distance of [6, final.distance]) views.push({ azimuth, polar, distance }); // as low as the entrance's rise and as close as the zoom
        for (const row of Object.values(BOSS_SPACE)) for (const beat of BEATS) for (const t of [0, 0.5, 1]) views.push(entranceView({ ...final, azimuth }, { beat, side: row.side, dark: 0 }, t * 1500));
      }
    }
    const targets = BOARD_CELLS.filter(([q, r]) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) >= 3).flatMap(([q, r]) => { // the outer rings, nearest the props
      const { x, z } = axialTo3D(q, r);
      return [new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 0.6, z)]; // the cell, the top of a marble on it
    });
    for (const deck of DECK_NAMES) {
      for (const phone of [false, true]) {
        const boxes = world(DECK_PROPS[deck], phone);
        const whole = boxes.reduce((all, box) => all.union(box), new THREE.Box3().makeEmpty());
        for (const view of views) {
          const eye = new THREE.Vector3(...Object.values(viewPosition(view)) as [number, number, number]);
          for (const target of targets) {
            const to = target.clone().sub(eye);
            const length = to.length();
            const ray = new THREE.Ray(eye, to.normalize());
            if (ray.intersectBox(whole, new THREE.Vector3()) === null) continue; // misses the whole prop, so every part
            const hit = boxes.some((box) => {
              const at = ray.intersectBox(box, new THREE.Vector3());
              return at !== null && at.distanceTo(eye) < length;
            });
            expect(hit, `${deck} ${phone} ${JSON.stringify(view)}`).toBe(false);
          }
        }
      }
    }
  });
});
