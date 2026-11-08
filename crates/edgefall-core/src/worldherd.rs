//! The herd (#1506, docs/specs/openworld.md section 4c): the troop drives a foe or neutral marble to the water over several hero steps.
//! Stateless: the hunt is derived each step from the world, the seed and the cells, so peers agree and nothing is saved. Integers only.

use crate::moves::Direction;
use crate::world::{hex_distance, Terrain};
use crate::worldfight::{Outcome, Push};
use crate::worldstep::{mix, DIRECTIONS};

/// A cell, `q, r`.
type Cell = (i32, i32);

/// A foe farther than this from the hero is not hunted (cells): about what the hero sees, and inside the reach of a push.
pub const RADIUS: i32 = 6;
/// A foe whose shortest walk to water or the world edge is longer than this is not hunted (cells): it bounds the search to 331 cells.
pub const PATH: i32 = 10;
/// A follower farther than this from the cell it should take does not take the role (cells).
pub const NEAR: i32 = 8;
/// The search stays within this many cells of the hero.
const SPAN: i32 = RADIUS + PATH;
/// The side of the square that holds those cells.
const SIDE: usize = (2 * SPAN + 1) as usize;
/// The six directions in the order round a cell.
const RING: [Cell; 6] = [(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)];
/// The place in `RING` of each of `DIRECTIONS`.
const RING_OF: [usize; 6] = [0, 3, 1, 4, 2, 5];

/// The hunt of a step: the foe, the direction it is herded in, the cell the pusher takes behind it and the walk to the water (cells).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Herd {
    pub foe: Cell,
    /// The index of the direction in `DIRECTIONS` (and `Direction::ALL`).
    pub dir: usize,
    pub behind: Cell,
    pub len: i32,
}

/// What a cell is to a herded foe.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Kind {
    /// Water or off the world: the foe falls.
    Goal,
    /// Open ground.
    Open,
    /// Anything else.
    Shut,
}

/// The terrain of the cells near the hero, read once each.
struct Grid<'a, T: Fn(i32, i32) -> Option<Terrain>> {
    hero: Cell,
    seen: Vec<Option<Option<Terrain>>>,
    terrain: &'a T,
}

impl<'a, T: Fn(i32, i32) -> Option<Terrain>> Grid<'a, T> {
    fn new(hero: Cell, terrain: &'a T) -> Self {
        Grid {
            hero,
            seen: vec![None; SIDE * SIDE],
            terrain,
        }
    }

    /// The place of a cell in the square round the hero.
    fn at(&self, c: Cell) -> usize {
        ((c.0 - self.hero.0 + SPAN) as usize) * SIDE + (c.1 - self.hero.1 + SPAN) as usize
    }

    fn kind(&mut self, c: Cell) -> Kind {
        let i = self.at(c);
        let terrain = *self.seen[i].get_or_insert_with(|| (self.terrain)(c.0, c.1));
        match terrain {
            None | Some(Terrain::Water) => Kind::Goal,
            Some(t) if t.blocked() => Kind::Shut,
            Some(_) => Kind::Open,
        }
    }

    /// Whether a marble can stand on `c`: open ground, no foe.
    fn standable(&mut self, c: Cell, foes: &[Cell]) -> bool {
        self.kind(c) == Kind::Open && !foes.contains(&c)
    }
}

fn plus(a: Cell, b: Cell) -> Cell {
    (a.0 + b.0, a.1 + b.1)
}

/// The shortest walks of `foe` to water or the edge over open ground free of other foes: their length and the directions (bit `k` for
/// `DIRECTIONS[k]`) of the first step of any of them; `None` when the shortest is longer than `PATH`.
fn plan<T: Fn(i32, i32) -> Option<Terrain>>(
    grid: &mut Grid<T>,
    foe: Cell,
    foes: &[Cell],
) -> Option<(i32, u8)> {
    let mut dist = vec![-1_i32; SIDE * SIDE];
    let mut first = vec![0_u8; SIDE * SIDE];
    dist[grid.at(foe)] = 0;
    let mut queue = vec![foe];
    let mut found: Option<(i32, u8)> = None;
    let mut head = 0;
    while head < queue.len() {
        let c = queue[head];
        head += 1;
        let d = dist[grid.at(c)];
        if d >= PATH || found.is_some_and(|(len, _)| d + 1 > len) {
            break;
        }
        for (k, &step) in DIRECTIONS.iter().enumerate() {
            let nb = plus(c, step);
            let from = if c == foe { 1 << k } else { first[grid.at(c)] };
            match grid.kind(nb) {
                Kind::Goal => {
                    found = Some((d + 1, found.map_or(0, |(_, m)| m) | from));
                }
                Kind::Open if !foes.contains(&nb) => {
                    let i = grid.at(nb);
                    if dist[i] < 0 {
                        dist[i] = d + 1;
                        queue.push(nb);
                    }
                    if dist[i] == d + 1 {
                        first[i] |= from;
                    }
                }
                _ => {}
            }
        }
    }
    found
}

