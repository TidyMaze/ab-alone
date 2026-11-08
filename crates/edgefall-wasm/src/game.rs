//! Standard 1v1 Abalone game instance exposed to WebAssembly.

use crate::convert::{
    board_bytes, decode, decode_tactic, draw_reason_code, encode, fuse_records, player, relic_set,
    side_code, special, special_records, status_code, tactic_mask, MOVE_STRIDE,
};
use edgefall_core::game::Game;
use edgefall_core::moves::legal_moves;
use edgefall_core::run::{army_game_against, army_game_formed, trainer_game, FoePlan, Formation};
use edgefall_core::search::{auto_move, best_move, position_score};
use edgefall_core::world::Biome;
use wasm_bindgen::prelude::*;

/// One opaque game instance handed to JavaScript.
#[wasm_bindgen]
pub struct Engine {
    game: Game,
}

#[wasm_bindgen]
impl Engine {
    /// A new game: standard layout, Black to move.
    #[wasm_bindgen(constructor)]
    pub fn new() -> Engine {
        Engine { game: Game::new() }
    }

    /// A rogue-lite fight (docs/specs/roguelite.md): the army's `army` marbles against the bot's
    /// `foes`, both clamped to 4..=14, the bot's front row missing first. White wins once the army is down to 3 marbles.
    pub fn with_army(army: u8, foes: u8) -> Engine {
        Engine {
            game: army_game_against(army, foes),
        }
    }

    /// A rogue-lite fight against the bot's army of a plan from `run_foes`: `[count, formation, biome,
    /// q, r, kind, ...]`, its formation and special marbles stood and the biome's holes opened
    /// (docs/specs/roguelite.md sections 14 and 18). `Err` carries why the plan cannot stand.
    pub fn with_foes(army: u8, plan: &[i32]) -> Result<Engine, String> {
        let [count, formation, biome, marks @ ..] = plan else {
            return Err("a plan starts with a count, a formation and a biome".to_string());
        };
        let biome = u8::try_from(*biome)
            .ok()
            .and_then(Biome::from_code)
            .ok_or_else(|| format!("unknown biome {biome}"))?;
        let formation = u8::try_from(*formation)
            .ok()
            .and_then(Formation::from_code)
            .ok_or_else(|| format!("unknown formation {formation}"))?;
        let specials = marks
            .as_chunks::<3>()
            .0
            .iter()
            .map(|m| {
                let kind = u8::try_from(m[2]).ok().and_then(special);
                kind.map(|kind| ((m[0], m[1]), kind))
                    .ok_or_else(|| format!("unknown kind {}", m[2]))
            })
            .collect::<Result<_, _>>()?;
        let plan = FoePlan {
            count: u8::try_from(*count).unwrap_or(u8::MAX),
            formation,
            specials,
            biome,
        };
        let game = army_game_formed(army, &plan).map_err(|e| format!("{e:?}"))?;
        Ok(Engine { game })
    }

    /// A Trainer wave (#1159): the player's 14 marbles (Black) against the bot's `wave` marbles,
    /// clamped to 1..=14. Black wins once all of them are out, or on a draw (`draw_reason` tells
    /// it from a clear); White once the run's `left` marbles (1..=6) are lost.
    pub fn trainer(wave: u8, left: u8) -> Engine {
        Engine {
            game: trainer_game(wave, left),
        }
    }

    /// Makes the marble on `(q, r)` a special marble of a rogue-lite fight, before its first
    /// move: `kind` `1` Heavy, `2` Anchor, `3` Spark, up to `10` Medic. `Err` carries the reason.
    pub fn place_special(&mut self, q: i32, r: i32, kind: u8) -> Result<(), String> {
        let kind = special(kind).ok_or_else(|| format!("unknown kind {kind}"))?;
        self.game
            .place_special((q, r), kind)
            .map_err(|e| format!("{e:?}"))
    }

