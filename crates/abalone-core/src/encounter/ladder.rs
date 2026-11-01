//! Bot ladder (docs/specs/game-design.md section 8): a seeded alpha-beta bot plays one boss and
//! the attempts are aggregated into telemetry. The player bot is the plain node-limited search of
//! `search.rs`; the boss plays with its own node budget, never a clock, so a run is the same on
//! every machine. The ladder is slow: it runs from `cargo run --release --example ladder`, never
//! from the unit tests beyond a tiny run.

use crate::board::{Board, Cell};
use crate::encounter::alien::{alien_move, alien_start, ALIEN_NODE_BUDGET};
use crate::encounter::assembly::{
    assembly_move, assembly_search, assembly_start, ASSEMBLY_NODE_BUDGET,
};
use crate::encounter::ballast::{ballast_move, ballast_search, ballast_start, BALLAST_NODE_BUDGET};
use crate::encounter::chaplain::{chaplain_boss, chaplain_move, chaplain_step, chaplain_tell};
use crate::encounter::choir::Choir;
use crate::encounter::dual::{dual_move, dual_start, dual_step, DUAL_NODE_BUDGET};
use crate::encounter::echo::{echo_boss, echo_free_moves, echo_move, echo_search, echo_start};
use crate::encounter::hull::{hull_boss, hull_move};
use crate::encounter::magnetizer::{magnetizer_boss, magnetizer_move};
use crate::encounter::overseer::{overseer_move, overseer_start, OVERSEER_NODE_BUDGET};
use crate::encounter::pulsar::{pulsar_move, pulsar_start, PULSAR_NODE_BUDGET};
use crate::encounter::railyard::{railyard_move, railyard_start, RAILYARD_NODE_BUDGET};
use crate::encounter::stalker::{refuse, stalker_start, STALKER_NODE_BUDGET};
use crate::encounter::swarm::{Swarm, SWARM_NODE_BUDGET};
use crate::encounter::telemetry::{
    classify_death, summarize, AttemptRecord, AttemptResult, DeathCause, Losses, Summary,
};
use crate::encounter::unstable::{unstable_move, unstable_start, UNSTABLE_NODE_BUDGET};
use crate::encounter::{marbles, Encounter, PveResult};
use crate::game::{Game, Outcome};
use crate::moves::{apply, legal_moves, Move, Player};
use crate::search::{search_hooked, search_with, DEFAULT_WEIGHTS};

/// A game longer than this many plies is stopped and counted as a loss.
pub const PLY_CAP: u32 = 300;
/// The first player moves of an attempt are random (seeded), so the seeds give different games
/// against a deterministic boss.
pub const OPENING_RANDOM_MOVES: u32 = 2;

/// The bosses the ladder can play.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LadderBoss {
    Echo,
    Hull,
    Chaplain,
    Choir,
    Ballast,
    Alien,
    Overseer,
    Dual,
    RailYard,
    Stalker,
    Swarm,
    Magnetizer,
    Pulsar,
    Assembly,
    Unstable,
}

impl LadderBoss {
    pub const ALL: [LadderBoss; 15] = [
        LadderBoss::Echo,
        LadderBoss::Hull,
        LadderBoss::Chaplain,
        LadderBoss::Choir,
        LadderBoss::Ballast,
        LadderBoss::Alien,
        LadderBoss::Overseer,
        LadderBoss::Dual,
        LadderBoss::RailYard,
        LadderBoss::Stalker,
        LadderBoss::Swarm,
        LadderBoss::Magnetizer,
        LadderBoss::Pulsar,
        LadderBoss::Assembly,
        LadderBoss::Unstable,
    ];

    /// Stable id used in the telemetry.
    pub fn id(self) -> &'static str {
        match self {
            LadderBoss::Echo => "echo",
            LadderBoss::Hull => "hull",
            LadderBoss::Chaplain => "chaplain",
            LadderBoss::Choir => "choir",
            LadderBoss::Ballast => "ballast",
            LadderBoss::Alien => "alien",
            LadderBoss::Overseer => "overseer",
            LadderBoss::Dual => "dual",
            LadderBoss::RailYard => "railyard",
            LadderBoss::Stalker => "stalker",
            LadderBoss::Swarm => "swarm",
            LadderBoss::Magnetizer => "magnetizer",
            LadderBoss::Pulsar => "pulsar",
            LadderBoss::Assembly => "assembly",
            LadderBoss::Unstable => "unstable",
        }
    }

    /// The boss with this stable id.
    pub fn from_id(id: &str) -> Option<LadderBoss> {
        LadderBoss::ALL.into_iter().find(|b| b.id() == id)
    }

    /// The boss search budget, the unit of the player budgets.
    pub fn node_budget(self) -> u32 {
        match self {
            LadderBoss::Echo => echo_boss().node_budget,
            LadderBoss::Hull => hull_boss().node_budget,
            LadderBoss::Chaplain => chaplain_boss().node_budget,
            LadderBoss::Choir => crate::encounter::choir::CHOIR_NODE_BUDGET,
            LadderBoss::Ballast => BALLAST_NODE_BUDGET,
            LadderBoss::Alien => ALIEN_NODE_BUDGET,
            LadderBoss::Overseer => OVERSEER_NODE_BUDGET,
            LadderBoss::Dual => DUAL_NODE_BUDGET,
            LadderBoss::RailYard => RAILYARD_NODE_BUDGET,
            LadderBoss::Stalker => STALKER_NODE_BUDGET,
            LadderBoss::Swarm => SWARM_NODE_BUDGET,
            LadderBoss::Magnetizer => magnetizer_boss().node_budget,
            LadderBoss::Pulsar => PULSAR_NODE_BUDGET,
            LadderBoss::Assembly => ASSEMBLY_NODE_BUDGET,
            LadderBoss::Unstable => UNSTABLE_NODE_BUDGET,
        }
    }
}

