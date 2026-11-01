//! The hero's step in the Open world (docs/specs/openworld.md section 4): the held arrows and the camera's yaw give a hex
//! step, and the semi-auto steering (#1137) slides it round an obstacle. Pure maths; the cells that are free come as a mask.

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
    let score = |i: usize| {
        (
            nano(gap_of(ground_angle(DIRECTIONS[i]), want)),
            nano(gap_of(ground_angle(DIRECTIONS[i]), fallback)),
        )
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
}
