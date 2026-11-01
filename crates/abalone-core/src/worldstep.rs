//! The hero's step in the Open world (docs/specs/openworld.md section 4): the held arrows and the camera's yaw give a hex
//! step, and the semi-auto steering (#1137) slides it round an obstacle. Pure maths; the cells that are free come as a mask.

use crate::world::Terrain;
use std::f64::consts::PI;

/// The neighbour steps, the index is the bridge direction code: E, W, NE, SW, NW, SE.
pub const DIRECTIONS: [(i32, i32); 6] = [(1, 0), (-1, 0), (1, -1), (-1, 1), (0, -1), (0, 1)];

/// The bits of the held arrows.
pub const UP: u8 = 1;
pub const DOWN: u8 = 2;
pub const LEFT: u8 = 4;
pub const RIGHT: u8 = 8;

/// The angle of a step on the ground, in radians, from the x axis towards the far side (screen up is the ground at yaw 0).
fn ground_angle((dq, dr): (i32, i32)) -> f64 {
    (-((3f64.sqrt() / 2.0) * f64::from(dr))).atan2(f64::from(dq) + f64::from(dr) / 2.0)
}

/// The gap between two angles in radians, from 0 to pi.
fn gap_of(a: f64, b: f64) -> f64 {
    let d = (a - b).abs() % (2.0 * PI);
    d.min(2.0 * PI - d)
}

/// A gap in nano-radians, so that ties compare equal.
fn nano(gap: f64) -> i64 {
    (gap * 1e9).round() as i64
}

/// The screen direction of the held arrows (x right, y up), `None` for no arrow or for opposite arrows.
fn screen(keys: u8) -> Option<(i32, i32)> {
    let has = |bit| i32::from(keys & bit != 0);
    let (x, y) = (has(RIGHT) - has(LEFT), has(UP) - has(DOWN));
    let opposed = (keys & UP != 0 && keys & DOWN != 0) || (keys & LEFT != 0 && keys & RIGHT != 0);
    (keys & (UP | DOWN | LEFT | RIGHT) != 0 && !opposed).then_some((x, y))
}

/// The direction the keyboard takes at yaw 0, the tie-break: left and right roll along the row, up and down zigzag with the row.
fn keyboard_dir(at_r: i32, keys: u8) -> usize {
    let odd = at_r.rem_euclid(2) == 1;
    match (
        keys & UP != 0,
        keys & DOWN != 0,
        keys & LEFT != 0,
        keys & RIGHT != 0,
    ) {
        (true, _, true, _) => 4,
        (true, _, _, true) => 2,
        (_, true, true, _) => 3,
        (_, true, _, true) => 5,
        (true, ..) => {
            if odd {
                4
            } else {
                2
            }
        }
        (_, true, ..) => {
            if odd {
                3
            } else {
                5
            }
        }
        (_, _, true, _) => 1,
        _ => 0,
    }
}

/// The direction of the held arrows in the yaw of the camera: the neighbour the camera shows nearest to the arrows, a tie going
/// to the step the keyboard takes at yaw 0. `None` for no arrow or for opposite arrows. `want` is the intent's ground angle.
fn straight(at_r: i32, keys: u8, yaw: f64) -> Option<(usize, f64)> {
    let (x, y) = screen(keys)?;
    let want = f64::from(y).atan2(f64::from(x)) + yaw;
    let fallback = ground_angle(DIRECTIONS[keyboard_dir(at_r, keys)]);
    // Left or Right alone breaks a tie toward the neighbour that leans up on the screen (#1273).
    let sideways = keys == LEFT || keys == RIGHT;
    let score = |i: usize| {
        let angle = ground_angle(DIRECTIONS[i]);
        let tie = if sideways {
            -(angle - yaw).sin()
        } else {
            gap_of(angle, fallback)
        };
        (nano(gap_of(angle, want)), nano(tie))
    };
    let best = (1..6).fold(0, |best, i| if score(i) < score(best) { i } else { best });
    Some((best, want))
}

/// The direction index of the hero's step from a cell on row `at_r`, `None` for no intent. Without `steering` it is the straight
/// direction. With it, a straight direction whose bit is not in `free` goes to the free one of its two side neighbours (60 degrees
/// off) that the intent follows best, a tie going to the lower index; the straight one when none is free.
pub fn hero_dir(at_r: i32, keys: u8, yaw: f64, steering: bool, free: u8) -> Option<usize> {
    let (ahead, want) = straight(at_r, keys, yaw)?;
    if !steering || free & (1 << ahead) != 0 {
        return Some(ahead);
    }
    let ahead_angle = ground_angle(DIRECTIONS[ahead]);
    let mut best = (ahead, i64::MAX);
    for (i, dir) in DIRECTIONS.iter().enumerate() {
        let side = (gap_of(ground_angle(*dir), ahead_angle) - PI / 3.0).abs() < 1e-6;
        let gap = nano(gap_of(ground_angle(*dir), want));
        if side && gap < best.1 && free & (1 << i) != 0 {
            best = (i, gap);
        }
    }
    Some(best.0)
}

