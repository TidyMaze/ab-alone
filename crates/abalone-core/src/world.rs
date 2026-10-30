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
/// Boulders sit on this share of the cells that are not water or peak, in thousandths.
const BOULDER_PER_MILLE: u64 = 60;
/// Walls are laid out on a lattice of squares of this many cells.
const WALL_BLOCK: i32 = 24;
/// A chunk tries to place `TRIES` enemy groups, each with this chance in thousandths; with the obstacles that refuse some,
/// about one group stands per 400 cells.
const GROUP_PER_MILLE: f64 = 600.0;
const TRIES: u64 = 2;
/// No enemy stands within this many cells of the spawn.
const SAFE: i32 = 8;

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

/// One cell: its height `0` to `3` and its terrain.
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

/// Smooth value noise at `(q, r)`: lattice values every `scale` cells, blended with smoothstep.
fn noise(seed: u64, salt: u64, q: i32, r: i32, scale: i32) -> f64 {
    let (x, y) = (q.div_euclid(scale), r.div_euclid(scale));
    let smooth = |t: f64| t * t * (3.0 - 2.0 * t);
    let tx = smooth(f64::from(q.rem_euclid(scale)) / f64::from(scale));
    let ty = smooth(f64::from(r.rem_euclid(scale)) / f64::from(scale));
    let at = |dx, dy| unit(seed, salt, x + dx, y + dy);
    let top = at(0, 0) + (at(1, 0) - at(0, 0)) * tx;
    let bottom = at(0, 1) + (at(1, 1) - at(0, 1)) * tx;
    top + (bottom - top) * ty
}

/// The axial distance from `(0, 0)`.
fn distance(q: i32, r: i32) -> i32 {
    (q.abs() + r.abs() + (q + r).abs()) / 2
}

/// Whether the chunk coordinate is inside the world.
fn in_world(c: i32) -> bool {
    (-WORLD_CHUNKS / 2..WORLD_CHUNKS / 2).contains(&c)
}

/// The cell at `(q, r)` of the world of `seed`, `None` off the world.
pub fn cell(seed: u64, q: i32, r: i32) -> Option<Cell> {
    if !in_world(q.div_euclid(CHUNK)) || !in_world(r.div_euclid(CHUNK)) {
        return None;
    }
    if distance(q, r) <= CLEARING {
        return Some(Cell {
            height: 1,
            terrain: Terrain::Grass,
        });
    }
    let elevation = 0.65 * noise(seed, 1, q, r, 12) + 0.35 * noise(seed, 2, q, r, 5);
    let height = match elevation {
        e if e < 0.32 => 0,
        e if e < 0.50 => 1,
        e if e < 0.64 => 2,
        _ => 3,
    };
    let dry = noise(seed, 3, q, r, 9) < 0.4;
    let terrain = match (height, dry) {
        (0, _) => Terrain::Water,
        (1, true) => Terrain::Sand,
        (2, true) => Terrain::Rock,
        (3, _) => Terrain::Peak,
        _ => Terrain::Grass,
    };
    let open = !terrain.blocked();
    let forest =
        terrain == Terrain::Grass && noise(seed, 5, q, r, 7) > 0.55 && unit(seed, 6, q, r) < 0.5;
    let terrain = if open && on_wall(seed, q, r) {
        Terrain::Wall
    } else if forest {
        Terrain::Tree
    } else if open && unit(seed, 4, q, r) * 1000.0 < BOULDER_PER_MILLE as f64 {
        Terrain::Boulder
    } else {
        terrain
    };
    Some(Cell { height, terrain })
}

/// Whether `(q, r)` is on a ruined wall: each `WALL_BLOCK` square of the grid may hold one segment of 3
/// to 6 cells along one of three axes, from the seed and the square alone, so a wall may cross a
/// chunk edge and the squares around the cell are the only ones to look at.
fn on_wall(seed: u64, q: i32, r: i32) -> bool {
    let (bx, by) = (q.div_euclid(WALL_BLOCK), r.div_euclid(WALL_BLOCK));
    (-1..=1).any(|dx| {
        (-1..=1).any(|dy| {
            let (x, y) = (bx + dx, by + dy);
            if unit(seed, 7, x, y) >= 0.45 {
                return false;
            }
            let start_q = x * WALL_BLOCK + (unit(seed, 8, x, y) * f64::from(WALL_BLOCK)) as i32;
            let start_r = y * WALL_BLOCK + (unit(seed, 9, x, y) * f64::from(WALL_BLOCK)) as i32;
            let (dq, dr) = [(1, 0), (0, 1), (1, -1)][(unit(seed, 10, x, y) * 3.0) as usize];
            let len = 3 + (unit(seed, 11, x, y) * 4.0) as i32;
            (0..len).any(|k| (start_q + k * dq, start_r + k * dr) == (q, r))
        })
    })
}

