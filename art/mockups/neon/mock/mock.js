import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const col = (n) => new THREE.Color(n);
const SQ3 = Math.sqrt(3);

export const DIRS = {
  A: { key: 'A', name: 'Circuit Slab', n1: 0x19e6ff, n2: 0x9a6bff, sky: 0x04050c, far: 0x1b2233, near: 0x1e2638, slab: 0x171c2b, crystal: 0x7a62d8, tones: [0x2f3b52, 0x3d3750, 0x1f2634], cell: 0x5d6a82, gap: 0x0a0e18,
    sun: 0xe8f0ff, sunI: 3.4, elev: 24, az: -50, nebula: 0x2a1d55, stars: 1400, planet: { c: 0x9fb0c8, deg: 9, ndc: [0.62, 0.62], bands: 0 }, ground: 'circuit', cellK: 'glass', ship: 0 },
  B: { key: 'B', name: 'Crystal Vein', n1: 0x7dff4a, n2: 0x2f8cff, sky: 0x03060a, far: 0x10241f, near: 0x18281f, slab: 0x13201f, crystal: 0x4fa07a, tones: [0x2a3f36, 0x2f3a4a, 0x18281f], cell: 0x56706a, gap: 0x08110f,
    sun: 0xf4fff0, sunI: 3.2, elev: 28, az: 35, nebula: 0x0f3a26, stars: 1600, planet: { c: 0x1c3a6a, deg: 24, ndc: [-0.55, 0.55], bands: 1 }, ground: 'veins', cellK: 'facet', ship: 0 },
  C: { key: 'C', name: 'Signal Hull', n1: 0xffab2e, n2: 0x2f7bff, sky: 0x04050a, far: 0x1c2430, near: 0x202836, slab: 0x1a202a, crystal: 0x8a7a5c, tones: [0x2f3a48, 0x40382f, 0x1f2630], cell: 0x667282, gap: 0x0b0e14,
    sun: 0xd8ecff, sunI: 4.4, elev: 35, az: 30, nebula: 0x10182c, stars: 900, planet: { c: 0x6f7c8c, deg: 6, ndc: [-0.7, 0.8], bands: 0 }, ground: 'apron', cellK: 'brushed', ship: 1 },
};

/* ---------- noise and textures ---------- */
function rnd(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const h2 = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function vn(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), f = x - xi, g = y - yi;
  const u = f * f * (3 - 2 * f), v = g * g * (3 - 2 * g);
  return (h2(xi, yi) * (1 - u) + h2(xi + 1, yi) * u) * (1 - v) + (h2(xi, yi + 1) * (1 - u) + h2(xi + 1, yi + 1) * u) * v;
}
function fbm(x, y, o = 5) { let a = 0.5, t = 0; for (let i = 0; i < o; i++) { t += a * vn(x, y); x *= 2.03; y *= 2.03; a /= 2; } return t; }
function canvas(s) { const c = document.createElement('canvas'); c.width = c.height = s; return c; }
function toTex(c, rep = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function pixels(s, fn) {
  const c = canvas(s), g = c.getContext('2d'), im = g.createImageData(s, s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const [r, gg, b] = fn(x / s, y / s), i = (y * s + x) * 4;
    im.data[i] = r * 255; im.data[i + 1] = gg * 255; im.data[i + 2] = b * 255; im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0); return c;
}
const rgb = (n) => { const c = new THREE.Color(); c.setHex(n, THREE.LinearSRGBColorSpace); return [c.r, c.g, c.b]; };
const mix = (a, b, t) => a.map((v, i) => v * (1 - t) + b[i] * t);

function voronoi(u, v, n) {
  const x = u * n, y = v * n, xi = Math.floor(x), yi = Math.floor(y); let d1 = 9, d2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i + h2(xi + i, yi + j), cy = yi + j + h2(yi + j + 7, xi + i + 3), d = Math.hypot(x - cx, y - cy);
    if (d < d1) { d2 = d1; d1 = d; id = h2(xi + i + 11, yi + j + 5); } else if (d < d2) d2 = d;
  }
  return { d1, e: d2 - d1, id };
}

function groundMaps(d) {
  const base = [0.95, 0.95, 0.95], dark = [0.62, 0.62, 0.62], S = 1024;
  const map = pixels(S, (u, v) => {
    const n = fbm(u * 14, v * 14), g = h2(Math.floor(u * 700), Math.floor(v * 700));
    const crack = Math.max(0, 1 - Math.abs(fbm(u * 6 + 3, v * 6) - 0.5) * 60);
    let c = mix(dark, base, 0.25 + n * 1.1);
    c = c.map((x) => x * (0.86 + g * 0.3) * (1 - crack * 0.55));
    return c;
  });
  const bump = pixels(S, (u, v) => { const n = fbm(u * 22, v * 22, 6); const crack = Math.max(0, 1 - Math.abs(fbm(u * 6 + 3, v * 6) - 0.5) * 60); const b = n * (1 - crack * 0.7); return [b, b, b]; });
  const em = canvas(2048), g = em.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 2048, 2048);
  const r = rnd(9);
  if (d.ground === 'circuit') {
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = hex(i % 3 ? d.n2 : d.n1); g.lineWidth = 1.5; g.globalAlpha = 0.35; g.beginPath();
      let x = r() * 2048, y = r() * 2048; x -= x % 64; y -= y % 64; g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        const l = (2 + Math.floor(r() * 6)) * 64, dirs = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [1, -1]], [a, b] = dirs[Math.floor(r() * 6)];
        x += a * l; y += b * l; g.lineTo(x, y);
      }
      g.stroke(); g.fillStyle = g.strokeStyle; g.beginPath(); g.arc(x, y, 8, 0, 7); g.fill();
    }
  } else if (d.ground === 'veins') {
    const c = pixels(1024, (u, v) => { const w = 0.03 * fbm(u * 9, v * 9); const o = voronoi(u + w, v + w * 1.3, 7); const t = Math.max(0, 1 - o.e * 42) * (fbm(u * 5, v * 5) > 0.45 ? 1 : 0.1); const [r1, g1, b1] = rgb(o.id > 0.72 ? d.n2 : d.n1); return [r1 * t, g1 * t, b1 * t]; });
    g.drawImage(c, 0, 0, 2048, 2048);
  } else {
    g.strokeStyle = '#0a0d12'; for (let i = 0; i <= 8; i++) { g.lineWidth = 1; g.beginPath(); g.moveTo(i * 256, 0); g.lineTo(i * 256, 2048); g.moveTo(0, i * 256); g.lineTo(2048, i * 256); g.stroke(); }
    for (let i = 0; i < 6; i++) {
      g.strokeStyle = hex(i % 2 ? d.n2 : d.n1); g.lineWidth = 6; g.setLineDash([46, 34]); g.globalAlpha = 0.9; g.beginPath(); const p = 128 + i * 340; g.moveTo(p, 0); g.lineTo(p, 2048); g.stroke();
    }
  }
  return { map: toTex(map, 1), bumpMap: toTex(bump, 1, false), emissiveMap: toTex(em, 1) };
}
function cellMaps(d) {
  const a = rgb(d.cell), S = 512, k = d.cellK;
  const f = (u, v) => {
    if (k === 'brushed') return 0.82 + 0.3 * vn(u * 6, v * 340) * vn(u * 3, v * 90) + 0.07 * h2(Math.floor(v * 500), 1);
    if (k === 'facet') { const o = voronoi(u, v, 9); return 0.8 + 0.34 * o.id - 0.25 * Math.max(0, 1 - o.e * 26); }
    return 0.92 + 0.14 * fbm(u * 8, v * 8) + 0.04 * h2(Math.floor(u * 400), Math.floor(v * 400)) - 0.1 * Math.max(0, 1 - Math.abs(fbm(u * 3, v * 3) - 0.5) * 90);
  };
  return {
    map: toTex(pixels(S, (u, v) => a.map((x) => x * f(u, v))), 0.12),
    bumpMap: toTex(pixels(S, (u, v) => { const t = f(u, v); return [t, t, t]; }), 0.12, false),
  };
}
function rimMaps(d) {
  const a = rgb(d.slab), S = 512;
  const c = pixels(S, (u, v) => {
    const plate = (Math.abs((u * 4) % 1 - 0.02) < 0.012 || Math.abs((v * 2) % 1 - 0.02) < 0.012) ? 0.35 : 1;
    const riv = Math.hypot(((u * 8) % 1) - 0.5, ((v * 4) % 1) - 0.14) < 0.05 ? 2.2 : 1;
    return rgb(0x1f2a44).map((x) => x * (0.8 + 0.6 * fbm(u * 10, v * 10)) * plate * riv);
  });
  return { map: toTex(c), bumpMap: toTex(c, 1, false) };
}
function shellMaps() {
  const c = pixels(1024, (u, v) => { const w = 0.05 * fbm(u * 5, v * 5); const r = Math.abs(Math.sin((v + w) * Math.PI * 16)); const s = Math.abs(Math.sin((u + w) * Math.PI * 22)); const t = Math.pow(r, 0.5) * (0.65 + 0.35 * s); return [t, t, t]; });
  return toTex(c, 1, false);
}
function fresnelMarble(color, ior = 1.5) { return new THREE.MeshPhysicalMaterial({ color, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.08, ior, sheen: 0.5, sheenColor: col(0xa0d8ff) }); }
const neon = (n, i = 3) => new THREE.MeshBasicMaterial({ color: col(n).multiplyScalar(i), toneMapped: true });
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.3, ...o });

