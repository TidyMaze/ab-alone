import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { RADIUS, axialTo3D, cellsFor } from './board';
import { framing, resetView, viewPosition, type View } from './camera';
import { TERRACE_VIEW } from './tablezero';
import { DECK_NAMES } from './deck';
import { BEATS, entranceView } from './entrance';
import { BOSS_SPACE } from './bossspace';
import { DECK_KEY, NEON } from './neonlook';
import { PULSAR_DISTANCE } from './pulsar';
import { DECK_PROPS, MESS_PROP_DARK, PROP_LIGHT, deckPropColour, deckPropGeometry, deckPropSpot, partBox, type PropPart } from './deckprop';

// One silhouette prop per deck, standing in the surround outside the board (#1551, art.md Decks): procedural, one merged mesh, a palette mix,
// never between the play camera and a cell or a marble, and in the window at 960x540 and at 390x844.

/** The play cameras: the one a fight starts on (`resetView`), the terrace's own (syncTableZero), and a phone's pitch of 44 drawn back to 13.8 or 18. */
const PLAY: View = resetView();
const FINALS: View[] = [PLAY, { ...TERRACE_VIEW }, ...[13.8, 18].map((distance) => ({ ...TERRACE_VIEW, polar: (46 * Math.PI) / 180, distance }))];
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
  it('has one prop for each deck, of at least four parts and between 1.4 and 3 cells tall', () => {
    for (const deck of DECK_NAMES) {
      const parts = DECK_PROPS[deck];
      expect(parts.length, deck).toBeGreaterThanOrEqual(4);
      const top = Math.max(...parts.map((p) => partBox(p).max.y));
      expect(top, deck).toBeGreaterThanOrEqual(1.4);
      expect(top, deck).toBeLessThanOrEqual(3);
      expect(Math.min(...parts.map((p) => partBox(p).min.y)), deck).toBeGreaterThanOrEqual(-1e-6); // it stands on the ground
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

  it('is a mix of the deck key and the white marble token, a palette colour that reads 3:1 on the black sky and on the terrace background, the Mess excepted', () => {
    expect(PROP_LIGHT).toBeGreaterThan(0);
    for (const deck of DECK_NAMES.filter((d) => d !== 'mess')) {
      const colour = deckPropColour(deck);
      expect(colour.equals(new THREE.Color(DECK_KEY[deck].key).lerp(new THREE.Color(NEON.whiteMarble), PROP_LIGHT)), deck).toBe(true);
      expect(contrast(colour, SKY), deck).toBeGreaterThanOrEqual(3);
      expect(contrast(colour, TERRACE_BACKGROUND), deck).toBeGreaterThanOrEqual(3);
    }
    expect(new Set(DECK_NAMES.map((d) => deckPropColour(d).getHex())).size).toBe(DECK_NAMES.length);
  });

  it('draws the Mess prop dark, the key darkened by the black marble token, 3:1 on the pale ground of the Mess (#1551)', () => {
    // The pale ground round the prop, measured on the render at 960x540: the neon look's (#97a0a2) and the terrace look's brightest tiles (#857f5c).
    const GROUNDS = [0x97a0a2, 0x857f5c].map((c) => new THREE.Color(c));
    const colour = deckPropColour('mess');
    expect(MESS_PROP_DARK).toBeGreaterThan(0.5);
    expect(colour.equals(new THREE.Color(DECK_KEY.mess.key).lerp(new THREE.Color(NEON.blackMarble), MESS_PROP_DARK))).toBe(true);
    for (const ground of GROUNDS) expect(contrast(colour, ground)).toBeGreaterThanOrEqual(3);
  });

  it('stands outside the board and its posts and beacons, off the south-east where the boss kit piece stands, on a phone and on a desktop', () => {
    for (const phone of [false, true]) {
      for (const radius of [RADIUS, 5]) {
        for (const deck of DECK_NAMES) {
          const near = Math.min(...world(DECK_PROPS[deck], phone, radius).flatMap(corners).map((c) => Math.hypot(c.x, c.z)));
          expect(near, `${deck} ${phone} ${radius}`).toBeGreaterThanOrEqual(Math.max(PULSAR_DISTANCE, radius * 1.3) + 0.3);
        }
      }
    }
    const [desk, phone] = [deckPropSpot(RADIUS, false), deckPropSpot(RADIUS, true)];
    expect(desk).not.toEqual(phone);
    const south = (s: { x: number; z: number }): boolean => s.x > 0 && s.z > 0; // the kit piece's quarter (bossprops.ts)
    expect(south(desk) || south(phone)).toBe(false);
  });

  it('stands in the window of the play camera, HUD margin kept, at 960x540 and at 390x844', () => {
    for (const [width, height, phone] of [[960, 540, false], [390, 844, true]] as const) {
      const cam = camera(PLAY, width, height);
      for (const deck of DECK_NAMES) {
        for (const c of world(DECK_PROPS[deck], phone).flatMap(corners)) {
          const p = c.clone().project(cam);
          expect(Math.abs(p.x), `${deck} ${width} x`).toBeLessThanOrEqual(0.95);
          expect(p.y, `${deck} ${width} y`).toBeLessThanOrEqual(0.8);
          expect(p.y, `${deck} ${width} y`).toBeGreaterThanOrEqual(-0.8);
        }
      }
    }
  });

  it('never hides a cell or a marble from the play camera turned to any side down to a pitch of 38 degrees, nor from the entrance beat of any boss', () => {
    for (const radius of [RADIUS, 5, 7]) { // the arena, The Ballast Mind's board, The Dual Room's: the camera draws back with the board
      const views: View[] = [];
      for (const final of FINALS.map((v) => ({ ...v, distance: (v.distance * radius) / RADIUS }))) {
        for (let a = 0; a < 12; a++) {
          const azimuth = (a * Math.PI) / 6;
          for (const polar of [final.polar, 0.9]) for (const distance of [6, final.distance]) views.push({ azimuth, polar, distance }); // as low as a pitch of 38 degrees and as close as the zoom
          if (a === 0 && final.polar === PLAY.polar) for (const row of Object.values(BOSS_SPACE)) for (const beat of BEATS) for (const t of [0, 0.5, 1]) views.push(entranceView(final, { beat, side: row.side, dark: 0 }, t * 1500)); // a boss fight opens on the default view, at the default azimuth
        }
      }
      const outer = cellsFor(radius).filter(([q, r]) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) >= radius - 1); // the rings nearest the props
      const targets = outer.flatMap(([q, r]) => {
        const { x, z } = axialTo3D(q, r);
        return [new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 0.6, z)]; // the cell, the top of a marble on it
      });
      for (const deck of DECK_NAMES) {
        for (const phone of [false, true]) {
          const boxes = world(DECK_PROPS[deck], phone, radius);
          const whole = boxes.reduce((all, box) => all.union(box), new THREE.Box3().makeEmpty());
          for (const view of views) {
            const eye = new THREE.Vector3(...(Object.values(viewPosition(view)) as [number, number, number]));
            for (const target of targets) {
              const to = target.clone().sub(eye);
              const length = to.length();
              const ray = new THREE.Ray(eye, to.normalize());
              if (ray.intersectBox(whole, new THREE.Vector3()) === null) continue; // misses the whole prop, so every part
              const hit = boxes.some((box) => {
                const at = ray.intersectBox(box, new THREE.Vector3());
                return at !== null && at.distanceTo(eye) < length;
              });
              expect(hit, `${deck} ${phone} ${radius} ${JSON.stringify(view)}`).toBe(false);
            }
          }
        }
      }
    }
  }, 60000);
});