/// The hunt among `foes` for a troop (the hero first) on `terrain`: the foe within `RADIUS` of the hero whose walk to water is the shortest
/// (at most `PATH`), ties by the SplitMix64 hash of the world `seed` and the foe's cell, with a direction whose cell behind the foe is open
/// ground. `None` when there is none.
pub fn herd(
    troop: &[Cell],
    foes: &[Cell],
    terrain: impl Fn(i32, i32) -> Option<Terrain>,
    seed: u64,
) -> Option<Herd> {
    let hero = troop[0];
    let mut grid = Grid::new(hero, &terrain);
    let mut best: Option<((i32, u64), Herd)> = None;
    for &foe in foes.iter().filter(|&&f| hex_distance(hero, f) <= RADIUS) {
        let Some((len, mask)) = plan(&mut grid, foe, foes) else {
            continue;
        };
        let Some(dir) = (0..6).find(|&k| {
            let d = DIRECTIONS[k];
            mask & (1 << k) != 0 && grid.standable((foe.0 - d.0, foe.1 - d.1), foes)
        }) else {
            continue;
        };
        let key = (
            len,
            mix(seed ^ mix(((foe.0 as u32 as u64) << 32) | foe.1 as u32 as u64)),
        );
        if best.as_ref().is_none_or(|(k, _)| key < *k) {
            let behind = (foe.0 - DIRECTIONS[dir].0, foe.1 - DIRECTIONS[dir].1);
            best = Some((
                key,
                Herd {
                    foe,
                    dir,
                    behind,
                    len,
                },
            ));
        }
    }
    best.map(|(_, h)| h)
}

/// The herding push: when a marble of the troop stands behind the hunted foe, it pushes the foe one cell along the walk and takes its cell.
/// `None` without a hunt, without a marble there, or when the cell ahead is not open ground free of the troop (a foe that falls is the shove's).
pub fn herd_push(
    troop: &[Cell],
    foes: &[Cell],
    terrain: impl Fn(i32, i32) -> Option<Terrain>,
    seed: u64,
) -> Option<Push> {
    // Cheap first: the search costs ~300 us, so it runs only when some marble stands beside some foe.
    let beside = |f: &Cell| {
        troop
            .iter()
            .any(|m| DIRECTIONS.contains(&(f.0 - m.0, f.1 - m.1)))
    };
    if !foes.iter().any(beside) {
        return None;
    }
    let h = herd(troop, foes, &terrain, seed)?;
    let to = plus(h.foe, DIRECTIONS[h.dir]);
    let open = terrain(to.0, to.1).is_some_and(|t| !t.blocked());
    (troop.contains(&h.behind) && open && !troop.contains(&to)).then(|| Push {
        dir: Direction::ALL[h.dir],
        troop: vec![h.behind],
        enemies: vec![h.foe],
        last: Outcome::Slides(to),
        ejections: 0,
    })
}

/// The follower of `free` nearest to `cell` within `NEAR` (the lowest index first), taken out of the list.
fn take(free: &mut Vec<usize>, troop: &[Cell], cell: Cell) -> Option<usize> {
    let at = (0..free.len())
        .filter(|&k| hex_distance(troop[free[k]], cell) <= NEAR)
        .min_by_key(|&k| (hex_distance(troop[free[k]], cell), free[k]))?;
    Some(free.remove(at))
}

