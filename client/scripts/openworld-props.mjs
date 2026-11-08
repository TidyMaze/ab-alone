// The Open world's mountain and tree (#1557), generated: a two-level faceted peak and a three-tier pine, so that from far away they
// read apart from each other and from the crystal they were (both were cones). Each replaces the mesh of its node (`ow_mountain`,
// `ow_tree`, and the `_hi` nodes) in the two prop models; the wall is a generated battlement too (#1557); the boulder keeps its bytes. Same input, same bytes: the
// committed models are what this writes, and writing them again changes nothing. Run from client/, then pack the served copy:
//   node -e "import('./scripts/openworld-props.mjs').then((m) => m.regenerate(m.MODELS))" && bun run scripts/pack-models.mjs
import { readFileSync, writeFileSync } from 'node:fs';

export const MODELS = new URL('../models/', import.meta.url);
const SIZE = { SCALAR: 1, VEC3: 3, VEC4: 4 };
const WIDTH = { 5123: 2, 5126: 4 }; // UNSIGNED_SHORT, FLOAT
const FILES = { 'openworld.glb': { mountain: 6, tree: 6 }, 'openworld-hi.glb': { mountain: 6, tree: 8 } };

const sub = (a, b) => a.map((v, i) => v - b[i]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** The flat geometry of triangles, each point `[x, y, z, tone]` (tone 0 is the base, 1 the peak). A face's normal points away from
 * the axis: the sign of its radial part is kept. With `outs`, a face is turned (its winding and its normal) toward its own outside
 * direction instead. Positions and normals are floats, the colours normalised unsigned shorts (RGBA). */
function flat(triangles, base, peak, outs) {
  const positions = [];
  const normals = [];
  const colours = [];
  triangles.forEach((given, index) => {
    let tri = given;
    let n = cross(sub(tri[1], tri[0]), sub(tri[2], tri[0]));
    let sign;
    if (outs) {
      const out = outs[index];
      if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) tri = [tri[0], tri[2], tri[1]];
      n = cross(sub(tri[1], tri[0]), sub(tri[2], tri[0]));
      sign = 1;
    } else {
      const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
      const cz = (tri[0][2] + tri[1][2] + tri[2][2]) / 3;
      sign = Math.sign(n[0] * cx + n[2] * cz);
    }
    const length = Math.hypot(...n);
    for (const p of tri) {
      positions.push(p[0], p[1], p[2]);
      normals.push(...n.map((v) => (sign * v) / length));
      const t = p[3];
      for (let c = 0; c < 3; c++) colours.push(Math.round((base[c] + (peak[c] - base[c]) * t) * 65535));
      colours.push(65535);
    }
  });
  const count = triangles.length * 3;
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colours: new Uint16Array(colours),
    indices: Uint16Array.from({ length: count }, (_, i) => i),
  };
}

/** The tones of the props, linear RGB 0 to 1, as the Blender export painted them (the mountain's dark base and pale summit, the
 * tree's dark skirt and bright tip). */
const TONES = {
  mountain: { base: [0.07, 0.09, 0.13], peak: [0.79, 0.87, 1] },
  wall: { base: [0.02, 0.03, 0.04], peak: [0.16, 0.19, 0.25] }, // a dark foot, a slate walkway, pale merlon tops (#1557)
  tree: { base: [0x5d / 255, 0x6a / 255, 0x82 / 255], peak: [0x7f / 255, 0xd6 / 255, 0xe8 / 255] }, // the palette's cell slate and pedestal ring (#1557 art round 1)
};

/** The mountain: a ring of 6 at the base, a ring of 6 at 60 degrees offset, higher on odd steps, and a summit a little off centre:
 * 18 triangles. */
