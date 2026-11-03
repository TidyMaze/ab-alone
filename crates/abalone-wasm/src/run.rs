//! Rogue-lite run bridge (docs/specs/roguelite.md): the map of a run seed, see the module docs of
//! the crate for its encoding. The army's fight is `Engine::with_army`.

use crate::convert::special_code;
use abalone_core::run;
use abalone_core::world::Biome;
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

/// The bot's army at node `node` of the map of `seed`, `less` marbles short and `more` special marbles more (the ascension
/// levels, none when omitted), in the biome of code `biome` (`0`, the Meadow, for an unknown code): `[count, formation,
/// biome, ...]` then a record `[q, r, kind]` per special marble, the plan `Engine::with_foes` stands.
#[wasm_bindgen]
pub fn run_foes(seed: u32, node: u32, less: u8, biome: u8, more: Option<u8>) -> Vec<i32> {
    let biome = Biome::from_code(biome).unwrap_or(Biome::Meadow);
    let plan = run::foe_plan_with(
        u64::from(seed),
        node as usize,
        less,
        biome,
        more.unwrap_or(0),
    );
    [
        i32::from(plan.count),
        plan.formation as i32,
        plan.biome as i32,
    ]
    .into_iter()
    .chain(
        plan.specials
            .iter()
            .flat_map(|&((q, r), kind)| [q, r, i32::from(special_code(kind))]),
    )
    .collect()
}

/// The codes of the two biomes the exits lead to for act `act` (1 or 2, `0` for the Meadow when out of range) of the run
/// `seed` that left the biome of code `from` (docs/specs/roguelite.md section 18).
#[wasm_bindgen]
pub fn run_exits(seed: u32, act: u8, from: u8) -> Vec<u8> {
    let from = Biome::from_code(from).unwrap_or(Biome::Meadow);
    run::exits(u64::from(seed), usize::from(act), from)
        .map(|b| b as u8)
        .to_vec()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::convert::special_code;
    use abalone_core::run::{NodeKind, RUNE_EXIT, RUNE_ROOM, RUNE_SHORTCUT};

    #[test]
    fn run_map_flattens_the_core_map() {
        let flat = run_map(3, None);
        let core = run::run_map(3);
        assert_eq!(flat.len(), core.len() * NODE_STRIDE);
        for (record, node) in flat.chunks(NODE_STRIDE).zip(&core) {
            assert_eq!(
                record[..3],
                [node.act as i32, node.row as i32, node.col as i32]
            );
            let code = node.kind as i32;
            assert_eq!(record[3], code);
            let links: i32 = node.links.iter().map(|&c| 1 << c).sum();
            assert_eq!(record[4], links);
            assert_eq!(record[5], node.formation as i32);
            assert_eq!(record[6], node.elite.map_or(0, |e| e as i32));
        }
        let codes = [
            (NodeKind::Fight, 0),
            (NodeKind::Boss, 1),
            (NodeKind::Elite, 2),
            (NodeKind::Rest, 3),
            (NodeKind::Event, 4),
            (NodeKind::Treasure, 5),
            (NodeKind::Shop, 6),
            (NodeKind::Unknown, 7),
        ];
        assert!(codes.iter().all(|&(kind, code)| kind as i32 == code));
        assert_eq!(flat[flat.len() - NODE_STRIDE + 3], 1); // the act 3 boss closes the map
        let kinds: Vec<i32> = flat.chunks(NODE_STRIDE).map(|r| r[3]).collect();
        assert!(
            [2, 3, 5, 6, 7].iter().all(|k| kinds.contains(k)),
            "seed 3 has an elite, a rest, a treasure, a shop and an unknown"
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
        let plan = run::foe_plan(5, index, 1, Biome::Meadow);
        let flat = run_foes(5, index as u32, 1, 0, None);
        assert_eq!(flat[..3], [i32::from(plan.count), plan.formation as i32, 0]);
        assert_eq!(plan.count, run::FULL_ARMY - 1);
        assert_eq!(flat.len(), 3 + 3 * plan.specials.len());
        for (record, ((q, r), kind)) in flat[3..].chunks(3).zip(&plan.specials) {
            assert_eq!(record, [*q, *r, i32::from(special_code(*kind))]);
        }
        assert!(!plan.specials.is_empty());
    }

    #[test]
    fn run_foes_carries_the_biome_and_an_unknown_one_is_the_meadow() {
        let flat = run_foes(5, 0, 0, 3, None);
        assert_eq!(flat[2], 3);
        assert_eq!(run_foes(5, 0, 0, 99, None), run_foes(5, 0, 0, 0, None));
        let plan = run::foe_plan(5, 0, 0, Biome::Desert);
        assert_eq!(flat[3..].len(), 3 * plan.specials.len());
    }

    #[test]
    fn run_exits_flattens_the_core_exits() {
        let core = run::exits(7, 2, Biome::Tundra).map(|b| b as u8);
        assert_eq!(run_exits(7, 2, 2, None), core);
        assert_eq!(run_exits(7, 2, 99, None), run_exits(7, 2, 0, None));
        assert_eq!(run_exits(7, 2, 2, Some(RUNE_ROOM)), core);
    }

    #[test]
    fn the_runes_reach_the_bridge_as_a_secret_room_a_shortcut_mask_and_a_third_exit() {
        let plain = run_map(3, None);
        assert_eq!(run_map(3, Some(0)), plain);
        let core = run::run_map_with(3, RUNE_ROOM | RUNE_SHORTCUT);
        let flat = run_map(3, Some(RUNE_ROOM | RUNE_SHORTCUT));
        assert_eq!(flat.len(), core.len() * NODE_STRIDE);
        let secret = flat.chunks(NODE_STRIDE).filter(|r| r[3] == 8).count();
        assert_eq!(secret, run::ACTS);
        for (record, node) in flat.chunks(NODE_STRIDE).zip(&core) {
            let links: i32 = node.links.iter().map(|&c| 1 << c).sum();
            let skips: i32 = node.skips.iter().map(|&c| 1 << (8 + c)).sum();
            assert_eq!(record[4], links | skips);
        }
        assert!(flat.chunks(NODE_STRIDE).any(|r| r[4] >> 8 != 0));
        let exits = run_exits(7, 2, 2, Some(RUNE_EXIT));
        assert_eq!(exits.len(), 3);
        assert_eq!(exits[..2], run_exits(7, 2, 2, None));
    }

    #[test]
    fn run_foes_adds_the_ascension_special_marbles() {
        let core = run::run_map(5);
        let (index, _) = core
            .iter()
            .enumerate()
            .find(|(_, n)| n.kind == NodeKind::Fight)
            .expect("seed 5 has a fight");
        let plain = run_foes(5, index as u32, 0, 0, None);
        assert_eq!(run_foes(5, index as u32, 0, 0, Some(0)), plain);
        let more = run_foes(5, index as u32, 0, 0, Some(2));
        assert_eq!(more.len(), plain.len() + 6);
        assert_eq!(more[..3], plain[..3]);
    }
}