/* ---------- geometry helpers ---------- */
function hexes(list, { r = 0.536, ch = 0.04, chH = 0.03, bottom = -2, lit = [0, 0] } = {}) {
  // list of {x,z,y,c:[r,g,b]}; world-planar uvs; pointy along z.
  const P = [], N = [], U = [], C = [];
  const v = (x, y, z, n, c) => { P.push(x, y, z); N.push(...n); U.push(x, z); C.push(...c); };
  const ring = (cx, cz, rr) => Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 6 * (2 * i + 1) + Math.PI / 6 - Math.PI / 6; return [cx + rr * Math.sin(a - Math.PI / 6 + Math.PI / 6 * 0), cz + rr * Math.cos(a - Math.PI / 6 + Math.PI / 6 * 0)]; });
  for (const h of list) {
    const t = ring(h.x, h.z, r - ch), o = ring(h.x, h.z, r), c = h.c, side = c.map((x) => Math.max(x * 0.7, 0.012));
    for (let i = 0; i < 6; i++) {
      const j = (i + 1) % 6;
      v(h.x, h.y, h.z, [0, 1, 0], c); v(...[t[i][0], h.y, t[i][1]], [0, 1, 0], c); v(...[t[j][0], h.y, t[j][1]], [0, 1, 0], c);
      const mx = (o[i][0] + o[j][0]) / 2 - h.x, mz = (o[i][1] + o[j][1]) / 2 - h.z, l = Math.hypot(mx, mz), nb = [mx / l * 0.7, 0.7, mz / l * 0.7], ns = [mx / l, 0, mz / l], cb = c.map((x) => x * (0.75 + 1.1 * Math.max(0, mx / l * lit[0] + mz / l * lit[1])));
      const q = (a, b, cc, dd, n, col2) => { v(...a, n, col2); v(...b, n, col2); v(...cc, n, col2); v(...a, n, col2); v(...cc, n, col2); v(...dd, n, col2); };
      q([t[i][0], h.y, t[i][1]], [o[i][0], h.y - chH, o[i][1]], [o[j][0], h.y - chH, o[j][1]], [t[j][0], h.y, t[j][1]], nb, cb);
      q([o[i][0], h.y - chH, o[i][1]], [o[i][0], bottom, o[i][1]], [o[j][0], bottom, o[j][1]], [o[j][0], h.y - chH, o[j][1]], ns, side);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  return g;
}
function hexLine(list, r0, r1, y) {
  // Thin neon hexagon rings in the gaps.
  const P = [];
  for (const h of list) for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3, b = (i + 1) * Math.PI / 3, s = (r, t) => [h.x + r * Math.sin(t), (h.y ?? 0) + y, h.z + r * Math.cos(t)];
    P.push(...s(r0, a), ...s(r1, a), ...s(r1, b), ...s(r0, a), ...s(r1, b), ...s(r0, b));
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.computeVertexNormals(); return g;
}
const shadowed = (m, cast = true, recv = true) => { m.castShadow = cast; m.receiveShadow = recv; return m; };
function hexPrismY(r, h, mat) { const g = new THREE.CylinderGeometry(r, r, h, 6); g.rotateY(Math.PI / 6); return shadowed(new THREE.Mesh(g, mat)); }

/* ---------- the meshes ---------- */
const cache = {};
function kit(d) {
  if (cache[d.key]) return cache[d.key];
  const k = cache[d.key] = {};
  k.ground = groundMaps(d); k.cell = cellMaps(d); k.rim = rimMaps(d); k.shell = shellMaps();
  return k;
}
export const M = {
  'cell': (d, one = true) => {
    const k = kit(d), g = new THREE.Group(), cells = one ? [{ x: 0, z: 0, y: 0 }] : boardCells();
    const list = cells.map((c) => ({ ...c, y: 0, c: [1 + (h2(c.x, c.z) - 0.5) * 0.1, 1, 1] }));
    g.add(shadowed(new THREE.Mesh(hexes(list, { bottom: -0.24, lit: [Math.sin(d.az * Math.PI / 180), Math.cos(d.az * Math.PI / 180)] }), new THREE.MeshStandardMaterial({ map: k.cell.map, bumpMap: k.cell.bumpMap, bumpScale: 0.6, vertexColors: true, roughness: 0.42, metalness: 0.35 }))));
    g.add(new THREE.Mesh(hexLine(cells, 0.548, 0.562, -0.03), neon(d.n1, 1.25)));
    if (one) { const b = hexPrismY(0.62, 0.1, std(d.gap)); b.position.y = -0.27; g.add(b); }
    return g;
  },
  'slab': (d) => {
    const k = kit(d), g = new THREE.Group(), R = 5.05, rim = new THREE.MeshStandardMaterial({ map: k.rim.map, bumpMap: k.rim.bumpMap, bumpScale: 1.2, roughness: 0.55, metalness: 0.3 });
    const hexR = (r, h, y, m) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.02, h, 6), m); p.rotation.y = Math.PI / 6; p.position.y = y; shadowed(p); g.add(p); };
    hexR(R, 0.3, -0.31, std(d.gap, { roughness: 0.9 }));
    // Rim: six beams, with the neon channel.
    const corners = Array.from({ length: 6 }, (_, i) => [Math.sin(i * Math.PI / 3 + Math.PI / 6 * 3), Math.cos(i * Math.PI / 3 + Math.PI / 6 * 3)]);
    for (let i = 0; i < 6; i++) {
      const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 6], Rr = 5.35, len = Rr, mx = (ax + bx) / 2 * Rr, mz = (az + bz) / 2 * Rr, ang = Math.atan2(bx - ax, bz - az);
      const beam = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.34, len + 0.3), rim)); beam.position.set(mx, -0.04, mz); beam.rotation.y = ang; g.add(beam);
      const ch = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, len - 0.3), neon(d.n2, 1.6)); ch.position.set(mx, 0.135, mz); ch.rotation.y = ang; g.add(ch);
      const low = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, len - 0.3), neon(d.n1, 1.3)); const o = 0.33; low.position.set(mx * (1 + o / 4.6), -0.1, mz * (1 + o / 4.6)); low.rotation.y = ang; g.add(low);
    }
    hexR(6.0, 0.5, -0.6, rim); hexR(6.9, 0.5, -1.0, rim);
    return g;
  },
  'post': (d) => {
    const k = kit(d), g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ map: k.rim.map, roughness: 0.45, metalness: 0.7 });
    const a = hexPrismY(0.2, 0.9, m); a.position.y = 0.45; g.add(a);
    const c = hexPrismY(0.25, 0.1, std(d.far, { metalness: 0.7, roughness: 0.3 })); c.position.y = 0.95; g.add(c);
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.03, 6), neon(d.n2, 3)); glow.position.y = 0.72; g.add(glow);
    const gl2 = glow.clone(); gl2.position.y = 0.3; gl2.material = neon(d.n1, 3); g.add(gl2);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 6), neon(d.n1, 3.2)); tip.position.y = 1.15; g.add(tip);
    return g;
  },
  'marble-glass': (d) => { const g = new THREE.Group(), s = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.42, 48, 32), fresnelMarble(0xf2f0ea))); s.position.y = 0.4; g.add(s); const b = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.012, 8, 48), neon(d.n1 === 0xffab2e ? 0x7fd6e8 : d.n1, 1.6)); b.rotation.x = Math.PI / 2; b.position.y = 0.03; g.add(b); return g; },
  'marble-shell': (d) => {
    const k = kit(d), g = new THREE.Group(), s = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.42, 64, 48), new THREE.MeshStandardMaterial({ color: 0x14161a, bumpMap: k.shell, bumpScale: 0.9, roughness: 0.42, metalness: 0.25, emissive: col(0x7a3b1d), emissiveIntensity: 0.04 })));
    s.position.y = 0.4; g.add(s);
    const seam = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.006, 6, 64), neon(0xd9822b, 1.2)); seam.rotation.x = Math.PI / 2 + 0.25; seam.position.y = 0.4; g.add(seam);
    return g;
  },
  'ring-arrow': (d) => {
    const g = new THREE.Group(), r = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.035, 8, 6), neon(0x7fd6e8, 3.2)); r.rotation.x = Math.PI / 2; r.rotation.z = Math.PI / 6; r.position.y = 0.04; g.add(r);
    const r2 = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.01, 6, 6), neon(0xd8d4c8, 2)); r2.rotation.x = Math.PI / 2; r2.rotation.z = Math.PI / 6; r2.position.y = 0.04; g.add(r2);
    const s = new THREE.Shape(); s.moveTo(-0.14, 0); s.lineTo(0.14, 0); s.lineTo(0.14, 0.3); s.lineTo(0.3, 0.3); s.lineTo(0, 0.62); s.lineTo(-0.3, 0.3); s.lineTo(-0.14, 0.3); s.closePath();
    const a = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false }), neon(0x7fd6e8, 2.6)); a.rotation.x = -Math.PI / 2; a.position.set(1.1, 0.05, 0.3); g.add(a);
    return g;
  },
  'terrain-column': (d) => {
    const k = kit(d), g = new THREE.Group(), list = [[0, 0, 0.5], [0.95, 0.55, 0.2], [-0.95, 0.55, 0.3], [0, 1.1, 0], [0.95, -0.55, 0.75], [-0.95, -0.55, 0.05], [0, -1.1, 0.35]].map(([x, z, y], i) => { const t = col(d.tones[i % 3]); return { x, z, y, c: [t.r * 1.9, t.g * 1.9, t.b * 1.9] }; });
    g.add(terrainMesh(d, list, 0.545)); return g;
  },
  'outcrop': (d) => {
    const g = new THREE.Group(), r = rnd(5), body = new THREE.MeshPhysicalMaterial({ color: d.crystal, roughness: 0.25, metalness: 0.05, clearcoat: 1, flatShading: true, vertexColors: true, emissive: col(d.crystal).multiplyScalar(0.3), emissiveIntensity: 0.5 });
    const vein = body.clone(); vein.emissive = col(d.n2); vein.emissiveIntensity = 0.3;
    [[0, 0, 0.36, 1.0], [0.42, 0.12, 0.24, 0.72], [-0.38, 0.22, 0.22, 0.6], [0.1, -0.42, 0.24, 0.84], [-0.28, -0.3, 0.16, 0.5], [0.3, 0.42, 0.15, 0.55]].forEach(([x, z, w, hh]) => {
      const h = hh * 1.5, geo = new THREE.ConeGeometry(w, h, 5).toNonIndexed(), n = geo.attributes.position.count, C = []; geo.clearGroups();
      for (let i = 0; i < n; i += 3) { const v = 0.55 + 0.45 * r(); C.push(v, v, v, v, v, v, v, v, v); geo.addGroup(i, 3, r() < 0.33 ? 1 : 0); }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
      const m = shadowed(new THREE.Mesh(geo, [body, vein])); m.position.set(x, h / 2 - 0.02, z); m.rotation.set((r() - 0.5) * 0.42, r() * 6, (r() - 0.5) * 0.42); g.add(m);
    });
    return g;
  },
  'boulder-crew': (d) => {
    const k = kit(d), g = new THREE.Group(), geo = new THREE.IcosahedronGeometry(0.5, 2), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i), n = 0.84 + 0.3 * vn(v.x * 3 + 5, v.y * 3 + v.z * 3); v.multiplyScalar(n); p.setXYZ(i, v.x, v.y, v.z); }
    geo.computeVertexNormals();
    const s = shadowed(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.7, flatShading: true }))); s.position.y = 0.38; g.add(s);
    const reg = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.09, 6), std(d.far, { roughness: 0.95 })); reg.position.y = 0.02; shadowed(reg, false); g.add(reg);
    return g;
  },
  'lair-tower': (d, beaten = false) => {
    const k = kit(d), g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ map: k.rim.map, roughness: 0.42, metalness: 0.75 }), lit = beaten ? 0x7fd6e8 : d.n2;
    const t = (r, h, y, mm = m) => { const p = hexPrismY(r, h, mm); p.position.y = y; g.add(p); return p; };
    t(0.85, 0.2, 0.1); t(0.6, 0.3, 0.35); t(0.32, 2.3, 1.65); t(0.18, 0.9, 3.2); t(0.42, 0.07, 2.85); t(0.42, 0.07, 1.35);
    [0.7, 1.9, 2.5].forEach((y) => { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.335, 0.335, 0.05, 6), neon(lit, 3)); r.position.y = y; g.add(r); });
    const l = new THREE.Mesh(new THREE.OctahedronGeometry(0.24), neon(lit, 4)); l.position.y = 3.85; g.add(l);
    const gr = new THREE.Mesh(new THREE.RingGeometry(0.9, 0.96, 6), neon(lit, 2)); gr.rotation.x = -Math.PI / 2; gr.position.y = 0.21; g.add(gr);
    return g;
  },
  'claim-wall': (d) => {
    const k = kit(d), g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ map: k.rim.map, color: 0xffffff, emissive: 0x1f2a44, emissiveIntensity: 0.55, roughness: 0.48, metalness: 0.3 });
    const w = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.36, 0.42), m)); w.position.y = 0.18; g.add(w);
    const cap = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.07, 0.48), std(d.far, { metalness: 0.8 }))); cap.position.y = 0.39; g.add(cap);
    const s = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.03, 0.03), neon(0xd9822b, 3)); s.position.set(0, 0.3, 0.215); g.add(s);
    const s2 = s.clone(); s2.position.z = -0.215; g.add(s2);
    const st = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.8, 6), std(0xd8d4c8))); st.position.set(0.5, 0.75, 0); st.rotation.z = -0.1; g.add(st);
    const t = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), neon(0xd9822b, 3.4)); t.position.set(0.54, 1.18, 0); g.add(t);
    return g;
  },
  'hero': (d) => {
    const g = new THREE.Group(), s = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.46, 48, 32), fresnelMarble(0xf2f0ea))); s.position.y = 0.5; g.add(s);
    const v = new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 16), neon(0x7fd6e8, 0.5)); v.position.set(0, 0.62, 0.42); g.add(v);
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.02, 8, 64), neon(0x7fd6e8, 2.8)); r.rotation.x = Math.PI / 2; r.position.y = 0.05; g.add(r);
    return g;
  },
  'teleporter': (d) => {
    const k = kit(d), g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ map: k.rim.map, roughness: 0.42, metalness: 0.75 });
    const b = hexPrismY(1.05, 0.16, m); b.position.y = 0.08; g.add(b);
    for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.5, arm = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.7, 0.26), m)); arm.position.set(Math.sin(a) * 0.86, 0.95, Math.cos(a) * 0.86); arm.rotation.y = a; arm.rotation.x = -0.14; g.add(arm); const tip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.2, 0.03), neon(d.n1, 3)); tip.position.set(Math.sin(a) * 0.76, 1.0, Math.cos(a) * 0.76); tip.rotation.y = a; tip.rotation.x = -0.14; g.add(tip); }
    const o = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.03, 8, 6), neon(d.n2, 3.2)); o.rotation.x = Math.PI / 2; o.position.y = 0.18; g.add(o);
    const c = new THREE.Mesh(new THREE.TorusKnotGeometry(0.2, 0.03, 80, 8, 2, 3), neon(d.n1, 3)); c.position.y = 1.0; g.add(c);
    return g;
  },
  'planet': (d) => {
    const base = rgb(d.planet.c), g = new THREE.Group();
    const c = pixels(1024, (u, v) => { const n = fbm(u * 8, v * 8 + fbm(u * 4, v * 16) * 2, 6), b = 0.85 + 0.15 * Math.sin(v * 40 + n * 7); return base.map((x) => x * b * (0.7 + 0.5 * n) * 0.34); });
    const s = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), new THREE.MeshStandardMaterial({ map: toTex(c), roughness: 1 })); g.add(s);
    const at = new THREE.Mesh(new THREE.SphereGeometry(1.02, 64, 48), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, uniforms: { c: { value: col(d.n2) } },
      vertexShader: 'varying vec3 n,v; void main(){n=normalize(normalMatrix*normal);vec4 p=modelViewMatrix*vec4(position,1.);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',
      fragmentShader: 'uniform vec3 c;varying vec3 n,v;void main(){float f=pow(1.-max(dot(n,v),0.),4.);gl_FragColor=vec4(c*.5,f*.6);}' })); g.add(at);
    return g;
  },
  'ballast': (d) => {
    const g = new THREE.Group(), hull = std(0x2a303a, { metalness: 0.8, roughness: 0.45 });
    const w = canvas(1024), x = w.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, 1024, 1024); const r = rnd(3);
    for (let i = 0; i < 900; i++) { x.fillStyle = r() < 0.09 ? hex(d.n1) : '#000'; x.fillRect(Math.floor(r() * 64) * 16, Math.floor(r() * 64) * 16, 10, 5); }
    const box = (sx, sy, sz, px, py, pz) => { const m = new THREE.MeshStandardMaterial({ color: 0x8a9ab8, metalness: 0.45, roughness: 0.55, emissive: 0xffffff, emissiveMap: toTex(w, 1), emissiveIntensity: 2.2, map: rimMapsPlain(d) }); const b = shadowed(new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m)); b.position.set(px, py, pz); g.add(b); return b; };
    box(21, 1.6, 2.2, 0, 0, 0); box(7, 2.8, 3.6, -3.5, 0.2, 0); box(3, 1.2, 5, 4, -0.2, 0); box(2.2, 1.2, 1.2, 9.6, 0.9, 0); box(5, 0.8, 1, -8, 1.1, 0.7); box(5, 0.8, 1, -8, -1.0, -0.7);
    for (let i = 0; i < 8; i++) { const t = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2, 12), hull)); t.rotation.z = Math.PI / 2; t.position.set(-1 + i * 1.5, -1.25, (i % 2 ? 1 : -1) * 0.75); g.add(t); }
    [[-10.8, 0.5], [-10.8, -0.5]].forEach(([a, b]) => { const e = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.4, 16), neon(d.n2, 3)); e.rotation.z = Math.PI / 2; e.position.set(a, b, 0); g.add(e); });
    for (let i = 0; i < 6; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), neon(i % 2 ? d.n1 : d.n2, 4)); l.position.set(-9 + i * 3.6, 1.0, 1.15); g.add(l); }
    return g;
  },
};
let rp;
function rimMapsPlain(d) { rp = rp || {}; if (!rp[d.key]) rp[d.key] = rimMaps(d).map; return rp[d.key]; }
function terrainMesh(d, list, r = 0.545) {
  const k = kit(d), g = new THREE.Group();
  const scale = 0.06;
  const mat = new THREE.MeshStandardMaterial({ map: k.ground.map, bumpMap: k.ground.bumpMap, bumpScale: 1.6, emissiveMap: k.ground.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0.55, vertexColors: true, roughness: 0.78, metalness: 0.2 });
  for (const t of [mat.map, mat.bumpMap, mat.emissiveMap]) t.repeat.set(scale, scale);
  g.add(shadowed(new THREE.Mesh(hexes(list, { r, ch: 0.05, chH: 0.05, bottom: -3 }), mat)));
  return g;
}