/// Player node budgets of the ladder: 4x, 1x and 0.5x of the boss budget.
pub fn player_budgets(boss: LadderBoss) -> [u32; 3] {
    let b = boss.node_budget();
    [b * 4, b, b / 2]
}

/// A running encounter, whichever boss it is.
enum Arena {
    Plain(Encounter, LadderBoss),
    Choir(Choir),
    Swarm(Swarm),
}

impl Arena {
    fn new(boss: LadderBoss, seed: u64) -> Self {
        let plain = |def| Arena::Plain(Encounter::new(Game::new(), def, seed), boss);
        match boss {
            LadderBoss::Ballast => Arena::Plain(ballast_start(seed), boss),
            LadderBoss::Alien => Arena::Plain(alien_start(seed), boss),
            LadderBoss::Overseer => Arena::Plain(overseer_start(seed), boss),
            LadderBoss::Echo => Arena::Plain(echo_start(seed), boss),
            LadderBoss::Dual => Arena::Plain(dual_start(seed), boss),
            LadderBoss::RailYard => Arena::Plain(railyard_start(seed), boss),
            LadderBoss::Stalker => Arena::Plain(stalker_start(seed), boss),
            LadderBoss::Pulsar => Arena::Plain(pulsar_start(seed), boss),
            LadderBoss::Assembly => Arena::Plain(assembly_start(seed), boss),
            LadderBoss::Unstable => Arena::Plain(unstable_start(seed), boss),
            LadderBoss::Magnetizer => plain(magnetizer_boss()),
            LadderBoss::Hull => plain(hull_boss()),
            LadderBoss::Chaplain => plain(chaplain_boss()),
            LadderBoss::Choir => Arena::Choir(Choir::start(seed)),
            LadderBoss::Swarm => Arena::Swarm(Swarm::start(seed)),
        }
    }

    fn kind(&self) -> LadderBoss {
        match self {
            Arena::Plain(_, kind) => *kind,
            Arena::Choir(_) => LadderBoss::Choir,
            Arena::Swarm(_) => LadderBoss::Swarm,
        }
    }

    fn game(&self) -> &Game {
        match self {
            Arena::Plain(enc, _) => enc.game(),
            Arena::Choir(choir) => choir.game(),
            Arena::Swarm(swarm) => swarm.game(),
        }
    }

    fn phase(&self) -> usize {
        match self {
            Arena::Plain(enc, _) => enc.phase(),
            Arena::Choir(choir) => choir.phase(),
            Arena::Swarm(swarm) => swarm.phase(),
        }
    }

    fn result(&self) -> Option<PveResult> {
        match self {
            Arena::Plain(enc, _) => enc.result(),
            Arena::Choir(choir) => choir.result(),
            Arena::Swarm(swarm) => swarm.result(),
        }
    }

    fn boss_move(&self) -> Option<Move> {
        match self {
            Arena::Plain(enc, LadderBoss::Echo) => echo_move(enc),
            Arena::Plain(enc, LadderBoss::Alien) => alien_move(enc),
            Arena::Plain(enc, LadderBoss::Overseer) => overseer_move(enc),
            Arena::Plain(enc, LadderBoss::Chaplain) => chaplain_move(enc),
            Arena::Plain(enc, LadderBoss::Hull) => hull_move(enc),
            Arena::Plain(enc, LadderBoss::Dual) => dual_move(enc),
            Arena::Plain(enc, LadderBoss::RailYard) => railyard_move(enc),
            Arena::Plain(enc, LadderBoss::Magnetizer) => magnetizer_move(enc),
            Arena::Plain(enc, LadderBoss::Pulsar) => pulsar_move(enc),
            Arena::Plain(enc, LadderBoss::Assembly) => assembly_move(enc),
            Arena::Plain(enc, LadderBoss::Unstable) => unstable_move(enc),
            Arena::Plain(enc, LadderBoss::Stalker) => enc.boss_search().map(|r| r.mv),
            // The Ballast Mind: the Choir is never plain.
            Arena::Plain(enc, _) => ballast_move(enc),
            Arena::Choir(choir) => choir.boss_move(),
            Arena::Swarm(swarm) => swarm.boss_move(),
        }
    }

    /// `true` when the tell the player reads on hover shows no harm from `mv`: no player marble
    /// flips if the boss then passes (the Chaplain's conversion tell), no draw after the Echo's
    /// bonus mirrors (its ghost). Other bosses have no such tell.
    fn tell_safe(&self, mv: &Move) -> bool {
        let Arena::Plain(enc, boss) = self else {
            return true;
        };
        let mut after = enc.clone();
        match boss {
            LadderBoss::Chaplain => after
                .play(mv)
                .is_ok_and(|()| chaplain_tell(&after).is_empty()),
            LadderBoss::Echo => after
                .play(mv)
                .is_ok_and(|()| after.game().outcome() != Some(Outcome::Draw)),
            _ => true,
        }
    }

    /// `true` when the Stalker's fog refuses `mv` for a hidden blocker, which is then revealed:
    /// the pro picks again on the board as it now sees it.
    fn refused(&mut self, mv: &Move) -> bool {
        match self {
            Arena::Plain(enc, LadderBoss::Stalker) => refuse(enc, mv).is_err(),
            _ => false,
        }
    }

    fn play(&mut self, mv: &Move) -> Result<(), String> {
        match self {
            Arena::Plain(enc, _) => enc.play(mv).map_err(|e| format!("{e:?}")),
            Arena::Choir(choir) => choir.play(mv).map_err(|e| format!("{e:?}")),
            Arena::Swarm(swarm) => swarm.play(mv).map_err(|e| format!("{e:?}")),
        }
    }
}

