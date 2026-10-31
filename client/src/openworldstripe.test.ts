import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { ROLL_ZOOM } from './openworldglide';
import { STRIPE_FULL_ZOOM, STRIPE_HALF_WIDTH, STRIPE_NORMAL, STRIPE_TILT, stripedMaterial, stripeFadeNode, stripeStrength } from './openworldstripe';

// The looks of the marbles (#1043): the hero, the troop and the foes, each a base colour and a stripe colour of the same hue.
const LOOKS = [
  { name: 'hero', base: 0xcfe8ff, stripe: 0x8fb4dc },
  { name: 'troop', base: 0x8fc4f5, stripe: 0x5f93c8 },
  { name: 'foes', base: 0x15171c, stripe: 0x3a3f4a },
];

const hueOf = (hex: number): number => {
  const hsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(hex).getHSL(hsl);
  return hsl.h;
};

describe('the stripe of an Open world marble (#1043)', () => {
  it('is one great circle 0.16 rad wide, its normal tilted 35 degrees off the travel axis', () => {
    expect(2 * STRIPE_HALF_WIDTH).toBeCloseTo(0.16);
    expect(STRIPE_TILT).toBeCloseTo((35 * Math.PI) / 180);
    const { x, y, z } = STRIPE_NORMAL;
    expect(Math.hypot(x, y, z)).toBeCloseTo(1);
    expect(x).toBeCloseTo(Math.cos(STRIPE_TILT)); // 35 degrees off the X axis, the travel axis at rest
    expect(y).toBeCloseTo(Math.sin(STRIPE_TILT));
    expect(z).toBeCloseTo(0);
  });

  it('covers under 15 % of the surface, so the centre of the marble keeps its base colour', () => {
    // A uniform sphere: the share of it within half a width of a great circle is the sine of that half width.
    expect(Math.sin(STRIPE_HALF_WIDTH)).toBeLessThan(0.15);
  });

  it('fades from full strength up to zoom 2.5 to nothing at ROLL_ZOOM, where the roll stops', () => {
    expect(STRIPE_FULL_ZOOM).toBe(2.5);
    expect(ROLL_ZOOM).toBe(3);
    expect(stripeStrength(0.5)).toBe(1);
    expect(stripeStrength(STRIPE_FULL_ZOOM)).toBe(1);
    expect(stripeStrength(2.75)).toBeCloseTo(0.5);
    expect(stripeStrength(ROLL_ZOOM)).toBe(0);
    expect(stripeStrength(4)).toBe(0);
  });

  it('changes its strength continuously with the zoom, no step at the ends of the fade', () => {
    for (let zoom = 0.5; zoom < 4; zoom += 0.001) {
      expect(Math.abs(stripeStrength(zoom + 0.001) - stripeStrength(zoom))).toBeLessThan(0.01);
    }
  });

  it('keeps the hue of each marble: the stripe is a lighter or darker shade of the base, both ways (the foes lighten)', () => {
    for (const { name, base, stripe } of LOOKS) {
      expect(Math.abs(hueOf(stripe) - hueOf(base)), name).toBeLessThan(0.02);
    }
    expect(new THREE.Color(0x3a3f4a).getHSL({ h: 0, s: 0, l: 0 }).l).toBeGreaterThan(new THREE.Color(0x15171c).getHSL({ h: 0, s: 0, l: 0 }).l);
  });

  it('starts its fade node at full strength, and the material reads that node', () => {
    expect(stripeFadeNode().value).toBe(1);
  });

  it('is a node material whose colour is the base with the stripe mixed in, on the look roughness, kept by a clone', () => {
    const fade = uniform(1);
    const material = stripedMaterial({ base: 0xcfe8ff, stripe: 0x8fb4dc, roughness: 0.1 }, fade);
    expect(material.isMeshStandardNodeMaterial).toBe(true);
    expect(material.colorNode).not.toBeNull();
    expect(material.roughness).toBeCloseTo(0.1);
    expect(material.color.getHex()).toBe(0xcfe8ff);
    expect(material.clone().colorNode).toBe(material.colorNode);
  });
});