/* ---------- board ---------- */
export function boardCells() { const o = []; for (let r = -4; r <= 4; r++) for (let q = -4; q <= 4; q++) { if (Math.abs(q + r) > 4) continue; o.push({ q, r, x: q + r / 2, z: r * SQ3 / 2 }); } return o; }
const place = (obj, x, y, z) => { obj.position.set(x, y, z); return obj; };
function isStart(c, side) { const r = side * c.r; return r === 4 || r === 3 || (r === 2 && Math.abs(c.q + c.r / 2) <= 1); }

function sky(d, scene) {
  const c = canvas(1); c.width = 8192; c.height = 4096; const g = c.getContext('2d'); g.fillStyle = hex(d.sky); g.fillRect(0, 0, 8192, 4096);
  const r = rnd(17);
  const neb = g.createLinearGradient(0, 1880, 0, 2048); neb.addColorStop(0, 'rgba(0,0,0,0)'); neb.addColorStop(1, hex(d.nebula)); g.globalAlpha = 0.1; g.fillStyle = neb; g.fillRect(0, 1880, 8192, 170); g.globalAlpha = 1;
  for (let i = 0; i < d.stars * 4; i++) { const st = Math.floor(r() * 3), rad = [0.5, 0.75, 1][st]; g.fillStyle = `rgba(${215 + r() * 40},${220 + r() * 35},255,${[0.45, 0.7, 1][st]})`; g.beginPath(); g.arc(r() * 8192, r() * 2040, rad, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(900, 48, 32), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false })));
}
function lights(d, scene, shadowI = 1) {
  const e = THREE.MathUtils.degToRad(d.elev), a = THREE.MathUtils.degToRad(d.az);
  const s = new THREE.DirectionalLight(d.sun, d.sunI); s.position.set(Math.sin(a) * Math.cos(e) * 60, Math.sin(e) * 60, Math.cos(a) * Math.cos(e) * 60);
  s.castShadow = true; s.shadow.mapSize.set(4096, 4096); Object.assign(s.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 180 }); s.shadow.bias = -0.0004; s.shadow.normalBias = 0.02; s.shadow.intensity = shadowI; s.shadow.radius = 3; scene.add(s);
  const h = new THREE.HemisphereLight(col(d.n2).lerp(col(0x8fa0c0), 0.6), col(d.near), 1.5); scene.add(h);
  return s;
}
function horizon(d, scene, edge = 33) {
  // Airless: a flat plain, ridges lit on the sun side only, no distance fade.
  const g = new THREE.PlaneGeometry(1400, 1400, 400, 400); g.rotateX(-Math.PI / 2); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z), m = THREE.MathUtils.smoothstep(r, 70, 330); p.setY(i, -2.3 + m * (fbm(x / 60 + 3, z / 60, 5) ** 2) * 46); }
  g.computeVertexNormals();
  const e = d.elev * Math.PI / 180, a2 = d.az * Math.PI / 180, S = new THREE.Vector3(Math.sin(a2) * Math.cos(e), Math.sin(e), Math.cos(a2) * Math.cos(e)), N = g.attributes.normal, C = [];
  const plain = col(0x151b28), lit = col(0x3a4560), dark = col(0x0b0e16);
  for (let i = 0; i < p.count; i++) {
    const h = THREE.MathUtils.smoothstep(p.getY(i), -1.8, 2), l = Math.max(0, new THREE.Vector3().fromBufferAttribute(N, i).dot(S)), c = dark.clone().lerp(lit, Math.min(1, l * 1.7)), pl = plain.clone().multiplyScalar(1 + 0.9 * Math.max(0, N.getY(i) * S.y + N.getX(i) * S.x * 3 + N.getZ(i) * S.z * 3)), o = pl.lerp(c, h).multiplyScalar(2.3 * (0.85 + 0.3 * h2(i, 3)));
    C.push(o.r, o.g, o.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true })));
  const lip = new THREE.Mesh(new THREE.TorusGeometry(edge, 0.09, 6, 6), new THREE.MeshBasicMaterial({ color: col(0x3a4560).multiplyScalar(2.2) })); lip.rotation.x = Math.PI / 2; lip.rotation.z = Math.PI / 6; lip.position.y = -2.1; scene.add(lip);
  const rr = rnd(31), rock = new THREE.MeshStandardMaterial({ color: col(0x3a4560), roughness: 0.95, flatShading: true });
  for (let i = 0; i < 14; i++) { const a = rr() * 6.28, dd = edge + 8 + rr() * 60, m = shadowed(new THREE.Mesh(new THREE.DodecahedronGeometry(0.8 + rr() * 2.2, 0), rock), false, false); m.position.set(Math.sin(a) * dd, -2.2, Math.cos(a) * dd); m.scale.y = 0.5; m.rotation.y = rr() * 6; scene.add(m); }
  for (let i = 0; i < 6; i++) { const a = rr() * 6.28, dd = edge + 15 + rr() * 60, m = new THREE.Mesh(new THREE.RingGeometry(3 + i, 3.5 + i, 28), new THREE.MeshBasicMaterial({ color: col(0x0f1420).multiplyScalar(1.6) })); m.rotation.x = -Math.PI / 2; m.position.set(Math.sin(a) * dd, -2.26, Math.cos(a) * dd); scene.add(m); }
  [[-70, -120], [40, -150], [130, -90]].forEach(([x, z]) => { const t = M['lair-tower'](d); t.scale.setScalar(4); t.position.set(x, -3, z); scene.add(t); });
}
function addShip(d, scene, o) { const s = M.ballast(d); s.position.copy(o.pos); s.scale.setScalar(o.scale); s.rotation.set(o.rx ?? 0.1, o.ry ?? 0.35, o.rz ?? -0.12); scene.add(s); return s; }