/// splitmix64: a cheap seeded hash, enough to pick an opening move.
fn mix(mut x: u64) -> u64 {
    x = x.wrapping_add(0x9E37_79B9_7F4A_7C15);
    x = (x ^ (x >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    x = (x ^ (x >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    x ^ (x >> 31)
}

/// The player bot move: a seeded random legal move for its first `opening` moves, then the
/// alpha-beta search with `budget` nodes. It plays like a pro who knows draws are losses and reads
/// the tells: it avoids a position it has already seen and a move that leaves a marble to flip,
/// takes the Echo's safe free moves that eject and never plays another free move, and plays the
/// plain search when no move is left. Against the Chaplain, the Ballast Mind and the Assembly Line
/// the search sees the hooks. `None` when the player has no move (every marble was converted).
fn player_move(arena: &Arena, seed: u64, index: u32, opening: u32, budget: u32) -> Option<Move> {
    let game = arena.game();
    if index < opening {
        let moves = match arena {
            Arena::Plain(enc, LadderBoss::Stalker) => enc.seen_moves(),
            _ => legal_moves(game.board(), Player::Black),
        };
        let pick = mix(seed ^ mix(u64::from(index))) % moves.len().max(1) as u64;
        moves.get(pick as usize).cloned()
    } else {
        // The Echo's free move costs no tempo, but one that gives the mirrored board back is the
        // Echo's lock (#951): the pro takes the first safe one that ejects, else declines (#958).
        let offered = match arena {
            Arena::Plain(enc, LadderBoss::Echo) => echo_free_moves(enc),
            _ => Vec::new(),
        };
        let ejects = |m: &Move| apply(game.board(), Player::Black, m).is_ok_and(|a| a.1);
        let safe = |m: &&Move| ejects(m) && game.seen_after_bonus(m) == 1 && arena.tell_safe(m);
        if let Some(free) = offered.iter().find(safe) {
            return Some(free.clone());
        }
        let own = |mv: &Move| !offered.contains(mv);
        let strict = |mv: &Move| own(mv) && game.seen_after(mv) == 1 && arena.tell_safe(mv);
        // The pro reads the hooks, not the health swing: the ladder keeps the player it measured.
        let step = |b: &Board, p: Player, m: &Move, a: Board| {
            (chaplain_step(0, b, p, m, a, [0, 0]).0, [0, 0])
        };
        // The Stalker's pro reads the board as seen: hidden marbles are empty cells.
        let seen = match arena {
            Arena::Plain(enc, LadderBoss::Stalker) => Some(Game::from_position(
                enc.seen_board(),
                Player::Black,
                [game.ejected(Player::Black), game.ejected(Player::White)],
            )),
            _ => None,
        };
        let pick = |allow: &dyn Fn(&Move) -> bool| match arena {
            Arena::Plain(_, LadderBoss::Stalker) => {
                search_with(seen.as_ref().unwrap(), budget, DEFAULT_WEIGHTS, allow).map(|r| r.mv)
            }
            Arena::Plain(enc, LadderBoss::Ballast) => ballast_search(enc, budget, allow),
            Arena::Plain(enc, LadderBoss::Assembly) => assembly_search(enc, budget, allow),
            Arena::Plain(enc, LadderBoss::Echo) => echo_search(enc, budget, allow),
            Arena::Swarm(swarm) => swarm.player_search(budget, allow).map(|r| r.mv),
            Arena::Plain(_, LadderBoss::Dual) => {
                search_hooked(game, budget, DEFAULT_WEIGHTS, allow, &dual_step).map(|r| r.mv)
            }
            _ if arena.kind() == LadderBoss::Chaplain => {
                search_hooked(game, budget, DEFAULT_WEIGHTS, allow, &step).map(|r| r.mv)
            }
            _ => search_with(game, budget, DEFAULT_WEIGHTS, allow).map(|r| r.mv),
        };
        pick(&strict).or_else(|| pick(&own))
    }
}

/// Plays `arena` to its end or to `ply_cap` plies and records it. A player with no move left lost
/// every marble to conversion, the only way to lose them all. `opening` is the number of
/// random first player moves.
fn play_out(
    mut arena: Arena,
    seed: u64,
    attempt: u32,
    player_budget: u32,
    opening: u32,
    ply_cap: u32,
) -> (AttemptRecord, Vec<Move>) {
    let echo = arena.kind() == LadderBoss::Echo;
    let mut losses = Losses::default();
    let mut max_phase = arena.phase();
    let (mut plies, mut player_moves, mut stuck) = (0, 0, None);
    let mut moves = Vec::new();
    while arena.game().outcome().is_none() && plies < ply_cap {
        let player_turn = arena.game().to_move() == Player::Black;
        let mv = if player_turn {
            player_moves += 1;
            let index = player_moves - 1;
            let Some(mut mv) = player_move(&arena, seed, index, opening, player_budget) else {
                stuck = Some(DeathCause::Conversion);
                break;
            };
            // Each refusal reveals a blocker, so the search sees one more marble: it ends.
            while arena.refused(&mv) {
                mv = player_move(&arena, seed, index, 0, player_budget)
                    .expect("a seen move is left after a refusal");
            }
            mv
        } else {
            let Some(mv) = arena.boss_move() else {
                stuck = Some(DeathCause::BossStuck);
                break;
            };
            mv
        };
        let game = arena.game();
        let boss_push = !player_turn & apply(game.board(), Player::White, &mv).is_ok_and(|a| a.1);
        let black = marbles(game.board(), Cell::Black);
        let lost_before = game.ejected(Player::White);
        arena.play(&mv).expect("the ladder plays legal moves");
        moves.push(mv);
        let game = arena.game();
        let lost = game.ejected(Player::White) - lost_before;
        let flipped = i32::from(black) - i32::from(marbles(game.board(), Cell::Black));
        // The Echo's bonus mirrors after a player move are its mirrored pushes.
        let mirrored = if echo && player_turn { lost } else { 0 };
        losses.mirrored += mirrored;
        losses.pushed += u8::from(boss_push);
        losses.rim += lost.saturating_sub(u8::from(boss_push) + mirrored);
        losses.converted = losses
            .converted
            .saturating_add((flipped - i32::from(lost)).max(0) as u8);
        max_phase = max_phase.max(arena.phase());
        plies += 1;
    }
    let game = arena.game();
    let won = arena.result() == Some(PveResult::Won);
    let draw = game.outcome() == Some(Outcome::Draw);
    let capped = game.outcome().is_none();
    let record = AttemptRecord {
        boss: arena.kind().id(),
        seed,
        attempt,
        result: if won {
            AttemptResult::Won
        } else {
            AttemptResult::Lost
        },
        plies,
        max_phase,
        death: (!won).then(|| stuck.unwrap_or_else(|| classify_death(draw, capped, &losses))),
        player_marbles: marbles(game.board(), Cell::Black),
        boss_marbles: marbles(game.board(), Cell::White),
        conversions: losses.converted,
    };
    (record, moves)
}

/// One seeded encounter of `boss` against the alpha-beta bot with `player_budget` nodes.
pub fn play_attempt(
    boss: LadderBoss,
    seed: u64,
    attempt: u32,
    player_budget: u32,
    ply_cap: u32,
) -> AttemptRecord {
    play_attempt_moves(boss, seed, attempt, player_budget, ply_cap).0
}

/// [`play_attempt`] and the moves of both sides in the order they were played, to store a game.
pub fn play_attempt_moves(
    boss: LadderBoss,
    seed: u64,
    attempt: u32,
    player_budget: u32,
    ply_cap: u32,
) -> (AttemptRecord, Vec<Move>) {
    play_out(
        Arena::new(boss, seed),
        seed,
        attempt,
        player_budget,
        OPENING_RANDOM_MOVES,
        ply_cap,
    )
}

/// Plays `moves` (both sides, in order) through the encounter API of `boss` from its start with
/// `seed`. Returns how it ended (`None` while it runs), or why a move was refused.
pub fn replay(boss: LadderBoss, seed: u64, moves: &[Move]) -> Result<Option<PveResult>, String> {
    let mut arena = Arena::new(boss, seed);
    for (i, mv) in moves.iter().enumerate() {
        arena
            .play(mv)
            .map_err(|e| format!("move {} refused: {e}", i + 1))?;
    }
    Ok(arena.result())
}

/// The attempts of one ladder cell and their aggregate.
#[derive(Clone, Debug, PartialEq)]
pub struct LadderReport {
    pub summary: Summary,
    pub records: Vec<AttemptRecord>,
}

/// Plays `seeds` encounters of `boss` (seed `i`, attempt `i + 1`) and aggregates them.
pub fn run_ladder(boss: LadderBoss, player_budget: u32, seeds: u32, ply_cap: u32) -> LadderReport {
    let records: Vec<AttemptRecord> = (0..seeds)
        .map(|i| play_attempt(boss, u64::from(i), i + 1, player_budget, ply_cap))
        .collect();
    LadderReport {
        summary: summarize(boss.id(), player_budget, &records),
        records,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::board::{Belts, Board, Cell};
    use crate::encounter::assembly::assembly_boss;
    use crate::encounter::ballast::{ballast_board, ballast_boss};
    use crate::encounter::chaplain::chaplain_boss;
    use crate::encounter::echo::{echo_boss, echo_fight, mirror_move};
    use crate::encounter::pulsar::pulsar_boss;
    use crate::encounter::stalker::stalker_boss;
    use crate::encounter::telemetry::{AttemptResult, DeathCause};
    use crate::encounter::Encounter;
    use crate::game::Game;
    use crate::moves::Player;

    type P = (i32, i32);

    fn arena(black: &[P], white: &[P], to_move: Player, ejected: [u8; 2]) -> Arena {
        let mut board = Board::empty();
        for &(q, r) in black {
            board.set(q, r, Cell::Black);
        }
        for &(q, r) in white {
            board.set(q, r, Cell::White);
        }
        let game = Game::from_position(board, to_move, ejected);
        Arena::Plain(Encounter::new(game, echo_boss(), 0), LadderBoss::Echo)
    }

    /// A Black marble in a pocket of White marbles: its only move, NE, leaves it with four White
    /// neighbours, so it flips and the Chaplain tell is never empty.
    fn pocket() -> Arena {
        let mut board = Board::empty();
        board.set(0, 0, Cell::Black);
        for (q, r) in [(1, 0), (-1, 0), (0, 1), (0, -1), (-1, 1), (2, -1), (2, -2)] {
            board.set(q, r, Cell::White);
        }
        let game = Game::from_position(board, Player::Black, [0, 0]);
        let enc = Encounter::new(game, chaplain_boss(), 0);
        Arena::Plain(enc, LadderBoss::Chaplain)
    }

    #[test]
    fn a_move_that_leaves_a_marble_to_flip_is_not_tell_safe() {
        let a = pocket();
        let mvs = legal_moves(a.game().board(), Player::Black);
        assert_eq!(mvs.len(), 1);
        assert!(!a.tell_safe(&mvs[0]));
    }

    #[test]
    fn a_move_whose_bonus_mirror_repeats_a_third_time_is_not_tell_safe() {
        // Both sides shuffle one marble, each move mirrored (Black takes its free moves):
        // Black's next step back is followed by the Echo's bonus, which brings the start
        // position back a third time.
        let mut a = echo_arena(&[(0, 2)], &[(0, -2)], Player::White);
        let step = |q, r, dir| Move {
            cells: vec![(q, r)],
            dir,
        };
        use crate::moves::Direction::{E, NW, SE};
        a.play(&step(0, -2, NW)).unwrap();
        a.play(&step(0, 2, SE)).unwrap();
        a.play(&step(0, 3, NW)).unwrap();
        a.play(&step(0, -2, NW)).unwrap();
        a.play(&step(0, 2, SE)).unwrap();
        let back = step(0, 3, NW);
        assert_eq!(
            a.game().seen_after(&back),
            2,
            "the plain check lets it through"
        );
        assert!(!a.tell_safe(&back));
        assert!(a.tell_safe(&step(0, 3, E)));
    }

    #[test]
    fn the_pro_takes_the_echos_free_move_only_when_it_ejects() {
        use crate::moves::Direction::{NW, SE, W};
        let step = |cells: &[(i32, i32)], dir| Move {
            cells: cells.to_vec(),
            dir,
        };
        let mut a = echo_arena(
            &[(2, 0), (3, 0)],
            &[(-2, 0), (-3, 0), (4, 0)],
            Player::White,
        );
        a.play(&step(&[(-2, 0), (-3, 0)], W)).unwrap();
        let push = mirror_move(&step(&[(-2, 0), (-3, 0)], W));
        assert_eq!(player_move(&a, 0, 9, 0, 1000), Some(push), "a free push");
        let mut a = echo_arena(
            &[(0, 2), (-3, 4), (2, 2)],
            &[(0, -2), (3, -4)],
            Player::White,
        );
        a.play(&step(&[(0, -2)], NW)).unwrap();
        let free = step(&[(0, 2)], SE);
        assert_ne!(
            player_move(&a, 0, 9, 0, 1000),
            Some(free),
            "a quiet one declined"
        );
        // Its opening moves stay random.
        assert!(player_move(&a, 0, 0, 1, 1000).is_some());
    }

    #[test]
    fn the_pro_never_plays_a_quiet_free_move_as_its_own() {
        use crate::moves::Direction::{E, NE, W};
        // Seed 3 after two plies: the pro's search alone picks the Echo's quiet free move.
        let mut enc = echo_start(3);
        let step = |cells: &[(i32, i32)], dir| Move {
            cells: cells.to_vec(),
            dir,
        };
        enc.play(&step(&[(0, 4), (1, 3)], NE)).unwrap();
        enc.play(&step(&[(-2, -2)], E)).unwrap();
        let free = step(&[(2, 2)], W);
        assert_eq!(echo_free_moves(&enc), vec![free.clone()]);
        assert_eq!(echo_search(&enc, 1000, &|_| true), Some(free.clone()));
        let a = Arena::Plain(enc, LadderBoss::Echo);
        let mv = player_move(&a, 3, 9, 0, 1000).unwrap();
        assert_ne!(mv, free, "declined");
    }

    #[test]
    fn every_boss_opens_tell_safe() {
        for boss in LadderBoss::ALL {
            let a = Arena::new(boss, 0);
            let mv = legal_moves(a.game().board(), Player::Black)[0].clone();
            assert!(a.tell_safe(&mv), "{boss:?}");
        }
    }

    #[test]
    fn the_player_plays_the_plain_search_when_every_move_flips() {
        let a = pocket();
        let only = legal_moves(a.game().board(), Player::Black)[0].clone();
        assert_eq!(player_move(&a, 0, 9, 0, 50), Some(only));
    }

    #[test]
    fn the_player_reads_the_hull_tick_of_the_ballast_mind() {
        let mut board = ballast_board();
        board.set(5, 0, Cell::Black);
        board.set(-4, 5, Cell::Black);
        board.set(-5, 0, Cell::White);
        board.set(0, -5, Cell::White);
        board.set_cracks(vec![((5, 0), 1)]);
        let game = Game::from_position(board, Player::Black, [0, 0]);
        let enc = Encounter::new(game, ballast_boss(), 0).counting_by_colour();
        let a = Arena::Plain(enc.clone(), LadderBoss::Ballast);
        let mv = player_move(&a, 0, 9, 0, 300).unwrap();
        let mut after = enc;
        after.play(&mv).unwrap();
        assert_eq!(
            after.game().ejected(Player::White),
            0,
            "{mv:?} leaves the cracked cell"
        );
    }

    #[test]
    fn the_player_reads_the_belts_of_the_assembly_line() {
        // The centre belt runs toward -q: the Black marble on its west end falls after this turn.
        // The plain search plays (-3, 4) NE there and loses it.
        let mut board = Board::empty();
        for (q, r, cell) in [
            (-4, 0, Cell::Black),
            (-2, 2, Cell::Black),
            (-3, 4, Cell::Black),
            (1, -3, Cell::Black),
            (-2, 4, Cell::White),
            (2, -4, Cell::White),
        ] {
            board.set(q, r, cell);
        }
        board.set_belts(Some(Belts {
            first: false,
            turns: 0,
            shift: [0; 3],
            strike: [None; 3],
        }));
        let game = Game::from_position(board, Player::Black, [0, 0]);
        let enc = Encounter::new(game, assembly_boss(), 0);
        let a = Arena::Plain(enc.clone(), LadderBoss::Assembly);
        let mv = player_move(&a, 0, 9, 0, 300).unwrap();
        let mut after = enc;
        after.play(&mv).unwrap();
        assert_eq!(
            after.game().ejected(Player::White),
            0,
            "{mv:?} keeps the marble on the belt"
        );
    }

    #[test]
    fn the_player_reads_the_pulse_of_the_pulsar() {
        // The E pulsar fires at the end of this turn, at force 2: the lone Black marble on the E
        // rim goes off, and so does the lone boss marble on (4, -2), unless Black pushes it off
        // first with the NE pair and leaves its own marble on that rim instead.
        let mut board = Board::empty();
        for (q, r) in [(4, 0), (2, 0), (3, -1)] {
            board.set(q, r, Cell::Black);
        }
        for (q, r) in [(4, -2), (-3, 2), (-2, 2)] {
            board.set(q, r, Cell::White);
        }
        board.set_pulsar(Some((0, 2)));
        let game = Game::from_position(board, Player::Black, [0, 0]);
        let enc = Encounter::new(game, pulsar_boss(), 0);
        let a = Arena::Plain(enc.clone(), LadderBoss::Pulsar);
        let mv = player_move(&a, 0, 9, 0, 300).unwrap();
        let mut after = enc;
        after.play(&mv).unwrap();
        assert_eq!(
            after.game().ejected(Player::White),
            0,
            "{mv:?} loses no marble to the pulse"
        );
    }

    #[test]
    fn the_echo_arena_plays_the_bonus_mirrors() {
        let mut a = Arena::new(LadderBoss::Echo, 0);
        let mv = legal_moves(a.game().board(), Player::Black)[0].clone();
        a.play(&mv).unwrap();
        assert_eq!(a.game().history().len(), 2, "the Echo's bonus mirror");
        assert_eq!(a.boss_move(), echo_move(&echo_start_after(&mv)));
    }

    fn echo_start_after(mv: &Move) -> Encounter {
        let mut enc = crate::encounter::echo::echo_start(0);
        enc.play(mv).unwrap();
        enc
    }

    #[test]
    fn the_player_reads_the_bonus_mirror_of_the_echo() {
        // Two pushes eject a boss marble: the north one hands the boss a mirror push back, the
        // east one does not. The plain search takes the north one; the pro, who sees the
        // bonus mirrors, the east one.
        let a = echo_arena(
            &[(2, 0), (3, 0), (0, -2), (0, -3), (0, 4)],
            &[(4, 0), (0, -4), (0, 2), (0, 3)],
            Player::Black,
        );
        let north = Move {
            cells: vec![(0, -3), (0, -2)],
            dir: crate::moves::Direction::NW,
        };
        let plain = search_with(a.game(), 400, DEFAULT_WEIGHTS, &|_| true).map(|r| r.mv);
        assert_eq!(plain, Some(north));
        let east = Move {
            cells: vec![(2, 0), (3, 0)],
            dir: crate::moves::Direction::E,
        };
        assert_eq!(player_move(&a, 0, 9, 0, 400), Some(east));
    }

    fn echo_arena(black: &[P], white: &[P], to_move: Player) -> Arena {
        let mut board = Board::empty();
        for &(q, r) in black {
            board.set(q, r, Cell::Black);
        }
        for &(q, r) in white {
            board.set(q, r, Cell::White);
        }
        let game = Game::from_position(board, to_move, [0, 0]);
        Arena::Plain(echo_fight(game, 0), LadderBoss::Echo)
    }

    #[test]
    fn the_player_search_skips_a_position_it_has_seen() {
        let a = Arena::new(LadderBoss::Echo, 0);
        let mv = player_move(&a, 0, 9, 0, 50).unwrap();
        assert_eq!(a.game().seen_after(&mv), 1);
    }

    #[test]
    fn every_boss_has_an_id_and_a_budget() {
        let ids: Vec<_> = LadderBoss::ALL.iter().map(|b| b.id()).collect();
        assert_eq!(
            ids,
            [
                "echo",
                "hull",
                "chaplain",
                "choir",
                "ballast",
                "alien",
                "overseer",
                "dual",
                "railyard",
                "stalker",
                "swarm",
                "magnetizer",
                "pulsar",
                "assembly",
                "unstable"
            ]
        );
        let budgets: Vec<_> = LadderBoss::ALL.iter().map(|b| b.node_budget()).collect();
        assert_eq!(
            budgets,
            [
                100, 3000, 300, 1500, 100, 3000, 3000, 3000, 3000, 3000, 1500, 3000, 3000, 3000,
                3000
            ]
        );
    }

    #[test]
    fn player_budgets_are_4x_1x_and_half_of_the_boss_budget() {
        assert_eq!(player_budgets(LadderBoss::Echo), [400, 100, 50]);
        assert_eq!(player_budgets(LadderBoss::Hull), [12000, 3000, 1500]);
    }

    #[test]
    fn the_player_wins_a_won_position() {
        let a = arena(&[(2, 0), (3, 0)], &[(4, 0), (-4, 4)], Player::Black, [5, 0]);
        let r = play_out(a, 7, 2, 50, 0, 300).0;
        assert_eq!((r.boss, r.seed, r.attempt), ("echo", 7, 2));
        assert_eq!((r.result, r.plies, r.death), (AttemptResult::Won, 1, None));
        assert_eq!((r.player_marbles, r.boss_marbles), (2, 1));
    }

    #[test]
    fn the_boss_wins_a_lost_position_by_a_push() {
        let a = arena(
            &[(-4, 0), (3, 3)],
            &[(-2, 0), (-3, 0)],
            Player::White,
            [0, 5],
        );
        let r = play_out(a, 0, 1, 50, 0, 300).0;
        assert_eq!(r.result, AttemptResult::Lost);
        assert_eq!(r.death, Some(DeathCause::Push));
        assert_eq!(r.plies, 1);
    }

    #[test]
    fn a_player_with_no_marble_left_has_no_move_and_loses_to_conversion() {
        let a = arena(&[], &[(0, 0)], Player::Black, [0, 0]);
        let r = play_out(a, 0, 1, 50, 2, 300).0;
        assert_eq!(r.result, AttemptResult::Lost);
        assert_eq!(r.death, Some(DeathCause::Conversion));
        assert_eq!((r.plies, r.player_marbles), (0, 0));
    }

    #[test]
    fn a_boss_with_no_move_ends_the_attempt_as_boss_stuck() {
        let a = arena(&[(0, 0)], &[], Player::White, [0, 0]);
        let r = play_out(a, 0, 1, 50, 2, 300).0;
        assert_eq!(r.result, AttemptResult::Lost);
        assert_eq!(r.death, Some(DeathCause::BossStuck));
        assert_eq!((r.plies, r.boss_marbles), (0, 0));
    }

    #[test]
    fn a_game_that_hits_the_ply_cap_is_a_capped_loss() {
        let r = play_attempt(LadderBoss::Echo, 0, 1, 50, 4);
        assert_eq!(r.plies, 4);
        assert_eq!(r.result, AttemptResult::Lost);
        assert_eq!(r.death, Some(DeathCause::PlyCap));
    }

    #[test]
    fn every_boss_opens_a_round() {
        for boss in LadderBoss::ALL {
            let r = play_attempt(boss, 1, 2, 30, 1);
            assert_eq!((r.boss, r.plies, r.attempt), (boss.id(), 1, 2), "{boss:?}");
        }
    }

    #[test]
    fn four_bosses_answer_the_player() {
        for boss in [
            LadderBoss::Echo,
            LadderBoss::Hull,
            LadderBoss::Chaplain,
            LadderBoss::Choir,
            LadderBoss::Ballast,
        ] {
            let r = play_attempt(boss, 1, 2, 30, 2);
            assert_eq!(r.plies, 2, "{boss:?}");
        }
    }

    #[test]
    fn the_ballast_mind_answers_through_its_own_move() {
        let mut a = Arena::new(LadderBoss::Ballast, 3);
        let mut enc = ballast_start(3);
        let mv = legal_moves(a.game().board(), Player::Black)[0].clone();
        a.play(&mv).unwrap();
        enc.play(&mv).unwrap();
        assert_eq!(a.boss_move(), ballast_move(&enc));
    }

    #[test]
    fn the_overseer_burns_and_answers_through_its_own_move() {
        let mut a = Arena::new(LadderBoss::Overseer, 3);
        let mut enc = overseer_start(3);
        assert_eq!(a.game().board(), enc.game().board());
        let mv = legal_moves(a.game().board(), Player::Black)[0].clone();
        a.play(&mv).unwrap();
        enc.play(&mv).unwrap();
        assert_eq!(a.boss_move(), overseer_move(&enc));
        assert!(a.boss_move().is_some());
    }

    #[test]
    fn the_rail_yard_answers_through_its_own_move() {
        let mut a = Arena::new(LadderBoss::RailYard, 3);
        let mut enc = railyard_start(3);
        let mv = legal_moves(a.game().board(), Player::Black)[0].clone();
        a.play(&mv).unwrap();
        enc.play(&mv).unwrap();
        assert_eq!(a.boss_move(), railyard_move(&enc));
        assert!(a.boss_move().is_some());
    }

    #[test]
    fn the_hooked_bosses_answer_through_their_own_move_and_finish_an_attempt() {
        for boss in [
            LadderBoss::Magnetizer,
            LadderBoss::Pulsar,
            LadderBoss::Assembly,
            LadderBoss::Unstable,
        ] {
            let mut a = Arena::new(boss, 0);
            assert_eq!(a.kind(), boss);
            let mv = legal_moves(a.game().board(), Player::Black)[0].clone();
            a.play(&mv).unwrap();
            let reply = a.boss_move().expect("a reply");
            a.play(&reply).unwrap();
            let r = play_attempt(boss, 0, 1, 30, 6);
            assert_eq!((r.boss, r.plies), (boss.id(), 6), "{boss:?}");
        }
    }

    #[test]
    fn the_alien_lays_its_eggs_and_answers_through_its_own_move() {
        let mut a = Arena::new(LadderBoss::Alien, 3);
        let mut enc = alien_start(3);
        assert_eq!(a.game().board(), enc.game().board());
        for _ in 0..2 {
            let mv = legal_moves(a.game().board(), Player::Black)[0].clone();
            a.play(&mv).unwrap();
            enc.play(&mv).unwrap();
            let reply = a.boss_move();
            assert_eq!(reply, alien_move(&enc));
            a.play(&reply.clone().unwrap()).unwrap();
            enc.play(&reply.unwrap()).unwrap();
        }
        assert_eq!(
            a.game().board().eggs().len(),
            1,
            "the first egg after ply 4"
        );
    }

    #[test]
    fn the_dual_room_answers_through_its_own_move_and_the_player_reads_the_returns() {
        let mut a = Arena::new(LadderBoss::Dual, 3);
        let mut enc = dual_start(3);
        assert_eq!(a.game().board(), enc.game().board());
        let mv = legal_moves(a.game().board(), Player::Black)[0].clone();
        a.play(&mv).unwrap();
        enc.play(&mv).unwrap();
        assert_eq!(a.boss_move(), dual_move(&enc));
        let reply = a.boss_move().unwrap();
        a.play(&reply).unwrap();
        enc.play(&reply).unwrap();
        let read = search_hooked(enc.game(), 200, DEFAULT_WEIGHTS, &|_| true, &dual_step);
        assert_eq!(player_move(&a, 0, 9, 0, 200), read.map(|r| r.mv));
    }

    #[test]
    fn the_swarm_answers_through_its_own_move_and_the_player_reads_the_waves() {
        let mut a = Arena::new(LadderBoss::Swarm, 3);
        let mut swarm = Swarm::start(3);
        assert_eq!(a.game().board(), swarm.game().board());
        let read = swarm.player_search(200, &|_| true).map(|r| r.mv);
        assert_eq!(player_move(&a, 0, 9, 0, 200), read);
        let mv = read.unwrap();
        a.play(&mv).unwrap();
        swarm.play(&mv).unwrap();
        assert_eq!(a.boss_move(), swarm.boss_move());
        assert_eq!((a.phase(), a.result()), (0, None));
        let (record, moves) = play_attempt_moves(LadderBoss::Swarm, 1, 1, 30, 300);
        assert!(record.plies <= 60, "30 turns at most");
        assert!(
            replay(LadderBoss::Swarm, 1, &moves[1..2]).is_err(),
            "a boss move first"
        );
        assert_eq!(record.result, AttemptResult::Won);
        assert_eq!(
            replay(LadderBoss::Swarm, 1, &moves),
            Ok(Some(PveResult::Won))
        );
    }

    #[test]
    fn a_boss_is_found_by_its_id() {
        assert_eq!(LadderBoss::from_id("ballast"), Some(LadderBoss::Ballast));
        assert_eq!(LadderBoss::from_id("nobody"), None);
    }

    #[test]
    fn a_played_game_replays_to_the_same_end() {
        let (record, moves) = play_attempt_moves(LadderBoss::Echo, 3, 4, 50, 6);
        assert_eq!(
            moves.len(),
            6,
            "the main moves only, the bonus moves replay by themselves"
        );
        assert_eq!(record.plies, 6);
        assert_eq!(replay(LadderBoss::Echo, 3, &moves), Ok(None));
    }

    #[test]
    fn a_replay_through_the_choir_and_a_refused_move_report_it() {
        let (_, moves) = play_attempt_moves(LadderBoss::Choir, 0, 1, 50, 4);
        assert_eq!(replay(LadderBoss::Choir, 0, &moves), Ok(None));
        let err = replay(LadderBoss::Echo, 0, &moves[1..2]).unwrap_err();
        assert!(err.starts_with("move 1 refused"), "{err}");
        let nowhere = Move {
            cells: vec![(0, 0)],
            dir: crate::moves::Direction::E,
        };
        let err = replay(LadderBoss::Choir, 0, &[nowhere]).unwrap_err();
        assert!(err.starts_with("move 1 refused"), "{err}");
    }

    #[test]
    fn the_same_seed_replays_the_same_attempt() {
        let a = play_attempt(LadderBoss::Hull, 5, 1, 60, 12);
        assert_eq!(a, play_attempt(LadderBoss::Hull, 5, 1, 60, 12));
    }

    /// Sight 1 (five ejections): the push of the white pair is legal on the seen board, where the
    /// marble behind it is hidden, and refused on the real one.
    fn fogged_encounter() -> Encounter {
        let mut board = Board::empty();
        for (q, r) in [(-1, 0), (0, 0)] {
            board.set(q, r, Cell::Black);
        }
        for (q, r) in [(1, 0), (2, 0)] {
            board.set(q, r, Cell::White);
        }
        let game = Game::from_position(board, Player::Black, [5, 0]);
        Encounter::new(game, stalker_boss(), 0).stalking()
    }

    fn fogged() -> Arena {
        Arena::Plain(fogged_encounter(), LadderBoss::Stalker)
    }

    fn fogged_seen() -> Board {
        fogged_encounter().seen_board()
    }

    fn push() -> Move {
        Move {
            cells: vec![(-1, 0), (0, 0)],
            dir: crate::moves::Direction::E,
        }
    }

    #[test]
    fn the_stalker_player_searches_the_seen_board_and_the_fog_refuses_a_hidden_blocker() {
        let mut a = fogged();
        assert!(a.refused(&push()), "a hidden marble blocks the push");
        assert!(
            !a.refused(&push()),
            "revealed, it is now seen: no new refusal"
        );
        let mv = player_move(&a, 0, 9, 0, 200).unwrap();
        assert_ne!(mv, push());
        assert!(!a.refused(&mv));
        let mut start = Arena::new(LadderBoss::Stalker, 0);
        assert!(!start.refused(&legal_moves(start.game().board(), Player::Black)[0]));
        let mut choir = Arena::new(LadderBoss::Choir, 0);
        assert!(!choir.refused(&push()), "no other boss is fogged");
    }

    #[test]
    fn the_stalker_ladder_retries_after_a_refusal() {
        // A seed whose random opening move is the blocked push.
        let moves = legal_moves(&fogged_seen(), Player::Black);
        let at = moves.iter().position(|m| *m == push()).unwrap() as u64;
        let seed = (0..)
            .find(|&s| mix(s ^ mix(0)) % moves.len() as u64 == at)
            .unwrap();
        let (r, played) = play_out(fogged(), seed, 1, 50, 1, 2);
        assert_eq!(r.plies, 2);
        assert_ne!(played[0], push(), "the refused push was not played");
    }

    #[test]
    fn a_tiny_ladder_runs_two_seeds_and_aggregates() {
        let report = run_ladder(LadderBoss::Echo, 40, 2, 8);
        assert_eq!(report.records.len(), 2);
        let attempts: Vec<_> = report.records.iter().map(|r| (r.seed, r.attempt)).collect();
        assert_eq!(attempts, [(0, 1), (1, 2)]);
        let s = &report.summary;
        assert_eq!((s.boss, s.player_budget, s.attempts), ("echo", 40, 2));
        assert!(s.median_plies > 0.0 && s.median_plies <= 8.0);
    }
}
