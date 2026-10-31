// The boss health bar (#788, docs/specs/ui.md 4): at the top centre of every boss fight, the boss's name and a red bar of
// one fragment per ejection the player needs to win. A fragment empties from the right per ejection; the fragment where a
// phase begins carries a step, a brighter edge. The counts come from the engine (win_ejections, phase_ejections), none is
// fixed here.

export interface BossBar {
  name: string;
  ejected: number; // ejections the player has made
  win: number; // ejections needed to win: one fragment each
  steps: readonly number[]; // ejections at which P2, P3... begin
  phase: number; // the engine's phase, 0 for P1: it never goes back when the bar refills (#810)
}

/** The bar in `el`, hidden without a boss. The fragments of a bar already drawn are emptied in place, so the CSS
 * transition drains them; a new boss or target draws the bar again. */
export function drawBossBar(el: HTMLElement, bar: BossBar | null): void {
  el.hidden = bar === null;
  if (bar === null) return;
  const { name, ejected, win, steps, phase } = bar;
  const key = `${name}|${win}|${steps}`;
  const fresh = el.dataset.key === key; // the bar was drawn before: its fragments change in place
  if (!fresh) {
    el.dataset.key = key;
    const at = new Set(steps.map((s) => win - s)); // the fragment that starts at each step, counted from the left
    const frags = Array.from({ length: win }, (_, i) => `<i class="frag${at.has(i) ? ' step' : ''}"></i>`).join('');
    el.innerHTML = `<div class="name"></div><div class="frags" role="meter" aria-valuemin="0">${frags}</div>`;
    el.querySelector('.name')!.textContent = name;
  }
  el.querySelectorAll('.frag').forEach((f, i) => {
    const empty = i >= win - ejected;
    if (!empty && f.classList.contains('empty')) {
      f.classList.add('refill');
      f.addEventListener('animationend', () => f.classList.remove('refill'), { once: true });
    }
    if (empty && !f.classList.contains('empty') && fresh) {
      f.classList.add('broke'); // #1096: one small burst on the fragment that breaks
      f.addEventListener('animationend', () => f.classList.remove('broke'), { once: true });
    }
    f.classList.toggle('empty', empty);
  });
  const meter = el.querySelector('.frags')!;
  meter.setAttribute('aria-label', `${name} health`);
  meter.setAttribute('aria-valuemax', String(win));
  meter.setAttribute('aria-valuenow', String(win - ejected));
  meter.setAttribute('aria-valuetext', `${ejected} of ${win} ejected, phase ${phase + 1} of ${steps.length + 1}`);
}