function worldHex(d, R, cx = 0, cz = 0, opt = {}) {
  const o = [], f = opt.scale ?? 1, a = rnd(4), gapR = opt.keep ?? 0;
  for (let r = -R; r <= R; r++) for (let q = -R; q <= R; q++) {
    if (Math.abs(q + r) > R) continue;
    const x = (q + r / 2) * f + cx, z = r * SQ3 / 2 * f + cz, dist = Math.hypot(x, z);
    if (dist < gapR) continue;
    const zone = fbm(x * 0.07 + 7, z * 0.07 + 2, 3), step = Math.round(fbm(x * 0.13, z * 0.13, 3) * 7) * 0.33, y = (opt.base ?? 0) + step - 1.6 - (zone > 0.52 ? 0.45 : 0);
    const t = 0.78 + 0.34 * h2(q, r) + (zone > 0.56 ? 0.4 : 0) - (zone < 0.42 ? 0.2 : 0);
    const tone = opt.calm ? col(d.near) : col(d.tones[zone > 0.55 ? 0 : zone < 0.44 ? 1 : 2]), m2 = (opt.calm ? 1.5 : 1.9) * (0.92 + 0.16 * h2(q, r));
    o.push({ x, z, y, c: [tone.r * m2, tone.g * m2, tone.b * m2] });
  }
  return o;
}

