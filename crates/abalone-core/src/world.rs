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
        return Some(Cell { height: 1, terrain: Terrain::Grass });
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
    let forest = terrain == Terrain::Grass && noise(seed, 5, q, r, 7) > 0.55 && unit(seed, 6, q, r) < 0.5;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_chunk_holds_every_cell_of_its_square_in_any_order_of_visit() {
        let a = chunk(7, 3, -2).unwrap();
        assert_eq!(a.len(), (CHUNK * CHUNK) as usize);
        let _elsewhere = chunk(7, -9, 5).unwrap();
        assert_eq!(chunk(7, 3, -2).unwrap(), a);
        assert_eq!(a[(2 * CHUNK + 5) as usize], cell(7, 3 * CHUNK + 5, -2 * CHUNK + 2).unwrap());
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
        assert!(walls > 20 && trees > 100, "{walls} wall cells, {trees} tree cells");
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
                        Terrain::Sand | Terrain::Grass | Terrain::Rock | Terrain::Boulder | Terrain::Tree | Terrain::Wall => {
                            assert!((0..=3).contains(&c.height))
                        }
                    }
                }
            }
        }
    }

    #[test]
    fn the_map_varies_and_obstacles_are_a_fair_share() {
        let cells: Vec<Cell> = (-4..4).flat_map(|cx| (-4..4).flat_map(move |cy| chunk(5, cx, cy).unwrap())).collect();
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
            assert!(cells.iter().any(|c| c.terrain == terrain), "{terrain:?} never appears");
        }
        let blocked = cells.iter().filter(|c| c.terrain.blocked()).count() * 100 / cells.len();
        assert!((10..=45).contains(&blocked), "{blocked} % blocked");
        let boulders = cells.iter().filter(|c| c.terrain == Terrain::Boulder).count();
        assert!(boulders * 100 / cells.len() <= 6);
        let heights: std::collections::HashSet<u8> = cells.iter().map(|c| c.height).collect();
        assert_eq!(heights.len(), 4);
    }

    #[test]
    fn only_water_peaks_boulders_trees_and_walls_block() {
        for t in [Terrain::Water, Terrain::Peak, Terrain::Boulder, Terrain::Tree, Terrain::Wall] {
            assert!(t.blocked(), "{t:?}");
        }
        assert!(!Terrain::Sand.blocked() && !Terrain::Grass.blocked() && !Terrain::Rock.blocked());
    }
}