/// The cells the followers are drawn to by the hunt (index among the followers, so in `troop` without the hero, cell): one pusher takes the cell behind the foe, up to two flankers
/// the cells beside it, behind it on either side; nothing when there is no hunt or no follower within `NEAR` of the push cell. The hero
/// never gets a goal.
pub fn goals(
    troop: &[Cell],
    foes: &[Cell],
    terrain: impl Fn(i32, i32) -> Option<Terrain>,
    seed: u64,
) -> Vec<(usize, Cell)> {
    let Some(h) = herd(troop, foes, &terrain, seed) else {
        return Vec::new();
    };
    let mut grid = Grid::new(troop[0], &terrain);
    let mut free: Vec<usize> = (1..troop.len()).collect();
    let mut out = Vec::new();
    match troop.iter().position(|&m| m == h.behind) {
        Some(0) => {}
        Some(i) => {
            free.retain(|&k| k != i);
            out.push((i - 1, h.behind));
        }
        None => {
            let Some(i) = take(&mut free, troop, h.behind) else {
                return out;
            };
            out.push((i - 1, h.behind));
        }
    }
    let ring = RING_OF[h.dir];
    for side in [2, 4] {
        let cell = plus(h.foe, RING[(ring + side) % 6]);
        if cell != troop[0] && grid.standable(cell, foes) {
            if let Some(i) = take(&mut free, troop, cell) {
                out.push((i - 1, cell));
            }
        }
    }
    out.sort_unstable();
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Grass, water from column `shore` on, the cells of `special`, and nothing beyond `edge` (off the world).
    fn world(
        shore: i32,
        edge: i32,
        special: Vec<(Cell, Terrain)>,
    ) -> impl Fn(i32, i32) -> Option<Terrain> {
        move |q, r| {
            if q.abs() > edge || r.abs() > edge {
                return None;
            }
            Some(special.iter().find(|(c, _)| *c == (q, r)).map_or(
                if q >= shore {
                    Terrain::Water
                } else {
                    Terrain::Grass
                },
                |s| s.1,
            ))
        }
    }

    fn sea() -> impl Fn(i32, i32) -> Option<Terrain> {
        world(5, 50, vec![])
    }

    #[test]
    fn the_directions_are_those_of_the_grid() {
        for (k, d) in Direction::ALL.into_iter().enumerate() {
            assert_eq!(d.vector(), DIRECTIONS[k]);
            assert_eq!(RING[RING_OF[k]], DIRECTIONS[k]);
        }
    }

    #[test]
    fn a_foe_three_cells_from_the_water_is_herded_straight_with_the_pusher_behind() {
        let h = herd(&[(0, 0)], &[(2, 0)], sea(), 1).unwrap();
        assert_eq!((h.foe, h.dir, h.behind, h.len), ((2, 0), 0, (1, 0), 3));
        // Beside the water the walk is one cell.
        let h = herd(&[(0, 0)], &[(4, 0)], sea(), 1).unwrap();
        assert_eq!((h.dir, h.behind, h.len), (0, (3, 0), 1));
    }

    #[test]
    fn the_world_edge_is_a_goal_like_the_water() {
        let h = herd(&[(0, 0)], &[(3, 0)], world(99, 5, vec![]), 1).unwrap();
        assert_eq!((h.len, h.behind), (3, (2, 0)));
    }

    #[test]
    fn a_foe_too_far_from_the_hero_or_from_the_water_is_left_alone() {
        assert_eq!(herd(&[(-5, 0)], &[(2, 0)], sea(), 1), None);
        assert!(herd(&[(-4, 0)], &[(2, 0)], sea(), 1).is_some());
        assert_eq!(herd(&[(0, 0)], &[(2, 0)], world(20, 50, vec![]), 1), None);
        assert!(herd(&[(0, 0)], &[(-4, 0)], world(7, 50, vec![]), 1).is_none());
        assert!(herd(&[(0, 0)], &[(-4, 0)], world(6, 50, vec![]), 1).is_some());
        assert_eq!(herd(&[(0, 0)], &[], sea(), 1), None);
    }

    #[test]
    fn the_shortest_walk_wins_and_ties_go_by_the_hash_of_the_seed_and_the_cell() {
        let h = herd(&[(0, 0)], &[(2, 0), (4, 0)], sea(), 1).unwrap();
        assert_eq!(h.foe, (4, 0));
        let foes = [(2, 1), (2, -1)];
        let pick = |seed, foes: &[Cell]| herd(&[(0, 0)], foes, sea(), seed).unwrap().foe;
        let picks: Vec<Cell> = (0..16).map(|s| pick(s, &foes)).collect();
        assert!(picks.contains(&(2, 1)) && picks.contains(&(2, -1)));
        for s in 0..16 {
            assert_eq!(pick(s, &foes), pick(s, &[foes[1], foes[0]]));
        }
    }

    #[test]
    fn a_wall_or_another_foe_blocks_the_walk() {
        let wall: Vec<(Cell, Terrain)> = (-8..=8).map(|r| ((3, r), Terrain::Peak)).collect();
        assert_eq!(herd(&[(0, 0)], &[(2, 0)], world(5, 50, wall), 1), None);
        // A row of foes is as good as a wall; the foes in it are hunted from their own side.
        let row: Vec<Cell> = (-8..=8).map(|r| (3, r)).collect();
        let foes: Vec<Cell> = std::iter::once((2, 0)).chain(row).collect();
        let h = herd(&[(0, 0)], &foes, world(5, 50, vec![]), 1).unwrap();
        assert_eq!(h.foe.0, 3);
    }

    #[test]
    fn an_obstacle_behind_the_foe_turns_the_push_to_another_shortest_walk() {
        let tree = vec![((1, 0), Terrain::Tree)];
        let h = herd(&[(0, 0)], &[(2, 0)], world(5, 50, tree), 1).unwrap();
        assert_eq!((h.dir, h.behind), (2, (1, 1)));
        let both = vec![((1, 0), Terrain::Tree), ((1, 1), Terrain::Tree)];
        let h = herd(&[(0, 0)], &[(2, 0)], world(5, 50, both), 1);
        assert_ne!(h.map(|h| h.behind), Some((1, 0)));
    }

    #[test]
    fn the_herding_push_moves_the_foe_one_cell_and_the_pusher_takes_its_place() {
        let push = herd_push(&[(0, 0), (1, 0)], &[(2, 0)], sea(), 1).unwrap();
        assert_eq!(push.dir, Direction::E);
        assert_eq!((push.troop, push.enemies), (vec![(1, 0)], vec![(2, 0)]));
        assert_eq!((push.last, push.ejections), (Outcome::Slides((3, 0)), 0));
        // The hero itself may push.
        assert!(herd_push(&[(1, 0), (5, 5)], &[(2, 0)], sea(), 1).is_some());
        // No marble behind, the cell ahead taken by the troop, no hunt: no push.
        assert!(herd_push(&[(0, 0)], &[(2, 0)], sea(), 1).is_none());
        assert!(herd_push(&[(0, 0), (1, 0), (3, 0)], &[(2, 0)], sea(), 1).is_none());
        assert!(herd_push(&[(0, 0), (1, 0)], &[], sea(), 1).is_none());
        // A foe beside the water is the shove's: the cell ahead is not ground.
        assert!(herd_push(&[(0, 0), (3, 0)], &[(4, 0)], sea(), 1).is_none());
    }

    #[test]
    fn a_pusher_and_two_flankers_take_the_cells_behind_and_beside_the_foe() {
        let troop = [(0, 0), (0, 1), (-1, 0), (-3, 3)];
        let out = goals(&troop, &[(2, 0)], sea(), 1);
        assert_eq!(out, [(0, (1, 0)), (1, (2, -1)), (2, (1, 1))]);
    }

    #[test]
    fn a_follower_already_behind_the_foe_stays_the_pusher() {
        let troop = [(0, 0), (-1, 0), (1, 0)];
        let out = goals(&troop, &[(2, 0)], sea(), 1);
        assert_eq!(out[1], (1, (1, 0)));
    }

    #[test]
    fn the_hero_behind_the_foe_is_the_pusher_and_gets_no_goal() {
        let troop = [(1, 0), (-1, 0), (-1, 1)];
        let out = goals(&troop, &[(2, 0)], sea(), 1);
        assert!(out.iter().all(|g| g.0 < 2 && g.1 != (1, 0)));
        assert_eq!(out.len(), 2);
    }

    #[test]
    fn without_a_hunt_or_a_pusher_in_reach_there_are_no_goals() {
        assert!(goals(&[(0, 0), (1, 1)], &[], sea(), 1).is_empty());
        assert!(goals(&[(0, 0), (-9, 0)], &[(2, 0)], sea(), 1).is_empty());
        assert!(goals(&[(0, 0)], &[(2, 0)], sea(), 1).is_empty());
    }

    #[test]
    fn a_flank_cell_the_hero_or_an_obstacle_holds_is_left_and_one_follower_takes_one_role() {
        // The hero on the flank cell (2, -1), a rock on the other (1, 1): only the pusher.
        let rock = vec![((1, 1), Terrain::Peak)];
        let troop = [(2, -1), (0, 1), (-1, 0)];
        let out = goals(&troop, &[(2, 0)], world(5, 50, rock), 1);
        assert_eq!(out, [(0, (1, 0))]);
        // One follower: it pushes, nobody flanks.
        assert_eq!(goals(&[(0, 0), (0, 1)], &[(2, 0)], sea(), 1), [(0, (1, 0))]);
    }
}