export function buildArena(d, scene) {
  sky(d, scene); lights(d, scene); horizon(d, scene);
  const g = new THREE.Group(); scene.add(g);
  g.add(M.slab(d)); g.add(M.cell(d, false));
  const cells = boardCells();
  for (const c of cells) {
    if (isStart(c, 1)) g.add(place(M['marble-shell'](d), c.x, 0, c.z));
    if (isStart(c, -1)) g.add(place(M['marble-glass'](d), c.x, 0, c.z));
  }
  // Selection, target arrows, last move.
  const sel = cells.filter((c) => c.r === 2 && Math.abs(c.q + c.r / 2) <= 1);
  sel.forEach((c) => { const r = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.032, 8, 6), neon(0x7fd6e8, 3.2)); r.rotation.x = Math.PI / 2; r.rotation.z = Math.PI / 6; r.position.set(c.x, 0.05, c.z); g.add(r); });
  cells.filter((c) => c.r === 1 && c.x >= -1.5 && c.x <= 1.5).forEach((c) => { const s = new THREE.Mesh(new THREE.CircleGeometry(0.15, 6), neon(0x7fd6e8, 2.2)); s.rotation.x = -Math.PI / 2; s.position.set(c.x, 0.03, c.z); g.add(s); });
  const last = cells.find((c) => c.r === -1 && c.q === 1); const lm = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 8, 6), neon(0xd9822b, 3)); lm.rotation.x = Math.PI / 2; lm.rotation.z = Math.PI / 6; lm.position.set(last.x, 0.05, last.z); g.add(lm);
  // Turn bar on the near rim.
  const bar = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.03, 0.13), neon(0x5fd0e6, 0.6)); bar.position.set(0, 0.155, 4.63); g.add(bar);
  [-0.1, 0.1].forEach((o) => { const gr = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.02, 0.05), std(0x05070b)); gr.position.set(0, 0.15, 4.63 + o); g.add(gr); });
  [[5.35, 0], [-5.35, 0], [2.67, 4.63], [-2.67, 4.63], [2.67, -4.63], [-2.67, -4.63]].forEach(([x, z]) => g.add(place(M.post(d), x, 0.1, z)));
  // The survey below.
  const list = worldHex(d, 26, 0, 0, { keep: 7.4, scale: 1.25, base: -0.6, calm: true });
  scene.add(terrainMesh(d, list, 0.66));
  const r = rnd(8);
  for (const h of list) {
    const p = r();
    if (p < 0.02) { if (Math.hypot(h.x, h.z) >= 13) { const o = M.outcrop(d); o.scale.setScalar(0.55); scene.add(place(o, h.x, h.y, h.z)); } }
    else if (p < 0.05) scene.add(place(M['boulder-crew'](d), h.x, h.y, h.z));
    else if (p < 0.075) { const w = M['claim-wall'](d); w.rotation.y = r() * 6; scene.add(place(w, h.x, h.y, h.z)); }
  }
  [[-13, -15], [14, -18], [19, 3], [-22, -2]].forEach(([x, z], i) => scene.add(place(M['lair-tower'](d, i === 2), x, -1, z)));
  if (d.ship) addShip(d, scene, { pos: new THREE.Vector3(10, 150, -320), scale: 16 });
  else addShip(d, scene, { pos: new THREE.Vector3(-140, 170, -420), scale: 4 });
}
export function buildWorld(d, scene) {
  sky(d, scene); lights(d, scene, 0.55); horizon(d, scene, 34);
  const list = worldHex(d, 34, 0, 0, { base: 1.1, scale: 1 });
  scene.add(terrainMesh(d, list, 0.545));
  const at = (x, z) => list.reduce((b, h) => (Math.hypot(h.x - x, h.z - z) < Math.hypot(b.x - x, b.z - z) ? h : b));
  const put = (o, x, z, ry = 0, s = 1) => { const h = at(x, z); o.position.set(h.x, h.y, h.z); o.rotation.y = ry; o.scale.setScalar(s); scene.add(o); return h; };
  const r = rnd(21);
  for (const h of list) {
    const dd = Math.hypot(h.x, h.z), p = r(); if (dd < 2.6) continue;
    if (p < 0.01) { const o = M.outcrop(d); o.position.set(h.x, h.y, h.z); o.scale.setScalar((0.7 + r() * 0.4) * (dd < 8 ? 0.6 : 1)); scene.add(o); }
    else if (p < 0.03) { const o = M['boulder-crew'](d); o.position.set(h.x, h.y, h.z); scene.add(o); }
  }
  put(M.hero(d), 0, 0);
  for (let i = 0; i < 6; i++) { const a = i * 1.047, m = M['marble-glass'](d); put(m, Math.sin(a) * 1.5, Math.cos(a) * 1.5, 0, 0.72); }
  [[-7, -8, false], [8, -13, false], [10, -3, true], [-14, -16, true]].forEach(([x, z, b]) => put(M['lair-tower'](d, b), x, z));
  put(M.teleporter(d), -5, 4);
  for (let i = 0; i < 9; i++) put(M['claim-wall'](d), 3 + i * 1.0, -6 + i * 0.58, -1.05);
  for (let i = 0; i < 4; i++) put(M['marble-shell'](d), -8 + (i % 2), -5 + i * 0.9, 0, 1);
  if (d.ship) addShip(d, scene, { pos: new THREE.Vector3(10, 160, -340), scale: 16 });
  else addShip(d, scene, { pos: new THREE.Vector3(-140, 170, -420), scale: 4 });
}

