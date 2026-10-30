import type { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import type * as THREE from 'three/webgpu';

export const EDITOR_URL = 'https://threejs.org/editor/';
const ENDPOINT = '/__editor/scene.json'; // the dev server's, scripts/editor-scene.mjs

/** What GLTFExporter decompresses the KTX2 textures with: the utils of the renderer the game runs on. */
export const textureUtils = (renderer: THREE.Renderer): Promise<Parameters<GLTFExporter['setTextureUtils']>[0]> =>
  (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend
    ? import('three/examples/jsm/utils/WebGPUTextureUtils.js')
    : import('three/examples/jsm/utils/WebGLTextureUtils.js');

/**
 * Opens the live scene in the three.js Editor (#872). toJSON() cannot write KTX2 textures, so the scene goes through
 * a GLB (GLTFExporter decompresses them, and keeps the lights as KHR_lights_punctual), is read back, and the editor
 * project (`{ camera, scene, scripts }`, what Editor.fromJSON takes) is posted to the dev server, which the Editor loads.
 * The tab opens first, from the click: a popup opened after the export would be blocked.
 */
export async function openInEditor(scene: THREE.Scene, camera: THREE.Camera, renderer: THREE.Renderer): Promise<void> {
  const tab = window.open('', '_blank');
  if (!tab) throw new Error('Editor export: the browser blocked the new tab');
  try {
    const [{ GLTFExporter }, { GLTFLoader }, { Scene }] = await Promise.all([
      import('three/examples/jsm/exporters/GLTFExporter.js'),
      import('three/examples/jsm/loaders/GLTFLoader.js'),
      import('three/webgpu'),
    ]);
    const glb = await new GLTFExporter().setTextureUtils(await textureUtils(renderer)).parseAsync(scene, { binary: true });
    const loaded = await new GLTFLoader().parseAsync(glb as ArrayBuffer, '');
    const project = { metadata: {}, project: {}, camera: camera.toJSON(), scene: new Scene().add(loaded.scene).toJSON(), scripts: {} };
    const posted = await fetch(ENDPOINT, { method: 'POST', body: JSON.stringify(project) });
    if (!posted.ok) throw new Error(`Editor export: POST ${ENDPOINT} answered ${posted.status}`);
  } catch (error) {
    tab.close();
    throw error;
  }
  tab.location.href = `${EDITOR_URL}#file=${location.origin}${ENDPOINT}`;
}
