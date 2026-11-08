// The Open world's first frame waits until its programs are built (#1582). A first render compiles every material of the
// world in one go: 0.8 s at 1x CPU, 2 s at 4x, a frozen page. `compile` (the renderer's compileAsync) builds them a few at a
// time instead, and the page keeps its veil up until it is done; a failed compile lets the world draw as before. Only the
// page's first world waits: the renderer keeps the programs, and a world entered again (a new scene, the same programs) draws
// at once, where a compile of its own would hold it for seconds (three builds one object a frame or so).

export class WarmGate {
  private warm = false;
  private pending: object | null = null;

  constructor(private readonly compile: (scene: object, camera: object) => Promise<unknown>) {}

  /** Whether the frame of `scene` must wait: the first call for a scene starts its compile, until one has ended. */
  hold(scene: object, camera: object): boolean {
    if (this.warm) return false;
    if (this.pending !== scene) {
      this.pending = scene;
      const end = (): void => {
        if (this.pending === scene) this.warm = true;
      };
      this.compile(scene, camera).then(end, end);
    }
    return true;
  }
}

interface Culled {
  frustumCulled: boolean;
}

/** Starts `compile` with every object of `scene` taken as in view, then puts their culling back: a mesh out of the camera's
 * frustum when the world opens is built too, and the first turn of the camera builds nothing. The renderer reads the culling
 * in the synchronous start of its compile only. */
export function compileWhole(scene: { traverse(visit: (object: Culled) => void): void }, compile: () => Promise<unknown>): Promise<unknown> {
  const culled: Culled[] = [];
  scene.traverse((object) => {
    if (object.frustumCulled) culled.push(object);
    object.frustumCulled = false;
  });
  const done = compile();
  for (const object of culled) object.frustumCulled = true;
  return done;
}

interface Shown {
  name: string;
  visible: boolean;
  isLight?: boolean;
}
type Pick = (child: Shown, index: number) => boolean;

/** The shown children in two halves, every other one. */
export const halves: Pick[] = [(_, i) => i % 2 === 0, (_, i) => i % 2 === 1];

/** Draws `scene` once per pick, each after `wait` (a task), with the shown children it picks and every light; all are shown again
 * after each draw. The first draw after a compile built the sun's shadow pass of every mesh at once, 0.2 s at 4x CPU: a draw per half
 * builds half of it. */
export async function drawEach(scene: { children: Shown[] }, picks: readonly Pick[], draw: () => void, wait: () => Promise<unknown>): Promise<void> {
  const shown = scene.children.filter((child) => child.visible && !child.isLight);
  for (const pick of picks) {
    await wait();
    shown.forEach((child, i) => (child.visible = pick(child, i)));
    try {
      draw();
    } finally {
      for (const child of shown) child.visible = true;
    }
  }
}
