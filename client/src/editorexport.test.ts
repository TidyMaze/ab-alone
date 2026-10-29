// @vitest-environment jsdom
import * as THREE from 'three/webgpu';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EDITOR_URL, openInEditor, textureUtils } from './editorexport';

// The two texture utils, marked: the real ones draw on a GPU.
vi.mock('three/examples/jsm/utils/WebGPUTextureUtils.js', () => ({ id: 'webgpu' }));
vi.mock('three/examples/jsm/utils/WebGLTextureUtils.js', () => ({ id: 'webgl' }));

afterEach(() => vi.unstubAllGlobals());

describe('textureUtils', () => {
  it('decompresses the KTX2 textures on the renderer the game runs on', async () => {
    expect(await textureUtils({ backend: { isWebGPUBackend: true } } as never)).toMatchObject({ id: 'webgpu' });
    expect(await textureUtils({ backend: {} } as never)).toMatchObject({ id: 'webgl' });
  });
});

describe('openInEditor (#872)', () => {
  const live = () => {
    const scene = new THREE.Scene();
    const tube = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: 0x38e8ff }));
    tube.name = 'corner-neon-nw';
    const lamp = new THREE.PointLight(0x38e8ff, 2.25);
    lamp.name = 'corner-neon-nw light';
    scene.add(tube, lamp);
    return { scene, camera: new THREE.PerspectiveCamera(35), renderer: { backend: {} } as never };
  };

  it('posts the live scene as an editor project, then points the opened tab at it', async () => {
    const tab = { location: { href: 'about:blank' } };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as never);
    const post = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', post);
    const { scene, camera, renderer } = live();
    await openInEditor(scene, camera, renderer);

    expect(open).toHaveBeenCalledWith('', '_blank'); // from the click itself: a popup after the export would be blocked
    const [url, init] = post.mock.calls[0]!;
    expect([url, init.method]).toEqual(['/__editor/scene.json', 'POST']);
    const project = JSON.parse(init.body);
    expect(Object.keys(project).sort()).toEqual(['camera', 'metadata', 'project', 'scene', 'scripts']);
    expect(project.camera.object.type).toBe('PerspectiveCamera');
    expect(project.scene.object.type).toBe('Scene');
    const kinds = JSON.stringify(project.scene.object);
    expect(kinds).toContain('"name":"corner-neon-nw"'); // the mesh and its name came through the glTF
    expect(kinds).toContain('PointLight'); // KHR_lights_punctual kept the light
    expect(tab.location.href).toBe(`${EDITOR_URL}#file=${location.origin}/__editor/scene.json`);
  });

  it('closes the tab and says so when the dev endpoint refuses', async () => {
    const tab = { location: { href: 'about:blank' }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(tab as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const { scene, camera, renderer } = live();
    await expect(openInEditor(scene, camera, renderer)).rejects.toThrow('Editor export: POST /__editor/scene.json answered 404');
    expect(tab.close).toHaveBeenCalled();
  });

  it('says so when the browser blocks the popup', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const { scene, camera, renderer } = live();
    await expect(openInEditor(scene, camera, renderer)).rejects.toThrow('Editor export: the browser blocked the new tab');
  });
});