/// The `CHUNK` x `CHUNK` cells of chunk `(cx, cy)`, row by row (`r` then `q` ascending), `None`
/// off the world.
pub fn chunk(seed: u64, cx: i32, cy: i32) -> Option<Vec<Cell>> {
    if !in_world(cx) || !in_world(cy) {
        return None;
    }
    Some(
        (0..CHUNK)
            .flat_map(|dr| (0..CHUNK).map(move |dq| (dq, dr)))
            .map(|(dq, dr)| cell(seed, cx * CHUNK + dq, cy * CHUNK + dr).expect("inside the chunk"))
            .collect(),
    )
}

/// The enemy groups that start in chunk `(cx, cy)` (docs/specs/openworld.md section 3): up to `TRIES` groups
/// of 1 to 3 marbles in a line on three axes, from the seed and the chunk alone. A group is placed only
/// when every one of its cells is in this chunk, open, off the spawn's `SAFE` radius and shared with no
/// group placed before it in the chunk; the others are dropped.
pub fn enemy_groups(seed: u64, cx: i32, cy: i32) -> Vec<Vec<(i32, i32)>> {
    if !in_world(cx) || !in_world(cy) {
        return vec![];
    }
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
                && cell(seed, q, r).is_some_and(|c| !c.terrain.blocked())
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
                        assert!((1..=2).contains(&c.height), "walls stand on land");
                    }
                    Terrain::Tree => {
                        trees += 1;
                        assert!((1..=2).contains(&c.height));
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
        for cx in -3..3 {
            for cy in -3..3 {
                for c in chunk(11, cx, cy).unwrap() {
                    assert!(c.height <= 3);
                    match c.terrain {
                        Terrain::Water => assert_eq!(c.height, 0),
                        Terrain::Peak => assert_eq!(c.height, 3),
                        Terrain::Sand
                        | Terrain::Grass
                        | Terrain::Rock
                        | Terrain::Boulder
                        | Terrain::Tree
                        | Terrain::Wall => {
                            assert!((0..=3).contains(&c.height))
                        }
                    }
                }
            }
        }
    }

    #[test]
    fn the_map_varies_and_obstacles_are_a_fair_share() {
        let cells: Vec<Cell> = (-4..4)
            .flat_map(|cx| (-4..4).flat_map(move |cy| chunk(5, cx, cy).unwrap()))
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
        assert!((10..=45).contains(&blocked), "{blocked} % blocked");
        let boulders = cells
            .iter()
            .filter(|c| c.terrain == Terrain::Boulder)
            .count();
        assert!(boulders * 100 / cells.len() <= 6);
        let heights: std::collections::HashSet<u8> = cells.iter().map(|c| c.height).collect();
        assert_eq!(heights.len(), 4);
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
        let fnv = |hash: u64, byte: u8| (hash ^ u64::from(byte)).wrapping_mul(0x0000_0100_0000_01B3);
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
        assert_eq!(world_digest(), 3_089_906_282_619_527_092, "digest of the reference world");
    }

    /// Timing, not a check: `cargo test --release -p abalone-core -- --ignored --nocapture world_timing`.
    #[test]
    #[ignore]
    fn world_timing() {
        use std::time::Instant;
        let started = Instant::now();
        let mut sink = 0usize;
        for _ in 0..200 {
            sink += chunk(7, 3, -2).unwrap().len();
        }
        println!("one chunk, chunk(): {:?} per call", started.elapsed() / 200);
        let started = Instant::now();
        for _ in 0..20 {
            sink += enemy_groups(7, 3, -2).len();
        }
        println!("one chunk, enemy_groups(): {:?} per call", started.elapsed() / 20);
        let started = Instant::now();
        let mut all = 0usize;
        for cx in -WORLD_CHUNKS / 2..WORLD_CHUNKS / 2 {
            for cy in -WORLD_CHUNKS / 2..WORLD_CHUNKS / 2 {
                all += chunk(7, cx, cy).unwrap().len();
            }
        }
        println!("4096 chunks, chunk(): {:?} total ({all} cells)", started.elapsed());
        let started = Instant::now();
        for cx in -WORLD_CHUNKS / 2..WORLD_CHUNKS / 2 {
            for cy in -WORLD_CHUNKS / 2..WORLD_CHUNKS / 2 {
                sink += enemy_groups(7, cx, cy).len();
            }
        }
        println!("4096 chunks, enemy_groups(): {:?} total", started.elapsed());
        assert!(sink > 0);
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
}
