import { afterEach, describe, expect, it, vi } from 'vitest';
import { CELLS, VANISHED, type Axial } from './board';
import { frameShape } from './frame';
import { HUB_CELLS, neighbours, type Spot } from './hub';
import { arrowCell, bossTitle, bumpLine, HUB_BOARD, hubHtml, hubTargetText, labelsHtml, pipsHtml, railHtml, reachabilityText, roomLabel } from './hubview';

// The hub on screen (docs/specs/game-design.md section 3.5, #521): the board the map is drawn with, the arrow keys and
// the HUD plate.

describe('the reachability hint on a touch screen (#1379)', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('says tap, not click', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(reachabilityText([0, 0], [1, 0])).toBe('Tap to move');
    expect(reachabilityText([0, 0], [2, 0])).toBe('Out of reach (roll closer)');
  });
});

describe('the hub board', () => {
  it('is floor on the 37 map cells and a hole everywhere else, so the frame shrinks to the map', () => {
    expect(HUB_BOARD).toHaveLength(CELLS.length);
    CELLS.forEach(([q, r], i) =>
      expect(HUB_BOARD[i]).toBe(HUB_CELLS.some(([hq, hr]) => hq === q && hr === r) ? 0 : VANISHED),
    );
    expect(frameShape(HUB_BOARD)).toMatchObject({ radius: 3, holes: [] });
  });
});

describe('the arrow keys', () => {
  it('roll left and right along the row', () => {
    expect(arrowCell([0, 0], 'ArrowLeft')).toEqual([-1, 0]);
    expect(arrowCell([1, -1], 'ArrowRight')).toEqual([2, -1]);
  });

  it('roll up and down in a zigzag that keeps the column: the centre reaches both lifts in two presses', () => {
    expect(arrowCell([0, 0], 'ArrowUp')).toEqual([1, -1]);
    expect(arrowCell([1, -1], 'ArrowUp')).toEqual([1, -2]);
    expect(arrowCell([0, 0], 'ArrowDown')).toEqual([0, 1]);
    expect(arrowCell([0, 1], 'ArrowDown')).toEqual([-1, 2]);
  });

  it('always roll to a neighbour, and down undoes up', () => {
    for (const cell of HUB_CELLS) {
      for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
        const [q, r] = arrowCell(cell, key)!;
        expect(Math.max(Math.abs(q - cell[0]), Math.abs(r - cell[1]), Math.abs(q + r - cell[0] - cell[1]))).toBe(1);
      }
      const up = arrowCell(cell, 'ArrowUp')!;
      expect(arrowCell(up, 'ArrowDown')).toEqual(cell);
    }
    expect(neighbours([0, 0])).toContainEqual(arrowCell([0, 0], 'ArrowUp'));
  });

  it('ignore every other key', () => {
    for (const key of ['Enter', 'a', ' ', 'Escape']) expect(arrowCell([0, 0], key)).toBeNull();
  });
});

describe('the hub HUD plate', () => {
  const at = (cell: Axial, deck: 'mess' | 'cargo' | 'bridge' = 'mess') => hubHtml({ deck, cell });

  it('names the ship and the deck, and nothing under the marble on a floor cell', () => {
    expect(at([0, 0])).toBe('<div class="turn"><span>Ship · Mess</span></div><small></small>');
    expect(at([0, 0], 'cargo')).toContain('Ship · Cargo');
  });

  it('names the room the marble stands on', () => {
    expect(at([2, 0])).toContain('<small>Boss door</small>');
    expect(at([2, -1])).toContain('<small>Terminal</small>');
    expect(at([-1, -1])).toContain('<small>Hot-seat table</small>');
    expect(at([-2, 0])).toContain('<small>Bot table</small>');
    expect(at([-2, 1])).toContain('<small>Online table</small>');
    expect(at([-2, 2])).toContain('<small>Battle royale lobby</small>'); // #522, #593
    expect(at([1, -2])).toContain('<small>Lift to Cargo</small>');
    expect(at([-1, 2], 'bridge')).toContain('<small>Lift to Chapel</small>');
  });
});

