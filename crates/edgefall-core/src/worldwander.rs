//! The wandering of the enemy marbles (docs/specs/openworld.md section 3b, #1511): the generated marbles of a chunk walk a short way
//! from where they start and back, slowly, as one group. The rule is a pure function of the world seed, the chunk, the marbles it
//! starts with and a tick of the clock, so every peer sees the same marbles in the same places. Integers only.

use crate::world::{self, CHUNK};
use crate::worldstep::mix;
use std::cell::OnceCell;

/// A cell, `q, r`.
pub type Cell = (i32, i32);

/// The most cells a chunk's marbles go from where they start.
pub const LEASH: i32 = 3;
/// The length of a tick of the clock in ms: the marbles take one step per tick, slower than the hero (140 ms a cell).
pub const TICK_MS: u32 = 1200;
/// Ticks of one outing: out, a pause, and back (`2 * LEASH + 2`). Every outing starts and ends with the marbles at home.
pub const EPOCH: u32 = 2 * LEASH as u32 + 2;

/// The six steps of the hex grid in the order of the client (E, W, NE, SW, NW, SE).
const STEPS: [Cell; 6] = [(1, 0), (-1, 0), (1, -1), (-1, 1), (0, -1), (0, 1)];
/// Keeps the draws of the walk apart from the other users of the mix.
const SALT: u64 = 0x1511_57A6_D0C5_93B1;

/// The chunk a cell is in.
fn chunk_of((q, r): Cell) -> Cell {
    (q.div_euclid(CHUNK), r.div_euclid(CHUNK))
}

/// How far along its outing a chunk's group is at `tick`, as the offset every marble of the chunk has from its generated cell. Each
/// outing (`EPOCH` ticks) draws a direction and a length up to `LEASH` from the seed, the chunk and the outing alone. The group goes
/// one cell per tick for that many cells (fewer when the way is blocked), stays, and comes back to end the outing at home, so tick 0
/// is at home. A cell the group would take must be in the chunk and not `blocked`, for every marble of `generated` (the chunk's
/// generated marbles, the ones a push moved away too, so the walk never depends on what the troop did).
pub fn offset_with(
    seed: u64,
    chunk: Cell,
    generated: &[Cell],
    tick: u32,
    blocked: &dyn Fn(i32, i32) -> bool,
) -> Cell {
    let (epoch, phase) = (tick / EPOCH, tick % EPOCH);
    let point = (u64::from(chunk.0 as u32) << 32) | u64::from(chunk.1 as u32);
    let draw = mix(seed ^ SALT ^ mix(point) ^ mix(u64::from(epoch)));
    let (dq, dr) = STEPS[(draw % 6) as usize];
    let want = ((draw >> 8) % (LEASH as u64 + 1)) as i32;
    // The group is `phase` cells out on the way out, `EPOCH - phase` on the way back, and no further than it wants to go.
    let reach = want.min(phase as i32).min((EPOCH - phase) as i32);
    let mut steps = 0;
    while steps < reach {
        let k = steps + 1;
        let free = generated.iter().all(|&(q, r)| {
            let at = (q + k * dq, r + k * dr);
            chunk_of(at) == chunk && !blocked(at.0, at.1)
        });
        if !free {
            break;
        }
        steps = k;
    }
    (steps * dq, steps * dr)
}

