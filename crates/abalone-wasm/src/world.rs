//! Open world bridge (docs/specs/openworld.md): the cells of a chunk, see the module docs of the
//! crate for its encoding.

use abalone_core::world::{self, Terrain};
use wasm_bindgen::prelude::*;

/// Bytes per cell: `[height, terrain]`.
pub const CELL_STRIDE: usize = 2;

/// The code of a terrain on the bridge: `0` water, `1` sand, `2` grass, `3` rock, `4` peak, `5` boulder.
fn terrain_code(terrain: Terrain) -> u8 {
    match terrain {
        Terrain::Water => 0,
        Terrain::Sand => 1,
        Terrain::Grass => 2,
        Terrain::Rock => 3,
        Terrain::Peak => 4,
        Terrain::Boulder => 5,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_chunk_is_two_bytes_a_cell_and_matches_the_engine() {
        let bytes = world_chunk(9, 1, -1);
        assert_eq!(bytes.len(), 16 * 16 * CELL_STRIDE);
        let cell = world::cell(9, 16 + 3, -16 + 2).unwrap();
        let at = (2 * 16 + 3) * CELL_STRIDE;
        assert_eq!(bytes[at], cell.height);
        assert_eq!(bytes[at + 1], terrain_code(cell.terrain));
    }

    #[test]
    fn off_the_world_is_empty() {
        assert!(world_chunk(9, 32, 0).is_empty());
    }

    #[test]
    fn every_terrain_has_its_code() {
        let all = [Terrain::Water, Terrain::Sand, Terrain::Grass, Terrain::Rock, Terrain::Peak, Terrain::Boulder];
        assert_eq!(all.map(terrain_code), [0, 1, 2, 3, 4, 5]);
    }
}