describe('a locked lift (#523)', () => {
  const below: Spot = { deck: 'mess', cell: [1, -1] };

  it('makes Tally say one short line when the marble bumps it', () => {
    expect(bumpLine(below, [1, -2], [])).toBe("Lift to Cargo: locked. This deck's boss is still on the books.");
    expect(bumpLine({ deck: 'cargo', cell: [0, -1] }, [1, -2], ['echo'])).toContain('Lift to Furnace: locked.');
  });

  it('says nothing for an open lift, another cell, or a lift more than one cell away', () => {
    expect(bumpLine(below, [1, -2], ['echo'])).toBe('');
    expect(bumpLine({ deck: 'cargo', cell: [0, 1] }, [-1, 2], [])).toBe(''); // the lift down is always open
    expect(bumpLine(below, [0, -1], [])).toBe('');
    expect(bumpLine({ deck: 'mess', cell: [0, 0] }, [1, -2], [])).toBe('');
  });

  it("puts Tally's line under the HUD plate", () => {
    expect(hubHtml(below, 'Locked.')).toBe(
      '<div class="turn"><span>Ship · Mess</span></div><small></small><div class="tally">Locked.</div>',
    );
  });
});

describe('hub target inspection and reachability (#628)', () => {
  const at: Spot = { deck: 'mess', cell: [0, 0] };

  it('reports reachability for neighbours, current cell, and distant cells', () => {
    expect(bossTitle('unknown')).toBe('Boss');
    expect(bossTitle('echo')).toBe('The Echo');
    expect(reachabilityText([0, 0], [0, 0])).toBe('Current position');
    expect(reachabilityText([0, 0], [1, 0])).toBe('Click to move');
    expect(reachabilityText([0, 0], [-1, 1])).toBe('Click to move');
    expect(reachabilityText([0, 0], [2, 0])).toBe('Out of reach (roll closer)');
    expect(reachabilityText([0, 0], [-2, 2])).toBe('Out of reach (roll closer)');
  });

  it('inspects all room kinds with descriptive names and mode subtitles', () => {
    expect(hubTargetText(at, [-2, 0])).toEqual({
      name: 'Bot table',
      desc: 'Practice match against AI',
      reach: 'Out of reach (roll closer)',
    });
    expect(hubTargetText(at, [2, 0])).toEqual({
      name: 'Boss door',
      desc: 'The Echo (Mess boss)',
      reach: 'Out of reach (roll closer)',
    });
    expect(hubTargetText({ deck: 'cargo', cell: [1, 0] }, [2, 0])).toEqual({
      name: 'Boss door',
      desc: 'The Hull (Cargo boss)',
      reach: 'Click to move',
    });
    expect(hubTargetText(at, [-1, -1])).toEqual({
      name: 'Hot-seat table',
      desc: '2 players, one screen',
      reach: 'Out of reach (roll closer)',
    });
    expect(hubTargetText({ deck: 'mess', cell: [0, -1] }, [-1, -1])).toEqual({
      name: 'Hot-seat table',
      desc: '2 players, one screen',
      reach: 'Click to move',
    });
    expect(hubTargetText(at, [-2, 1])).toEqual({
      name: 'Online table',
      desc: 'Peer-to-peer 1v1 match',
      reach: 'Out of reach (roll closer)',
    });
    expect(hubTargetText(at, [-2, 2])).toEqual({
      name: 'Battle royale lobby',
      desc: 'Multi-player battle royale',
      reach: 'Out of reach (roll closer)',
    });
    expect(hubTargetText(at, [0, 2])).toEqual({
      name: 'Medal room',
      desc: 'Every boss, its medal and best turns',
      reach: 'Out of reach (roll closer)',
    });
    expect(hubTargetText(at, [2, -1])).toEqual({
      name: 'Terminal',
      desc: 'Ship archive and audio log',
      reach: 'Out of reach (roll closer)',
    });
    expect(hubTargetText(at, [1, -2])).toEqual({
      name: 'Lift to Cargo',
      desc: 'Transit to Cargo',
      reach: 'Out of reach (roll closer)',
    });
    expect(hubTargetText(at, [3, -2])).toEqual({
      name: 'Boss door',
      desc: 'The Dual Room (Mess boss)',
      reach: 'Out of reach (roll closer)',
    });
    const target = (deck: Spot['deck'], cell: Axial): string => {
      const { name, desc } = hubTargetText({ deck, cell: [0, 0] }, cell);
      return `${name} · ${desc}`;
    };
    expect(target('mess', [3, -3])).toBe('Daily challenge · One boss and one seed a day');
    expect(target('mess', [0, -3])).toBe('Open world · A generated hex world');
    expect(target('cargo', [0, 3])).toBe('Rogue-lite run · Three acts, one army of 14');
    expect(target('furnace', [0, -3])).toBe('Fight together · Two players, one army, a boss');
    expect(target('bridge', [3, -3])).toBe('Ranked · Online 1v1, Elo and tiers');
    expect(target('bridge', [0, -3])).toBe('Trainer · Waves against the bot, one more each');
    expect(hubTargetText(at, [1, 0])).toEqual({
      name: 'Deck floor',
      desc: 'Open transit corridor',
      reach: 'Click to move',
    });
  });

  it('renders preview in hubHtml when hover is provided', () => {
    const html = hubHtml(at, '', [-2, 0]);
    expect(html).toContain('class="hub-preview"');
    expect(html).toContain('Target: Bot table · Practice match against AI');
    expect(html).toContain('(Out of reach (roll closer))');

    const near = hubHtml({ deck: 'mess', cell: [-1, 0] }, '', [-2, 0]);
    expect(near).toContain('Target: Bot table · Practice match against AI');
    expect(near).toContain('(Click to move)');
  });

  it('omits preview in hubHtml when hover is null', () => {
    expect(hubHtml(at, '', null)).not.toContain('class="hub-preview"');
  });
});

