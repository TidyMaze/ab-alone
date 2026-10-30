//! Open world map (docs/specs/openworld.md section 2): the cells of a huge hex map, generated
//! chunk by chunk from a seed. A chunk depends on the seed and its coordinates alone, so the same
//! world comes out in any order of visit. Relief and terrain are looks: only `Terrain::blocked`
//! cells change what a marble may do.

use crate::encounter::hull::mix;

/// A chunk is `CHUNK` x `CHUNK` cells of the axial grid.
pub const CHUNK: i32 = 16;
/// The world is `WORLD_CHUNKS` x `WORLD_CHUNKS` chunks, centred on the spawn chunk.
pub const WORLD_CHUNKS: i32 = 64;
/// Cells within this distance of the spawn cell `(0, 0)` are open grass.
pub const CLEARING: i32 = 3;
/// Boulders sit on this share of the open cells left once walls and trees are placed, in thousandths.
const BOULDER_PER_MILLE: u64 = 20;
/// Walls are laid out on a lattice of squares of this many cells.
const WALL_BLOCK: i32 = 24;
/// A chunk tries to place `TRIES` enemy groups, each with this chance in thousandths; with the obstacles that refuse some,
/// about one group stands per 400 cells.
const GROUP_PER_MILLE: f64 = 600.0;
const TRIES: u64 = 2;
/// No enemy stands within this many cells of the spawn.
const SAFE: i32 = 8;
/// Scales, in cells, of the three levels of a field: macro (continents), meso (ranges) and micro (bumps).
const LEVEL_SCALES: [i32; 3] = [256, 48, 8];
/// Weights of the macro, meso and micro levels of the elevation and of the moisture; each set sums to 1.
const HEIGHT_WEIGHTS: [f64; 3] = [0.50, 0.35, 0.15];
const MOISTURE_WEIGHTS: [f64; 3] = [0.45, 0.35, 0.20];
/// Salts of the levels: the elevation uses `HEIGHT_SALT` to `+ 2`, the moisture `MOISTURE_SALT` to `+ 2`. The
/// enemy draws already use the salts 12 to 21, so these start after them.
const HEIGHT_SALT: u64 = 30;
const MOISTURE_SALT: u64 = 33;
/// Upper bounds of the elevation of heights 1 to 7 (height 0 is below the first). They were found by
/// measuring the elevation of chunks 2 to 17 of seeds 1 to 4 (`the_eight_height_levels_hold_their_measured_shares`):
/// their quantiles give the shares of 8, 10, 12, 16, 18, 16, 12 and 8 % per height.
const ELEVATION_STEPS: [f64; 7] = [0.293, 0.367, 0.431, 0.491, 0.546, 0.597, 0.655];
/// The elevation the spawn is pulled to: the middle of the grass band (height 3).
const GRASS_ELEVATION: f64 = (ELEVATION_STEPS[2] + ELEVATION_STEPS[3]) / 2.0;
/// Within `SPAWN_FULL` cells of the spawn the elevation is the grass one, and it fades to the world's own
/// elevation by `SPAWN_FADE` cells, so the spawn is never in a sea nor boxed in by peaks.
const SPAWN_FULL: i32 = 8;
const SPAWN_FADE: i32 = 64;
/// Moisture below `DRY` makes a rock level (5) sand-coloured rock, moisture above `FOREST` makes the grass a
/// forest zone. Both are quantiles of the moisture, measured like the elevation.
const DRY: f64 = 0.382;
const FOREST: f64 = 0.478;

/// What a cell looks like and whether it can be entered.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Terrain {
    Water,
    Sand,
    Grass,
    Rock,
    Peak,
    Boulder,
    Tree,
    Wall,
}

impl Terrain {
    /// Water, peaks, boulders, trees and walls cannot be entered.
    pub fn blocked(self) -> bool {
        !matches!(self, Terrain::Sand | Terrain::Grass | Terrain::Rock)
    }
}

/// One cell: its height `0` to `7` and its terrain.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Cell {
    pub height: u8,
    pub terrain: Terrain,
}

