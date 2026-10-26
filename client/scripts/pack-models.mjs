// Compresses the glTF models with meshopt (EXT_meshopt_compression, #701); the page decodes them with the GLTFLoader's
// MeshoptDecoder (roomloader.ts). Each model's source is its Blender export in client/models/, outside public/, so it never
// reaches the build; the packed copy is committed under public/assets/pbr/. gltfpack keeps the node names roomloader.ts
// picks the materials by (-kn), the UVs the PBR maps tile on though the model has no texture (-kv), and full precision
// (-noq: quantized, each mesh moves into an unnamed child node). Same source, same bytes.
// Run from client/ after a new export: bun run scripts/pack-models.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pack } from 'gltfpack';

export const SOURCE = new URL('../models/', import.meta.url);
export const OUTPUT = new URL('../public/assets/pbr/', import.meta.url);

/** The meshopt-compressed copy of one .glb file. */
export async function packModel(glb) {
  let packed;
  await pack(['-i', 'in.glb', '-o', 'out.glb', '-c', '-kn', '-kv', '-noq'], { read: () => glb, write: (_, data) => (packed = data) });
  return Buffer.from(packed);
}

// Run as a script: the same check as the asset generators, which a test can make true (import.meta.main it cannot).
if (import.meta.url === `file://${process.argv[1]}`) {
  for (const name of readdirSync(SOURCE)) {
    writeFileSync(new URL(name, OUTPUT), await packModel(readFileSync(new URL(name, SOURCE))));
    console.log(`public/assets/pbr/${name}`);
  }
}