// The deck plan (#1249): every room wears a label plate, always shown, with a short label for a phone; a lift-shaft rail
// lists the five decks and boss pips show the progress.
describe('the room labels (#1249)', () => {
  it('name each room with a short state, and a short label for a phone', () => {
    expect(roomLabel('mess', { kind: 'hotseat' }, [])).toEqual({ name: 'Hot-seat', state: '2 players', short: 'Hot-seat', mark: '' });
    expect(roomLabel('mess', { kind: 'bot' }, [])).toEqual({ name: 'Bot table', state: 'vs the ship AI', short: 'Bot', mark: '' });
    expect(roomLabel('mess', { kind: 'online' }, [])).toEqual({ name: 'Online', state: '1v1 peer room', short: 'Online', mark: '' });
    expect(roomLabel('mess', { kind: 'royale' }, [])).toEqual({ name: 'Royale', state: 'battle royale', short: 'Royale', mark: '' });
    expect(roomLabel('mess', { kind: 'terminal', lore: 'mess-house-rule' }, [])).toEqual({ name: 'Terminal', state: 'lore entry', short: 'Terminal', mark: '' });
    expect(roomLabel('mess', { kind: 'medals' }, [])).toEqual({ name: 'Medal room', state: 'best turns', short: 'Medals', mark: '' });
    expect(roomLabel('mess', { kind: 'daily' }, [])).toEqual({ name: 'Daily', state: 'boss of the day', short: 'Daily', mark: '' });
    expect(roomLabel('cargo', { kind: 'run' }, [])).toEqual({ name: 'Rogue-lite', state: '3-act run', short: 'Run', mark: '' });
    expect(roomLabel('cargo', { kind: 'world' }, [])).toEqual({ name: 'Open world', state: 'walk Hollow', short: 'World', mark: '' });
    expect(roomLabel('furnace', { kind: 'together' }, [])).toEqual({ name: 'Together', state: 'co-op vs a boss', short: 'Co-op', mark: '' });
    expect(roomLabel('bridge', { kind: 'ranked' }, [])).toEqual({ name: 'Ranked', state: 'Elo ladder', short: 'Ranked', mark: '' });
    expect(roomLabel('bridge', { kind: 'trainer' }, [])).toEqual({ name: 'Trainer', state: 'bot waves', short: 'Trainer', mark: '' });
  });

  it('name the boss behind the door, marked once beaten', () => {
    expect(roomLabel('cargo', { kind: 'boss', boss: 'hull' }, [])).toEqual({ name: 'Boss door', state: 'The Hull', short: 'Hull', mark: '' });
    expect(roomLabel('mess', { kind: 'boss', boss: 'echo' }, ['echo'])).toEqual({
      name: 'Boss door',
      state: 'The Echo · beaten',
      short: 'Echo',
      mark: 'beaten',
    });
  });

  it('name every boss of the roster, its phone label without "The" (#1249)', () => {
    const names = ['echo', 'hull', 'choir', 'chaplain', 'ballast', 'alien', 'railyard', 'magnetizer', 'pulsar', 'overseer', 'assembly', 'core', 'dual', 'stalker', 'swarm'].map(bossTitle);
    expect(names).toEqual([
      'The Echo', 'The Hull', 'The Choir', 'The Chaplain', 'The Ballast Mind', 'The Alien', 'The Rail Yard', 'The Magnetizer',
      'The Pulsar', 'The Overseer', 'The Assembly Line', 'The Unstable Core', 'The Dual Room', 'The Stalker', 'The Swarm',
    ]);
    expect(roomLabel('cargo', { kind: 'boss', boss: 'assembly' }, []).short).toBe('Assembly Line');
  });

  it('show the medal of a beaten boss: its best turns (#1249)', () => {
    expect(roomLabel('cargo', { kind: 'boss', boss: 'alien' }, ['alien'], { alien: 22 })).toEqual({
      name: 'Boss door',
      state: 'The Alien · Medal: 22 turns',
      short: 'Alien',
      mark: 'beaten',
    });
    expect(roomLabel('mess', { kind: 'boss', boss: 'echo' }, ['echo'], { echo: 1 }).state).toBe('The Echo · Medal: 1 turn');
    expect(roomLabel('cargo', { kind: 'boss', boss: 'alien' }, [], { echo: 3 }).state).toBe('The Alien');
    expect(labelsHtml({ deck: 'cargo', cell: [0, 0] }, ['alien'], { alien: 22 })).toContain('<small>The Alien · Medal: 22 turns</small>');
  });

  it('point a lift up or down to its deck, marked while it is locked', () => {
    expect(roomLabel('cargo', { kind: 'lift', to: 'furnace' }, ['echo'])).toEqual({
      name: 'Lift ▲ Furnace',
      state: 'locked',
      short: '▲ Locked',
      mark: 'locked',
    });
    expect(roomLabel('cargo', { kind: 'lift', to: 'mess' }, ['echo'])).toEqual({ name: 'Lift ▼ Mess', state: 'open', short: '▼ Mess', mark: '' });
    expect(roomLabel('mess', { kind: 'lift', to: 'cargo' }, ['echo'])).toEqual({ name: 'Lift ▲ Cargo', state: 'open', short: '▲ Cargo', mark: '' });
  });

  it('put one plate on the cell of each room of the deck, and YOU on the marble', () => {
    const html = labelsHtml({ deck: 'mess', cell: [0, 0] }, []);
    expect(html.match(/class="hub-label"/g)).toHaveLength(12); // the eleven rooms and the lift up of the Mess
    expect(html).toContain(
      '<div class="hub-label" data-cell="2,0" data-kind="boss"><b>Boss door</b><small>The Echo</small><span class="short">Echo</span></div>',
    );
    expect(html).toContain('<div class="hub-label" data-cell="1,-2" data-kind="lift" data-mark="locked"><b>Lift ▲ Cargo</b>');
    expect(html).toContain('<div class="hub-label you" data-cell="0,0">You</div>');
  });

  it('marks the plate of the room the marble stands on, with no YOU plate of its own', () => {
    const html = labelsHtml({ deck: 'cargo', cell: [2, 0] }, ['echo', 'hull']);
    expect(html).toContain('<div class="hub-label" data-cell="2,0" data-kind="boss" data-mark="beaten" data-here>');
    expect(html).not.toContain('hub-label you');
  });
});

