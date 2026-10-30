//! Rogue-lite run bridge (docs/specs/roguelite.md): the map of a run seed, see the module docs of
//! the crate for its encoding. The army's fight is `Engine::with_army`.

use abalone_core::run::{self, NodeKind};
use wasm_bindgen::prelude::*;

/// Integers per map node: `[act, row, col, kind, links]`.
pub const NODE_STRIDE: usize = 5;

/// The map of the run `seed`, one record of `NODE_STRIDE` integers per node.
#[wasm_bindgen]
pub fn run_map(seed: u32) -> Vec<i32> {
    run::run_map(u64::from(seed))
        .iter()
        .flat_map(|node| {
            let links: i32 = node.links.iter().map(|&c| 1 << c).sum();
            [
                node.act as i32,
                node.row as i32,
                node.col as i32,
                i32::from(node.kind == NodeKind::Boss),
                links,
            ]
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn run_map_flattens_the_core_map() {
        let flat = run_map(11);
        let core = run::run_map(11);
        assert_eq!(flat.len(), core.len() * NODE_STRIDE);
        for (record, node) in flat.chunks(NODE_STRIDE).zip(&core) {
            assert_eq!(
                record[..3],
                [node.act as i32, node.row as i32, node.col as i32]
            );
            assert_eq!(record[3], i32::from(node.kind == NodeKind::Boss));
            let links: i32 = node.links.iter().map(|&c| 1 << c).sum();
            assert_eq!(record[4], links);
        }
        assert_eq!(flat[flat.len() - 2], 1); // the act 3 boss closes the map
    }
}
