import { describe, expect, it } from 'vitest';
import { EDGE_GAIN, EDGE_WIDTH, HEX_APOTHEM, HEX_RADIUS, edgeDistance, edgeMaterial } from './openworldedge';

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
});