/// `offset_with` on the terrain of the world `seed`: a cell is blocked when it is off the world or not open ground. The chunk's
/// terrain is only built when the group is out on a walk.
pub fn offset(seed: u64, chunk: Cell, generated: &[Cell], tick: u32) -> Cell {
    let terrain: OnceCell<Box<dyn Fn(i32, i32) -> bool>> = OnceCell::new();
    offset_with(seed, chunk, generated, tick, &|q, r| {
        terrain.get_or_init(|| Box::new(world::chunk_blocked(seed, chunk.0, chunk.1)))(q, r)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world::{self, CHUNK};

    fn chunk_of((q, r): Cell) -> Cell {
        (q.div_euclid(CHUNK), r.div_euclid(CHUNK))
    }

    fn dist((a, b): Cell, (c, d): Cell) -> i32 {
        let (dq, dr) = (a - c, b - d);
        (dq.abs() + dr.abs() + (dq + dr).abs()) / 2
    }

    fn open(_: i32, _: i32) -> bool {
        false
    }

    /// The chunks of the seeds 1 to 4 that hold enemies, with their generated marbles.
    fn chunks() -> Vec<(u64, Cell, Vec<Cell>)> {
        let mut found = Vec::new();
        for seed in 1..=4 {
            for cx in -5..5 {
                for cy in -5..5 {
                    let generated: Vec<Cell> = world::enemy_groups(seed, cx, cy).concat();
                    if !generated.is_empty() {
                        found.push((seed, (cx, cy), generated));
                    }
                }
            }
        }
        found
    }

    #[test]
    fn tick_zero_and_the_start_of_every_outing_are_at_home() {
        for (seed, chunk, generated) in chunks() {
            for epoch in 0..20 {
                assert_eq!(offset(seed, chunk, &generated, epoch * EPOCH), (0, 0));
            }
        }
    }

    #[test]
    fn an_empty_chunk_does_not_move() {
        assert_eq!(offset(3, (0, 0), &[], 5), (0, 0));
    }

    #[test]
    fn a_tick_moves_the_group_one_cell_at_most_and_never_past_the_leash() {
        for (seed, chunk, generated) in chunks() {
            let mut last = (0, 0);
            for tick in 0..200 {
                let now = offset(seed, chunk, &generated, tick);
                assert!(dist(now, last) <= 1, "{seed} {chunk:?} tick {tick}");
                assert!(dist(now, (0, 0)) <= LEASH);
                last = now;
            }
        }
    }

    #[test]
    fn the_group_walks_to_the_leash_in_some_outings_and_stays_in_others() {
        let (mut far, mut still) = (false, false);
        for (seed, chunk, generated) in chunks().into_iter().take(40) {
            for epoch in 0..30 {
                let out = (0..EPOCH)
                    .map(|p| dist(offset(seed, chunk, &generated, epoch * EPOCH + p), (0, 0)))
                    .max()
                    .unwrap();
                far |= out == LEASH;
                still |= out == 0;
            }
        }
        assert!(far && still);
    }

    #[test]
    fn no_marble_ever_stands_off_its_chunk_or_on_water_a_peak_a_wall_a_tree_or_a_boulder() {
        let mut moved = 0;
        for (seed, chunk, generated) in chunks() {
            for tick in 0..120 {
                let (dq, dr) = offset(seed, chunk, &generated, tick);
                moved += usize::from((dq, dr) != (0, 0));
                for &(q, r) in &generated {
                    let at = (q + dq, r + dr);
                    assert_eq!(chunk_of(at), chunk);
                    let cell = world::cell(seed, at.0, at.1).expect("in the world");
                    assert!(
                        !cell.terrain.blocked(),
                        "{seed} {chunk:?} {at:?} {:?}",
                        cell.terrain
                    );
                }
            }
        }
        assert!(moved > 0);
    }

    #[test]
    fn the_offset_is_a_function_of_the_seed_the_chunk_and_the_tick() {
        let (seed, chunk, generated) = chunks().remove(0);
        for tick in 0..50 {
            assert_eq!(
                offset(seed, chunk, &generated, tick),
                offset(seed, chunk, &generated, tick)
            );
        }
        let other: Vec<Cell> = (0..400)
            .map(|tick| offset(seed + 100, chunk, &generated, tick))
            .collect();
        let same: Vec<Cell> = (0..400)
            .map(|tick| offset(seed, chunk, &generated, tick))
            .collect();
        assert_ne!(other, same);
    }

    #[test]
    fn a_blocked_cell_stops_the_group_short_and_a_wall_all_round_keeps_it_home() {
        let generated = [(5, 5), (6, 5)];
        let outings = |blocked: &dyn Fn(i32, i32) -> bool| -> Vec<Cell> {
            (0..400)
                .map(|tick| offset_with(7, (0, 0), &generated, tick, blocked))
                .collect()
        };
        let free = outings(&open);
        assert!(free.iter().any(|&o| dist(o, (0, 0)) == LEASH));
        let near_only = outings(&|q, r| dist((q, r), (5, 5)) > 1 && dist((q, r), (6, 5)) > 1);
        assert!(near_only.iter().all(|&o| dist(o, (0, 0)) <= 1));
        let walled = outings(&|_, _| true);
        assert!(walled.iter().all(|&o| o == (0, 0)));
    }

    #[test]
    fn the_group_stays_in_its_chunk() {
        let generated = [(0, 0), (1, 0)]; // in the corner of chunk (0, 0)
        for tick in 0..400 {
            let (dq, dr) = offset_with(9, (0, 0), &generated, tick, &open);
            for &(q, r) in &generated {
                assert_eq!(chunk_of((q + dq, r + dr)), (0, 0));
            }
        }
    }
}