export function mountain() {
  const ring = (n, radius, depth, y, t, offset) =>
    Array.from({ length: n }, (_, i) => {
      const a = ((i + offset) * 2 * Math.PI) / n;
      return [radius * depth[0] * Math.cos(a), y(i), radius * depth[1] * Math.sin(a), t];
    });
  const low = ring(6, 0.5, [1.04, 0.84], () => -0.5, 0, 0);
  const mid = ring(6, 0.6, [0.5, 0.44], (i) => (i % 2 ? 0.05 : -0.12), 0.5, 0.5);
  const summit = [0.04, 0.5, -0.02, 1];
  const triangles = [];
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    triangles.push([low[i], low[j], mid[i]], [mid[i], low[j], mid[j]], [mid[i], mid[j], summit]);
  }
  return flat(triangles, TONES.mountain.base, TONES.mountain.peak);
}

/** The tree: three tiers, each a cone of `sides` faces, the upper one starting inside the lower one: 3 * sides triangles. */
export function tree(sides) {
  const tiers = [
    [0.33, -0.5, -0.08],
    [0.25, -0.26, 0.16],
    [0.16, 0, 0.5],
  ];
  const triangles = tiers.flatMap(([radius, y0, y1], tier) => {
    const ring = Array.from({ length: sides }, (_, i) => {
      const a = ((i + tier / 2) * 2 * Math.PI) / sides;
      return [radius * Math.cos(a), y0, radius * Math.sin(a), 0];
    });
    const apex = [0, y1, 0, 1];
    return ring.map((p, i) => [p, ring[(i + 1) % sides], apex]);
  });
  return flat(triangles, TONES.tree.base, TONES.tree.peak);
}

/** The wall: a hex column (corners at 30 + 60 k degrees, radius 0.5, as the old wall) up to a walkway at 0.125, and three merlons on
 * alternate edges up to 0.5, 0.375 high and 0.2 deep: from above a dark hex with three pale teeth, from the side a battlement. 12 side, 4
 * walkway and 3 x 10 merlon triangles: 46. */
export function wall() {
  const FOOT = -0.5;
  const WALK = 0.125;
  const TOP = 0.5;
  const corner = (i, radius, y, t) => {
    const a = ((30 + 60 * i) * Math.PI) / 180;
    return [radius * Math.cos(a), y, radius * Math.sin(a), t];
  };
  const triangles = [];
  const outs = [];
  const face = (a, b, c, out) => {
    triangles.push([a, b, c]);
    outs.push(out);
  };
  const quad = (a, b, c, d, out) => {
    face(a, b, c, out);
    face(a, c, d, out);
  };
  const UP = [0, 1, 0];
  const mid = (i) => [Math.cos(((60 + 60 * i) * Math.PI) / 180), 0, Math.sin(((60 + 60 * i) * Math.PI) / 180)];
  for (let i = 0; i < 6; i++) quad(corner(i, 0.5, FOOT, 0), corner(i + 1, 0.5, FOOT, 0), corner(i + 1, 0.5, WALK, 0.5), corner(i, 0.5, WALK, 0.5), mid(i));
  for (let i = 1; i < 5; i++) face(corner(0, 0.5, WALK, 0.5), corner(i, 0.5, WALK, 0.5), corner(i + 1, 0.5, WALK, 0.5), UP);
  for (let i = 0; i < 6; i += 2) {
    const [o0, o1, i0, i1] = [corner(i, 0.5, WALK, 0.5), corner(i + 1, 0.5, WALK, 0.5), corner(i, 0.3, WALK, 0.5), corner(i + 1, 0.3, WALK, 0.5)];
    const up = (p) => [p[0], TOP, p[2], 1];
    const out = mid(i);
    const side = (p, q) => sub(q, p); // along the edge, out of the merlon's end
    quad(o0, o1, up(o1), up(o0), out);
    quad(i0, i1, up(i1), up(i0), out.map((v) => -v));
    quad(o0, i0, up(i0), up(o0), side(o1, o0));
    quad(o1, i1, up(i1), up(o1), side(o0, o1));
    quad(up(o0), up(o1), up(i1), up(i0), UP);
  }
  return flat(triangles, TONES.wall.base, TONES.wall.peak, outs);
}