    /// Gives the army of a rogue-lite fight its run's relics, before its first move: `mask` holds
    /// the bit of each relic's code and, from bit 16, the level of each affinity on 2 bits (see the
    /// module docs); a bit no relic has is ignored.
    pub fn set_relics(&mut self, mask: u32) -> Result<(), String> {
        let (relics, levels) = relic_set(mask);
        self.game
            .set_relics(&relics)
            .and_then(|()| self.game.set_affinities(levels))
            .map_err(|e| format!("{e:?}"))
    }

    /// The special marbles, records of 3 integers `[q, r, kind]`, see the module docs.
    pub fn specials(&self) -> Vec<i32> {
        special_records(self.game.board())
    }

    /// The fuses of the Bombs, records of 3 integers `[q, r, turns]`, see the module docs.
    pub fn fuses(&self) -> Vec<i32> {
        fuse_records(self.game.board())
    }

    /// The tactics the army can play now, a bit mask (see the module docs).
    pub fn tactics(&self) -> u8 {
        tactic_mask(self.game.tactics())
    }

    /// Side to move: `1` Black, `2` White.
    pub fn to_move(&self) -> u8 {
        side_code(self.game.to_move())
    }

    /// Legal moves of the side to move, flat records of `MOVE_STRIDE` integers. Empty once the
    /// game is over.
    pub fn legal_moves(&self) -> Vec<i32> {
        if self.game.outcome().is_some() {
            return Vec::new();
        }
        legal_moves(self.game.board(), self.game.to_move())
            .iter()
            .flat_map(encode)
            .collect()
    }

    /// Plays one move record, or a tactic record (a `0` first, see the module docs). `Err` carries
    /// the reason, the game is left unchanged.
    pub fn play(&mut self, mv: &[i32]) -> Result<(), String> {
        if mv.first() == Some(&0) {
            let tactic = decode_tactic(mv)?;
            return self.game.play_tactic(tactic).map_err(|e| format!("{e:?}"));
        }
        let mv = decode(mv)?;
        self.game.play(&mv).map_err(|e| format!("{e:?}"))
    }

    /// Opponent marbles ejected by a side: `1` Black, `2` White. The game ends at 6.
    pub fn ejected(&self, side: u8) -> u8 {
        self.game.ejected(player(side))
    }

    /// Ejections a side needs to win: `1` Black, `2` White.
    pub fn win_ejections(&self, side: u8) -> u8 {
        self.game.win_ejections(player(side))
    }

    /// The 61 cells, see the module docs for the order.
    pub fn board(&self) -> Vec<u8> {
        board_bytes(self.game.board())
    }

    /// The bot's reply for the side to move, one move record, searching at most `nodes`
    /// positions. Empty once the game is over.
    pub fn best_move(&self, nodes: u32) -> Vec<i32> {
        best_move(&self.game, nodes)
            .map(|mv| encode(&mv).to_vec())
            .unwrap_or_default()
    }

    /// The move Auto-play plays for the side to move (#1500), one move record: the bot's search, but
    /// never into a draw by repetition unless every legal move draws. Empty once the game is over.
    pub fn auto_move(&self, nodes: u32) -> Vec<i32> {
        auto_move(&self.game, nodes)
            .map(|mv| encode(&mv).to_vec())
            .unwrap_or_default()
    }

    /// Score of the position for the side to move, searching at most `nodes` positions. See the
    /// module docs.
    pub fn evaluate(&self, nodes: u32) -> i32 {
        position_score(&self.game, nodes)
    }

    /// Winner or draw state, see the module docs.
    pub fn status(&self) -> u8 {
        status_code(self.game.outcome())
    }

    /// Draw reason code, `0` when the game is not a draw. See the module docs.
    pub fn draw_reason(&self) -> u8 {
        draw_reason_code(self.game.draw_reason())
    }

    /// The side whose turn passed after the last ply, `0` when none. See the module docs.
    pub fn passed(&self) -> u8 {
        self.game.passed().map_or(0, side_code)
    }
}

