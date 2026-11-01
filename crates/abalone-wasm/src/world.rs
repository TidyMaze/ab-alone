//! Open world bridge (docs/specs/openworld.md): the cells of a chunk, see the module docs of the
//! crate for its encoding.

use abalone_core::world::{self, Terrain};
use abalone_core::worldfight::{self, Fall, Outcome};
use abalone_core::worldoverlay::Overlay;
use abalone_core::worldstep::{self, Entry};
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

/// The terrain of a bridge code, `None` for `-1` (off the world) or an unknown code.
fn terrain_of_code(code: i32) -> Option<Terrain> {
    [
        Terrain::Water,
        Terrain::Sand,
        Terrain::Grass,
        Terrain::Rock,
        Terrain::Peak,
        Terrain::Boulder,
        Terrain::Tree,
        Terrain::Wall,
    ]
    .into_iter()
    .find(|&terrain| i32::from(terrain_code(terrain)) == code)
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

/// The boss lairs of the world `seed`, one per boss of the roster: `q, r` pairs, lair 0 first (docs/specs/openworld.md section 7).
#[wasm_bindgen]
pub fn world_lairs(seed: u32) -> Vec<i32> {
    world::lairs(u64::from(seed), crate::encounter::boss_ids().len())
        .into_iter()
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

/// The walk of the hero from `(from_q, from_r)` to `(to_q, to_r)` in the world `seed` (docs/specs/openworld.md section 4): `q, r`
/// pairs, the start left out, empty when there is none. `blocked` holds the enemy cells and the lairs, `broken` the obstacles the
/// hero has broken (#1154), both `q, r` pairs.
#[wasm_bindgen]
pub fn world_path(
    seed: u32,
    from_q: i32,
    from_r: i32,
    to_q: i32,
    to_r: i32,
    blocked: Vec<i32>,
    broken: Vec<i32>,
) -> Vec<i32> {
    world::walk_path(
        u64::from(seed),
        (from_q, from_r),
        (to_q, to_r),
        &pairs(&broken),
        &pairs(&blocked),
    )
    .into_iter()
    .flat_map(|(q, r)| [q, r])
    .collect()
}

/// The walk to the nearest tower of the world `seed` (the Dungeon button, #1291) from `(from_q, from_r)`: `beaten` holds the numbers of
/// the lairs beaten (tried last), `blocked` the enemy cells and the lairs, `broken` the broken obstacles (`q, r` pairs). Empty when no
/// tower has a way within the search budget; else `[lair, ...q, r pairs]`: the tower's number, then the cells to walk, the tower's last.
#[wasm_bindgen]
pub fn world_dungeon(
    seed: u32,
    from_q: i32,
    from_r: i32,
    beaten: Vec<i32>,
    blocked: Vec<i32>,
    broken: Vec<i32>,
) -> Vec<i32> {
    let lairs = world::lairs(u64::from(seed), crate::encounter::boss_ids().len());
    let beaten: Vec<usize> = beaten.iter().map(|&k| k as usize).collect();
    let Some((lair, path)) = world::dungeon_walk(
        u64::from(seed),
        (from_q, from_r),
        &lairs,
        &beaten,
        &pairs(&broken),
        &pairs(&blocked),
    ) else {
        return Vec::new();
    };
    std::iter::once(lair as i32)
        .chain(path.into_iter().flat_map(|(q, r)| [q, r]))
        .collect()
}

/// The direction of the hero's step (docs/specs/openworld.md section 4), the index of `DIRECTIONS` (E, W, NE, SW, NW, SE), `-1` for no
/// step: `row` is the row of the hero, `keys` the held arrows (bit 0 up, 1 down, 2 left, 3 right), `yaw` the camera's in radians,
/// `steering` whether the step slides round obstacles (#1137), `free` the bits of the directions whose cell the hero can enter.
#[wasm_bindgen]
pub fn world_step(row: i32, keys: u32, yaw: f64, steering: bool, free: u32) -> i32 {
    worldstep::hero_dir(row, keys as u8, yaw, steering, free as u8).map_or(-1, |dir| dir as i32)
}

/// What the hero's step from `(q, r)` to `(tq, tr)` does: `0` refused, `1` rolls, `2` breaks the obstacle (#1147). `terrain` is the
/// bridge code of the target cell (`-1` or an unknown code: off the world), `occupied` whether an enemy stands on it, `trees_near`
/// whether a tree stands on one of its neighbours.
#[wasm_bindgen]
pub fn world_enter(
    q: i32,
    r: i32,
    tq: i32,
    tr: i32,
    terrain: i32,
    occupied: bool,
    trees_near: bool,
) -> i32 {
    let entry = worldstep::entry(
        (q, r),
        (tq, tr),
        terrain_of_code(terrain),
        occupied,
        trees_near,
    );
    match entry {
        Entry::Refused => 0,
        Entry::Rolls => 1,
        Entry::Breaks => 2,
    }
}

/// The troop after the hero steps from `(q, r)` to `(tq, tr)`: `q, r` pairs, the cell the hero left first.
#[wasm_bindgen]
pub fn world_trail(troop: Vec<i32>, q: i32, r: i32, tq: i32, tr: i32) -> Vec<i32> {
    worldstep::trail(&pairs(&troop), (q, r), (tq, tr))
        .into_iter()
        .flat_map(|(q, r)| [q, r])
        .collect()
}

/// The cells of a flat `q, r` list.
fn cells_of_flat(flat: &[i32]) -> Vec<(i32, i32)> {
    pairs(flat)
}

/// The flat `q, r` list of cells.
fn flat_of(cells: &[(i32, i32)]) -> Vec<i32> {
    cells.iter().flat_map(|&(q, r)| [q, r]).collect()
}

/// The enemies of the Open world fight as the pushes of the troop left them (abalone-core `worldoverlay`). The generated enemies of a
/// chunk come in with each call, so the object holds only what the pushes changed.
#[wasm_bindgen]
pub struct WorldFight {
    overlay: Overlay,
}

#[wasm_bindgen]
impl WorldFight {
    /// A fight with no push.
    #[wasm_bindgen(constructor)]
    pub fn new() -> WorldFight {
        WorldFight {
            overlay: Overlay::new(),
        }
    }

    /// The fight of a save: the generated enemies gone and the enemies on other cells (`q, r` pairs), the number ejected.
    pub fn restore(removed: Vec<i32>, added: Vec<i32>, beaten: u32) -> WorldFight {
        WorldFight {
            overlay: Overlay::from_parts(cells_of_flat(&removed), cells_of_flat(&added), beaten),
        }
    }

    /// Forgets every push.
    pub fn reset(&mut self) {
        self.overlay = Overlay::new();
    }

    /// Hides generated enemies (`q, r` pairs).
    pub fn hide(&mut self, cells: Vec<i32>) {
        self.overlay.hide(&cells_of_flat(&cells));
    }

    /// Whether an enemy stands on `(q, r)`, `generated` being the generated enemies of its chunk.
    pub fn occupied(&self, generated: Vec<i32>, q: i32, r: i32) -> bool {
        self.overlay.occupied(&cells_of_flat(&generated), (q, r))
    }

    /// The enemies on chunk `(cx, cy)` now, `generated` being its generated ones.
    pub fn chunk_enemies(&self, generated: Vec<i32>, cx: i32, cy: i32) -> Vec<i32> {
        flat_of(
            &self
                .overlay
                .chunk_enemies(&cells_of_flat(&generated), (cx, cy)),
        )
    }

    /// Plays a push: the enemies `old` leave, the enemies `new` stand, `ejected` of them are beaten.
    pub fn apply(&mut self, old: Vec<i32>, new: Vec<i32>, ejected: u32) {
        self.overlay
            .apply(&cells_of_flat(&old), &cells_of_flat(&new), ejected as usize);
    }

    /// The generated enemies gone, `q, r` pairs in the order they went.
    pub fn removed(&self) -> Vec<i32> {
        flat_of(self.overlay.removed())
    }

    /// The enemies on other cells, `q, r` pairs in the order they came.
    pub fn added(&self) -> Vec<i32> {
        flat_of(self.overlay.added())
    }

    /// The enemies ejected so far.
    pub fn beaten(&self) -> u32 {
        self.overlay.beaten()
    }
}

impl Default for WorldFight {
    fn default() -> Self {
        Self::new()
    }
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
    fn the_lairs_are_q_r_pairs_that_match_the_core() {
        let flat = world_lairs(7);
        let roster = crate::encounter::boss_ids().len();
        let lairs: Vec<(i32, i32)> = world::lairs(7, roster);
        assert_eq!(flat.len(), 2 * roster);
        assert_eq!(
            flat,
            lairs.iter().flat_map(|&(q, r)| [q, r]).collect::<Vec<_>>()
        );
    }

    #[test]
    fn the_dungeon_walk_is_a_lair_number_then_q_r_pairs_that_match_the_core() {
        let lairs = world_lairs(3);
        let blocked = lairs.clone();
        let flat = world_dungeon(3, 0, 0, vec![], blocked.clone(), vec![]);
        let pairs: Vec<(i32, i32)> = lairs.chunks(2).map(|c| (c[0], c[1])).collect();
        let (lair, path) = world::dungeon_walk(3, (0, 0), &pairs, &[], &[], &pairs).unwrap();
        assert_eq!(flat[0], lair as i32);
        assert_eq!(
            flat[1..],
            path.iter().flat_map(|&(q, r)| [q, r]).collect::<Vec<_>>()
        );
        let walled: Vec<i32> = pairs
            .iter()
            .flat_map(|&(q, r)| {
                [(1, 0), (-1, 0), (1, -1), (-1, 1), (0, -1), (0, 1)]
                    .into_iter()
                    .flat_map(move |(a, b)| [q + a, r + b])
            })
            .collect();
        assert!(world_dungeon(3, 0, 0, vec![], walled, vec![]).is_empty());
        assert_ne!(
            world_dungeon(3, 0, 0, vec![lair as i32], blocked, vec![])[0],
            lair as i32
        );
    }

    #[test]
    fn a_path_is_q_r_pairs_that_match_the_core() {
        assert_eq!(
            world_path(9, 0, 0, 3, 0, vec![], vec![]),
            vec![1, 0, 2, 0, 3, 0]
        );
        let round = world_path(9, 0, 0, 3, 0, vec![1, 0, 2, 0], vec![]);
        assert_eq!(round.len(), 8);
        assert_eq!(round[6..], [3, 0]);
        assert!(world_path(9, 0, 0, 0, 0, vec![], vec![]).is_empty());
    }

    #[test]
    fn an_entry_is_zero_refused_one_rolls_two_breaks() {
        assert_eq!(world_enter(0, 0, 1, 0, 2, false, false), 1); // grass
        assert_eq!(world_enter(0, 0, 1, 0, 5, false, false), 2); // boulder
        assert_eq!(world_enter(0, 0, 1, 0, 6, false, true), 0); // tree in a grove
        assert_eq!(world_enter(0, 0, 1, 0, 0, false, false), 0); // water
        assert_eq!(world_enter(0, 0, 1, 0, 2, true, false), 0); // enemy
        assert_eq!(world_enter(0, 0, 3, 0, 2, false, false), 0); // not a neighbour
        assert_eq!(world_enter(0, 0, 1, 0, -1, false, false), 0); // off the world
        assert_eq!(world_enter(0, 0, 1, 0, 99, false, false), 0); // unknown code
    }

    #[test]
    fn every_terrain_code_gives_its_entry() {
        let codes: Vec<i32> = (0..8)
            .map(|t| world_enter(0, 0, 1, 0, t, false, false))
            .collect();
        assert_eq!(codes, vec![0, 1, 1, 1, 0, 2, 2, 0]);
    }

    #[test]
    fn a_trail_is_the_old_cell_then_the_troop_without_the_new_one() {
        let out = world_trail(vec![1, 0, -1, 0], 0, 0, 1, 0);
        assert_eq!(out, vec![0, 0, -1, 0]);
    }

    #[test]
    fn a_step_is_a_direction_index_or_minus_one() {
        assert_eq!(world_step(0, 8, 0.0, true, 0b11_1111), 0);
        assert_eq!(world_step(0, 8, 0.0, true, 0b11_1110), 2);
        assert_eq!(world_step(0, 0, 0.0, true, 0b11_1111), -1);
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

    #[test]
    fn a_fight_plays_a_push_and_answers_for_the_chunk() {
        let mut fight = WorldFight::new();
        assert!(fight.occupied(vec![1, 0], 1, 0));
        fight.apply(vec![1, 0], vec![2, 0], 1);
        assert!(!fight.occupied(vec![1, 0], 1, 0));
        assert!(fight.occupied(vec![], 2, 0));
        assert_eq!(
            fight.chunk_enemies(vec![1, 0, 5, 5], 0, 0),
            vec![5, 5, 2, 0]
        );
        assert_eq!(fight.removed(), vec![1, 0]);
        assert_eq!(fight.added(), vec![2, 0]);
        assert_eq!(fight.beaten(), 1);
    }

    #[test]
    fn a_fight_hides_resets_and_restores() {
        let mut fight = WorldFight::default();
        fight.hide(vec![1, 0]);
        assert_eq!(fight.removed(), vec![1, 0]);
        fight.reset();
        assert!(fight.removed().is_empty() && fight.beaten() == 0);
        let saved = WorldFight::restore(vec![4, 4, 1, 1], vec![2, 2], 7);
        assert_eq!(saved.removed(), vec![4, 4, 1, 1]);
        assert_eq!(saved.added(), vec![2, 2]);
        assert_eq!(saved.beaten(), 7);
    }
}