/** A glTF's bytes with the mountain, the tree and the wall (the nodes `ow_mountain`, `ow_tree`, `ow_wall`, with `_hi` in the detailed file) remade with
 * `sides.tree` sides. Every other accessor is copied as it is. */
export function withProps(glb, sides) {
  const headerLength = glb.readUInt32LE(12);
  const doc = JSON.parse(glb.subarray(20, 20 + headerLength).toString());
  const bin = glb.subarray(28 + headerLength, 28 + headerLength + glb.readUInt32LE(20 + headerLength));
  const propOfMesh = {};
  for (const node of doc.nodes) {
    const match = /^ow_(mountain|tree|wall)(_hi)?$/.exec(node.name);
    if (match) propOfMesh[node.mesh] = match[1];
  }
  const views = [];
  const accessors = [];
  let size = 0;
  const place = (bytes) => {
    const pad = (4 - (size % 4)) % 4;
    views.push({ buffer: 0, byteOffset: size + pad, byteLength: bytes.length });
    size += pad + bytes.length;
    return Buffer.concat([Buffer.alloc(pad), bytes]);
  };
  const chunks = [];
  const add = (bytes, accessor) => {
    chunks.push(place(bytes));
    accessors.push({ ...accessor, bufferView: views.length - 1, byteOffset: 0 });
    return accessors.length - 1;
  };
  const copy = (index) => {
    const acc = doc.accessors[index];
    const view = doc.bufferViews[acc.bufferView];
    const start = (view.byteOffset | 0) + (acc.byteOffset | 0); // | 0: an absent offset is 0
    return add(bin.subarray(start, start + acc.count * SIZE[acc.type] * WIDTH[acc.componentType]), acc);
  };
  const bytesOf = (array) => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
  doc.meshes.forEach((mesh, meshIndex) => {
    mesh.primitives.forEach((primitive) => {
      const prop = propOfMesh[meshIndex];
      if (!prop) {
        const attributes = {};
        for (const [name, index] of Object.entries(primitive.attributes)) attributes[name] = copy(index);
        primitive.attributes = attributes;
        primitive.indices = copy(primitive.indices);
        return;
      }
      const g = prop === 'tree' ? tree(sides.tree) : prop === 'wall' ? wall() : mountain();
      const axis = (c) => Array.from({ length: g.positions.length / 3 }, (_, i) => g.positions[i * 3 + c]);
      const min = [0, 1, 2].map((c) => Math.min(...axis(c)));
      const max = [0, 1, 2].map((c) => Math.max(...axis(c)));
      primitive.attributes = {
        POSITION: add(bytesOf(g.positions), { componentType: 5126, type: 'VEC3', count: g.positions.length / 3, min, max }),
        NORMAL: add(bytesOf(g.normals), { componentType: 5126, type: 'VEC3', count: g.normals.length / 3 }),
        COLOR_0: add(bytesOf(g.colours), { componentType: 5123, type: 'VEC4', normalized: true, count: g.colours.length / 4 }),
      };
      primitive.indices = add(bytesOf(g.indices), { componentType: 5123, type: 'SCALAR', count: g.indices.length });
    });
  });
  doc.bufferViews = views;
  doc.accessors = accessors;
  doc.buffers[0].byteLength = size;
  const json = Buffer.from(JSON.stringify(doc));
  const jsonChunk = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const binChunk = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write('glTF', 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
  const chunkHeader = (length, type) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(length, 0);
    h.writeUInt32LE(type, 4);
    return h;
  };
  return Buffer.concat([header, chunkHeader(jsonChunk.length, 0x4e4f534a), jsonChunk, chunkHeader(binChunk.length, 0x004e4942), binChunk]);
}

/** Rewrites the two prop models in `dir` (`MODELS`, the committed ones). */
export function regenerate(dir) {
  for (const [file, sides] of Object.entries(FILES)) {
    const url = new URL(file, dir);
    writeFileSync(url, withProps(readFileSync(url), sides));
  }
}
