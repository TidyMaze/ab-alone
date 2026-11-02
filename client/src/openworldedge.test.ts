import { float, uniform } from 'three/tsl';
import { describe, expect, it } from 'vitest';
import { EDGE_GAIN, EDGE_WIDTH, HEX_APOTHEM, HEX_RADIUS, edgeDistance, edgeFade, edgeMaterial, GAP_FILL, gapFill } from './openworldedge';

describe('the hex edge of an Open world ground (#1138)', () => {
  it('is 0 on an edge of the prism, the apothem at the centre, and the same on the six edges of the hex', () => {
    expect(HEX_APOTHEM).toBeCloseTo(HEX_RADIUS * Math.cos(Math.PI / 6));
    expect(edgeDistance(0, 0)).toBeCloseTo(HEX_APOTHEM);
    // The middle of the six edges of a prism of CylinderGeometry (vertices at the angles 0, 60, ... from +z).
    for (const k of [0, 1, 2, 3, 4, 5]) {
      const angle = Math.PI / 6 + (k * Math.PI) / 3;
      expect(edgeDistance(HEX_APOTHEM * Math.sin(angle), HEX_APOTHEM * Math.cos(angle))).toBeCloseTo(0);
    }
  });

  it('measures the distance to the nearest edge, and a corner lies on two edges', () => {
    expect(edgeDistance(HEX_APOTHEM / 2, 0)).toBeCloseTo(HEX_APOTHEM / 2);
    expect(edgeDistance(0, HEX_RADIUS)).toBeCloseTo(0);
  });

  it('darkens the land seam a little and lights the water line a little, in a narrow band', () => {
    expect(EDGE_GAIN.land).toBeLessThan(0);
    expect(EDGE_GAIN.land).toBeGreaterThan(-0.5);
    expect(EDGE_GAIN.water).toBeGreaterThan(0);
    expect(EDGE_GAIN.water).toBeLessThanOrEqual(1);
    expect(EDGE_WIDTH).toBeLessThan(HEX_APOTHEM / 4);
  });

  it('is a node material on its look, white until an instance colours it, with no texture', () => {
    const material = edgeMaterial({ emissive: 0x0a5568, roughness: 0.2, gain: EDGE_GAIN.water });
    expect(material.isMeshStandardNodeMaterial).toBe(true);
    expect(material.colorNode).not.toBeNull();
    expect(material.roughness).toBeCloseTo(0.2);
    expect(material.emissive.getHex()).toBe(0x0a5568);
    expect(material.color.getHex()).toBe(0xffffff);
    expect(material.map).toBeNull();
  });

  it('fades the band out as it gets thinner than a pixel, so a wide zoom shows a flat colour (#1347)', () => {
    expect(edgeFade(0)).toBe(0);
    expect(edgeFade(0.75)).toBe(0); // a band under a pixel beats against the pixel grid
    expect(edgeFade(2)).toBe(1); // a close zoom keeps the whole band
    expect(edgeFade(100)).toBe(1);
    expect(edgeFade(1.4)).toBeGreaterThan(0);
    expect(edgeFade(1.4)).toBeLessThan(1);
    expect(edgeFade(1.6)).toBeGreaterThan(edgeFade(1.2));
  });

  it('widens the prisms to close the gap between them as the zoom goes out, so the gap shows no dark dots at a wide zoom (#1347)', () => {
    expect(gapFill(1)).toBe(0); // the close look keeps its thin gap
    expect(gapFill(1.8)).toBe(0);
    expect(gapFill(6)).toBe(GAP_FILL);
    expect(gapFill(2.4)).toBeGreaterThan(0);
    expect(gapFill(2.4)).toBeLessThan(GAP_FILL);
    expect(gapFill(3)).toBe(GAP_FILL);
    // a full widening takes the radius 2 % past the corner of the cell the grid of spacing 1 gives: the prisms overlap a hair, no crack
    expect(HEX_RADIUS * (1 + GAP_FILL)).toBeCloseTo(1.02 / Math.sqrt(3), 6);
  });

  it('takes a widen uniform and a position node, and gives them as they are when one is missing', () => {
    const shimmer = float(1);
    const look = { emissive: 0, roughness: 0.2, gain: 0 };
    expect(edgeMaterial({ ...look, widen: uniform(0) }).positionNode).not.toBeNull();
    expect(edgeMaterial({ ...look, positionNode: shimmer }).positionNode).toBe(shimmer);
    expect(edgeMaterial({ ...look, positionNode: shimmer, widen: uniform(0) }).positionNode).not.toBe(shimmer);
    expect(edgeMaterial(look).positionNode).toBeNull();
    const glow = float(2);
    expect(edgeMaterial({ ...look, emissiveNode: glow }).emissiveNode).toBe(glow);
  });
});