/// A hash of the seed, a purpose `salt` and a point, uniform in `[0, 1)`.
fn unit(seed: u64, salt: u64, x: i32, y: i32) -> f64 {
    let point = (u64::from(x as u32) << 32) | u64::from(y as u32);
    let h = mix(seed ^ salt.wrapping_mul(0xD6E8_FEB8_6659_FD93) ^ mix(point));
    (h >> 11) as f64 / (1u64 << 53) as f64
}

/// Smooth value noise at `(q, r)`: lattice values every `scale` cells, blended with smoothstep. `at`
/// gives the value of a lattice point.
fn noise_at(at: impl Fn(i32, i32) -> f64, q: i32, r: i32, scale: i32) -> f64 {
    let (x, y) = (q.div_euclid(scale), r.div_euclid(scale));
    let smooth = |t: f64| t * t * (3.0 - 2.0 * t);
    let tx = smooth(f64::from(q.rem_euclid(scale)) / f64::from(scale));
    let ty = smooth(f64::from(r.rem_euclid(scale)) / f64::from(scale));
    let top = at(x, y) + (at(x + 1, y) - at(x, y)) * tx;
    let bottom = at(x, y + 1) + (at(x + 1, y + 1) - at(x, y + 1)) * tx;
    top + (bottom - top) * ty
}

/// Lattice points a chunk spans along one axis: at most 6 for the finest noise (`scale` 5).
const LATTICE: usize = 8;

/// The lattice values of one noise field over one chunk, hashed once for all its cells.
struct Lattice {
    x0: i32,
    y0: i32,
    scale: i32,
    values: [[f64; LATTICE]; LATTICE],
}

impl Lattice {
    fn new(seed: u64, salt: u64, cx: i32, cy: i32, scale: i32) -> Self {
        let (x0, y0) = (
            (cx * CHUNK).div_euclid(scale),
            (cy * CHUNK).div_euclid(scale),
        );
        let x1 = ((cx + 1) * CHUNK - 1).div_euclid(scale) + 1;
        let y1 = ((cy + 1) * CHUNK - 1).div_euclid(scale) + 1;
        debug_assert!(x1 - x0 < LATTICE as i32 && y1 - y0 < LATTICE as i32);
        let mut values = [[0.0; LATTICE]; LATTICE];
        for y in y0..=y1 {
            for x in x0..=x1 {
                values[(y - y0) as usize][(x - x0) as usize] = unit(seed, salt, x, y);
            }
        }
        Lattice {
            x0,
            y0,
            scale,
            values,
        }
    }

    fn noise(&self, q: i32, r: i32) -> f64 {
        noise_at(
            |x, y| self.values[(y - self.y0) as usize][(x - self.x0) as usize],
            q,
            r,
            self.scale,
        )
    }
}

/// The axial distance from `(0, 0)`.
fn distance(q: i32, r: i32) -> i32 {
    (q.abs() + r.abs() + (q + r).abs()) / 2
}

