import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain Node script, no type declarations
import { editorScene } from './editor-scene.mjs';

type Handler = (req: Readable & { method: string }, res: Res) => Promise<void>;
interface Res {
  statusCode: number;
  headers: Record<string, string>;
  setHeader: (name: string, value: string) => void;
  end: ReturnType<typeof vi.fn>;
}

/** The plugin's middleware, as the dev server mounts it, and a request to it. */
function serve() {
  let mounted: { path: string; handler: Handler } | null = null;
  const plugin = editorScene();
  plugin.configureServer({ middlewares: { use: (path: string, handler: Handler) => (mounted = { path, handler }) } });
  const call = async (method: string, body = ''): Promise<Res> => {
    const headers: Record<string, string> = {};
    const res: Res = { statusCode: 200, headers, setHeader: (n, v) => void (headers[n] = v), end: vi.fn() };
    await mounted!.handler(Object.assign(Readable.from([Buffer.from(body)]), { method }), res);
    return res;
  };
  return { plugin, mounted: () => mounted!, call };
}

describe('editorScene (#872)', () => {
  it('lives in the dev server only, at /__editor/scene.json', () => {
    const { plugin, mounted } = serve();
    expect(plugin.name).toBe('editor-scene');
    expect(plugin.apply).toBe('serve'); // a build never gets it
    expect(mounted().path).toBe('/__editor/scene.json');
  });

  it('keeps the last scene posted and gives it back, as JSON', async () => {
    const { call } = serve();
    expect((await call('GET')).statusCode).toBe(404); // nothing exported yet
    expect((await call('POST', '{"scene":1}')).statusCode).toBe(204);
    await call('POST', '{"scene":2}');
    const got = await call('GET');
    expect(got.statusCode).toBe(200);
    expect(got.headers['Content-Type']).toBe('application/json');
    expect(String(got.end.mock.calls[0]![0])).toBe('{"scene":2}');
  });

  it('answers the preflight of threejs.org, which also reaches for the local network', async () => {
    const { call } = serve();
    const res = await call('OPTIONS');
    expect(res.statusCode).toBe(204);
    expect(res.headers).toMatchObject({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Private-Network': 'true',
    });
  });

  it('sends the CORS headers with the scene too, and refuses any other method', async () => {
    const { call } = serve();
    expect((await call('POST', '{}')).headers['Access-Control-Allow-Origin']).toBe('*');
    expect((await call('GET')).headers['Access-Control-Allow-Private-Network']).toBe('true');
    expect((await call('DELETE')).statusCode).toBe(405);
  });
});
