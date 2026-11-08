//! A whole army fight played by two bots (#1598, docs/specs/roguelite.md section 30): the run simulator's fights and elites.
//! The army's bot is a cheap search with a material, centre and pressure evaluation that is meant to turn a lead into the 6
//! ejections; the foes' is the plain search of the page.

use crate::board::{Cell, PlaceError, Special, STANDARD_BLACK};
use crate::encounter::marbles;
use crate::game::{Game, Outcome};
use crate::moves::{Move, Player};
use crate::run::{army_game_formed, FoePlan, Relic};
use crate::search::{avoiding_repeats, best_move, search_with, Weights};

/// The army's evaluation: the plain bot's material, ejections and centre, the army's own cohesion not counted, and a push the army
/// has lined up toward the rim counted (`Weights::pressure`). A cohesive army with a lead shuffles into the 100 plies without an ejection
/// that draw the fight (the plain bot wins 1 of 16 against a foe of 250 positions at 500 or 2000); this one pushes the last marbles, which
/// huddle on the rim, off it.
pub const FIGHT_WEIGHTS: Weights = Weights {
    marbles: 100,
    ejected: 50,
    centre: 3,
    cohesion: 0,
    threat: 0,
    egg: 0,
    charges: 0,
    pressure: 30,
};

/// The positions a foe bot searches in a fight or an elite of a run (client/src/roguelite.ts `runNodes` and `fightBudget`, #1611; the page's
/// `runPercent` gives the 29 %, 40 % and 86 % the test pins, and the page is the reference if the two drift): `peak` times a share that grows geometrically from 25 % at the run's first fight to 100 % on the
/// fourth act, by the node's `act`, its `row` and the `rows` of its act; an elite (`Some`, whether it is marked with a key) searches 2
/// times that, one more from ascension level 1 and one more when marked; a quarter more from level 10.
pub fn foe_budget(
    peak: u32,
    act: usize,
    row: usize,
    rows: usize,
    elite: Option<bool>,
    level: u32,
) -> u32 {
    let t = ((act as f64 + row as f64 / rows as f64) / 3.0).clamp(0.0, 1.0);
    let percent = (25.0 * 4.0_f64.powf(t)).round();
    let nodes = (f64::from(peak) * percent / 100.0).round().max(1.0);
    let times = elite.map_or(1, |marked| 2 + u32::from(level >= 1) + u32::from(marked));
    let factor = if level >= 10 { 1.25 } else { 1.0 };
    (nodes * f64::from(times) * factor).round() as u32
}

/// The army's move: the best of [`FIGHT_WEIGHTS`] searched to `budget` positions that does not repeat the game into a draw
/// (the page's Auto-play rule, `avoiding_repeats`). `None` once the game is over.
pub fn fight_move(game: &Game, budget: u32) -> Option<Move> {
    avoiding_repeats(
        game,
        |mv| game.seen_after(mv),
        |allow| search_with(game, budget, FIGHT_WEIGHTS, allow),
    )
    .map(|r| r.mv)
}

/// How a fight ended.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FightResult {
    /// The army ejected the 6 marbles. A draw, a lost fight and a game cut at the ply cap are all not won.
    pub won: bool,
    /// The army's marbles left on the board.
    pub left: u8,
    /// The army's special marbles left on the board.
    pub specials: Vec<Special>,
    /// Plies played.
    pub plies: u32,
}

/// The fight of an army of `army` marbles against the foes of `plan`, its `specials` on the front of the army (the last
/// cells of the standard layout, one marble each, as many as the army has) and its `relics` held. Refused when a special marble of
/// the foes' plan sits on a cell with no marble.
pub fn army_fight(
    army: u8,
    plan: &FoePlan,
    specials: &[Special],
    relics: &[Relic],
) -> Result<Game, PlaceError> {
    let mut game = army_game_formed(army, plan)?;
    game.set_relics(relics)
        .expect("a rogue-lite fight that has not started");
    let cells: Vec<_> = STANDARD_BLACK
        .iter()
        .rev()
        .filter(|&&(q, r)| game.board().get(q, r) == Some(Cell::Black))
        .collect();
    for (&&cell, &kind) in cells.iter().zip(specials) {
        game.place_special(cell, kind)
            .expect("a marble of the army");
    }
    Ok(game)
}