/* ---------- render ---------- */
const W = window;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
document.getElementById('v').appendChild(renderer.domElement);

function draw(scene, cam, w, h, bloom = 0.16) {
  renderer.setPixelRatio(1); renderer.setSize(w, h, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
  const c = new EffectComposer(renderer, rt); c.setPixelRatio(1); c.setSize(w, h);
  c.addPass(new RenderPass(scene, cam));
  c.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), bloom, 0.15, 1.25));
  c.addPass(new OutputPass()); c.render();
}
function orbit(cam, tx, ty, tz, yawDeg, pitchDeg, dist) {
  const y = THREE.MathUtils.degToRad(yawDeg), p = THREE.MathUtils.degToRad(pitchDeg);
  cam.position.set(tx + dist * Math.cos(p) * Math.sin(y), ty + dist * Math.sin(p), tz + dist * Math.cos(p) * Math.cos(y)); cam.lookAt(tx, ty, tz); cam.updateMatrixWorld();
}
function addPlanet(d, scene, cam) {
  const p = M.planet(d), ndc = new THREE.Vector3(d.planet.ndc[0], d.planet.ndc[1], 0.5).unproject(cam).sub(cam.position).normalize();
  const D = 600; p.position.copy(cam.position).addScaledVector(ndc, D); p.scale.setScalar(Math.tan(THREE.MathUtils.degToRad(d.planet.deg / 2)) * D); p.rotation.set(0.4, 1, 0.3); scene.add(p);
}
export const VIEWS = {
  'arena-desktop': { s: 'arena', w: 1600, h: 900, yaw: 0, pitch: 50, dist: 13.6, tz: -0.28, hud: 'arena' },
  'arena-phone': { s: 'arena', w: 780, h: 1688, yaw: 0, pitch: 62, dist: 31, hud: 'arena' },
  'arena-low': { s: 'arena', w: 1600, h: 900, yaw: -28, pitch: 11, dist: 19, ty: 2.4 },
  'arena-side': { s: 'arena', w: 1600, h: 900, yaw: 90, pitch: 32, dist: 15 },
  'arena-top': { s: 'arena', w: 1600, h: 900, yaw: 0, pitch: 81, dist: 15.5 },
  'arena-close': { s: 'arena', w: 1600, h: 900, yaw: 18, pitch: 26, dist: 6.2, tx: 0.2, tz: 2.2 },
  'world-desktop': { s: 'world', w: 1600, h: 900, yaw: 0, pitch: 48, dist: 16, hud: 'world' },
  'world-phone': { s: 'world', w: 780, h: 1688, yaw: 0, pitch: 58, dist: 22, hud: 'world' },
  'world-low': { s: 'world', w: 1600, h: 900, yaw: 200, pitch: 9, dist: 16, ty: 3.2 },
  'world-top': { s: 'world', w: 1600, h: 900, yaw: 0, pitch: 80, dist: 30 },
};
const hudEl = document.getElementById('hud');
function hud(kind, d, phone) {
  const n = hex(d.n1), n2 = hex(d.n2); hudEl.style.setProperty('--n', n); hudEl.style.setProperty('--n2', n2);
  hudEl.className = phone ? 'phone' : ''; hudEl.innerHTML = '';
  if (!kind) return;
  if (kind === 'arena') hudEl.innerHTML = `<div class="pan tl"><b><i></i>BLACK TO MOVE</b><span>Black ejected 0/6 · White ejected 0/6</span><em>${'▮'.repeat(6)}<u>${'▮'.repeat(6)}</u></em></div>
    <div class="pan tally">Mess: two crews, one table. Ledger open.</div>
    <div class="pan dock"><a>New</a><a>View</a><a>Hint</a><a>Replay</a><a>Modes</a></div>`;
  else hudEl.innerHTML = `<div class="pan tally">Seats on file: 2 of 6. Slag-glass remembers heat.</div>
    <div class="pan mini"><s></s><s class="b"></s><s class="c"></s></div><div class="pan map">MAP</div>`;
}
W.renderView = (dk, view) => {
  const d = DIRS[dk], v = VIEWS[view], scene = new THREE.Scene(); scene.background = col(d.sky);
  (v.s === 'arena' ? buildArena : buildWorld)(d, scene);
  const cam = new THREE.PerspectiveCamera(40, v.w / v.h, 0.1, 2500);
  orbit(cam, v.tx ?? 0, v.ty ?? 0, v.tz ?? 0, v.yaw, v.pitch, v.dist); addPlanet(d, scene, cam);
  hud(v.hud, d, v.w < v.h); document.getElementById('v').style.cssText = `width:${v.w / 2}px;height:${v.h / 2}px`;
  draw(scene, cam, v.w, v.h);
  return [v.w / 2, v.h / 2];
};

