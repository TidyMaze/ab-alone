//! Hull breach: from round 12, a ring of the arena cracks at the end of a round and goes void
//! at the end of the next one, with the marbles on it (rules.md section 10.4).

use super::{seat_of, Royale};

/// Round at the end of which each ring (radius) cracks: every 6 rounds from round 12 down to
/// radius 3, then ring 2, the last one around the hole, so every game ends by round 46.
const SCHEDULE: [(u32, i32); 7] = [
    (12, 8),
    (18, 7),
    (24, 6),
    (30, 5),
    (36, 4),
    (42, 3),
    (45, 2),
];

/// Ring that cracks at the end of `round`, if any.
fn cracking_ring(round: u32) -> Option<i32> {
    SCHEDULE
        .iter()
        .find(|&&(at, _)| at == round)
        .map(|&(_, ring)| ring)
}

impl Royale {
    /// End of a round: the cracked cells go void with their marbles, each credited to its last
    /// toucher unless that is its owner, and the seats left with none go out. Then the
    /// scheduled ring cracks, readable in `board().cracks()` one round before it voids.
    pub(super) fn breach(&mut self) {
        let cracked = self.board.cracks().to_vec();
        if !cracked.is_empty() {
            let mut lost = vec![0; self.seats];
            for ((q, r), _) in cracked {
                if let Some(owner) = self.board.get(q, r).and_then(seat_of) {
                    lost[owner] += 1;
                    if let Some(toucher) = self.touched.get(&(q, r)).filter(|&&t| t != owner) {
                        self.ejections[*toucher] += 1;
                    }
                }
                self.touched.remove(&(q, r));
                self.board.void(q, r);
            }
            // The seats this void puts out, worst first: a tie on the breach rule shares a place.
            let key = |s: usize| (lost[s], self.ejections[s]);
            let mut out: Vec<usize> = (0..self.seats)
                .filter(|&s| lost[s] > 0 && self.is_out(s))
                .collect();
            out.sort_by_key(|&s| key(s));
            for group in out.chunk_by(|&a, &b| key(a) == key(b)) {
                self.eliminated.push(group.to_vec());
            }
            self.last_void = lost;
        }
        let radius = self.board.radius();
        let cracks = cracking_ring(self.round).map_or(Vec::new(), |ring| {
            (-radius..=radius)
                .flat_map(|q| (-radius..=radius).map(move |r| (q, r)))
                .filter(|&(q, r)| q.abs().max(r.abs()).max((q + r).abs()) == ring)
                .filter(|&(q, r)| self.board.get(q, r).is_some())
                .map(|c| (c, 1))
                .collect()
        });
        self.board.set_cracks(cracks);
    }

    /// Seats sharing first place once the game is over, `None` while two seats or more have
    /// marbles. The last seat with marbles wins. When a void takes the last marbles of every
    /// seat left, the most marbles held before it wins, then the most ejections credited; a tie
    /// still standing shares the place.
    pub fn winners(&self) -> Option<Vec<usize>> {
        let left: Vec<usize> = (0..self.seats).filter(|&s| !self.is_out(s)).collect();
        if left.len() > 1 {
            return None;
        }
        if !left.is_empty() {
            return Some(left);
        }
        let key = |s: usize| (self.last_void[s], self.ejections[s]);
        let best = (0..self.seats).map(key).max();
        Some((0..self.seats).filter(|&s| Some(key(s)) == best).collect())
    }

