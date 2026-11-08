//! Rogue-lite run bridge (docs/specs/roguelite.md): the map of a run seed, see the module docs of
//! the crate for its encoding. The army's fight is `Engine::with_army`.

use crate::convert::special_code;
use edgefall_core::run;
use edgefall_core::world::Biome;
use wasm_bindgen::prelude::*;

/// Integers per map node: `[act, row, col, kind, links, formation, elite]`.
pub const NODE_STRIDE: usize = 7;

/// The map of the run `seed` of a player who owns the runes `runes` (none when omitted, section 27) at the generation `version`
/// (the one of a run saved before the pacing when omitted, section 2), one record of `NODE_STRIDE` integers per node.
#[wasm_bindgen]
pub fn run_map(seed: u32, runes: Option<u8>, version: Option<u8>) -> Vec<i32> {
    run::run_map_v(u64::from(seed), runes.unwrap_or(0), version.unwrap_or(0))
        .iter()
        .flat_map(|node| {
            let links: i32 = node.links.iter().map(|&c| 1 << c).sum();
            let skips: i32 = node.skips.iter().map(|&c| 1 << (8 + c)).sum();
            [
                node.act as i32,
                node.row as i32,
                node.col as i32,
                node.kind as i32,
                links | skips,
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
pub fn run_foes(
    seed: u32,
    node: u32,
    less: u8,
    biome: u8,
    more: Option<u8>,
    version: Option<u8>,
) -> Vec<i32> {
    let biome = Biome::from_code(biome).unwrap_or(Biome::Meadow);
    let plan = run::foe_plan_v(
        u64::from(seed),
        node as usize,
        less,
        biome,
        more.unwrap_or(0),
        version.unwrap_or(0),
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
/// `seed` that left the biome of code `from` (docs/specs/roguelite.md section 18), and a third one with the rune of the exit in
/// `runes` (section 27). A run that began in the biome `first` (a dungeon gate's, section 18) is never offered it either.
#[wasm_bindgen]
pub fn run_exits(seed: u32, act: u8, from: u8, runes: Option<u8>, first: Option<u8>) -> Vec<u8> {
    let from = Biome::from_code(from).unwrap_or(Biome::Meadow);
    let first = Biome::from_code(first.unwrap_or(0)).unwrap_or(Biome::Meadow);
    run::exits_after(
        u64::from(seed),
        usize::from(act),
        from,
        first,
        runes.unwrap_or(0),
    )
    .into_iter()
    .map(|b| b as u8)
    .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::convert::special_code;
    use edgefall_core::run::{NodeKind, RUNE_EXIT, RUNE_ROOM, RUNE_SHORTCUT};

    #[test]
    fn run_map_flattens_the_core_map() {
        let flat = run_map(3, None, None);
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
    fn the_version_picks_the_generation_of_the_map_and_of_its_foes() {
        let old = run_map(3, None, None);
        assert_eq!(run_map(3, None, Some(0)), old);
        let paced = run_map(3, None, Some(run::MAP_VERSION));
        assert_eq!(paced.len(), old.len());
        assert_ne!(paced, old);
        let core = run::run_map_v(3, 0, run::MAP_VERSION);
        let (index, node) = core
            .iter()
            .enumerate()
            .find(|(_, n)| n.kind == NodeKind::Fight && n.row > 0)
            .expect("a fight after the first row");
        let plan = run::foe_plan_v(3, index, 0, Biome::Meadow, 0, run::MAP_VERSION);
        let flat = run_foes(3, index as u32, 0, 0, None, Some(run::MAP_VERSION));
        assert_eq!(flat[..2], [i32::from(plan.count), node.formation as i32]);
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
        let flat = run_foes(5, index as u32, 1, 0, None, None);
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
        let flat = run_foes(5, 0, 0, 3, None, None);
        assert_eq!(flat[2], 3);
        assert_eq!(
            run_foes(5, 0, 0, 99, None, None),
            run_foes(5, 0, 0, 0, None, None)
        );
        let plan = run::foe_plan(5, 0, 0, Biome::Desert);
        assert_eq!(flat[3..].len(), 3 * plan.specials.len());
    }

    #[test]
    fn run_exits_flattens_the_core_exits() {
        let core = run::exits(7, 2, Biome::Tundra).map(|b| b as u8);
        assert_eq!(run_exits(7, 2, 2, None, None), core);
        assert_eq!(
            run_exits(7, 2, 99, None, None),
            run_exits(7, 2, 0, None, None)
        );
        assert_eq!(run_exits(7, 2, 2, Some(RUNE_ROOM), None), core);
        let after = run_exits(7, 2, 3, None, Some(Biome::Forest as u8));
        assert!(!after.contains(&(Biome::Forest as u8)) && !after.contains(&3));
        assert_eq!(
            run_exits(7, 2, 3, None, Some(99)),
            run_exits(7, 2, 3, None, None)
        );
    }

    #[test]
    fn the_runes_reach_the_bridge_as_a_secret_room_a_shortcut_mask_and_a_third_exit() {
        let plain = run_map(3, None, None);
        assert_eq!(run_map(3, Some(0), None), plain);
        let core = run::run_map_with(3, RUNE_ROOM | RUNE_SHORTCUT);
        let flat = run_map(3, Some(RUNE_ROOM | RUNE_SHORTCUT), None);
        assert_eq!(flat.len(), core.len() * NODE_STRIDE);
        let secret = flat.chunks(NODE_STRIDE).filter(|r| r[3] == 8).count();
        assert_eq!(secret, run::ACTS);
        for (record, node) in flat.chunks(NODE_STRIDE).zip(&core) {
            let links: i32 = node.links.iter().map(|&c| 1 << c).sum();
            let skips: i32 = node.skips.iter().map(|&c| 1 << (8 + c)).sum();
            assert_eq!(record[4], links | skips);
        }
        assert!(flat.chunks(NODE_STRIDE).any(|r| r[4] >> 8 != 0));
        let exits = run_exits(7, 2, 2, Some(RUNE_EXIT), None);
        assert_eq!(exits.len(), 3);
        assert_eq!(exits[..2], run_exits(7, 2, 2, None, None));
    }

    #[test]
    fn run_foes_adds_the_ascension_special_marbles() {
        let core = run::run_map(5);
        let (index, _) = core
            .iter()
            .enumerate()
            .find(|(_, n)| n.kind == NodeKind::Fight)
            .expect("seed 5 has a fight");
        let plain = run_foes(5, index as u32, 0, 0, None, None);
        assert_eq!(run_foes(5, index as u32, 0, 0, Some(0), None), plain);
        let more = run_foes(5, index as u32, 0, 0, Some(2), None);
        assert_eq!(more.len(), plain.len() + 6);
        assert_eq!(more[..3], plain[..3]);
    }
}