/* Four-angle 3D sheet and 2D blueprint of one mesh. */
function fit(obj) { const b = new THREE.Box3().setFromObject(obj), c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3()); return { b, c, s, r: s.length() / 2 }; }
function shot(scene, cam, w, h) { draw(scene, cam, w, h, 0.14); const c = canvas(1); c.width = w; c.height = h; c.getContext('2d').drawImage(renderer.domElement, 0, 0); return c; }
function stage(d, obj) {
  const scene = new THREE.Scene(); scene.background = col(0x05070e); lights(d, scene); scene.add(obj);
  const f = fit(obj), g = new THREE.Mesh(new THREE.CircleGeometry(f.r * 3, 6), new THREE.MeshLambertMaterial({ color: d.far })); g.rotation.x = -Math.PI / 2; g.position.y = f.b.min.y - 0.01; g.receiveShadow = true; scene.add(g);
  return { scene, f };
}
const sheetEl = document.getElementById('sheet');
function compose(items, cols, tw, th, title) {
  const c = canvas(1); c.width = cols * tw; c.height = Math.ceil(items.length / cols) * th; const g = c.getContext('2d'); g.fillStyle = '#05070e'; g.fillRect(0, 0, c.width, c.height);
  items.forEach(([im, label], i) => { const x = (i % cols) * tw, y = Math.floor(i / cols) * th; g.drawImage(im, x, y, tw, th); g.strokeStyle = '#1b2233'; g.lineWidth = 2; g.strokeRect(x, y, tw, th); g.font = '600 22px Helvetica'; g.fillStyle = '#19e6ff'; g.fillText(label, x + 22, y + 38); });
  sheetEl.innerHTML = ''; sheetEl.appendChild(c); c.style.cssText = 'display:block'; document.getElementById('v').style.display = 'none'; hudEl.innerHTML = ''; return [c.width, c.height];
}
function dressMesh(id, d) { if (id === 'cell') return M.cell(d); if (id === 'slab') { const g = M.slab(d); g.add(M.cell(d, false)); return g; } return M[id](d); }
W.renderMesh3D = (dk, id) => {
  const d = DIRS[dk], obj = dressMesh(id, d), { scene, f } = stage(d, obj), big = id === 'ballast' || id === 'planet';
  const cam = new THREE.PerspectiveCamera(32, 16 / 10, 0.05, 2000), out = [], dist = f.r / Math.sin(THREE.MathUtils.degToRad(14)) * 0.82;
  let ang = [['FACE', 0, 8], ['TROIS-QUARTS', 38, 24], ['ARRIÈRE', 160, 16], ['DESSUS', 0, 84]], K = 1;
  if (id === 'slab') { ang = [['FACE', 0, 35], ['TROIS-QUARTS', 38, 35], ['ARRIÈRE', 160, 35], ['DESSUS', 0, 84]]; K = 0.67; }
  if (id === 'ballast') { ang = [['FLANC', 0, 6], ['TROIS-QUARTS', 32, 14], ['ARRIÈRE', 165, 10], ['DESSUS', 0, 70]]; K = 0.7; }
  const rimL = new THREE.DirectionalLight(id === 'ballast' ? 0x8090b0 : 0x7fa0b0, id === 'ballast' ? 3 : 1.2); rimL.position.set(8, 12, 22); scene.add(rimL);
  const rimL2 = rimL.clone(); rimL2.position.set(-14, 8, -18); rimL2.intensity = id === 'ballast' ? 2 : 0.8; scene.add(rimL2);
  if (id === 'planet') { const g = scene.children.find((c) => c.geometry?.type === 'CircleGeometry'); g.visible = false; }
  for (const [n, y, p] of ang) { orbit(cam, f.c.x, f.c.y, f.c.z, y, p, dist * K); out.push([shot(scene, cam, 960, 600), n]); }
  return compose(out, 2, 800, 500);
};
function flat(obj) {
  // Line art: dark fill, every edge drawn, neon parts kept in their colour.
  const o = new THREE.Group();
  obj.updateMatrixWorld(true);
  obj.traverse((m) => {
    if (!m.geometry || m.isLine || m.isLineSegments) return;
    const isNeon = m.material.isMeshBasicMaterial, c = isNeon ? m.material.color.clone().multiplyScalar(0.4) : col(0x0d1322);
    const f = new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })); f.applyMatrix4(m.matrixWorld); o.add(f);
    const l = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 24), new THREE.LineBasicMaterial({ color: isNeon ? c : 0x8fb4d8 })); l.applyMatrix4(m.matrixWorld); o.add(l);
  });
  return o;
}
function grid(w, h, label, size) {
  const c = canvas(1); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#060a14'; g.fillRect(0, 0, w, h); g.strokeStyle = '#121b2e'; g.lineWidth = 1; for (let x = 0; x < w; x += 30) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y < h; y += 30) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } return c;
}
function ortho(obj, axis) {
  const scene = new THREE.Scene(); scene.background = null; scene.add(obj);
  const f = fit(obj), a = 16 / 10, hh = (axis === 'top' ? Math.max(f.s.z, f.s.x / a) : Math.max(f.s.y, Math.max(f.s.x, f.s.z) / a)) * 0.62, cam = new THREE.OrthographicCamera(-hh * a, hh * a, hh, -hh, 0.01, 3000);
  const D = f.r * 6 + 10; cam.position.copy(f.c).add(axis === 'front' ? new THREE.Vector3(0, 0, D) : axis === 'side' ? new THREE.Vector3(D, 0, 0) : new THREE.Vector3(0, D, 0.001)); cam.lookAt(f.c); cam.updateMatrixWorld();
  renderer.setPixelRatio(1); renderer.setSize(960, 600, false); renderer.setClearColor(0x000000, 0); const tm = renderer.toneMapping; renderer.toneMapping = THREE.NoToneMapping; renderer.render(scene, cam); renderer.toneMapping = tm;
  const c = grid(960, 600); c.getContext('2d').drawImage(renderer.domElement, 0, 0); return { c, f };
}
W.renderMesh2D = (dk, id) => {
  const d = DIRS[dk], obj = flat(dressMesh(id, d)), a = ortho(obj.clone(), 'front'), b = ortho(obj.clone(), 'side'), t = ortho(obj.clone(), 'top');
  const hdr = grid(960, 600), g = hdr.getContext('2d'); g.font = '500 24px Helvetica'; g.fillStyle = '#8fb4d8'; const s = a.f.s, unit = id === 'ballast' ? 100 : 1;
  g.fillText('GABARIT', 40, 70); g.font = '600 46px Helvetica'; g.fillStyle = '#e8f0ff'; g.fillText(`${(s.x).toFixed(2)} × ${(s.y).toFixed(2)} × ${(s.z).toFixed(2)}`, 40, 130); g.font = '400 22px Helvetica'; g.fillStyle = '#8fb4d8'; g.fillText('largeur × hauteur × profondeur, en cellules', 40, 168);
  let tri = 0; obj.traverse((m) => { if (m.isMesh) tri += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); g.fillStyle = '#19e6ff'; g.font = '600 32px Helvetica'; g.fillText(`${Math.round(tri)} triangles (maquette)`, 40, 240);
  const pal = [d.n1, d.n2, d.slab, d.cell, d.gap, 0xd9822b]; pal.forEach((p, i) => { g.fillStyle = hex(p); g.fillRect(40 + i * 140, 300, 120, 120); g.fillStyle = '#8fb4d8'; g.font = '400 18px Helvetica'; g.fillText(hex(p), 40 + i * 140, 448); });
  return compose([[a.c, 'FACE'], [b.c, 'PROFIL'], [t.c, 'PLAN'], [hdr, '']], 2, 800, 500);
};
W.renderScene2D = (dk, kind) => {
  const d = DIRS[dk], scene = new THREE.Scene(); (kind === 'arena' ? buildArena : buildWorld)(d, scene);
  const keep = new THREE.Group(); [...scene.children].forEach((c) => { if (c.isGroup || (c.isMesh && c.geometry.type === 'BufferGeometry')) keep.add(c); });
  const obj = flat(keep), s2 = new THREE.Scene(); s2.add(obj); const R = kind === 'arena' ? 9.2 : 15, a = 16 / 9, cam = new THREE.OrthographicCamera(-R * a, R * a, R, -R, 0.1, 1000); cam.position.set(0, 200, 0.001); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
  renderer.setPixelRatio(1); renderer.setSize(1600, 900, false); renderer.setClearColor(0x05070e, 1); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%'; renderer.toneMapping = THREE.NoToneMapping; renderer.render(s2, cam);
  document.getElementById('v').style.cssText = 'width:800px;height:450px'; hudEl.innerHTML = ''; return [800, 450];
};
W.ready = true;