/// How much of the grass elevation a cell at axial distance `d` from the spawn takes: 1 up to `SPAWN_FULL`,
/// 0 from `SPAWN_FADE`, smoothstep between.
fn spawn_bias(d: i32) -> f64 {
    let t = ((SPAWN_FADE - d) as f64 / (SPAWN_FADE - SPAWN_FULL) as f64).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

/// Whether the chunk coordinate is inside the world.
fn in_world(c: i32) -> bool {
    (-WORLD_CHUNKS / 2..WORLD_CHUNKS / 2).contains(&c)
}

/// The ruined wall of the square `(x, y)` of the `WALL_BLOCK` grid: its first cell, its step and its
/// length. Most squares have none.
struct Segment {
    start: (i32, i32),
    step: (i32, i32),
    len: i32,
}

fn wall_segment(seed: u64, x: i32, y: i32) -> Option<Segment> {
    if unit(seed, 7, x, y) >= 0.45 {
        return None;
    }
    let start = (
        x * WALL_BLOCK + (unit(seed, 8, x, y) * f64::from(WALL_BLOCK)) as i32,
        y * WALL_BLOCK + (unit(seed, 9, x, y) * f64::from(WALL_BLOCK)) as i32,
    );
    let step = [(1, 0), (0, 1), (1, -1)][(unit(seed, 10, x, y) * 3.0) as usize];
    let len = 3 + (unit(seed, 11, x, y) * 4.0) as i32;
    Some(Segment { start, step, len })
}

/// A field: value noise at the three `LEVEL_SCALES`, the level `i` from the salt `salt + i`, summed with
/// `weights`. Every node of every level is hashed once per chunk.
struct Field {
    levels: [Lattice; 3],
    weights: [f64; 3],
}

impl Field {
    fn new(seed: u64, salt: u64, cx: i32, cy: i32, weights: [f64; 3]) -> Self {
        Field {
            levels: std::array::from_fn(|i| {
                Lattice::new(seed, salt + i as u64, cx, cy, LEVEL_SCALES[i])
            }),
            weights,
        }
    }

    fn value(&self, q: i32, r: i32) -> f64 {
        self.levels
            .iter()
            .zip(self.weights)
            .map(|(level, weight)| weight * level.noise(q, r))
            .sum()
    }
}

/// Everything the cells of one chunk need, computed once: the fields and the walls.
struct Window {
    seed: u64,
    q0: i32,
    r0: i32,
    /// Elevation, which gives the height.
    height: Field,
    /// Moisture, which gives the dry rock and the forest zones.
    moisture: Field,
    /// Whether each cell of the chunk is on a wall, row by row.
    wall: [bool; (CHUNK * CHUNK) as usize],
}

impl Window {
    fn new(seed: u64, cx: i32, cy: i32) -> Self {
        let (q0, r0) = (cx * CHUNK, cy * CHUNK);
        let mut wall = [false; (CHUNK * CHUNK) as usize];
        // A segment reaches at most one square past its own along each axis, so the squares one
        // step around the chunk's squares hold every segment that crosses it.
        let (x0, y0) = (q0.div_euclid(WALL_BLOCK) - 1, r0.div_euclid(WALL_BLOCK) - 1);
        let x1 = (q0 + CHUNK - 1).div_euclid(WALL_BLOCK) + 1;
        let y1 = (r0 + CHUNK - 1).div_euclid(WALL_BLOCK) + 1;
        for x in x0..=x1 {
            for y in y0..=y1 {
                let Some(seg) = wall_segment(seed, x, y) else {
                    continue;
                };
                for k in 0..seg.len {
                    let (q, r) = (seg.start.0 + k * seg.step.0, seg.start.1 + k * seg.step.1);
                    if (q0..q0 + CHUNK).contains(&q) && (r0..r0 + CHUNK).contains(&r) {
                        wall[((r - r0) * CHUNK + (q - q0)) as usize] = true;
                    }
                }
            }
        }
        Window {
            seed,
            q0,
            r0,
            height: Field::new(seed, HEIGHT_SALT, cx, cy, HEIGHT_WEIGHTS),
            moisture: Field::new(seed, MOISTURE_SALT, cx, cy, MOISTURE_WEIGHTS),
            wall,
        }
    }

    /// The cell at `(q, r)`, which must lie in this chunk.
    fn cell(&self, q: i32, r: i32) -> Cell {
        if distance(q, r) <= CLEARING {
            return Cell {
                height: 3,
                terrain: Terrain::Grass,
            };
        }
        let bias = spawn_bias(distance(q, r));
        let elevation = self.height.value(q, r) * (1.0 - bias) + GRASS_ELEVATION * bias;
        let height = ELEVATION_STEPS
            .iter()
            .filter(|&&step| elevation >= step)
            .count() as u8;
        let moisture = self.moisture.value(q, r);
        let terrain = match height {
            0 | 1 => Terrain::Water,
            2 => Terrain::Sand,
            3 | 4 => Terrain::Grass,
            5 if moisture < DRY => Terrain::Rock,
            5 => Terrain::Grass,
            6 => Terrain::Rock,
            _ => Terrain::Peak,
        };
        let open = !terrain.blocked();
        // A grass cell of a forest zone is a tree one time in four.
        let forest =
            terrain == Terrain::Grass && moisture > FOREST && unit(self.seed, 6, q, r) < 0.25;
        let on_wall = self.wall[((r - self.r0) * CHUNK + (q - self.q0)) as usize];
        let terrain = if open && on_wall {
            Terrain::Wall
        } else if forest {
            Terrain::Tree
        } else if open && unit(self.seed, 4, q, r) * 1000.0 < BOULDER_PER_MILLE as f64 {
            Terrain::Boulder
        } else {
            terrain
        };
        Cell { height, terrain }
    }
}

/// The cell at `(q, r)` of the world of `seed`, `None` off the world.
pub fn cell(seed: u64, q: i32, r: i32) -> Option<Cell> {
    if !in_world(q.div_euclid(CHUNK)) || !in_world(r.div_euclid(CHUNK)) {
        return None;
    }
    Some(Window::new(seed, q.div_euclid(CHUNK), r.div_euclid(CHUNK)).cell(q, r))
}

/// The `CHUNK` x `CHUNK` cells of chunk `(cx, cy)`, row by row (`r` then `q` ascending), `None`
/// off the world.
pub fn chunk(seed: u64, cx: i32, cy: i32) -> Option<Vec<Cell>> {
    if !in_world(cx) || !in_world(cy) {
        return None;
    }
    let window = Window::new(seed, cx, cy);
    let mut cells = Vec::with_capacity((CHUNK * CHUNK) as usize);
    for dr in 0..CHUNK {
        for dq in 0..CHUNK {
            cells.push(window.cell(cx * CHUNK + dq, cy * CHUNK + dr));
        }
    }
    Some(cells)
}

/// The enemy groups that start in chunk `(cx, cy)` (docs/specs/openworld.md section 3): up to `TRIES` groups
/// of 1 to 3 marbles in a line on three axes, from the seed and the chunk alone. A group is placed only
/// when every one of its cells is in this chunk, open, off the spawn's `SAFE` radius and shared with no
/// group placed before it in the chunk; the others are dropped.
pub fn enemy_groups(seed: u64, cx: i32, cy: i32) -> Vec<Vec<(i32, i32)>> {
    if !in_world(cx) || !in_world(cy) {
        return vec![];
    }
    let window = Window::new(seed, cx, cy);
    let mut placed: Vec<Vec<(i32, i32)>> = Vec::new();
    for n in 0..TRIES {
        let draw = |salt: u64| unit(seed, 12 + 5 * n + salt, cx, cy);
        if draw(0) * 1000.0 >= GROUP_PER_MILLE {
            continue;
        }
        let q = cx * CHUNK + (draw(1) * f64::from(CHUNK)) as i32;
        let r = cy * CHUNK + (draw(2) * f64::from(CHUNK)) as i32;
        let (dq, dr) = [(1, 0), (0, 1), (1, -1)][(draw(3) * 3.0) as usize];
        let len = 1 + (draw(4) * 3.0) as i32;
        let group: Vec<(i32, i32)> = (0..len).map(|k| (q + k * dq, r + k * dr)).collect();
        let free = group.iter().all(|&(q, r)| {
            q.div_euclid(CHUNK) == cx
                && r.div_euclid(CHUNK) == cy
                && distance(q, r) > SAFE
                && !window.cell(q, r).terrain.blocked()
                && !placed.iter().flatten().any(|&taken| taken == (q, r))
        });
        if free {
            placed.push(group);
        }
    }
    placed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_chunk_holds_every_cell_of_its_square_in_any_order_of_visit() {
        let a = chunk(7, 3, -2).unwrap();
        assert_eq!(a.len(), (CHUNK * CHUNK) as usize);
        let _elsewhere = chunk(7, -9, 5).unwrap();
        assert_eq!(chunk(7, 3, -2).unwrap(), a);
        assert_eq!(
            a[(2 * CHUNK + 5) as usize],
            cell(7, 3 * CHUNK + 5, -2 * CHUNK + 2).unwrap()
        );
    }

    #[test]
    fn the_seed_makes_the_world() {
        assert_ne!(chunk(1, 4, 4), chunk(2, 4, 4));
    }

    #[test]
    fn the_world_ends_at_its_edge() {
        let edge = WORLD_CHUNKS / 2;
        assert!(chunk(1, edge - 1, -edge).is_some());
        assert!(chunk(1, edge, 0).is_none());
        assert!(chunk(1, 0, -edge - 1).is_none());
        assert!(cell(1, edge * CHUNK, 0).is_none());
        assert!(cell(1, 0, -edge * CHUNK - 1).is_none());
        assert!(cell(1, edge * CHUNK - 1, -edge * CHUNK).is_some());
    }

    #[test]
    fn the_spawn_clearing_is_open_grass() {
        for seed in 0..40 {
            for q in -CLEARING..=CLEARING {
                for r in -CLEARING..=CLEARING {
                    if distance(q, r) > CLEARING {
                        continue;
                    }
                    let c = cell(seed, q, r).unwrap();
                    assert_eq!(c.terrain, Terrain::Grass);
                    assert_eq!(c.height, 3);
                    assert!(!c.terrain.blocked());
                }
            }
        }
    }

    #[test]
    fn walls_stand_on_land_and_trees_grow_on_grass_height() {
        let (mut walls, mut trees) = (0, 0);
        for q in -96..96 {
            for r in -96..96 {
                let c = cell(5, q, r).unwrap();
                match c.terrain {
                    Terrain::Wall => {
                        walls += 1;
                        assert!((2..=6).contains(&c.height), "walls stand on land");
                    }
                    Terrain::Tree => {
                        trees += 1;
                        assert!((3..=5).contains(&c.height), "trees grow on grass");
                    }
                    _ => {}
                }
            }
        }
        assert!(
            walls > 20 && trees > 100,
            "{walls} wall cells, {trees} tree cells"
        );
    }

    #[test]
    fn the_distance_is_the_axial_one() {
        assert_eq!(distance(0, 0), 0);
        assert_eq!(distance(2, -1), 2);
        assert_eq!(distance(2, 2), 4);
        assert_eq!(distance(-3, 0), 3);
    }

    #[test]
    fn heights_and_terrains_agree() {
        // A wide window of four seeds: one seed's window can hold no peak at all (its continents are few).
        for seed in 11..15 {
            for cx in -8..8 {
                for cy in -8..8 {
                    for c in chunk(seed, cx, cy).unwrap() {
                        assert!(c.height <= 7);
                        match c.terrain {
                            Terrain::Water => assert!(c.height <= 1),
                            Terrain::Sand => assert_eq!(c.height, 2),
                            Terrain::Grass => assert!((3..=5).contains(&c.height)),
                            Terrain::Rock => assert!((5..=6).contains(&c.height)),
                            Terrain::Peak => assert_eq!(c.height, 7),
                            Terrain::Tree => assert!((3..=5).contains(&c.height)),
                            Terrain::Boulder | Terrain::Wall => {
                                assert!((2..=6).contains(&c.height))
                            }
                        }
                    }
                }
            }
        }
    }

    #[test]
    fn the_map_varies_and_obstacles_are_a_fair_share() {
        // Four seeds over 16 x 16 chunks: one seed's window is dominated by its few continents.
        let cells: Vec<Cell> = (1..=4)
            .flat_map(|seed| {
                (-8..8).flat_map(move |cx| (-8..8).flat_map(move |cy| chunk(seed, cx, cy).unwrap()))
            })
            .collect();
        for terrain in [
            Terrain::Water,
            Terrain::Sand,
            Terrain::Grass,
            Terrain::Rock,
            Terrain::Peak,
            Terrain::Boulder,
            Terrain::Tree,
            Terrain::Wall,
        ] {
            assert!(
                cells.iter().any(|c| c.terrain == terrain),
                "{terrain:?} never appears"
            );
        }
        let blocked = cells.iter().filter(|c| c.terrain.blocked()).count() * 100 / cells.len();
        assert!((34..=43).contains(&blocked), "{blocked} % blocked");
        let boulders = cells
            .iter()
            .filter(|c| c.terrain == Terrain::Boulder)
            .count();
        assert!(boulders * 100 / cells.len() <= 2);
        let heights: std::collections::HashSet<u8> = cells.iter().map(|c| c.height).collect();
        assert_eq!(heights.len(), 8);
    }

    #[test]
    fn the_eight_height_levels_hold_their_measured_shares() {
        // The 16 x 16 chunks around the spawn, the real window, of four seeds.
        let mut counts = [0usize; 8];
        for seed in 1..=4 {
            for cx in -8..8 {
                for cy in -8..8 {
                    for c in chunk(seed, cx, cy).unwrap() {
                        counts[c.height as usize] += 1;
                    }
                }
            }
        }
        let total: usize = counts.iter().sum();
        let targets = [8.0, 10.0, 12.0, 16.0, 18.0, 16.0, 12.0, 8.0];
        for (level, (&n, target)) in counts.iter().zip(targets).enumerate() {
            let share = n as f64 * 100.0 / total as f64;
            assert!(
                (share - target).abs() <= 2.0,
                "level {level}: {share:.1} % against {target} %"
            );
        }
    }

    #[test]
    fn a_far_view_around_the_spawn_has_a_sea_and_a_range() {
        // The widest zoom sees about 21 x 21 chunks around the spawn: each of seeds 1 to 8 shows water, and rock or peak.
        for seed in 1..=8 {
            let cells: Vec<Cell> = (-10..=10)
                .flat_map(|cx| (-10..=10).flat_map(move |cy| chunk(seed, cx, cy).unwrap()))
                .collect();
            let total = cells.len() as f64;
            let water = cells.iter().filter(|c| c.terrain == Terrain::Water).count() as f64 * 100.0 / total;
            let range = cells
                .iter()
                .filter(|c| matches!(c.terrain, Terrain::Rock | Terrain::Peak))
                .count() as f64
                * 100.0
                / total;
            assert!((3.0..=45.0).contains(&water), "seed {seed}: water {water:.1} %");
            assert!((5.0..=45.0).contains(&range), "seed {seed}: rock and peak {range:.1} %");
        }
    }

    #[test]
    fn only_water_peaks_boulders_trees_and_walls_block() {
        for t in [
            Terrain::Water,
            Terrain::Peak,
            Terrain::Boulder,
            Terrain::Tree,
            Terrain::Wall,
        ] {
            assert!(t.blocked(), "{t:?}");
        }
        assert!(!Terrain::Sand.blocked() && !Terrain::Grass.blocked() && !Terrain::Rock.blocked());
    }

    fn all_groups() -> Vec<Vec<(i32, i32)>> {
        (-8..8)
            .flat_map(|cx| (-8..8).flat_map(move |cy| enemy_groups(5, cx, cy)))
            .collect()
    }

    #[test]
    fn enemy_groups_are_the_same_in_any_order_of_visit() {
        let a = all_groups();
        let reversed: Vec<_> = (-8..8)
            .rev()
            .flat_map(|cx| (-8..8).rev().flat_map(move |cy| enemy_groups(5, cx, cy)))
            .collect();
        let (mut sorted, mut backwards) = (a.clone(), reversed);
        sorted.sort();
        backwards.sort();
        assert_eq!(sorted, backwards);
        assert_ne!(
            a,
            (-8..8)
                .flat_map(|cx| (-8..8).flat_map(move |cy| enemy_groups(6, cx, cy)))
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn a_group_is_one_to_three_marbles_in_a_line_on_open_cells_away_from_the_spawn() {
        let groups = all_groups();
        assert!(groups.len() > 40);
        let lens: std::collections::HashSet<usize> = groups.iter().map(Vec::len).collect();
        assert_eq!(lens, std::collections::HashSet::from([1, 2, 3]));
        for group in &groups {
            for pair in group.windows(2) {
                let step = (pair[1].0 - pair[0].0, pair[1].1 - pair[0].1);
                assert!([(1, 0), (0, 1), (1, -1)].contains(&step), "{group:?}");
            }
            for &(q, r) in group {
                assert!(distance(q, r) > SAFE);
                assert!(!cell(5, q, r).unwrap().terrain.blocked());
            }
        }
    }

    #[test]
    fn there_is_about_one_group_per_four_hundred_cells() {
        let per_cell = all_groups().len() as f64 / (16.0 * 16.0 * 256.0);
        assert!((1.0 / 700.0..1.0 / 300.0).contains(&per_cell), "{per_cell}");
    }

    #[test]
    fn every_group_stays_in_its_chunk_and_no_cell_holds_two_marbles() {
        for seed in 0..12 {
            let mut seen = std::collections::HashSet::new();
            for cx in -8..8 {
                for cy in -8..8 {
                    for group in enemy_groups(seed, cx, cy) {
                        for &(q, r) in &group {
                            assert_eq!(
                                (q.div_euclid(CHUNK), r.div_euclid(CHUNK)),
                                (cx, cy),
                                "{group:?}"
                            );
                            assert!(seen.insert((q, r)), "{seed}: {q},{r} holds two marbles");
                        }
                    }
                }
            }
        }
    }

    /// FNV-1a over the bytes of the chunks and the enemy groups of a few seeds and chunks: any change
    /// of the generated world changes it.
    fn world_digest() -> u64 {
        let fnv =
            |hash: u64, byte: u8| (hash ^ u64::from(byte)).wrapping_mul(0x0000_0100_0000_01B3);
        let mut hash = 0xCBF2_9CE4_8422_2325u64;
        let coords = [
            (0, 0),
            (-1, 0),
            (3, -2),
            (5, 5),
            (-8, 7),
            (31, -32),
            (-32, 31),
            (12, 9),
            (-4, -4),
            (17, 1),
            (2, 20),
            (-20, -11),
        ];
        for seed in [1u64, 7, 42] {
            for &(cx, cy) in &coords {
                for cell in chunk(seed, cx, cy).unwrap() {
                    hash = fnv(hash, cell.height);
                    hash = fnv(hash, cell.terrain as u8);
                }
                for group in enemy_groups(seed, cx, cy) {
                    for (q, r) in group {
                        for byte in q.to_le_bytes().into_iter().chain(r.to_le_bytes()) {
                            hash = fnv(hash, byte);
                        }
                    }
                    hash = fnv(hash, 0xFF);
                }
            }
        }
        hash
    }

    #[test]
    fn the_generated_world_is_pinned_by_a_digest() {
        assert_eq!(
            world_digest(),
            15_334_099_604_620_259_680,
            "digest of the reference world"
        );
    }

    #[test]
    fn the_spawn_chunks_and_the_edge_of_the_world_hold_no_group_in_the_clearing() {
        assert!(enemy_groups(1, WORLD_CHUNKS / 2, 0).is_empty());
        assert!(enemy_groups(1, 0, -WORLD_CHUNKS / 2 - 1).is_empty());
        for seed in 0..60 {
            for g in enemy_groups(seed, 0, 0) {
                assert!(g.iter().all(|&(q, r)| distance(q, r) > SAFE));
            }
        }
    }

    /// The 5 x 5 chunks around the spawn chunk, as cell coordinates `[-2 * CHUNK, 3 * CHUNK)`.
    fn spawn_window() -> impl Iterator<Item = (i32, i32)> {
        (-2 * CHUNK..3 * CHUNK).flat_map(|q| (-2 * CHUNK..3 * CHUNK).map(move |r| (q, r)))
    }

    /// The open cells of the spawn window, and those of them that a flood fill over the six
    /// neighbours reaches from the spawn. The fill may leave the window to go round an obstacle, but
    /// stays in the 16 x 16 chunks around the spawn.
    fn spawn_window_reach(seed: u64) -> (usize, usize) {
        let inside = |q: i32, r: i32| {
            (-8 * CHUNK..8 * CHUNK).contains(&q) && (-8 * CHUNK..8 * CHUNK).contains(&r)
        };
        let open = |q: i32, r: i32| cell(seed, q, r).is_some_and(|c| !c.terrain.blocked());
        let mut reached = std::collections::HashSet::from([(0, 0)]);
        let mut todo = vec![(0, 0)];
        while let Some((q, r)) = todo.pop() {
            for (dq, dr) in [(1, 0), (-1, 0), (0, 1), (0, -1), (1, -1), (-1, 1)] {
                let next = (q + dq, r + dr);
                if inside(next.0, next.1) && open(next.0, next.1) && reached.insert(next) {
                    todo.push(next);
                }
            }
        }
        let total = spawn_window().filter(|&(q, r)| open(q, r)).count();
        let got = spawn_window().filter(|c| reached.contains(c)).count();
        (total, got)
    }

    #[test]
    fn most_open_cells_around_the_spawn_are_reachable_on_foot() {
        for seed in 1..=32 {
            let (open, reached) = spawn_window_reach(seed);
            assert!(
                reached * 100 >= open * 90,
                "seed {seed}: {reached} of {open} open cells reached on foot"
            );
        }
    }
}
