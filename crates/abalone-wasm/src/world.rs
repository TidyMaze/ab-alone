//! Open world bridge (docs/specs/openworld.md): the cells of a chunk, see the module docs of the
//! crate for its encoding.

use abalone_core::world::{self, Terrain};
use abalone_core::worldfight::{self, Fall, Outcome};
use wasm_bindgen::prelude::*;

/// Bytes per cell: `[height, terrain, biome]`.
pub const CELL_STRIDE: usize = 3;

/// The code of a terrain on the bridge: `0` water, `1` sand, `2` grass, `3` rock, `4` peak, `5` boulder, `6` tree, `7` wall.
fn terrain_code(terrain: Terrain) -> u8 {
    match terrain {
        Terrain::Water => 0,
        Terrain::Sand => 1,
        Terrain::Grass => 2,
        Terrain::Rock => 3,
        Terrain::Peak => 4,
        Terrain::Boulder => 5,
        Terrain::Tree => 6,
        Terrain::Wall => 7,
    }
}

/// The version of the generated world (`WORLD_VERSION` of the core): a save of another version is not loaded (#968).
#[wasm_bindgen]
pub fn world_version() -> u32 {
    world::WORLD_VERSION
}

/// The cells of chunk `(cx, cy)` of the world `seed`, `CELL_STRIDE` bytes per cell, row by row;
/// empty off the world.
#[wasm_bindgen]
pub fn world_chunk(seed: u32, cx: i32, cy: i32) -> Vec<u8> {
    world::chunk(u64::from(seed), cx, cy)
        .unwrap_or_default()
        .iter()
        .flat_map(|cell| [cell.height, terrain_code(cell.terrain), cell.biome as u8])
        .collect()
}

/// The enemy marbles that start in chunk `(cx, cy)` of the world `seed`: `q, r` pairs, the groups one
/// after the other; empty off the world.
#[wasm_bindgen]
pub fn world_enemies(seed: u32, cx: i32, cy: i32) -> Vec<i32> {
    world::enemy_groups(u64::from(seed), cx, cy)
        .into_iter()
        .flatten()
        .flat_map(|(q, r)| [q, r])
        .collect()
}

/// The troop's push of the Open world (docs/specs/openworld.md section 4) on the world `seed`: `troop`
/// is the hero's cell then the troop's, `enemies` the enemy marbles near the hero, all `q, r` pairs.
/// Empty when no push is legal; else `[ejected_q, ejected_r, ejected_kind, ntroop, ...troop, nenemies,
/// ...enemies, dir_q, dir_r]`: the new troop cells in the order of the input (the hero's first), the
/// new enemy cells in the order of the input without the ejected one, `ejected_kind` `0` none, `1`
/// water, `2` edge, with the ejected enemy's cell before the push (`0, 0` when none), and the push's
/// direction as an axial step. `broken` holds the `q, r` pairs of the obstacles the hero has broken
/// (#1154): they are plain ground, not blocked.
#[wasm_bindgen]
pub fn world_push(seed: u32, troop: Vec<i32>, enemies: Vec<i32>, broken: Vec<i32>) -> Vec<i32> {
    let broken = pairs(&broken);
    let terrain = |q, r| match terrain_at(u64::from(seed), q, r) {
        Some(Terrain::Boulder) if broken.contains(&(q, r)) => Some(Terrain::Rock),
        Some(Terrain::Tree) if broken.contains(&(q, r)) => Some(Terrain::Grass),
        other => other,
    };
    push_encoded(&pairs(&troop), &pairs(&enemies), &terrain)
}

/// The terrain of a cell of the world `seed`, `None` off the world.
fn terrain_at(seed: u64, q: i32, r: i32) -> Option<Terrain> {
    let cell = world::cell(seed, q, r)?;
    Some(cell.terrain)
}

/// The `q, r` pairs of a flat list.
fn pairs(flat: &[i32]) -> Vec<(i32, i32)> {
    let (chunks, _) = flat.as_chunks::<2>();
    chunks.iter().map(|&[q, r]| (q, r)).collect()
}

