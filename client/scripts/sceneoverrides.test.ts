import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain Node script, no type declarations
import { overridesText, sceneOverrides } from './sceneoverrides.mjs';

let dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs = [];
});

/** The plugin's middleware on a temp file, called with a request of `method` sending `body`. */
function send(method: string, body: string): { file: string; status: number | undefined; next: ReturnType<typeof vi.fn> } {
  const dir = mkdtempSync(join(tmpdir(), 'sceneoverrides-'));
  dirs.push(dir);
  const file = join(dir, 'sceneoverrides.json');
  let middleware!: (req: EventEmitter & { method: string }, res: { statusCode?: number; end: () => void }, next: () => void) => void;
  sceneOverrides(file).configureServer({ middlewares: { use: (url: string, fn: typeof middleware) => (expect(url).toBe('/__sceneoverrides'), (middleware = fn)) } });
  const req = Object.assign(new EventEmitter(), { method });
  const res = { statusCode: undefined as number | undefined, end: vi.fn() };
  const next = vi.fn();
  middleware(req, res, next);
  req.emit('data', Buffer.from(body));
  req.emit('end');
  return { file, status: res.statusCode, next };
}

describe('overridesText', () => {
  it('pretty prints the overrides, the names sorted, a newline at the end', () => {
    expect(overridesText({ power: { key: 1.5, 'bloom strength': 0.06, fill: 0 } })).toBe(
      '{\n  "power": {\n    "bloom strength": 0.06,\n    "fill": 0,\n    "key": 1.5\n  }\n}\n',
    );
  });

  it.each([[{}], [{ power: null }], [{ power: { key: '1' } }], [{ power: { key: null } }], [null]])('refuses %j', (body) => {
    expect(() => overridesText(body)).toThrow('power');
  });
});

describe('sceneOverrides (dev server only)', () => {
  it('serves only while the dev server runs', () => {
    expect(sceneOverrides().apply).toBe('serve');
  });

  it('writes the file from a POST and answers 204', () => {
    const { file, status, next } = send('POST', '{"power":{"key":2,"fill":0.5}}');
    expect(status).toBe(204);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ power: { fill: 0.5, key: 2 } });
    expect(next).not.toHaveBeenCalled();
  });

  it.each([['{"power":{"key":"x"}}'], ['not json']])('answers 400 and writes nothing for %s', (body) => {
    const { file, status } = send('POST', body);
    expect(status).toBe(400);
    expect(() => readFileSync(file)).toThrow();
  });

  it('leaves any other request to the next handler', () => {
    const { status, next } = send('GET', '');
    expect(status).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });
});
