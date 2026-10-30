//! Open world bridge (docs/specs/openworld.md): the cells of a chunk, see the module docs of the
//! crate for its encoding.

use abalone_core::world::{self, Terrain};
use wasm_bindgen::prelude::*;

/// Bytes per cell: `[height, terrain]`.
pub const CELL_STRIDE: usize = 2;

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

/// The cells of chunk `(cx, cy)` of the world `seed`, `CELL_STRIDE` bytes per cell, row by row;
/// empty off the world.
#[wasm_bindgen]
pub fn world_chunk(seed: u32, cx: i32, cy: i32) -> Vec<u8> {
    world::chunk(u64::from(seed), cx, cy)
        .unwrap_or_default()
        .iter()
        .flat_map(|cell| [cell.height, terrain_code(cell.terrain)])
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

#[cfg(test)]
mod tests {
    use super::*;

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
        let biomes: Vec<u8> = (-8..8)
            .flat_map(|cx| world_chunk(3, cx, 0))
            .skip(2)
            .step_by(CELL_STRIDE)
            .collect();
        assert!(biomes.iter().all(|&code| code <= 4));
        assert!(biomes.contains(&0) && biomes.contains(&4));
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
}