/// Replays a ranked 1v1 move log (move records back to back, `MOVE_STRIDE` integers each) on a new standard game and returns
/// `[status, black ejections, white ejections]`: the score the rules give it (#1287). Empty when the log is cut inside a record, a
/// move is not legal, or a move comes after the game ended: a log that does not replay has no score.
#[wasm_bindgen]
pub fn replay_score(moves: &[i32]) -> Vec<u8> {
    let mut engine = Engine::new();
    if !moves.len().is_multiple_of(MOVE_STRIDE) {
        return Vec::new();
    }
    for mv in moves.chunks(MOVE_STRIDE) {
        if engine.status() != 0 || engine.play(mv).is_err() {
            return Vec::new();
        }
    }
    vec![engine.status(), engine.ejected(1), engine.ejected(2)]
}

impl Default for Engine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use edgefall_core::board::Board;
    use edgefall_core::moves::Player;
    use edgefall_core::run::Relic;

    fn count(cells: &[u8], value: u8) -> usize {
        cells.iter().filter(|&&c| c == value).count()
    }

    #[test]
    fn replay_score_replays_a_log_to_status_and_ejections_or_refuses_it() {
        let mut engine = Engine::new();
        let mut log: Vec<i32> = Vec::new();
        assert_eq!(replay_score(&log), vec![0, 0, 0]);
        for _ in 0..300 {
            let mv = engine.best_move(20);
            if mv.is_empty() {
                break;
            }
            engine.play(&mv).unwrap();
            log.extend(mv);
        }
        assert_eq!(
            replay_score(&log),
            vec![engine.status(), engine.ejected(1), engine.ejected(2)]
        );
        // An illegal move, a log cut inside a record, a tactic record and a move past the end of the game: no score.
        assert!(replay_score(&[1, 0, 0, 0, 0, 0, 0, 0]).is_empty());
        assert!(replay_score(&log[..MOVE_STRIDE + 3]).is_empty());
        assert!(replay_score(&[0, 1, 0, 0, 0, 0, 0, 0]).is_empty());
        let mut past = log.clone();
        past.extend_from_slice(&log[..MOVE_STRIDE]);
        assert_ne!(engine.status(), 0);
        assert!(replay_score(&past).is_empty());
    }

    #[test]
    fn new_game_black_to_move_and_running() {
        let engine = Engine::new();
        assert_eq!(engine.to_move(), 1);
        assert_eq!(engine.status(), 0);
    }

    #[test]
    fn with_army_starts_the_army_fight() {
        let engine = Engine::with_army(9, 14);
        assert_eq!(count(&engine.board(), 1), 9);
        assert_eq!(count(&engine.board(), 2), 14);
        assert_eq!(engine.win_ejections(2), 6);
        assert_eq!(Engine::with_army(5, 14).win_ejections(2), 2);
        assert_eq!(Engine::with_army(14, 14).board(), Engine::new().board());
        let fight = Engine::with_army(14, 10);
        assert_eq!(count(&fight.board(), 1), 14);
        assert_eq!(count(&fight.board(), 2), 10);
    }

    #[test]
    fn with_foes_stands_the_bots_formation_with_its_special_marbles() {
        // A plan is `[count, formation, biome, q, r, kind, ...]` (run_foes).
        let engine = Engine::with_foes(14, &[10, 3, 0, 4, -4, 2, 0, -4, 3]).unwrap();
        assert_eq!(count(&engine.board(), 1), 14);
        assert_eq!(count(&engine.board(), 2), 10);
        assert_eq!(engine.specials(), vec![0, -4, 3, 4, -4, 2]);
        let plain = Engine::with_foes(14, &[14, 0, 0]).unwrap();
        assert_eq!(plain.board(), Engine::with_army(14, 14).board());
        assert_eq!(
            Engine::with_foes(5, &[10, 4, 0]).unwrap().win_ejections(2),
            2
        );
        // A plan the engine cannot stand is refused: no plan, an unknown formation, biome or special, a cell with no marble.
        assert!(Engine::with_foes(14, &[]).is_err());
        assert!(Engine::with_foes(14, &[10, 0]).is_err());
        assert!(Engine::with_foes(14, &[10, 9, 0]).is_err());
        assert!(Engine::with_foes(14, &[10, 0, 9]).is_err());
        assert!(Engine::with_foes(14, &[10, 0, -1]).is_err());
        assert!(Engine::with_foes(14, &[10, 0, 0, 4, -4, 99]).is_err());
        assert!(Engine::with_foes(14, &[10, 0, 0, 0, 0, 2]).is_err());
    }

    #[test]
    fn with_foes_opens_the_holes_of_the_biome() {
        // The Desert (3) removes (-1, 0) and (1, 0); the Meadow (0) none.
        let desert = Engine::with_foes(14, &[10, 0, 3]).unwrap();
        let meadow = Engine::with_foes(14, &[10, 0, 0]).unwrap();
        assert_ne!(desert.board(), meadow.board());
        assert_eq!(count(&desert.board(), 1), 14);
        assert_eq!(count(&desert.board(), 2), 10);
    }

    #[test]
    fn trainer_starts_a_wave_of_that_many_white_marbles() {
        let engine = Engine::trainer(3, 4);
        assert_eq!(count(&engine.board(), 1), 14);
        assert_eq!(count(&engine.board(), 2), 3);
        assert_eq!(engine.win_ejections(1), 3);
        assert_eq!(engine.win_ejections(2), 4);
        assert_eq!(engine.status(), 0);
    }

    #[test]
    fn a_rogue_lite_fight_places_special_marbles_before_its_first_move() {
        let mut engine = Engine::with_army(14, 14);
        assert_eq!(engine.place_special(0, 4, 1), Ok(()));
        assert_eq!(engine.place_special(-1, 4, 2), Ok(()));
        assert_eq!(engine.place_special(0, -4, 3), Ok(()));
        assert_eq!(engine.specials(), vec![-1, 4, 2, 0, -4, 3, 0, 4, 1]);
        // The upgraded types (#1458): Heavy+ 4, Anchor+ 5, Spark+ 6.
        assert_eq!(engine.place_special(1, 3, 6), Ok(()));
        assert_eq!(engine.specials()[9..], [1, 3, 6]);
        // Magnet 7, Shield 8, Bomb 9 and Medic 10 (#1461).
        for (i, kind) in (7..=10).enumerate() {
            assert_eq!(engine.place_special(i as i32 - 4, 4, kind), Ok(()));
        }
        assert_eq!(
            engine.specials()[..12],
            [-4, 4, 7, -3, 4, 8, -2, 4, 9, -1, 4, 10]
        );
        assert_eq!(
            engine.place_special(0, 4, 11),
            Err("unknown kind 11".to_string())
        );
        assert_eq!(engine.place_special(0, 0, 1), Err("NoMarble".to_string()));
        let first = engine.legal_moves()[..MOVE_STRIDE].to_vec();
        engine.play(&first).unwrap();
        assert_eq!(engine.place_special(1, 3, 1), Err("Started".to_string()));
        let mut plain = Engine::new();
        assert_eq!(
            plain.place_special(0, 4, 1),
            Err("NotRogueLite".to_string())
        );
        assert!(plain.specials().is_empty());
    }

    #[test]
    fn a_bomb_reports_the_turns_left_on_its_fuse() {
        let mut engine = Engine::with_army(14, 14);
        assert!(engine.fuses().is_empty());
        engine.place_special(0, 4, 9).unwrap();
        engine.place_special(-1, 4, 10).unwrap();
        // Only the Bomb has a fuse, 3 turns at the start (#1490).
        assert_eq!(engine.fuses(), vec![0, 4, 3]);
        let first = engine.legal_moves()[..MOVE_STRIDE].to_vec();
        engine.play(&first).unwrap();
        assert_eq!(engine.fuses()[2], 2);
        assert_eq!(engine.fuses().len(), 3);
    }

    #[test]
    fn set_relics_also_takes_the_affinity_levels_from_bit_16_on_two_bits_each() {
        let mut engine = Engine::with_army(14, 14);
        // Force 1, Tactics 2, Chaos 3 (capped at the top level 2).
        assert_eq!(engine.set_relics(1 << 16 | 2 << 18 | 3 << 20), Ok(()));
        assert_eq!(engine.game.board().affinities(), [1, 2, 2]);
        assert_eq!(engine.game.board().relics(), 0);
        assert_eq!(
            Engine::new().set_relics(1 << 16),
            Err("NotRogueLite".to_string())
        );
    }

    #[test]
    fn set_relics_takes_the_relics_of_a_run_by_their_bit_before_the_first_move() {
        let mut engine = Engine::with_army(14, 14);
        // Gyroscope (0) and Detonator (4), and a bit no relic has.
        assert_eq!(engine.set_relics(0b1_0001 | 1 << 14), Ok(()));
        let board = engine.game.board();
        assert!(board.has_relic(Relic::Gyroscope) && board.has_relic(Relic::Detonator));
        assert!(!board.has_relic(Relic::Jammer));
        let first = engine.legal_moves()[..MOVE_STRIDE].to_vec();
        engine.play(&first).unwrap();
        assert_eq!(engine.set_relics(1), Err("Started".to_string()));
        assert_eq!(Engine::new().set_relics(1), Err("NotRogueLite".to_string()));
    }

    #[test]
    fn the_same_fight_gives_the_same_game_through_the_bridge() {
        // Two Sparks, a Heavy, a Magnet, a Shield, a Bomb and a Medic in a bot game: the same placement and moves give the same game.
        let run = || {
            let mut engine = Engine::with_army(14, 14);
            for (q, r, kind) in [
                (-4, 4, 3),
                (4, -4, 3),
                (0, 2, 1),
                (-2, 4, 7),
                (-1, 3, 8),
                (-3, 3, 9),
                (1, 3, 10),
            ] {
                engine.place_special(q, r, kind).unwrap();
            }
            for _ in 0..40 {
                let mv = engine.best_move(40);
                engine.play(&mv).unwrap();
            }
            (
                engine.board(),
                engine.specials(),
                engine.ejected(1),
                engine.ejected(2),
            )
        };
        assert_eq!(run(), run());
    }

    #[test]
    fn default_is_a_new_game() {
        assert_eq!(Engine::default().board(), Engine::new().board());
    }

    #[test]
    fn board_has_61_cells_14_per_side() {
        let cells = Engine::new().board();
        assert_eq!(cells.len(), 61);
        assert_eq!(count(&cells, 1), 14);
        assert_eq!(count(&cells, 2), 14);
        assert_eq!(count(&cells, 0), 33);
    }

    #[test]
    fn board_order_is_rows_from_r_minus_4_q_ascending() {
        let cells = Engine::new().board();
        // (0,-4) is White, (0,4) is Black, the centre (0,0) is empty.
        assert_eq!(cells[0], 2);
        assert_eq!(cells[60], 1);
        assert_eq!(cells[30], 0);
        // Row r=-4 has 5 cells, row r=-3 starts at index 5 with (q=-1).
        assert_eq!(cells[5], 2);
        // Row r=2 starts at index 5+6+7+8+9+8 = 43 with q=-4, so (q=-2, r=2) is index 45.
        assert_eq!(cells[45], 1);
    }

    #[test]
    fn legal_moves_match_the_core_count() {
        let expected = legal_moves(&Board::standard(), Player::Black).len();
        let flat = Engine::new().legal_moves();
        assert_eq!(flat.len(), expected * MOVE_STRIDE);
        for record in flat.chunks(MOVE_STRIDE) {
            assert!((1..=3).contains(&record[0]));
            assert!((0..=5).contains(&record[1]));
        }
    }

    #[test]
    fn play_a_legal_move_switches_side_and_changes_board() {
        let mut engine = Engine::new();
        let before = engine.board();
        let first = engine.legal_moves()[..MOVE_STRIDE].to_vec();
        assert_eq!(engine.play(&first), Ok(()));
        assert_eq!(engine.to_move(), 2);
        assert_ne!(engine.board(), before);
    }

    #[test]
    fn play_rejects_malformed_records() {
        let mut engine = Engine::new();
        assert!(engine.play(&[]).is_err());
        assert!(engine.play(&[1, 0, 0, 0]).is_err());
        assert!(engine.play(&[0, 0, 0, 0, 0, 0, 0, 0]).is_err());
        assert!(engine.play(&[4, 0, 0, 0, 0, 0, 0, 0]).is_err());
        assert!(engine.play(&[-1, 0, 0, 0, 0, 0, 0, 0]).is_err());
        assert!(engine.play(&[1, 6, 0, 4, 0, 0, 0, 0]).is_err());
        assert!(engine.play(&[1, -1, 0, 4, 0, 0, 0, 0]).is_err());
        assert_eq!(engine.to_move(), 1);
    }

    #[test]
    fn play_rejects_an_illegal_move_with_the_core_reason() {
        let mut engine = Engine::new();
        // (0,-4) is a White marble, Black may not move it.
        let err = engine.play(&[1, 0, 0, -4, 0, 0, 0, 0]).unwrap_err();
        assert_eq!(err, "Move(NotOwnMarble)");
        assert_eq!(engine.to_move(), 1);
    }

    /// Both sides play their first legal move until the game ends.
    fn play_until_over(engine: &mut Engine) {
        while engine.status() == 0 {
            let first = engine.legal_moves()[..MOVE_STRIDE].to_vec();
            engine.play(&first).unwrap();
        }
    }

    #[test]
    fn a_drawn_game_reports_draw_and_refuses_moves() {
        let mut engine = Engine::new();
        play_until_over(&mut engine);
        assert_eq!(engine.status(), 3);
        assert!((1..=2).contains(&engine.draw_reason()));
        assert!(engine.legal_moves().is_empty());
        assert!(engine.play(&[1, 0, 0, 0, 0, 0, 0, 0]).is_err());
    }

    #[test]
    fn auto_move_does_not_repeat_into_a_draw_where_best_move_does() {
        // The bot against itself on the standard board draws by repetition at ply 61 (#1500).
        let play = |auto: bool| {
            let mut engine = Engine::new();
            while engine.status() == 0 {
                let mv = if auto {
                    engine.auto_move(20)
                } else {
                    engine.best_move(20)
                };
                engine.play(&mv).unwrap();
            }
            (engine.status(), engine.draw_reason())
        };
        assert_eq!(play(false), (3, 1), "the plain search repeats");
        assert_ne!(play(true).1, 1, "the auto-played search does not");
    }

    #[test]
    fn auto_move_is_one_legal_record_and_empty_once_the_game_is_over() {
        let mut engine = Engine::new();
        let record = engine.auto_move(300);
        assert_eq!(record.len(), MOVE_STRIDE);
        engine.play(&record).unwrap();
        let mut over = Engine::new();
        while over.status() == 0 {
            let mv = over.best_move(5);
            over.play(&mv).unwrap();
        }
        assert!(over.auto_move(300).is_empty());
    }

    #[test]
    fn best_move_is_one_legal_record() {
        let engine = Engine::new();
        let record = engine.best_move(300);
        assert_eq!(record.len(), MOVE_STRIDE);
        assert!(engine
            .legal_moves()
            .chunks(MOVE_STRIDE)
            .any(|m| m == record.as_slice()));
    }

    #[test]
    fn best_move_can_be_played_and_the_bot_answers_for_white() {
        let mut engine = Engine::new();
        let first = engine.legal_moves()[..MOVE_STRIDE].to_vec();
        engine.play(&first).unwrap();
        let reply = engine.best_move(300);
        assert_eq!(engine.play(&reply), Ok(()));
        assert_eq!(engine.to_move(), 1);
    }

    #[test]
    fn best_move_is_empty_once_the_game_is_over() {
        let mut engine = Engine::new();
        play_until_over(&mut engine);
        assert!(engine.best_move(300).is_empty());
    }

    #[test]
    fn evaluate_is_the_core_position_score_for_the_side_to_move() {
        use edgefall_core::search::{position_score, WIN};
        let mut engine = Engine::new();
        let start = engine.evaluate(2000);
        assert_eq!(start, position_score(&Game::new(), 2000));
        assert!(start.abs() < WIN / 2, "a running game is not decided");
        let first = engine.legal_moves()[..MOVE_STRIDE].to_vec();
        engine.play(&first).unwrap();
        assert_eq!(engine.evaluate(2000), position_score(&engine.game, 2000));
    }

    #[test]
    fn evaluate_a_drawn_game_is_zero() {
        let mut engine = Engine::new();
        play_until_over(&mut engine);
        assert_eq!(engine.evaluate(300), 0);
    }

    #[test]
    fn a_game_is_won_at_6_ejections_for_both_sides() {
        let engine = Engine::new();
        assert_eq!((engine.win_ejections(1), engine.win_ejections(2)), (6, 6));
    }

    #[test]
    fn a_side_with_no_legal_move_passes_and_the_bridge_says_which() {
        use edgefall_core::board::Cell;
        let mut board = Board::empty();
        for (q, r) in [(3, -4), (3, -3), (4, -2)] {
            board.set(q, r, Cell::Black);
        }
        board.set(4, -4, Cell::White);
        let mut engine = Engine {
            game: Game::from_position(board, Player::Black, [0, 0]),
        };
        assert_eq!(engine.passed(), 0);
        // (4,-2) steps NW to (4,-3): White's corner marble is walled in and passes.
        engine.play(&[1, 4, 4, -2, 0, 0, 0, 0]).unwrap();
        assert_eq!((engine.to_move(), engine.passed()), (1, 2));
        assert_eq!(engine.status(), 0);
    }

    #[test]
    fn a_tactic_record_plays_in_a_rogue_lite_fight_and_the_mask_says_which_can() {
        let mut engine = Engine::with_army(7, 14);
        engine.place_special(0, 2, 1).unwrap();
        assert_eq!(engine.tactics(), 0b0111); // Reinforce, Freeze, Swap; nothing to fall back on
        engine.play(&[0, 1, 0, 0, 0, 0, 0, 0]).unwrap(); // Reinforce
        assert_eq!(engine.board().iter().filter(|&&c| c == 1).count(), 8);
        assert_eq!(engine.win_ejections(2), 5);
        engine.play(&[0, 2, 0, 0, 0, 0, 0, 0]).unwrap(); // Freeze
        assert_eq!(engine.tactics(), 0b0101);
        let first = engine.legal_moves()[..MOVE_STRIDE].to_vec();
        engine.play(&first).unwrap();
        assert_eq!((engine.to_move(), engine.passed()), (1, 2));
        assert_eq!(engine.tactics(), 0b1111);
        engine.play(&[0, 3, 0, 2, 1, 3, 0, 0]).unwrap(); // Swap (0, 2) with (1, 3)
        assert_eq!(engine.specials(), vec![1, 3, 1]);
        assert_eq!(engine.to_move(), 2);
        assert_eq!(engine.tactics(), 0);
        let reply = engine.legal_moves()[..MOVE_STRIDE].to_vec();
        engine.play(&reply).unwrap();
        engine.play(&[0, 4, 0, 0, 0, 0, 0, 0]).unwrap(); // Fall back
        assert_eq!(engine.specials(), vec![0, 2, 1]);
    }

    #[test]
    fn a_tactic_record_the_engine_refuses_is_an_error_and_changes_nothing() {
        let mut plain = Engine::new();
        assert_eq!(plain.tactics(), 0);
        assert!(plain
            .play(&[0, 2, 0, 0, 0, 0, 0, 0])
            .unwrap_err()
            .contains("NotRogueLite"));
        let mut engine = Engine::with_army(14, 14);
        let board = engine.board();
        assert!(engine
            .play(&[0, 1, 0, 0, 0, 0, 0, 0])
            .unwrap_err()
            .contains("NoFreeCell"));
        assert!(engine
            .play(&[0, 9, 0, 0, 0, 0, 0, 0])
            .unwrap_err()
            .contains("tactic"));
        assert!(engine
            .play(&[0, 2, 0, 0])
            .unwrap_err()
            .contains("8 integers"));
        assert_eq!(engine.board(), board);
        assert_eq!(engine.to_move(), 1);
    }

    #[test]
    fn ejected_counts_start_at_zero_for_both_sides() {
        let engine = Engine::new();
        assert_eq!(engine.ejected(1), 0);
        assert_eq!(engine.ejected(2), 0);
    }
}