    /// The game is over: at most one seat has marbles. No round can be resolved any more.
    pub fn is_over(&self) -> bool {
        self.winners().is_some()
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::super::{resolve_round, seat_cell, start, Royale, RoyaleError};
    use super::*;
    use crate::board::{Board, MAX_RADIUS};

    type P = (i32, i32);

    /// A royale of `seats` seats on the radius 8 arena with only the listed marbles, at `round`.
    fn arena(seats: usize, round: u32, marbles: &[(P, usize)]) -> Royale {
        let mut board = Board::with_radius(MAX_RADIUS);
        for &((q, r), seat) in marbles {
            board.set(q, r, seat_cell(seat));
        }
        Royale {
            board,
            seats,
            round,
            ejections: vec![0; seats],
            touched: BTreeMap::new(),
            last_void: vec![0; seats],
            eliminated: Vec::new(),
        }
    }

    /// Plays one round where every seat holds.
    fn hold(s: &Royale) -> Royale {
        resolve_round(s, &[]).unwrap().0
    }

    fn distance((q, r): P) -> i32 {
        q.abs().max(r.abs()).max((q + r).abs())
    }

    fn cells(s: &Royale) -> Vec<P> {
        (-MAX_RADIUS..=MAX_RADIUS)
            .flat_map(|q| (-MAX_RADIUS..=MAX_RADIUS).map(move |r| (q, r)))
            .filter(|&(q, r)| s.board().get(q, r).is_some())
            .collect()
    }

    /// Every cell of ring `radius`, each with 1 round left.
    fn cracked_ring(radius: i32) -> Vec<(P, u8)> {
        cells(&start(3).unwrap())
            .into_iter()
            .filter(|&c| distance(c) == radius)
            .map(|c| (c, 1))
            .collect()
    }

    #[test]
    fn the_schedule_cracks_a_ring_every_6_rounds_then_every_3_down_to_ring_2() {
        let schedule = [
            (12, 8),
            (18, 7),
            (24, 6),
            (30, 5),
            (36, 4),
            (42, 3),
            (45, 2),
        ];
        for round in 1..=60 {
            let expected = schedule
                .iter()
                .find(|&&(at, _)| at == round)
                .map(|&(_, ring)| ring);
            assert_eq!(cracking_ring(round), expected, "round {round}");
        }
    }

    #[test]
    fn rounds_11_12_13_and_18_of_a_held_game() {
        let mut s = start(6).unwrap();
        for _ in 1..=11 {
            s = hold(&s);
        }
        // After round 11: nothing cracked yet.
        assert_eq!(s.round(), 12);
        assert!(s.board().cracks().is_empty());
        assert_eq!(cells(&s).len(), 210);
        // After round 12: the radius 8 ring is cracked, readable one round before it voids.
        s = hold(&s);
        assert_eq!(s.board().cracks(), cracked_ring(8));
        assert_eq!(s.board().cracks().len(), 48);
        assert_eq!(cells(&s).len(), 210);
        assert!((0..6).all(|seat| s.marbles(seat) == 10));
        // After round 13: the ring is void with its marbles, nobody touched them: no credit.
        s = hold(&s);
        assert!(s.board().cracks().is_empty());
        assert_eq!(cells(&s).len(), 162);
        assert!(cells(&s).iter().all(|&c| (2..=7).contains(&distance(c))));
        assert!((0..6).all(|seat| s.marbles(seat) == 7 && s.ejections(seat) == 0));
        assert_eq!(s.last_void, vec![3; 6]);
        for _ in 14..=17 {
            s = hold(&s);
        }
        assert!(s.board().cracks().is_empty());
        // After round 18: the radius 7 ring is cracked.
        s = hold(&s);
        assert_eq!(s.board().cracks(), cracked_ring(7));
        s = hold(&s);
        assert_eq!(cells(&s).len(), 120);
        assert!((0..6).all(|seat| s.marbles(seat) == 3));
    }

    #[test]
    fn below_radius_3_a_ring_cracks_every_3_rounds_and_ring_2_ends_the_game() {
        let mut s = arena(
            3,
            42,
            &[((2, 0), 0), ((-2, 0), 0), ((0, 2), 1), ((0, -2), 2)],
        );
        // Rings 8 to 4 are already void, and so is the hole.
        for c in cells(&s) {
            if distance(c) > 3 || distance(c) < 2 {
                s.board.void(c.0, c.1);
            }
        }
        let mut cracks = Vec::new();
        let mut left = Vec::new();
        for round in 42..=46 {
            assert_eq!(s.winners(), None, "round {round}");
            s = hold(&s);
            cracks.push(s.board().cracks().to_vec());
            left.push(cells(&s).len());
        }
        assert_eq!(
            cracks,
            [cracked_ring(3), vec![], vec![], cracked_ring(2), vec![]]
        );
        assert_eq!(left, [30, 12, 12, 12, 0]);
        // Ring 2 took every marble left: seat 0 held the most and wins.
        assert_eq!(s.round(), 47);
        assert!((0..3).all(|seat| s.is_out(seat)));
        assert_eq!(s.last_void, [2, 1, 1]);
        assert_eq!(s.winners(), Some(vec![0]));
        assert!(s.is_over());
        assert_eq!(resolve_round(&s, &[]), Err(RoyaleError::Over));
    }

    #[test]
    fn a_voided_marble_is_credited_to_its_last_toucher_unless_it_is_the_owner() {
        let mut s = arena(
            3,
            12,
            &[
                ((8, 0), 0),
                ((8, -1), 1),
                ((8, -2), 2),
                ((0, 0), 0),
                ((1, 0), 1),
                ((2, 0), 2),
            ],
        );
        s.touched.insert((8, 0), 1);
        s.touched.insert((8, -1), 1);
        s.touched.insert((1, 0), 0);
        s = hold(&hold(&s));
        assert_eq!(
            (0..3).map(|seat| s.ejections(seat)).collect::<Vec<_>>(),
            [0, 1, 0]
        );
        assert_eq!(s.last_toucher(8, 0), None);
        assert_eq!(s.last_toucher(8, -1), None);
        assert_eq!(s.last_toucher(1, 0), Some(0), "off the ring, kept");
        assert_eq!(s.last_void, [1, 1, 1]);
        assert!((0..3).all(|seat| s.marbles(seat) == 1));
    }

    /// Seats 0 and 1 have 2 marbles on the radius 8 ring, seat 2 has 1: the void at the end
    /// of round 13 takes them all.
    fn last_void() -> Royale {
        arena(
            3,
            12,
            &[
                ((8, 0), 0),
                ((8, -1), 0),
                ((0, 8), 1),
                ((1, 7), 1),
                ((-8, 0), 2),
            ],
        )
    }

    #[test]
    fn a_void_that_takes_everyone_ranks_by_marbles_held_then_ejections() {
        let s = last_void();
        assert_eq!(s.winners(), None);
        assert!(!s.is_over());
        // A tie on marbles and ejections shares the place.
        let end = hold(&hold(&s));
        assert!((0..3).all(|seat| end.is_out(seat)));
        assert_eq!(end.last_void, [2, 2, 1]);
        assert_eq!(end.winners(), Some(vec![0, 1]));
        assert!(end.is_over());
        assert_eq!(resolve_round(&end, &[]), Err(RoyaleError::Over));
        // More ejections break the tie on marbles.
        let mut s1 = s.clone();
        s1.ejections[1] = 1;
        assert_eq!(hold(&hold(&s1)).winners(), Some(vec![1]));
        // The credits of the void itself count.
        let mut s0 = s.clone();
        s0.touched.insert((-8, 0), 0);
        let end = hold(&hold(&s0));
        assert_eq!(end.ejections(0), 1);
        assert_eq!(end.winners(), Some(vec![0]));
        // Seat 2 has the most ejections but the fewest marbles held.
        let mut s2 = s;
        s2.ejections[2] = 5;
        assert_eq!(hold(&hold(&s2)).winners(), Some(vec![0, 1]));
    }
}