describe('the lift-shaft rail (#1249)', () => {
  it('lists the five decks from the Bridge down, each beaten, open or locked, and where the marble is', () => {
    const html = railHtml('cargo', ['echo']);
    expect(html.match(/<li /g)).toHaveLength(5);
    expect(html.indexOf('Bridge')).toBeLessThan(html.indexOf('Mess'));
    expect(html).toContain('<li data-deck="mess" data-state="beaten"><span class="n">01</span><b>Mess</b><small>The Echo beaten</small></li>');
    expect(html).toContain(
      '<li data-deck="cargo" data-state="open" aria-current="location"><span class="n">02</span><b>Cargo</b><small>The Hull waits · you are here</small></li>',
    );
    expect(html).toContain('<li data-deck="furnace" data-state="locked"><span class="n">03</span><b>Furnace</b><small>Lift locked</small></li>');
  });

  it('says a deck is beaten once its boss is, from the boss menu too', () => {
    expect(railHtml('mess', ['choir'])).toContain('<li data-deck="furnace" data-state="beaten"><span class="n">03</span><b>Furnace</b><small>The Choir beaten</small></li>');
  });
});

describe('the boss pips (#1249)', () => {
  it('count the bosses beaten, a pip each in deck order: beaten, open or locked', () => {
    expect(pipsHtml(['echo'])).toBe(
      '<span class="count">Bosses 1/5</span>' +
        '<span class="pip" data-state="beaten" title="The Echo: beaten"></span>' +
        '<span class="pip" data-state="open" title="The Hull: open"></span>' +
        '<span class="pip" data-state="locked" title="The Choir: locked"></span>' +
        '<span class="pip" data-state="locked" title="The Chaplain: locked"></span>' +
        '<span class="pip" data-state="locked" title="The Ballast Mind: locked"></span>',
    );
    expect(pipsHtml([])).toContain('Bosses 0/5');
  });
});