/// How many marbles follow the hero.
pub const TROOP: usize = 6;

/// What the hero's step onto a cell does.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Entry {
    /// The step is refused.
    Refused,
    /// The hero rolls onto an open cell.
    Rolls,
    /// The hero rolls onto an obstacle and breaks it (#1147).
    Breaks,
}

/// What the hero's step from `at` to `to` does, `terrain` being that of `to` (`None` off the world), `occupied` whether an enemy
/// stands on it and `trees_near` whether a tree stands on one of its six neighbours.
pub fn entry(
    at: (i32, i32),
    to: (i32, i32),
    terrain: Option<Terrain>,
    occupied: bool,
    trees_near: bool,
) -> Entry {
    todo!()
}

/// The troop after the hero steps from `at` to `to`: the cell the hero left first, then the marbles before, none on `to`, at most `TROOP`.
pub fn trail(troop: &[(i32, i32)], at: (i32, i32), to: (i32, i32)) -> Vec<(i32, i32)> {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;

    const E: usize = 0;
    const NE: usize = 2;
    const NW: usize = 4;
    const SE: usize = 5;
    const ALL: u8 = 0b11_1111;
    fn except(dirs: &[usize]) -> u8 {
        dirs.iter().fold(ALL, |m, d| m & !(1 << d))
    }

    #[test]
    fn at_yaw_zero_a_single_arrow_is_the_step_of_the_keyboard_on_every_row() {
        for (r, up, down) in [(0, NE, SE), (1, NW, 3), (-3, NW, 3), (2, NE, SE)] {
            assert_eq!(hero_dir(r, UP, 0.0, false, ALL), Some(up));
            assert_eq!(hero_dir(r, DOWN, 0.0, false, ALL), Some(down));
            assert_eq!(hero_dir(r, LEFT, 0.0, false, ALL), Some(1));
            assert_eq!(hero_dir(r, RIGHT, 0.0, false, ALL), Some(E));
        }
    }

    #[test]
    fn at_yaw_zero_a_diagonal_of_two_arrows_is_the_diagonal_of_the_grid() {
        assert_eq!(hero_dir(0, UP | LEFT, 0.0, false, ALL), Some(NW));
        assert_eq!(hero_dir(1, UP | RIGHT, 0.0, false, ALL), Some(NE));
        assert_eq!(hero_dir(0, DOWN | LEFT, 0.0, false, ALL), Some(3));
        assert_eq!(hero_dir(1, DOWN | RIGHT, 0.0, false, ALL), Some(SE));
    }

    #[test]
    fn no_arrow_or_opposite_arrows_give_no_step() {
        for keys in [0, UP | DOWN, LEFT | RIGHT, 16] {
            assert_eq!(hero_dir(0, keys, 0.5, true, ALL), None);
        }
    }

    #[test]
    fn the_camera_yaw_turns_the_step_to_the_neighbour_it_shows_nearest() {
        // A quarter turn (60 degrees) of the camera moves the east arrow to the next neighbour round the cell.
        assert_eq!(hero_dir(0, RIGHT, PI / 3.0, false, ALL), Some(NE));
        assert_eq!(hero_dir(0, RIGHT, -PI / 3.0, false, ALL), Some(SE));
        assert_eq!(hero_dir(0, RIGHT, PI, false, ALL), Some(1));
    }

    #[test]
    fn steering_takes_the_straight_cell_when_it_is_free() {
        assert_eq!(hero_dir(0, RIGHT, 0.0, true, ALL), Some(E));
    }

    #[test]
    fn steering_goes_round_a_rock_ahead_by_the_free_side_the_first_when_both_are_free() {
        assert_eq!(hero_dir(0, RIGHT, 0.0, true, except(&[E])), Some(NE));
        assert_eq!(hero_dir(0, RIGHT, 0.0, true, except(&[E, NE])), Some(SE));
        assert_eq!(hero_dir(0, RIGHT, 0.0, true, except(&[E, SE])), Some(NE));
    }

    #[test]
    fn steering_slides_to_the_side_the_intent_follows_best() {
        assert_eq!(hero_dir(0, RIGHT | UP, 0.0, true, except(&[NE])), Some(E));
        assert_eq!(
            hero_dir(0, RIGHT | UP, 0.0, true, except(&[NE, E])),
            Some(NW)
        );
    }

    #[test]
    fn steering_gives_the_blocked_straight_cell_in_a_dead_end() {
        assert_eq!(hero_dir(0, RIGHT, 0.0, true, except(&[E, NE, SE])), Some(E));
    }

    #[test]
    fn without_steering_a_blocked_straight_cell_is_still_the_step() {
        assert_eq!(hero_dir(0, RIGHT, 0.0, false, except(&[E])), Some(E));
    }

    #[test]
    fn steering_never_steps_back() {
        // Only the cells behind and the NW side are free: the hero stays on its straight, blocked cell.
        assert_eq!(hero_dir(0, RIGHT, 0.0, true, 1 << NW | 1 << 1), Some(E));
    }

    /// The ground angle of a direction index, for the tests of the lean.
    fn angle(i: usize) -> f64 {
        ground_angle(DIRECTIONS[i])
    }

    #[test]
    fn left_and_right_alone_both_lean_forward_up_on_the_screen_at_each_resting_angle() {
        for k in 0..6 {
            let yaw = -PI / 6.0 + f64::from(k) * PI / 3.0;
            for r in [0, 1, -3, 2] {
                let left = hero_dir(r, LEFT, yaw, false, ALL).unwrap();
                let right = hero_dir(r, RIGHT, yaw, false, ALL).unwrap();
                assert!((angle(left) - yaw).sin() > 0.49, "left {k} {r}");
                assert!((angle(right) - yaw).sin() > 0.49, "right {k} {r}");
                assert!((angle(left) - yaw).cos() < 0.0);
                assert!((angle(right) - yaw).cos() > 0.0);
            }
        }
    }

    #[test]
    fn down_with_left_or_right_still_steps_back_at_the_resting_angles() {
        for k in 0..6 {
            let yaw = -PI / 6.0 + f64::from(k) * PI / 3.0;
            for key in [LEFT, RIGHT] {
                let to = hero_dir(0, DOWN | key, yaw, false, ALL).unwrap();
                assert!((angle(to) - yaw).sin() < 0.0);
            }
        }
    }

    #[test]
    fn a_neighbour_of_open_ground_free_of_enemies_is_rolled_onto() {
        for terrain in [Terrain::Sand, Terrain::Grass, Terrain::Rock] {
            assert_eq!(entry((0, 0), (1, 0), Some(terrain), false, false), Entry::Rolls);
        }
        for to in DIRECTIONS {
            assert_eq!(entry((2, 3), (2 + to.0, 3 + to.1), Some(Terrain::Grass), false, true), Entry::Rolls);
        }
    }

    #[test]
    fn a_cell_that_is_not_a_neighbour_is_refused() {
        for to in [(0, 0), (2, 0), (1, 1), (-1, -1), (5, 5)] {
            assert_eq!(entry((0, 0), to, Some(Terrain::Grass), false, false), Entry::Refused);
        }
    }

    #[test]
    fn off_the_world_or_under_an_enemy_is_refused_even_for_a_boulder() {
        assert_eq!(entry((0, 0), (1, 0), None, false, false), Entry::Refused);
        assert_eq!(entry((0, 0), (1, 0), Some(Terrain::Grass), true, false), Entry::Refused);
        assert_eq!(entry((0, 0), (1, 0), Some(Terrain::Boulder), true, false), Entry::Refused);
    }

    #[test]
    fn a_boulder_and_a_lone_tree_are_broken_and_nothing_else_blocked() {
        assert_eq!(entry((0, 0), (1, 0), Some(Terrain::Boulder), false, true), Entry::Breaks);
        assert_eq!(entry((0, 0), (1, 0), Some(Terrain::Tree), false, false), Entry::Breaks);
        assert_eq!(entry((0, 0), (1, 0), Some(Terrain::Tree), false, true), Entry::Refused);
        for terrain in [Terrain::Water, Terrain::Peak, Terrain::Wall] {
            assert_eq!(entry((0, 0), (1, 0), Some(terrain), false, false), Entry::Refused);
        }
    }

    #[test]
    fn the_troop_trails_the_hero_and_stays_at_six() {
        let around = [(1, 0), (-1, 0), (1, -1), (-1, 1), (0, -1), (0, 1)];
        let mut troop = around.to_vec();
        let mut at = (0, 0);
        for to in [(1, 0), (1, -1), (1, -2), (1, -3)] {
            troop = trail(&troop, at, to);
            at = to;
        }
        assert_eq!(troop.len(), TROOP);
        assert_eq!(troop[..4], [(1, -2), (1, -1), (1, 0), (0, 0)]);
    }

    #[test]
    fn rolling_onto_a_marble_takes_it_out_of_the_troop() {
        let troop = [(1, 0), (-1, 0), (1, -1), (-1, 1), (0, -1), (0, 1)];
        let after = trail(&troop, (0, 0), (1, 0));
        assert_eq!(after, [(0, 0), (-1, 0), (1, -1), (-1, 1), (0, -1), (0, 1)]);
    }

    #[test]
    fn a_short_troop_grows_to_the_hero_trail() {
        assert_eq!(trail(&[], (0, 0), (1, 0)), [(0, 0)]);
    }
}