/// `game` played out: the army (Black) with [`fight_move`] at `army_nodes` positions, the foes with the plain search at
/// `foe_nodes`, until it ends or `ply_cap` plies are played.
pub fn play_out(mut game: Game, army_nodes: u32, foe_nodes: u32, ply_cap: u32) -> FightResult {
    let mut plies = 0;
    while game.outcome().is_none() && plies < ply_cap {
        let mv = if game.to_move() == Player::Black {
            fight_move(&game, army_nodes)
        } else {
            best_move(&game, foe_nodes)
        };
        game.play(&mv.expect("a move while the fight runs"))
            .expect("a legal move");
        plies += 1;
    }
    let board = game.board();
    FightResult {
        won: game.outcome() == Some(Outcome::Win(Player::Black)),
        left: marbles(board, Cell::Black),
        specials: board
            .specials()
            .iter()
            .filter(|((q, r), _)| board.get(*q, *r) == Some(Cell::Black))
            .map(|s| s.1)
            .collect(),
        plies,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::board::Board;
    use crate::run::Formation;
    use crate::world::Biome;

    fn plan(count: u8, specials: Vec<((i32, i32), Special)>) -> FoePlan {
        FoePlan {
            count,
            formation: Formation::Standard,
            specials,
            biome: Biome::Meadow,
        }
    }

    /// The army one push from its sixth ejection: 2 marbles behind a foe on the rim.
    fn last_push() -> Game {
        let mut board = Board::empty();
        board.set(0, -4, Cell::White);
        board.set(0, -3, Cell::Black);
        board.set(0, -2, Cell::Black);
        board.set(-3, 4, Cell::White);
        Game::from_position(board, Player::Black, [5, 0])
    }

    #[test]
    fn a_foe_searches_more_along_the_run_and_more_in_an_elite_and_at_the_high_levels() {
        // 25 % of the peak at the first fight, 100 % on the fourth act, the share of the page's `runPercent`.
        assert_eq!(foe_budget(20_000, 0, 0, 3, None, 0), 5_000);
        assert_eq!(foe_budget(20_000, 1, 0, 3, None, 0), 8_000);
        assert_eq!(foe_budget(20_000, 2, 2, 3, None, 0), 17_200);
        assert_eq!(foe_budget(1, 0, 0, 3, None, 0), 1, "at least one position");
        assert_eq!(foe_budget(20_000, 1, 0, 3, Some(false), 0), 16_000);
        assert_eq!(foe_budget(20_000, 1, 0, 3, Some(false), 1), 24_000);
        assert_eq!(foe_budget(20_000, 1, 0, 3, Some(true), 1), 32_000);
        assert_eq!(foe_budget(20_000, 1, 0, 3, None, 10), 10_000);
    }

    #[test]
    fn the_army_takes_the_ejection_that_wins() {
        let game = last_push();
        let mut played = game.clone();
        played
            .play(&fight_move(&game, 50).expect("a move"))
            .unwrap();
        assert_eq!(played.winner(), Some(Player::Black));
        assert_eq!(
            fight_move(&played, 50),
            None,
            "no move once the fight is won"
        );
    }

    #[test]
    fn the_army_holds_its_special_marbles_on_the_front_and_its_relics() {
        let spark = army_fight(
            14,
            &plan(8, vec![]),
            &[Special::Spark, Special::Heavy],
            &[Relic::Detonator],
        )
        .unwrap();
        assert_eq!(
            spark.board().specials(),
            [((-1, 2), Special::Heavy), ((0, 2), Special::Spark)]
        );
        assert!(spark.board().has_relic(Relic::Detonator));
        // The foes' own marks stay, and a small army that cannot hold every mark holds as many as it has.
        let foes = plan(8, vec![((0, -4), Special::Anchor)]);
        let small = army_fight(4, &foes, &[Special::Spark; 6], &[]).unwrap();
        assert_eq!(small.board().specials().len(), 5);
        assert_eq!(small.board().special((0, -4)), Some(Special::Anchor));
        assert!(army_fight(14, &plan(8, vec![((0, 0), Special::Heavy)]), &[], &[]).is_err());
    }

    #[test]
    fn a_fight_played_out_is_won_or_cut_at_the_ply_cap() {
        let won = play_out(last_push(), 50, 50, 300);
        assert_eq!((won.won, won.left, won.plies), (true, 2, 1));
        let game = army_fight(14, &plan(8, vec![]), &[Special::Spark], &[]).unwrap();
        let cut = play_out(game, 30, 30, 4);
        assert_eq!((cut.won, cut.plies), (false, 4));
        assert_eq!(cut.left, 14);
        assert_eq!(cut.specials, [Special::Spark]);
    }
}
