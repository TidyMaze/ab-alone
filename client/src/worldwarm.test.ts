import { describe, expect, it } from 'vitest';
import { WarmGate, compileWhole, drawEach, halves } from './worldwarm';

describe('compileWhole (#1582)', () => {
  it('compiles with every object in view, and puts back the culling of each once the compile has started', async () => {
    const objects = [{ frustumCulled: true }, { frustumCulled: false }, { frustumCulled: true }];
    const scene = { traverse: (visit: (o: { frustumCulled: boolean }) => void) => objects.forEach(visit) };
    let seen: boolean[] = [];
    const done = compileWhole(scene, async () => {
      seen = objects.map((o) => o.frustumCulled);
    });
    expect(seen).toEqual([false, false, false]);
    expect(objects.map((o) => o.frustumCulled)).toEqual([true, false, true]);
    await done;
  });
});

describe('drawEach (#1582)', () => {
  const child = (name: string, visible = true, isLight = false) => ({ name, visible, isLight });

  it('draws the scene once per pick, a task apart, each with the shown children it picks and the lights, then shows them all again', async () => {
    const children = [child('a'), child('sun', true, true), child('b'), child('hidden', false), child('c')];
    const seen: string[][] = [];
    const waits: number[] = [];
    const draw = () => void seen.push(children.filter((c) => c.visible).map((c) => c.name));
    await drawEach({ children }, [(c) => c.name === 'b', ...halves], draw, async () => void waits.push(seen.length));
    expect(seen).toEqual([['sun', 'b'], ['a', 'sun', 'c'], ['sun', 'b']]);
    expect(waits).toEqual([0, 1, 2]); // each draw in a task of its own
    expect(children.map((c) => c.visible)).toEqual([true, true, true, false, true]);
  });

  it('shows every child again when a draw throws', async () => {
    const children = [child('a'), child('b')];
    await expect(drawEach({ children }, halves, () => { throw new Error('lost'); }, async () => {})).rejects.toThrow('lost');
    expect(children.map((c) => c.visible)).toEqual([true, true]);
  });
});

// #1582: the Open world's first frame waits behind the veil until the renderer has built its programs, so the page never
// freezes on a first render that compiles them all at once.
describe('WarmGate (#1582)', () => {
  const deferred = () => {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((ok, no) => ((resolve = ok), (reject = no)));
    return { promise, resolve, reject };
  };

  it('holds a new scene while its compile runs, starts it once, and lets it draw once it is done', async () => {
    const compiles: [object, object][] = [];
    const done = deferred();
    const gate = new WarmGate((scene, camera) => (compiles.push([scene, camera]), done.promise));
    const scene = {};
    const camera = {};
    expect(gate.hold(scene, camera)).toBe(true);
    expect(gate.hold(scene, camera)).toBe(true);
    expect(compiles).toEqual([[scene, camera]]);
    done.resolve();
    await done.promise;
    await Promise.resolve();
    expect(gate.hold(scene, camera)).toBe(false);
    expect(compiles).toHaveLength(1);
    expect(gate.hold({}, camera)).toBe(false); // a world entered again draws at once: the renderer has its programs
    expect(compiles).toHaveLength(1);
  });

  it('lets the scene draw when its compile fails: the first render builds the programs as before', async () => {
    const done = deferred();
    const gate = new WarmGate(() => done.promise);
    const scene = {};
    expect(gate.hold(scene, {})).toBe(true);
    done.reject(new Error('lost context'));
    await done.promise.catch(() => undefined);
    await Promise.resolve();
    expect(gate.hold(scene, {})).toBe(false);
  });

  it('compiles a scene that replaced the one under way, and the late end of the old one frees nothing', async () => {
    const first = deferred();
    const second = deferred();
    const queue = [first, second];
    const gate = new WarmGate(() => queue.shift()!.promise);
    const a = {};
    const b = {};
    expect(gate.hold(a, {})).toBe(true);
    expect(gate.hold(b, {})).toBe(true); // the world left and entered again before the first compile ended
    first.resolve();
    await first.promise;
    await Promise.resolve();
    expect(gate.hold(b, {})).toBe(true);
    second.resolve();
    await second.promise;
    await Promise.resolve();
    expect(gate.hold(b, {})).toBe(false);
  });
});