/// The encoding of `world_push` for any terrain (`None` off the world).
fn push_encoded(
    troop: &[(i32, i32)],
    enemies: &[(i32, i32)],
    terrain: &dyn Fn(i32, i32) -> Option<Terrain>,
) -> Vec<i32> {
    let Some(push) = worldfight::best_push(troop, enemies, terrain) else {
        return Vec::new();
    };
    let (mut troop, mut enemies) = (troop.to_vec(), enemies.to_vec());
    let gone = worldfight::apply_push(&mut troop, &mut enemies, &push);
    let ejected = gone.first().copied().unwrap_or((0, 0));
    let kind = match push.last {
        Outcome::Slides(_) => 0,
        Outcome::Ejected(Fall::Water) => 1,
        Outcome::Ejected(Fall::Edge) => 2,
    };
    let (dq, dr) = push.dir.vector();
    let mut out = vec![ejected.0, ejected.1, kind, troop.len() as i32];
    out.extend(troop.iter().flat_map(|&(q, r)| [q, r]));
    out.push(enemies.len() as i32);
    out.extend(enemies.iter().flat_map(|&(q, r)| [q, r]));
    out.extend([dq, dr]);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_world_version_is_the_core_one() {
        assert_eq!(world_version(), abalone_core::world::WORLD_VERSION);
    }

    #[test]
    fn a_chunk_is_three_bytes_a_cell_and_matches_the_engine() {
        let bytes = world_chunk(9, 1, -1);
        assert_eq!(bytes.len(), 16 * 16 * CELL_STRIDE);
        let cell = world::cell(9, 16 + 3, -16 + 2).unwrap();
        let at = (2 * 16 + 3) * CELL_STRIDE;
        assert_eq!(bytes[at], cell.height);
        assert_eq!(bytes[at + 1], terrain_code(cell.terrain));
        assert_eq!(bytes[at + 2], cell.biome as u8);
    }

    #[test]
    fn the_biome_codes_are_the_five_biomes_of_the_table() {
        let biomes: std::collections::HashSet<u8> = (1..=4)
            .flat_map(|seed| {
                (-8..8).flat_map(move |cx| (-8..8).map(move |cy| world_chunk(seed, cx, cy)))
            })
            .flat_map(|bytes| bytes.into_iter().skip(2).step_by(CELL_STRIDE))
            .collect();
        assert_eq!(biomes, std::collections::HashSet::from([0, 1, 2, 3, 4]));
    }

    #[test]
    fn enemies_are_q_r_pairs_that_match_the_engine() {
        let mut found = false;
        for cx in -8..8 {
            let flat = world_enemies(5, cx, 3);
            let groups: Vec<(i32, i32)> = world::enemy_groups(5, cx, 3).concat();
            assert_eq!(flat.len(), groups.len() * 2);
            for (i, (q, r)) in groups.iter().enumerate() {
                assert_eq!((flat[2 * i], flat[2 * i + 1]), (*q, *r));
                found = true;
            }
        }
        assert!(found);
        assert!(world_enemies(5, 32, 0).is_empty());
    }

    #[test]
    fn off_the_world_is_empty() {
        assert!(world_chunk(9, 32, 0).is_empty());
    }

    #[test]
    fn every_terrain_has_its_code() {
        let all = [
            Terrain::Water,
            Terrain::Sand,
            Terrain::Grass,
            Terrain::Rock,
            Terrain::Peak,
            Terrain::Boulder,
            Terrain::Tree,
            Terrain::Wall,
        ];
        assert_eq!(all.map(terrain_code), [0, 1, 2, 3, 4, 5, 6, 7]);
    }

    #[test]
    fn a_slide_keeps_the_order_of_the_troop_and_moves_the_enemy() {
        // The hero (0,0) and the marble (-1,0) push the enemy (1,0) east to (2,0), on the spawn clearing.
        let out = world_push(9, vec![0, 0, -1, 0], vec![1, 0], vec![]);
        assert_eq!(out, vec![0, 0, 0, 2, 1, 0, 0, 0, 1, 2, 0, 1, 0]);
    }

    #[test]
    fn a_push_into_water_ejects_the_last_enemy_as_kind_one() {
        // Only the cell beyond the enemy is asked for: it is water.
        let water = |_q: i32, _r: i32| Some(Terrain::Water);
        let out = push_encoded(&[(2, 0), (1, 0), (0, 0)], &[(3, 0), (4, 0)], &water);
        assert_eq!(out, vec![4, 0, 1, 3, 3, 0, 2, 0, 1, 0, 1, 4, 0, 1, 0]);
    }

    #[test]
    fn a_push_off_the_world_ejects_the_last_enemy_as_kind_two() {
        // The world ends at q = 511: the enemy (511,0) is pushed onto (512,0), which is off it.
        let out = world_push(9, vec![509, 0, 510, 0], vec![511, 0], vec![]);
        assert_eq!(out, vec![511, 0, 2, 2, 510, 0, 511, 0, 0, 1, 0]);
    }

    #[test]
    fn no_legal_push_is_empty() {
        assert!(world_push(9, vec![0, 0, -1, 0], vec![], vec![]).is_empty());
        assert!(world_push(9, vec![0, 0], vec![1, 0], vec![]).is_empty());
    }

    /// A boulder or a tree of the seed 9 with a free cell on its west to start a line from, found in the world itself.
    fn obstacle(kind: Terrain) -> (i32, i32) {
        (-60..60)
            .flat_map(|q| (-60..60).map(move |r| (q, r)))
            .find(|&(q, r)| terrain_at(9, q, r) == Some(kind))
            .unwrap()
    }

    #[test]
    fn a_push_into_a_broken_obstacle_is_legal_and_into_an_unbroken_one_is_refused() {
        for kind in [Terrain::Boulder, Terrain::Tree] {
            let (q, r) = obstacle(kind);
            // Two marbles push the enemy next to the obstacle east, onto it.
            let troop = vec![q - 2, r, q - 3, r];
            let enemies = vec![q - 1, r];
            let refused = world_push(9, troop.clone(), enemies.clone(), vec![]);
            assert!(refused.is_empty(), "{kind:?} blocks");
            let elsewhere = world_push(9, troop.clone(), enemies.clone(), vec![q + 1, r]);
            assert!(elsewhere.is_empty(), "another broken cell changes nothing");
            let out = world_push(9, troop, enemies, vec![q, r]);
            assert_eq!(out[..3], [0, 0, 0], "{kind:?} broken: the enemy slides");
        }
    }
}
