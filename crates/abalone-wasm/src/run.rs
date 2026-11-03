//! Rogue-lite run bridge (docs/specs/roguelite.md): the map of a run seed, see the module docs of
//! the crate for its encoding. The army's fight is `Engine::with_army`.

use crate::convert::special_code;
use abalone_core::run;
use wasm_bindgen::prelude::*;

/// Integers per map node: `[act, row, col, kind, links, formation, elite]`.
pub const NODE_STRIDE: usize = 7;

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
                node.kind as i32,
                links,
                node.formation as i32,
                node.elite.map_or(0, |e| e as i32),
            ]
        })
        .collect()
}

/// The bot's army at node `node` of the map of `seed`, `less` marbles short: `[count, formation,
/// ...]` then a record `[q, r, kind]` per special marble, the plan `Engine::with_foes` stands.
#[wasm_bindgen]
pub fn run_foes(seed: u32, node: u32, less: u8) -> Vec<i32> {
    let plan = run::foe_plan(u64::from(seed), node as usize, less);
    [i32::from(plan.count), plan.formation as i32]
        .into_iter()
        .chain(
            plan.specials
                .iter()
                .flat_map(|&((q, r), kind)| [q, r, i32::from(special_code(kind))]),
        )
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::convert::special_code;
    use abalone_core::run::NodeKind;

    #[test]
    fn run_map_flattens_the_core_map() {
        let flat = run_map(3);
        let core = run::run_map(3);
        assert_eq!(flat.len(), core.len() * NODE_STRIDE);
        for (record, node) in flat.chunks(NODE_STRIDE).zip(&core) {
            assert_eq!(
                record[..3],
                [node.act as i32, node.row as i32, node.col as i32]
            );
            let code = match node.kind {
                NodeKind::Fight => 0,
                NodeKind::Boss => 1,
                NodeKind::Elite => 2,
                NodeKind::Rest => 3,
                NodeKind::Event => 4,
                NodeKind::Treasure => 5,
                NodeKind::Shop => 6,
            };
            assert_eq!(record[3], code);
            let links: i32 = node.links.iter().map(|&c| 1 << c).sum();
            assert_eq!(record[4], links);
            assert_eq!(record[5], node.formation as i32);
            assert_eq!(record[6], node.elite.map_or(0, |e| e as i32));
        }
        assert_eq!(flat[flat.len() - NODE_STRIDE + 3], 1); // the act 3 boss closes the map
        let kinds: Vec<i32> = flat.chunks(NODE_STRIDE).map(|r| r[3]).collect();
        assert!(
            (2..=6).all(|k| kinds.contains(&k)),
            "seed 3 has an elite, a rest, an event, a treasure and a shop"
        );
    }

    #[test]
    fn run_foes_flattens_the_core_plan() {
        let core = run::run_map(5);
        let (index, _) = core
            .iter()
            .enumerate()
            .find(|(_, n)| n.kind == NodeKind::Elite)
            .expect("seed 5 has an elite");
        let plan = run::foe_plan(5, index, 1);
        let flat = run_foes(5, index as u32, 1);
        assert_eq!(flat[..2], [i32::from(plan.count), plan.formation as i32]);
        assert_eq!(plan.count, run::FULL_ARMY - 1);
        assert_eq!(flat.len(), 2 + 3 * plan.specials.len());
        for (record, ((q, r), kind)) in flat[2..].chunks(3).zip(&plan.specials) {
            assert_eq!(record, [*q, *r, i32::from(special_code(*kind))]);
        }
        assert!(!plan.specials.is_empty());
    }
}
