//! Rogue-lite run (docs/specs/roguelite.md): the map of a run from its seed, the fight of an
//! army that lost marbles in the fights before, and its special marbles.

use crate::board::{Board, Cell, PlaceError, Special, FUSE, STANDARD_BLACK};
use crate::encounter::hull::{mix, NEIGHBOURS};
use crate::encounter::marbles;
use crate::game::{Game, WIN_EJECTIONS};
use crate::moves::Player;
use crate::world::Biome;

/// Acts of a run, each ending on its boss node.
pub const ACTS: usize = 3;
/// The index of the fourth act (docs/specs/roguelite.md section 22): an elite then a final boss, walked only with the three
/// keys. Its two nodes come last in the map, so the nodes of the other acts keep their indices.
pub const FINAL_ACT: usize = ACTS;
/// Rows of fight nodes in an act, before its boss row.
pub const FIGHT_ROWS: usize = 3;
/// Marbles of the army at the start of a run: the standard layout.
pub const FULL_ARMY: u8 = 14;
/// Below this many marbles the run is over.
pub const MIN_ARMY: u8 = 4;
/// Marbles of the bot against a fight node (#1145): its standard layout without the 4 of its front row.
pub const FIGHT_FOES: u8 = 10;
/// Marbles of the bot in the first fight of a run (#1502): act 1, row 1.
pub const FIRST_FOES: u8 = 8;

/// What a node of the map holds (docs/specs/roguelite.md section 2). Its value is its code on
/// the bridge.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NodeKind {
    Fight = 0,
    Boss = 1,
    Elite = 2,
    Rest = 3,
    Event = 4,
    Treasure = 5,
    Shop = 6,
    /// A "?" node (#1463): the page turns it into an event, a fight or a treasure when it is
    /// entered. It took the place of the Event in the draw, so no map holds an `Event` any more.
    Unknown = 7,
    /// A secret room (docs/specs/roguelite.md section 27), drawn only on the map of a run that holds the rune of the room. The page
    /// plays it as a treasure.
    Secret = 8,
}

/// The runes a player owns, as a bit mask (docs/specs/roguelite.md section 27): each opens one kind of hidden branch on the maps
/// of later runs. The room adds a secret room to each act, the shortcut a link that skips a row, the exit a third biome exit.
pub const RUNE_ROOM: u8 = 1;
pub const RUNE_SHORTCUT: u8 = 2;
pub const RUNE_EXIT: u8 = 4;

/// A relic of a rogue-lite run (docs/specs/roguelite.md section 9): a passive effect for the rest of
/// the run, its value its code on the bridge. The engine plays the two that act inside a fight, on
/// the army's marbles (Black): the Gyroscope in a push and the Detonator in a Spark's burst. The
/// page plays the others between and around the fights.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Relic {
    Gyroscope = 0,
    HullPlating = 1,
    SalvageMagnet = 2,
    Jammer = 3,
    Detonator = 4,
    Bunks = 5,
    LuckyCoin = 6,
    Bargain = 7,
    Saboteur = 8,
    Dampener = 9,
    WarChest = 10,
    Quartermaster = 11,
}

impl Relic {
    /// Every relic, in the order of its code.
    pub const ALL: [Relic; 12] = [
        Relic::Gyroscope,
        Relic::HullPlating,
        Relic::SalvageMagnet,
        Relic::Jammer,
        Relic::Detonator,
        Relic::Bunks,
        Relic::LuckyCoin,
        Relic::Bargain,
        Relic::Saboteur,
        Relic::Dampener,
        Relic::WarChest,
        Relic::Quartermaster,
    ];

    /// Its bit in a set of relics: `1` shifted by its code.
    pub fn bit(self) -> u32 {
        1 << self as u32
    }
}

/// An affinity of a rogue-lite run (docs/specs/roguelite.md section 23): a family of special marbles a scroll grows
/// by a level, its value its code on the bridge. The engine plays the bonuses on the army's marbles (Black).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Affinity {
    /// The Heavy and the Heavy+: they weigh more in a push.
    Force = 0,
    /// The Anchor, the Anchor+ and the Shield.
    Tactics = 1,
    /// The Spark, the Spark+ and the Bomb.
    Chaos = 2,
}

/// The highest level of an affinity.
pub const MAX_AFFINITY: u8 = 2;

/// What the army's affinities add to the weight of the special marble `kind` on `cell` in a push (docs/specs/roguelite.md
/// section 23): Force adds its level to a Heavy and a Heavy+, Tactics 2 adds 1 to an Anchor, an Anchor+ and a Shield. The
/// enemy's marbles gain nothing.
pub(crate) fn affinity_weight(board: &Board, (q, r): (i32, i32), kind: Special) -> u32 {
    if board.get(q, r) != Some(Cell::Black) {
        return 0;
    }
    match kind {
        Special::Heavy | Special::HeavyPlus => u32::from(board.affinity(Affinity::Force)),
        Special::Shield => u32::from(board.affinity(Affinity::Tactics) >= 2),
        _ => u32::from(kind.anchor() && board.affinity(Affinity::Tactics) >= 2),
    }
}

/// Whether the special marble on `cell` keeps the marble in front of it in a pushed line on the board: an Anchor+, and
/// the army's Anchor with Tactics 1 (section 23).
pub(crate) fn keeps_in_front(board: &Board, (q, r): (i32, i32)) -> bool {
    match board.special((q, r)) {
        Some(Special::AnchorPlus) => true,
        Some(Special::Anchor) => {
            board.get(q, r) == Some(Cell::Black) && board.affinity(Affinity::Tactics) >= 1
        }
        _ => false,
    }
}

/// How the bot's marbles stand at the start of a fight or an elite (docs/specs/roguelite.md section
/// 14), its value its code on the bridge. The army always stands on the standard layout, so the
/// daisies are the flowers of the Belgian daisy (`Board::belgian_daisy`) set on the bot's half.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Formation {
    Standard = 0,
    BelgianDaisy = 1,
    GermanDaisy = 2,
    Snake = 3,
    Wedge = 4,
}

/// Two flowers (a cell and its six neighbours) on the corners of the bot's back edge.
const BELGIAN_DAISY_FOES: [(i32, i32); 14] = [
    (0, -4),
    (1, -4),
    (1, -3),
    (0, -3),
    (-1, -3),
    (0, -2),
    (-1, -2),
    (3, -4),
    (4, -4),
    (4, -3),
    (3, -3),
    (2, -3),
    (3, -2),
    (2, -2),
];

/// Two flowers on the corners of the bot's sides, left and right.
const GERMAN_DAISY_FOES: [(i32, i32); 14] = [
    (-3, 0),
    (-2, 0),
    (-4, 0),
    (-3, 1),
    (-3, -1),
    (-2, -1),
    (-4, 1),
    (3, 0),
    (4, 0),
    (2, 0),
    (3, 1),
    (3, -1),
    (4, -1),
    (2, 1),
];

/// A chain along the back edge, back across the second row and forward on the third.
const SNAKE_FOES: [(i32, i32); 14] = [
    (4, -4),
    (3, -4),
    (2, -4),
    (1, -4),
    (0, -4),
    (-1, -3),
    (-1, -2),
    (0, -2),
    (1, -2),
    (2, -2),
    (3, -2),
    (3, -1),
    (2, -1),
    (1, -1),
];

/// A triangle of 5, 4, 3 and 2 marbles pointing at the army.
const WEDGE_FOES: [(i32, i32); 14] = [
    (0, -4),
    (1, -4),
    (2, -4),
    (3, -4),
    (4, -4),
    (0, -3),
    (1, -3),
    (2, -3),
    (3, -3),
    (0, -2),
    (1, -2),
    (2, -2),
    (0, -1),
    (1, -1),
];

impl Formation {
    /// Every formation, in the order of its code.
    pub const ALL: [Formation; 5] = [
        Formation::Standard,
        Formation::BelgianDaisy,
        Formation::GermanDaisy,
        Formation::Snake,
        Formation::Wedge,
    ];

    /// The formation of a bridge code, `None` for an unknown one.
    pub fn from_code(code: u8) -> Option<Formation> {
        Self::ALL.get(usize::from(code)).copied()
    }

    /// The cells of `count` White marbles (clamped to `MIN_ARMY..=FULL_ARMY`): the standard layout
    /// without its front row first, any other formation without the marbles nearest the centre
    /// first.
    pub fn cells(self, count: u8) -> Vec<(i32, i32)> {
        let mut cells: Vec<(i32, i32)> = match self {
            Formation::Standard => STANDARD_BLACK.iter().map(|&(q, r)| (-q, -r)).collect(),
            other => {
                let mut cells = match other {
                    Formation::BelgianDaisy => BELGIAN_DAISY_FOES,
                    Formation::GermanDaisy => GERMAN_DAISY_FOES,
                    Formation::Snake => SNAKE_FOES,
                    _ => WEDGE_FOES,
                };
                cells.sort_by_key(|&(q, r)| {
                    (
                        std::cmp::Reverse(q.abs().max(r.abs()).max((q + r).abs())),
                        q,
                        r,
                    )
                });
                cells.to_vec()
            }
        };
        cells.truncate(usize::from(count.clamp(MIN_ARMY, FULL_ARMY)));
        cells
    }
}

/// The named style of an elite (docs/specs/roguelite.md section 14), its value its code on the
/// bridge (`0` is no elite).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Elite {
    /// Anchors.
    Wall = 1,
    /// Sparks and Bombs.
    Artificer = 2,
    /// Heavies.
    Brute = 3,
}

impl Elite {
    /// Every archetype, in the order of its code.
    pub const ALL: [Elite; 3] = [Elite::Wall, Elite::Artificer, Elite::Brute];

    /// The special marbles of an elite of act `act`: `act + 2`, all of its own kind, the Artificer's
    /// Sparks first and as many Bombs, the odd one a Spark.
    fn kinds(self, act: usize) -> Vec<Special> {
        let n = act + 2;
        match self {
            Elite::Wall => vec![Special::Anchor; n],
            Elite::Brute => vec![Special::Heavy; n],
            Elite::Artificer => (0..n)
                .map(|i| {
                    if i < n.div_ceil(2) {
                        Special::Spark
                    } else {
                        Special::Bomb(FUSE)
                    }
                })
                .collect(),
        }
    }
}

/// Where the point-symmetric holes of each biome open on a fight's board (docs/specs/roguelite.md section 18):
/// the cells The Hull and The Ballast Mind remove (`Board::void`), in the middle band where no army stands. A hole
/// is never opened on a marble.
const FOREST_HOLES: [(i32, i32); 2] = [(-2, 1), (2, -1)];
const TUNDRA_HOLES: [(i32, i32); 3] = [(-1, 1), (0, 0), (1, -1)];
const DESERT_HOLES: [(i32, i32); 2] = [(-1, 0), (1, 0)];
const BADLANDS_HOLES: [(i32, i32); 4] = [(-3, 1), (-2, 0), (2, 0), (3, -1)];
const ARCHIPELAGO_HOLES: [(i32, i32); 5] = [(0, 1), (-1, 0), (0, 0), (1, 0), (0, -1)];

/// The biomes of a run's acts (docs/specs/roguelite.md section 18), the Open world's: its code is the world's. Act 1 is the
/// Meadow; at the end of an act two exits lead to other biomes for the next.
impl Biome {
    /// Every biome, in the order of its code.
    pub const ALL: [Biome; 6] = [
        Biome::Meadow,
        Biome::Forest,
        Biome::Tundra,
        Biome::Desert,
        Biome::Badlands,
        Biome::Archipelago,
    ];

    /// The biome of a bridge code, `None` for an unknown one.
    pub fn from_code(code: u8) -> Option<Biome> {
        Self::ALL.get(usize::from(code)).copied()
    }

    /// The cells it opens on the board of a fight: none in the Meadow.
    fn holes(self) -> &'static [(i32, i32)] {
        match self {
            Biome::Meadow => &[],
            Biome::Forest => &FOREST_HOLES,
            Biome::Tundra => &TUNDRA_HOLES,
            Biome::Desert => &DESERT_HOLES,
            Biome::Badlands => &BADLANDS_HOLES,
            Biome::Archipelago => &ARCHIPELAGO_HOLES,
        }
    }

    /// The special marble every fight of the biome holds among the bot's, one of the first five kinds so it is dealt
    /// from act 2 on; the Meadow has none.
    pub fn signature(self) -> Option<Special> {
        match self {
            Biome::Meadow => None,
            Biome::Forest => Some(Special::Anchor),
            Biome::Tundra => Some(Special::Shield),
            Biome::Desert => Some(Special::Spark),
            Biome::Badlands => Some(Special::Heavy),
            Biome::Archipelago => Some(Special::Magnet),
        }
    }
}

/// The biomes the exits at the end of act `act - 1` could lead to for act `act` of the run `seed` that left the biome `from`
/// and began in `first`, in the order they are offered: never the Meadow, `from` nor `first`, drawn from the seed and the act.
/// The third is the secret exit.
fn exit_pool(seed: u64, act: usize, from: Biome, first: Biome) -> Vec<Biome> {
    let mut pool: Vec<Biome> = Biome::ALL[1..]
        .iter()
        .copied()
        .filter(|&b| b != from && b != first)
        .collect();
    let mut state = mix(seed ^ mix(act as u64 | 4 << 32));
    for i in 0..3 {
        let j = i + (draw(&mut state) % (pool.len() - i) as u64) as usize;
        pool.swap(i, j);
    }
    pool
}

/// The two biomes the exits at the end of act `act - 1` lead to, for act `act` (1 or 2) of the run `seed` that
/// left the biome `from`: two different ones, never the Meadow nor `from`, drawn from the seed and the act.
pub fn exits(seed: u64, act: usize, from: Biome) -> [Biome; 2] {
    let pool = exit_pool(seed, act, from, Biome::Meadow);
    [pool[0], pool[1]]
}

/// The exits of `exits` and, with the rune of the exit (`RUNE_EXIT`, section 27), a third one: another biome of the same draw.
pub fn exits_with(seed: u64, act: usize, from: Biome, runes: u8) -> Vec<Biome> {
    exits_after(seed, act, from, Biome::Meadow, runes)
}

/// The exits of a run that began in `first` (a dungeon gate's biome, #1597): `exits_with` and never `first` either. With the Meadow it is `exits_with`.
pub fn exits_after(seed: u64, act: usize, from: Biome, first: Biome, runes: u8) -> Vec<Biome> {
    let mut pool = exit_pool(seed, act, from, first);
    pool.truncate(2 + usize::from(runes & RUNE_EXIT != 0));
    pool
}

/// One node of the map. `links` are the columns of the next row of the same act it leads to,
/// ascending; a boss node has none (it leads to the first row of the next act). `skips` are the columns of the
/// row after the next it leads to, the shortcut of a run with its rune (section 27). A fight or an
/// elite has the `formation` of the bot's army, an elite its archetype.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Node {
    pub act: usize,
    pub row: usize,
    pub col: usize,
    pub kind: NodeKind,
    pub links: Vec<usize>,
    pub skips: Vec<usize>,
    pub formation: Formation,
    pub elite: Option<Elite>,
}

/// The next splitmix64 draw of `state`.
fn draw(state: &mut u64) -> u64 {
    *state = mix(*state);
    *state
}

/// The links from a row of `from` nodes to a row of `to` nodes: a walk from the first pair to the
/// last that steps one row, the other or both at random, so every node leads on, every node of the
/// next row is reached and no two paths cross.
fn links(from: usize, to: usize, state: &mut u64) -> Vec<Vec<usize>> {
    let mut out = vec![Vec::new(); from];
    let (mut i, mut j) = (0, 0);
    out[0].push(0);
    while i + 1 < from || j + 1 < to {
        let step = match (i + 1 < from, j + 1 < to) {
            (true, true) => draw(state) % 3,
            (true, false) => 0,
            _ => 1,
        };
        i += usize::from(step != 1);
        j += usize::from(step != 0);
        out[i].push(j);
    }
    out
}

/// The kinds a node after the first row of an act draws from, equally likely. The Treasure took
/// the place of a second Event (#1457), the Shop the place of a second Fight (#1459) and the
/// Unknown the place of the Event (#1463), so a run saved before keeps its other kinds.
const DRAWN: [NodeKind; 6] = [
    NodeKind::Shop,
    NodeKind::Fight,
    NodeKind::Elite,
    NodeKind::Unknown,
    NodeKind::Treasure,
    NodeKind::Rest,
];

/// The kind of node `index` of the map of `seed` on `row` of its act: the first row fights, the
/// boss row its boss, the others drawn from `DRAWN`. Its own draw, apart from the map's shape, so
/// the shape stays the one of the runs saved before the kinds (#800).
fn kind(seed: u64, index: usize, row: usize) -> NodeKind {
    match row {
        0 => NodeKind::Fight,
        FIGHT_ROWS => NodeKind::Boss,
        _ => DRAWN[(mix(seed ^ mix(index as u64)) % DRAWN.len() as u64) as usize],
    }
}

/// The formation of the bot's army at node `index` of the map of `seed` and, for an elite, its
/// archetype: each its own draw, apart from the map's shape and the kinds. Only a fight and an
/// elite have them.
fn foes_of(seed: u64, index: usize, kind: NodeKind) -> (Formation, Option<Elite>) {
    let pick =
        |salt: u64, n: usize| (mix(seed ^ mix(index as u64 | salt << 32)) % n as u64) as usize;
    match kind {
        NodeKind::Fight | NodeKind::Elite => (
            Formation::ALL[pick(1, Formation::ALL.len())],
            (kind == NodeKind::Elite).then(|| Elite::ALL[pick(2, Elite::ALL.len())]),
        ),
        _ => (Formation::Standard, None),
    }
}

/// Whether two neighbours of a row, whose links are `out`, lead to nodes none of which they share: taking one leaves the other's way behind.
fn forks(out: &[Vec<usize>]) -> bool {
    out.windows(2).any(|w| w[0].last() < w[1].first())
}

/// The pacing of an act of the map of version 1 (#1543): the nodes `nodes` of an act, the first of them at index `first` of the map,
/// get at most one elite a row (the others fight) and a rest or a shop to go to after every node of the row before the last.
fn pace(nodes: &mut [Node], seed: u64, first: usize) {
    let set = |nodes: &mut [Node], i: usize, kind: NodeKind| {
        let (formation, elite) = foes_of(seed, first + i, kind);
        nodes[i].kind = kind;
        nodes[i].formation = formation;
        nodes[i].elite = elite;
    };
    let rows = |nodes: &[Node], row: usize| -> Vec<usize> {
        (0..nodes.len()).filter(|&i| nodes[i].row == row).collect()
    };
    for row in 1..FIGHT_ROWS {
        let elites: Vec<usize> = rows(nodes, row)
            .into_iter()
            .filter(|&i| nodes[i].kind == NodeKind::Elite)
            .collect();
        for &i in elites.iter().skip(1) {
            set(nodes, i, NodeKind::Fight);
        }
    }
    let last = rows(nodes, FIGHT_ROWS - 1);
    for i in rows(nodes, FIGHT_ROWS - 2) {
        let ways: Vec<usize> = nodes[i].links.iter().map(|&c| last[c]).collect();
        if !ways
            .iter()
            .any(|&j| matches!(nodes[j].kind, NodeKind::Rest | NodeKind::Shop))
        {
            let j = ways[ways.len() - 1];
            let kind = if mix(seed ^ mix((first + j) as u64 | 7 << 32)).is_multiple_of(2) {
                NodeKind::Rest
            } else {
                NodeKind::Shop
            };
            set(nodes, j, kind);
        }
    }
}

/// The map of the run `seed`: act by act, row by row, column ascending. A fight row has 2 to 4
/// nodes, the boss row one; the fourth act (`FINAL_ACT`) has an elite and its boss.
pub fn run_map(seed: u64) -> Vec<Node> {
    run_map_with(seed, 0)
}

/// The map of the run `seed` of a player who owns the runes `runes` (`RUNE_*`, section 27): the map of `run_map` with the hidden
/// branches the runes open. The secret rooms come after every other node, so a node keeps its index.
pub fn run_map_with(seed: u64, runes: u8) -> Vec<Node> {
    run_map_v(seed, runes, 0)
}

/// The version of the map a new run is dealt (`run_map_v`): 0 is the map of the runs saved before #1543, 1 the paced map.
pub const MAP_VERSION: u8 = 1;

/// `run_map_with` at the generation `version` of the map: the version a run was dealt is saved with it, so a run in progress keeps its nodes.
pub fn run_map_v(seed: u64, runes: u8, version: u8) -> Vec<Node> {
    let mut state = seed;
    let mut map = Vec::new();
    for act in 0..ACTS {
        let mut widths: Vec<usize> = (0..FIGHT_ROWS)
            .map(|_| 2 + (draw(&mut state) % 3) as usize)
            .collect();
        widths.push(1);
        let mut outs: Vec<Vec<Vec<usize>>> = (0..=FIGHT_ROWS)
            .map(|row| match widths.get(row + 1) {
                Some(&next) => links(widths[row], next, &mut state),
                None => vec![Vec::new()],
            })
            .collect();
        if version >= 1 && !(0..FIGHT_ROWS - 1).any(|r| forks(&outs[r])) {
            let mut own = mix(seed ^ mix(act as u64 | 6 << 32));
            while !forks(&outs[0]) {
                outs[0] = links(widths[0], widths[1], &mut own);
            }
        }
        let mut nodes = Vec::new();
        for (row, out) in outs.into_iter().enumerate() {
            let first = map.len() + nodes.len();
            nodes.extend(out.into_iter().enumerate().map(|(col, links)| {
                let kind = kind(seed, first + col, row);
                let (formation, elite) = foes_of(seed, first + col, kind);
                Node {
                    act,
                    row,
                    col,
                    kind,
                    links,
                    skips: Vec::new(),
                    formation,
                    elite,
                }
            }));
        }
        if version >= 1 {
            pace(&mut nodes, seed, map.len());
        }
        map.extend(nodes);
    }
    for (row, kind) in [NodeKind::Elite, NodeKind::Boss].into_iter().enumerate() {
        let (formation, elite) = foes_of(seed, map.len(), kind);
        map.push(Node {
            act: FINAL_ACT,
            row,
            col: 0,
            kind,
            links: if row == 0 { vec![0] } else { Vec::new() },
            skips: Vec::new(),
            formation,
            elite,
        });
    }
    open_runes(&mut map, seed, runes);
    map
}

/// Opens the hidden branches of `runes` on `map` of the run `seed`, act by act (section 27). The rune of the shortcut links a
/// node of the first row to a node of the third; the rune of the room adds, at the end of the second row, a room reached from the last
/// node of the first row that leads to the last node of the third: neither crosses a path of the map.
fn open_runes(map: &mut Vec<Node>, seed: u64, runes: u8) {
    for act in 0..ACTS {
        let width = |map: &[Node], row| map.iter().filter(|n| n.act == act && n.row == row).count();
        let (w0, w1, w2) = (width(map, 0), width(map, 1), width(map, 2));
        let mut state = mix(seed ^ mix(act as u64 | 5 << 32));
        if runes & RUNE_SHORTCUT != 0 {
            let (from, to) = (
                draw(&mut state) as usize % w0,
                draw(&mut state) as usize % w2,
            );
            map.iter_mut()
                .find(|n| (n.act, n.row, n.col) == (act, 0, from))
                .unwrap()
                .skips
                .push(to);
        }
        if runes & RUNE_ROOM != 0 {
            map.iter_mut()
                .find(|n| (n.act, n.row, n.col) == (act, 0, w0 - 1))
                .unwrap()
                .links
                .push(w1);
            map.push(Node {
                act,
                row: 1,
                col: w1,
                kind: NodeKind::Secret,
                links: vec![w2 - 1],
                skips: Vec::new(),
                formation: Formation::Standard,
                elite: None,
            });
        }
    }
}

/// The special marbles of `next`, the board after a ply of the `mover` on `board` that moved the
/// marbles on `moved` one step along `d`, threw the one on `off` off the board and spent the Shields
/// on `spent` (docs/specs/roguelite.md sections 5 and 13): the marks follow their marbles, the
/// Magnets that moved pull, an ejected Spark bursts, the mover's Bombs burn and the Medics thrown
/// off come back. Returns whether a Bomb burst, which takes its own marble off the board.
pub(crate) fn carry_specials(
    board: &Board,
    next: &mut Board,
    moved: &[(i32, i32)],
    (dq, dr): (i32, i32),
    off: Option<(i32, i32)>,
    mover: Cell,
    spent: &[(i32, i32)],
) -> bool {
    let mut magnets = Vec::new();
    let mut specials: Vec<_> = board
        .specials()
        .iter()
        .filter(|s| Some(s.0) != off && !spent.contains(&s.0))
        .map(|&((q, r), kind)| {
            if moved.contains(&(q, r)) {
                if kind == Special::Magnet {
                    magnets.push((q + dq, r + dr));
                }
                ((q + dq, r + dr), kind)
            } else {
                ((q, r), kind)
            }
        })
        .collect();
    magnets.sort();
    for magnet in magnets {
        pull(next, &mut specials, magnet);
    }
    let reach = off.and_then(|c| board.special(c)).map_or(0, Special::burst);
    if let Some(spark) = off.filter(|_| reach > 0) {
        // The army's Detonator: its Sparks push 1 cell further (a Spark+ 3).
        let army = board.get(spark.0, spark.1) == Some(Cell::Black);
        // And Chaos 1 one cell further again (section 23).
        let reach = reach
            + i32::from(army && board.has_relic(Relic::Detonator))
            + i32::from(army && board.affinity(Affinity::Chaos) >= 1);
        burst(next, &mut specials, spark, reach);
    }
    specials.sort_by_key(|s| s.0);
    let bombed = burn(next, &mut specials, mover);
    revive(board, next, &specials);
    next.set_specials(specials);
    bombed
}

/// The Magnet on `magnet` pulls the first enemy marble in line two cells away, in the order of the
/// directions, one cell toward it, when the cell between is free. A pulled marble keeps its mark.
/// The Magnets that moved in one ply sit in one line with the marbles they pushed, so none pulls
/// another.
fn pull(next: &mut Board, specials: &mut [((i32, i32), Special)], magnet: (i32, i32)) {
    let side = next.get(magnet.0, magnet.1);
    let mut toward = NEIGHBOURS;
    toward.sort();
    for (dq, dr) in toward {
        let (near, far) = (
            (magnet.0 + dq, magnet.1 + dr),
            (magnet.0 + 2 * dq, magnet.1 + 2 * dr),
        );
        let Some(foe @ (Cell::Black | Cell::White)) = next.get(far.0, far.1) else {
            continue;
        };
        if Some(foe) == side || next.get(near.0, near.1) != Some(Cell::Empty) {
            continue;
        }
        next.set(far.0, far.1, Cell::Empty);
        next.set(near.0, near.1, foe);
        if let Some(mark) = specials.iter_mut().find(|s| s.0 == far) {
            mark.0 = near;
        }
        return;
    }
}

/// The `mover`'s Bombs each lose a turn of their fuse (two for the army's with Chaos 2); those at 0 burst like a Spark
/// where they stand (1 cell, 2 for the army's with Chaos 1) and are gone with their marble. Returns whether one did.
fn burn(next: &mut Board, specials: &mut Vec<((i32, i32), Special)>, mover: Cell) -> bool {
    let chaos = next.affinity(Affinity::Chaos);
    let army = mover == Cell::Black;
    for (cell, kind) in specials.iter_mut() {
        if let Special::Bomb(turns) = kind {
            if next.get(cell.0, cell.1) == Some(mover) {
                *turns = turns.saturating_sub(1 + u8::from(army && chaos >= 2));
            }
        }
    }
    let mut bombed = false;
    while let Some(i) = specials.iter().position(|s| s.1 == Special::Bomb(0)) {
        let (cell, _) = specials.remove(i);
        let reach = 1 + i32::from(next.get(cell.0, cell.1) == Some(Cell::Black) && chaos >= 1);
        next.set(cell.0, cell.1, Cell::Empty);
        burst(next, specials, cell, reach);
        bombed = true;
    }
    bombed
}

/// The Medics of `board` that no longer have a mark in `specials` were thrown off the board: each
/// comes back as a plain marble on the first free cell of its side's back row, in the order of the
/// standard layout, and is lost when the row is full.
fn revive(board: &Board, next: &mut Board, specials: &[((i32, i32), Special)]) {
    let medics = |marks: &[((i32, i32), Special)], on: &Board, side: Cell| {
        marks
            .iter()
            .filter(|s| s.1 == Special::Medic && on.get(s.0 .0, s.0 .1) == Some(side))
            .count()
    };
    for side in [Cell::Black, Cell::White] {
        let mut gone = medics(board.specials(), board, side) - medics(specials, next, side);
        let flip = if side == Cell::Black { 1 } else { -1 };
        for &(q, r) in &STANDARD_BLACK[..5] {
            let (q, r) = (q * flip, r * flip);
            if gone > 0 && next.get(q, r) == Some(Cell::Empty) {
                next.set(q, r, side);
                gone -= 1;
            }
        }
    }
}

/// A Spark's burst from its last cell: each marble next to it slides `reach` cells straight away
/// from it, stops before a marble, and goes off the board past the rim, unless it is an Anchor (or an
/// Anchor+), which stops on the rim. A Spark it throws off does not burst. The order, by cell, changes nothing: each
/// neighbour slides along its own ray from the Spark.
fn burst(
    next: &mut Board,
    specials: &mut Vec<((i32, i32), Special)>,
    (sq, sr): (i32, i32),
    reach: i32,
) {
    let mut away = NEIGHBOURS;
    away.sort();
    for (dq, dr) in away {
        let (q, r) = (sq + dq, sr + dr);
        let Some(marble @ (Cell::Black | Cell::White)) = next.get(q, r) else {
            continue;
        };
        let mark = specials.iter().position(|s| s.0 == (q, r));
        let anchor = mark.is_some_and(|i| specials[i].1.anchor());
        let (mut to, mut off) = ((q, r), false);
        for _ in 0..reach {
            match next.get(to.0 + dq, to.1 + dr) {
                Some(Cell::Empty) => to = (to.0 + dq, to.1 + dr),
                None if !anchor => {
                    off = true;
                    break;
                }
                _ => break,
            }
        }
        if !off && to == (q, r) {
            continue;
        }
        next.set(q, r, Cell::Empty);
        if off {
            if let Some(i) = mark {
                specials.remove(i);
            }
        } else {
            next.set(to.0, to.1, marble);
            if let Some(i) = mark {
                specials[i].0 = to;
            }
        }
    }
}

/// The ejections a ply credits to Black and to White, `ejected` being whether the push of `mover`
/// threw a marble off `before`, giving `after`. On a rogue-lite board a Spark's burst can throw
/// more off, of both colours: each marble gone counts for the opponent of its colour.
pub fn credits(before: &Board, mover: Player, ejected: bool, after: &Board) -> [u8; 2] {
    if ejected && before.rogue_lite() {
        return [Cell::White, Cell::Black].map(|c| marbles(before, c) - marbles(after, c));
    }
    let mut credits = [0, 0];
    credits[usize::from(mover == Player::White)] = u8::from(ejected);
    credits
}

/// A fight of an army of `army` marbles (clamped to `MIN_ARMY..=FULL_ARMY`) against the bot's
/// full 14, see `army_game_against`.
pub fn army_game(army: u8) -> Game {
    army_game_against(army, FULL_ARMY)
}

/// A fight of an army of `army` marbles against the bot's `foes` (both clamped to
/// `MIN_ARMY..=FULL_ARMY`), on the standard layout less the missing marbles: the army's back row
/// first, the bot's front row first. The bot wins once the army is down to 3 marbles, which ends
/// the run; the army wins at the usual 6 ejections.
pub fn army_game_against(army: u8, foes: u8) -> Game {
    army_fight(army, &Formation::Standard.cells(foes), Biome::Meadow)
}

/// The army's fight against White marbles on `foes`, on the board of `biome`: its holes opened on the cells no marble
/// stands on.
fn army_fight(army: u8, foes: &[(i32, i32)], biome: Biome) -> Game {
    let army = army.clamp(MIN_ARMY, FULL_ARMY);
    let mut board = Board::standard();
    for &(q, r) in &STANDARD_BLACK[..usize::from(FULL_ARMY - army)] {
        board.set(q, r, Cell::Empty);
    }
    for &(q, r) in &STANDARD_BLACK {
        board.set(-q, -r, Cell::Empty);
    }
    for &(q, r) in foes {
        board.set(q, r, Cell::White);
    }
    for &(q, r) in biome.holes() {
        if board.get(q, r) == Some(Cell::Empty) {
            board.void(q, r);
        }
    }
    board.set_rogue_lite();
    Game::from_position(board, Player::Black, [0, 0])
        .with_win([WIN_EJECTIONS, (army - (MIN_ARMY - 1)).min(WIN_EJECTIONS)])
}

/// The bot's army in a fight or an elite (docs/specs/roguelite.md section 14): how many marbles,
/// their formation and the special ones among them, and the biome whose holes the board opens (section 18).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FoePlan {
    pub count: u8,
    pub formation: Formation,
    pub specials: Vec<((i32, i32), Special)>,
    pub biome: Biome,
}

/// The bot's army at node `index` of the map of `seed`, `less` marbles short (the Saboteur): a
/// pure function of the seed and the node. A fight, or an Unknown node the page turned into
/// one (#1463), has `FIGHT_FOES` marbles, the first fight of the run `FIRST_FOES` (#1502), and an elite `FULL_ARMY`, in the node's formation. A fight holds `act + 1` special marbles of different
/// kinds, from the Heavy, Anchor and Spark in act 1, with the Magnet and Shield in act 2 and the
/// Bomb and Medic in act 3; an elite holds its archetype's. In a `biome` (section 18) a fight also always holds the
/// biome's signature special marble, in place of its first kind when it was not dealt. Any other node, or an index off
/// the map, has the plain army.
pub fn foe_plan(seed: u64, index: usize, less: u8, biome: Biome) -> FoePlan {
    foe_plan_with(seed, index, less, biome, 0)
}

/// `foe_plan` with `more` special marbles added to a fight's or an elite's (the ascension levels,
/// docs/specs/roguelite.md section 20): a fight's are other kinds of its act's pool while the pool
/// lasts, an elite's more of its own style. At most one to a marble; `more` 0 is `foe_plan`.
pub fn foe_plan_with(seed: u64, index: usize, less: u8, biome: Biome, more: u8) -> FoePlan {
    foe_plan_v(seed, index, less, biome, more, 0)
}

/// `foe_plan_with` on the map of the generation `version` (`run_map_v`).
pub fn foe_plan_v(
    seed: u64,
    index: usize,
    less: u8,
    biome: Biome,
    more: u8,
    version: u8,
) -> FoePlan {
    let map = run_map_v(seed, 0, version);
    let Some(node) = map.get(index).filter(|n| {
        matches!(
            n.kind,
            NodeKind::Fight | NodeKind::Elite | NodeKind::Unknown
        )
    }) else {
        return FoePlan {
            count: FULL_ARMY,
            formation: Formation::Standard,
            specials: Vec::new(),
            biome,
        };
    };
    let base = if node.kind == NodeKind::Elite {
        FULL_ARMY
    } else if node.act == 0 && node.row == 0 {
        FIRST_FOES
    } else {
        FIGHT_FOES
    };
    let count = base.saturating_sub(less).max(MIN_ARMY);
    let mut cells = node.formation.cells(count);
    let mut state = mix(seed ^ mix(index as u64 | 3 << 32));
    let kinds = match node.elite {
        Some(elite) => elite.kinds(node.act + usize::from(more)),
        None => {
            let mut pool = vec![
                Special::Heavy,
                Special::Anchor,
                Special::Spark,
                Special::Magnet,
                Special::Shield,
                Special::Bomb(FUSE),
                Special::Medic,
            ];
            pool.truncate(3 + 2 * node.act);
            let mut kinds: Vec<Special> = (0..(node.act + 1 + usize::from(more)).min(pool.len()))
                .map(|i| {
                    let j = i + (draw(&mut state) % (pool.len() - i) as u64) as usize;
                    pool.swap(i, j);
                    pool[i]
                })
                .collect();
            if let Some(signature) = biome.signature().filter(|s| !kinds.contains(s)) {
                kinds[0] = signature;
            }
            kinds
        }
    };
    let specials = kinds
        .into_iter()
        .take(cells.len())
        .enumerate()
        .map(|(i, kind)| {
            let j = i + (draw(&mut state) % (cells.len() - i) as u64) as usize;
            cells.swap(i, j);
            (cells[i], kind)
        })
        .collect();
    FoePlan {
        count,
        formation: node.formation,
        specials,
        biome,
    }
}

/// A fight of an army of `army` marbles against the bot's army of `plan`, its special marbles
/// placed. Refused when a special marble sits on a cell with no marble.
pub fn army_game_formed(army: u8, plan: &FoePlan) -> Result<Game, PlaceError> {
    let mut game = army_fight(army, &plan.formation.cells(plan.count), plan.biome);
    for &(cell, kind) in &plan.specials {
        game.place_special(cell, kind)?;
    }
    Ok(game)
}

/// Marbles the player can lose over a whole Trainer run (#1159): the 6 of a standard loss.
pub const TRAINER_MARBLES: u8 = 6;

/// A Trainer wave (#1159): the player's full 14 marbles against the bot's `wave` marbles (clamped
/// to `1..=FULL_ARMY`), its front ones, on the standard rules. Black wins once every one of them is
/// out, White once the player has lost the `left` marbles (clamped to `1..=TRAINER_MARBLES`) of the
/// run's pool. A lone marble can run for ever, so a draw by repetition or idle plies is a win for
/// Black that still reports its `draw_reason`: the page counts it as a marble lost.
pub fn trainer_game(wave: u8, left: u8) -> Game {
    let wave = wave.clamp(1, FULL_ARMY);
    let mut board = Board::standard();
    for &(q, r) in &STANDARD_BLACK[..usize::from(FULL_ARMY - wave)] {
        board.set(-q, -r, Cell::Empty);
    }
    Game::from_position(board, Player::Black, [0, 0])
        .with_win([wave, left.clamp(1, TRAINER_MARBLES)])
        .with_draw_to(Player::Black)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::board::{Board, Cell};
    use crate::moves::Player;

    fn row(map: &[Node], act: usize, row: usize) -> Vec<&Node> {
        map.iter()
            .filter(|n| n.act == act && n.row == row)
            .collect()
    }

    fn count(board: &Board, cell: Cell) -> usize {
        (-4..=4)
            .flat_map(|q| (-4..=4).map(move |r| (q, r)))
            .filter(|&(q, r)| board.get(q, r) == Some(cell))
            .count()
    }

    #[test]
    fn three_acts_of_three_fight_rows_then_one_boss() {
        let map = run_map(7);
        for act in 0..ACTS {
            for r in 0..FIGHT_ROWS {
                let nodes = row(&map, act, r);
                assert!((2..=4).contains(&nodes.len()), "act {act} row {r}");
                assert!(nodes.iter().all(|n| n.kind != NodeKind::Boss));
                let cols: Vec<usize> = nodes.iter().map(|n| n.col).collect();
                assert_eq!(cols, (0..nodes.len()).collect::<Vec<_>>());
            }
            let boss = row(&map, act, FIGHT_ROWS);
            assert_eq!(boss.len(), 1);
            assert_eq!(boss[0].kind, NodeKind::Boss);
            assert!(boss[0].links.is_empty());
        }
        assert_eq!(map.iter().filter(|n| n.act >= ACTS).count(), 2);
        assert!(map
            .windows(2)
            .all(|w| (w[0].act, w[0].row, w[0].col) < (w[1].act, w[1].row, w[1].col)));
    }

    #[test]
    fn the_same_seed_gives_the_same_map_and_another_seed_another() {
        assert_eq!(run_map(42), run_map(42));
        assert!((0..8).any(|s| run_map(s) != run_map(42)));
    }

    #[test]
    fn every_node_leads_on_and_is_reached_without_crossing_paths() {
        for seed in 0..200 {
            let map = run_map(seed);
            for act in 0..ACTS {
                for r in 0..FIGHT_ROWS {
                    let next = row(&map, act, r + 1).len();
                    let mut reached = vec![false; next];
                    let mut last = 0;
                    for node in row(&map, act, r) {
                        assert!(!node.links.is_empty(), "seed {seed}");
                        assert!(node.links.windows(2).all(|w| w[0] < w[1]));
                        assert!(node.links[0] >= last, "crossing, seed {seed}");
                        last = *node.links.last().unwrap();
                        for &c in &node.links {
                            reached[c] = true;
                        }
                    }
                    assert!(reached.iter().all(|&r| r), "seed {seed}");
                }
            }
        }
    }

    #[test]
    fn an_act_opens_on_fights_then_mixes_elites_rests_unknowns_treasures_and_shops() {
        let mut seen = Vec::new();
        for seed in 0..50 {
            let map = run_map(seed);
            for act in 0..ACTS {
                assert!(row(&map, act, 0).iter().all(|n| n.kind == NodeKind::Fight));
            }
            for node in map
                .iter()
                .filter(|n| n.act < ACTS && n.row > 0 && n.row < FIGHT_ROWS)
            {
                if !seen.contains(&node.kind) {
                    seen.push(node.kind);
                }
            }
        }
        seen.sort_by_key(|k| *k as u8);
        use NodeKind::*;
        assert_eq!(seen, [Fight, Elite, Rest, Treasure, Shop, Unknown]);
    }

    #[test]
    fn the_node_kinds_leave_the_shape_of_the_map_of_slice_1() {
        // Computed on main before #800: the acts, rows, columns and links of 50 seeds, so a run
        // saved before the elites, rests and events still walks its map.
        let mut digest = 0u64;
        for seed in 0..50 {
            for n in run_map(seed).into_iter().filter(|n| n.act < ACTS) {
                digest = mix(digest ^ (n.act * 1000 + n.row * 100 + n.col) as u64);
                for l in n.links {
                    digest = mix(digest ^ l as u64);
                }
            }
        }
        assert_eq!(digest, 4066793024634845041);
    }

    /// The nodes of 50 seeds of the map of a run saved before the pacing (version 0): kind, formation and archetype.
    fn kinds_digest(version: u8) -> u64 {
        let mut digest = 0u64;
        for seed in 0..50 {
            for n in run_map_v(seed, 0, version) {
                digest = mix(digest
                    ^ (n.kind as u64
                        | (n.formation as u64) << 8
                        | (n.elite.map_or(0, |e| e as u64)) << 16));
            }
        }
        digest
    }

    #[test]
    fn a_map_saved_before_the_pacing_keeps_its_nodes() {
        // Computed on main before #1543: the map of version 0 is frozen, so a run in progress does not change under the player.
        assert_eq!(kinds_digest(0), 15599315090305818837);
        assert_eq!(run_map_v(9, RUNE_ROOM, 0), run_map_with(9, RUNE_ROOM));
        assert_ne!(kinds_digest(MAP_VERSION), kinds_digest(0));
    }

    const PACED_SEEDS: u64 = 2000;

    #[test]
    fn a_paced_map_has_a_rest_or_shop_after_every_node_of_the_row_before_the_last() {
        for seed in 0..PACED_SEEDS {
            let map = run_map_v(seed, 0, MAP_VERSION);
            for act in 0..ACTS {
                let last = row(&map, act, FIGHT_ROWS - 1);
                for node in row(&map, act, FIGHT_ROWS - 2) {
                    assert!(
                        node.links
                            .iter()
                            .any(|&c| matches!(last[c].kind, NodeKind::Rest | NodeKind::Shop)),
                        "seed {seed} act {act} col {}",
                        node.col
                    );
                }
            }
        }
    }

    #[test]
    fn a_paced_map_has_at_most_one_elite_a_row() {
        for seed in 0..PACED_SEEDS {
            let map = run_map_v(seed, 0, MAP_VERSION);
            for act in 0..ACTS {
                for r in 0..=FIGHT_ROWS {
                    let elites = row(&map, act, r)
                        .iter()
                        .filter(|n| n.kind == NodeKind::Elite)
                        .count();
                    assert!(elites <= 1, "seed {seed} act {act} row {r}");
                }
            }
        }
    }

    #[test]
    fn a_paced_act_has_a_fork_where_a_pick_closes_a_branch() {
        // Two neighbours of a row whose links share no node: taking one leaves the other's way behind.
        for seed in 0..PACED_SEEDS {
            let map = run_map_v(seed, 0, MAP_VERSION);
            for act in 0..ACTS {
                let forks = (0..FIGHT_ROWS - 1).any(|r| {
                    row(&map, act, r)
                        .windows(2)
                        .any(|w| w[0].links.last() < w[1].links.first())
                });
                assert!(forks, "seed {seed} act {act}");
            }
        }
    }

    #[test]
    fn a_paced_map_keeps_the_shape_the_runes_and_the_kinds_of_the_other_version() {
        let mut seen = Vec::new();
        for seed in 0..PACED_SEEDS {
            let (old, new) = (run_map_v(seed, 0, 0), run_map_v(seed, 0, MAP_VERSION));
            assert_eq!(old.len(), new.len());
            assert!(old
                .iter()
                .zip(&new)
                .all(|(a, b)| (a.act, a.row, a.col) == (b.act, b.row, b.col)));
            for n in new
                .iter()
                .filter(|n| n.act < ACTS && n.row > 0 && n.row < FIGHT_ROWS)
            {
                if !seen.contains(&n.kind) {
                    seen.push(n.kind);
                }
            }
            for r in 0..FIGHT_ROWS {
                for act in 0..ACTS {
                    let (rows, next) = (row(&new, act, r), row(&new, act, r + 1).len());
                    let mut reached = vec![false; next];
                    let mut last = 0;
                    for node in rows {
                        assert!(node.links.windows(2).all(|w| w[0] < w[1]));
                        assert!(node.links[0] >= last, "crossing, seed {seed}");
                        last = *node.links.last().unwrap();
                        node.links.iter().for_each(|&c| reached[c] = true);
                    }
                    assert!(reached.iter().all(|&r| r), "seed {seed}");
                }
            }
        }
        seen.sort_by_key(|k| *k as u8);
        use NodeKind::*;
        assert_eq!(seen, [Fight, Elite, Rest, Treasure, Shop, Unknown]);
        let rooms = run_map_v(5, RUNE_ROOM, MAP_VERSION);
        assert_eq!(
            rooms.iter().filter(|n| n.kind == NodeKind::Secret).count(),
            ACTS
        );
    }

    #[test]
    fn the_foes_of_a_node_follow_the_map_of_its_version() {
        let mut changed = 0;
        for seed in 0..200 {
            let (old, new) = (run_map_v(seed, 0, 0), run_map_v(seed, 0, MAP_VERSION));
            for (i, (a, b)) in old.iter().zip(&new).enumerate() {
                let plan = foe_plan_v(seed, i, 0, Biome::Meadow, 0, MAP_VERSION);
                assert_eq!(plan, foe_plan_v(seed, i, 0, Biome::Meadow, 0, MAP_VERSION));
                if a.kind != b.kind && matches!(b.kind, NodeKind::Fight | NodeKind::Elite) {
                    changed += 1;
                    assert_eq!(plan.formation, b.formation, "seed {seed} node {i}");
                    assert_ne!(
                        plan,
                        foe_plan_v(seed, i, 0, Biome::Meadow, 0, 0),
                        "seed {seed} node {i}"
                    );
                }
                assert_eq!(
                    foe_plan_v(seed, i, 0, Biome::Meadow, 0, 0),
                    foe_plan_with(seed, i, 0, Biome::Meadow, 0)
                );
            }
        }
        assert!(changed > 0);
    }

    #[test]
    fn paths_branch() {
        let map = run_map(3);
        assert!(map.iter().any(|n| n.links.len() > 1));
    }

    #[test]
    fn a_full_army_is_the_standard_game() {
        let game = army_game(FULL_ARMY);
        let mut standard = Board::standard();
        standard.set_rogue_lite();
        assert_eq!(game.board(), &standard);
        assert_eq!(game.to_move(), Player::Black);
        assert_eq!(game.win_ejections(Player::Black), 6);
        assert_eq!(game.win_ejections(Player::White), 6);
        assert!(game.outcome().is_none());
    }

    #[test]
    fn a_smaller_army_keeps_its_front_marbles_and_loses_below_four() {
        let game = army_game(9);
        assert_eq!(count(game.board(), Cell::Black), 9);
        assert_eq!(count(game.board(), Cell::White), 14);
        assert_eq!(game.board().get(-4, 4), Some(Cell::Empty)); // the back row goes first
        assert_eq!(game.board().get(0, 2), Some(Cell::Black));
        assert_eq!(game.win_ejections(Player::White), 6);
        assert_eq!(game.win_ejections(Player::Black), 6);
        assert_eq!(army_game(7).win_ejections(Player::White), 4); // 3 marbles left lose the run
        assert_eq!(army_game(MIN_ARMY).win_ejections(Player::White), 1);
    }

    #[test]
    fn a_smaller_enemy_loses_its_front_marbles() {
        let game = army_game_against(FULL_ARMY, 10);
        assert_eq!(count(game.board(), Cell::Black), 14);
        assert_eq!(count(game.board(), Cell::White), 10);
        assert_eq!(game.board().get(0, -2), Some(Cell::Empty)); // its front row is gone
        assert_eq!(game.board().get(-1, -3), Some(Cell::Empty));
        assert_eq!(game.board().get(0, -3), Some(Cell::White));
        assert_eq!(game.board().get(4, -4), Some(Cell::White)); // its back row stays
        assert_eq!(game.win_ejections(Player::Black), 6);
        assert_eq!(
            army_game_against(9, 10).board().get(0, 2),
            Some(Cell::Black)
        );
        assert_eq!(
            army_game_against(9, FULL_ARMY).board(),
            army_game(9).board()
        );
    }

    #[test]
    fn a_trainer_wave_has_that_many_white_marbles_and_ends_when_they_are_all_out() {
        let game = trainer_game(1, 6);
        assert_eq!(count(game.board(), Cell::Black), 14);
        assert_eq!(count(game.board(), Cell::White), 1);
        assert_eq!(game.board().get(0, -2), Some(Cell::White)); // the front marbles stay
        assert_eq!(game.win_ejections(Player::Black), 1);
        assert_eq!(game.win_ejections(Player::White), 6);
        assert!(!game.board().rogue_lite());
        let game = trainer_game(9, 6);
        assert_eq!(count(game.board(), Cell::White), 9);
        assert_eq!(game.win_ejections(Player::Black), 9);
        assert_eq!(trainer_game(0, 6).board(), trainer_game(1, 6).board());
        assert_eq!(trainer_game(99, 6).board(), &Board::standard());
        assert_eq!(trainer_game(99, 6).win_ejections(Player::Black), 14);
        assert_eq!(trainer_game(3, 2).win_ejections(Player::White), 2); // what is left of the run's pool
        assert_eq!(trainer_game(3, 0).win_ejections(Player::White), 1);
        assert_eq!(trainer_game(3, 9).win_ejections(Player::White), 6);
    }

    #[test]
    fn a_trainer_wave_repeated_three_times_is_won() {
        let mut game = trainer_game(1, 6);
        // Each side plays the move that brings back the position seen most often: it comes round again.
        for _ in 0..40 {
            if game.outcome().is_some() {
                break;
            }
            let side = game.to_move();
            let all = crate::moves::legal_moves(game.board(), side);
            let seen = all
                .iter()
                .max_by_key(|m| game.seen_after(m))
                .unwrap()
                .clone();
            game.play(&seen).unwrap();
        }
        assert_eq!(
            game.outcome(),
            Some(crate::game::Outcome::Win(Player::Black))
        );
    }

    #[test]
    fn the_enemy_is_clamped() {
        assert_eq!(
            army_game_against(9, 0).board(),
            army_game_against(9, MIN_ARMY).board()
        );
        assert_eq!(army_game_against(9, 99).board(), army_game(9).board());
    }

    #[test]
    fn the_army_is_clamped() {
        assert_eq!(army_game(0).board(), army_game(MIN_ARMY).board());
        assert_eq!(army_game(99).board(), army_game(FULL_ARMY).board());
    }
}

#[cfg(test)]
mod plain_games {
    use crate::encounter::hull::mix;
    use crate::game::Game;
    use crate::moves::legal_moves;
    use crate::search::best_move;

    /// A digest of 24 seeded games of 60 plies, a random legal move and a bot move in turn, on
    /// the plain rules: the history hashes, the ejections and the outcome of each.
    fn digest() -> u64 {
        let mut digest = 0;
        for seed in 0..24u64 {
            let mut game = Game::new();
            let mut state = seed;
            for ply in 0..60 {
                if game.outcome().is_some() {
                    break;
                }
                let mv = if ply % 2 == 0 {
                    state = mix(state);
                    let moves = legal_moves(game.board(), game.to_move());
                    moves[(state % moves.len() as u64) as usize].clone()
                } else {
                    best_move(&game, 60).expect("a running game has a move")
                };
                game.play(&mv).expect("a legal move");
            }
            for played in game.history() {
                digest = mix(digest ^ played.hash);
            }
            let [black, white] = [crate::moves::Player::Black, crate::moves::Player::White]
                .map(|p| u64::from(game.ejected(p)));
            digest =
                mix(digest ^ black ^ (white << 8) ^ (u64::from(game.outcome().is_some()) << 16));
        }
        digest
    }

    #[test]
    fn plain_games_are_bit_for_bit_the_games_before_the_special_marbles() {
        // Computed on main before #799: any change to the plain rules, the credits or the search
        // moves it.
        assert_eq!(digest(), 1811593443741359660);
    }
}

#[cfg(test)]
mod special_marbles {
    use super::*;
    use crate::board::{PlaceError, Special};
    use crate::encounter::hull::mix;
    use crate::game::Outcome;
    use crate::moves::Direction::{self, E, NE, SE};
    use crate::moves::{apply, legal_moves, Move, MoveError};
    use crate::search::{best_move, search};

    type P = (i32, i32);
    use Special::{Anchor, Heavy, Spark};

    /// A rogue-lite board: Black and White marbles, then the special ones among them.
    fn board(black: &[P], white: &[P], specials: &[(P, Special)]) -> Board {
        let mut b = Board::empty();
        b.set_rogue_lite();
        for &(q, r) in black {
            b.set(q, r, Cell::Black);
        }
        for &(q, r) in white {
            b.set(q, r, Cell::White);
        }
        for &(cell, kind) in specials {
            b.place_special(cell, kind).unwrap();
        }
        b
    }

    fn mv(cells: &[P], dir: Direction) -> Move {
        Move {
            cells: cells.to_vec(),
            dir,
        }
    }

    fn cells(b: &Board, cell: Cell) -> Vec<P> {
        let mut v: Vec<P> = (-4..=4)
            .flat_map(|q| (-4..=4).map(move |r| (q, r)))
            .filter(|&(q, r)| b.get(q, r) == Some(cell))
            .collect();
        v.sort();
        v
    }

    fn black_plays(b: &Board, m: &Move) -> Result<Board, MoveError> {
        apply(b, Player::Black, m).map(|(b, _)| b)
    }

    #[test]
    fn specials_are_placed_only_on_a_marble_of_a_rogue_lite_board_in_cell_order() {
        let mut plain = Board::standard();
        assert_eq!(
            plain.place_special((0, 4), Heavy),
            Err(PlaceError::NotRogueLite)
        );
        assert!(!plain.rogue_lite() && plain.specials().is_empty());
        let mut b = Board::standard();
        b.set_rogue_lite();
        assert!(b.rogue_lite() && b.specials().is_empty());
        assert_eq!(b.place_special((0, 0), Heavy), Err(PlaceError::NoMarble));
        assert_eq!(b.place_special((9, 0), Heavy), Err(PlaceError::NoMarble));
        b.place_special((0, 4), Spark).unwrap();
        b.place_special((-4, 4), Heavy).unwrap();
        b.place_special((0, -4), Anchor).unwrap(); // a White marble may be one too
        b.place_special((0, 4), Anchor).unwrap(); // in place of the Spark
        assert_eq!(
            b.specials(),
            [((-4, 4), Heavy), ((0, -4), Anchor), ((0, 4), Anchor)]
        );
        assert_eq!(b.special((0, 4)), Some(Anchor));
        assert_eq!(b.special((0, 3)), None);
    }

    #[test]
    fn a_fight_places_its_specials_before_its_first_move_only() {
        let mut game = army_game(FULL_ARMY);
        assert!(game.board().rogue_lite(), "the army's fight has the flag");
        assert_eq!(game.place_special((0, 2), Heavy), Ok(()));
        assert_eq!(game.board().special((0, 2)), Some(Heavy));
        let first = legal_moves(game.board(), Player::Black)[0].clone();
        game.play(&first).unwrap();
        assert_eq!(game.place_special((0, 4), Spark), Err(PlaceError::Started));
        assert_eq!(
            Game::new().place_special((0, 4), Spark),
            Err(PlaceError::NotRogueLite)
        );
    }

    #[test]
    fn a_heavy_weighs_2_in_a_push_on_both_sides() {
        // A lone Heavy pushes a plain marble; a plain one cannot.
        let lone = mv(&[(0, 0)], E);
        let b = board(&[(0, 0)], &[(1, 0)], &[((0, 0), Heavy)]);
        let after = black_plays(&b, &lone).unwrap();
        assert_eq!(
            (cells(&after, Cell::Black), cells(&after, Cell::White)),
            (vec![(1, 0)], vec![(2, 0)])
        );
        assert_eq!(
            after.specials(),
            [((1, 0), Heavy)],
            "the mark moves with it"
        );
        assert_eq!(
            black_plays(&board(&[(0, 0)], &[(1, 0)], &[]), &lone),
            Err(MoveError::NotStrongEnough)
        );
        // Heavy + 1 (3) pushes 2 plain, not 3 (a tie); Heavy + 2 (4) pushes 3.
        let pair = mv(&[(-1, 0), (0, 0)], E);
        let b = board(&[(-1, 0), (0, 0)], &[(1, 0), (2, 0)], &[((-1, 0), Heavy)]);
        let after = black_plays(&b, &pair).unwrap();
        assert_eq!(cells(&after, Cell::White), vec![(2, 0), (3, 0)]);
        let three = [(1, 0), (2, 0), (3, 0)];
        let b = board(&[(-1, 0), (0, 0)], &three, &[((-1, 0), Heavy)]);
        assert_eq!(black_plays(&b, &pair), Err(MoveError::NotStrongEnough));
        let trio = mv(&[(-2, 0), (-1, 0), (0, 0)], E);
        let b = board(&[(-2, 0), (-1, 0), (0, 0)], &three, &[((-2, 0), Heavy)]);
        let after = black_plays(&b, &trio).unwrap();
        assert_eq!(cells(&after, Cell::White), vec![(2, 0), (3, 0), (4, 0)]);
        // 2 plain cannot push a White Heavy (2 against 2); 3 plain can, and it keeps its mark.
        let b = board(&[(0, 0), (1, 0)], &[(2, 0)], &[((2, 0), Heavy)]);
        assert_eq!(
            black_plays(&b, &mv(&[(0, 0), (1, 0)], E)),
            Err(MoveError::NotStrongEnough)
        );
        let b = board(&[(-1, 0), (0, 0), (1, 0)], &[(2, 0)], &[((2, 0), Heavy)]);
        let after = black_plays(&b, &mv(&[(-1, 0), (0, 0), (1, 0)], E)).unwrap();
        assert_eq!(after.specials(), [((3, 0), Heavy)]);
    }

    #[test]
    fn a_broadside_move_carries_the_marks_and_leaves_the_others() {
        let b = board(
            &[(0, 0), (1, 0), (-3, 3)],
            &[(4, -4)],
            &[((1, 0), Spark), ((-3, 3), Heavy)],
        );
        let after = black_plays(&b, &mv(&[(0, 0), (1, 0)], SE)).unwrap();
        assert_eq!(after.specials(), [((-3, 3), Heavy), ((1, 1), Spark)]);
    }

    #[test]
    fn an_anchor_is_never_pushed_off_but_is_pushed_along() {
        let push = mv(&[(2, 0), (3, 0)], E);
        let plain = board(&[(2, 0), (3, 0)], &[(4, 0)], &[]);
        assert!(legal_moves(&plain, Player::Black).contains(&push));
        assert!(apply(&plain, Player::Black, &push).unwrap().1);
        let anchored = board(&[(2, 0), (3, 0)], &[(4, 0)], &[((4, 0), Anchor)]);
        assert!(!legal_moves(&anchored, Player::Black).contains(&push));
        assert_eq!(black_plays(&anchored, &push), Err(MoveError::PushBlocked));
        // Along the board it moves with its mark.
        let b = board(&[(1, 0), (2, 0)], &[(3, 0)], &[((3, 0), Anchor)]);
        let after = black_plays(&b, &mv(&[(1, 0), (2, 0)], E)).unwrap();
        assert_eq!(after.specials(), [((4, 0), Anchor)]);
        // It shields itself only: the plain marble in front of it goes off.
        let trio = [(0, 0), (1, 0), (2, 0)];
        let b = board(&trio, &[(3, 0), (4, 0)], &[((3, 0), Anchor)]);
        let (after, ejected) = apply(&b, Player::Black, &mv(&trio, E)).unwrap();
        assert!(ejected);
        assert_eq!(cells(&after, Cell::White), vec![(4, 0)]);
        assert_eq!(after.specials(), [((4, 0), Anchor)]);
    }

    #[test]
    fn an_ejected_spark_pushes_each_neighbour_one_cell_away() {
        // The Spark goes off from (4,-2): its 4 neighbours on the board move away from it.
        let push = mv(&[(2, -2), (3, -2)], E);
        let b = board(
            &[(2, -2), (3, -2), (4, -1)],
            &[(4, -2), (4, -3), (3, -1)],
            &[((4, -2), Spark), ((4, -1), Heavy)],
        );
        let (after, ejected) = apply(&b, Player::Black, &push).unwrap();
        assert!(ejected);
        // The pusher left on (3,-2) goes back to (2,-2); the one on the Spark's cell stays.
        assert_eq!(cells(&after, Cell::Black), vec![(2, -2), (4, -2), (4, 0)]);
        assert_eq!(cells(&after, Cell::White), vec![(2, 0), (4, -4)]);
        assert_eq!(
            after.specials(),
            [((4, 0), Heavy)],
            "the Spark's mark is gone"
        );
        // The same push of a plain marble moves nobody else.
        let plain = board(
            &[(2, -2), (3, -2), (4, -1)],
            &[(4, -2), (4, -3), (3, -1)],
            &[],
        );
        let after = black_plays(&plain, &push).unwrap();
        assert_eq!(cells(&after, Cell::White), vec![(3, -1), (4, -3)]);
        // Nor does a Heavy pushed off: only a Spark bursts.
        let trio = [(1, -2), (2, -2), (3, -2)];
        let heavy = board(&trio, &[(4, -2), (4, -3), (3, -1)], &[((4, -2), Heavy)]);
        let after = black_plays(&heavy, &mv(&trio, E)).unwrap();
        assert_eq!(cells(&after, Cell::White), vec![(3, -1), (4, -3)]);
    }

    #[test]
    fn a_neighbour_whose_cell_away_is_taken_stays() {
        // (3,-1) has (2,0) behind it and stays; (4,-3) has (4,-4) free and moves.
        let b = board(
            &[(2, -2), (3, -2)],
            &[(4, -2), (3, -1), (2, 0), (4, -3)],
            &[((4, -2), Spark)],
        );
        let after = black_plays(&b, &mv(&[(2, -2), (3, -2)], E)).unwrap();
        assert_eq!(cells(&after, Cell::White), vec![(2, 0), (3, -1), (4, -4)]);
    }

    #[test]
    fn a_neighbour_at_the_rim_is_ejected_and_counts_for_the_opponent_of_its_colour() {
        // The Spark goes off from (4,-3): its neighbour (4,-4) goes off over the corner.
        let push = mv(&[(2, -3), (3, -3)], E);
        let b = board(
            &[(2, -3), (3, -3)],
            &[(4, -3), (4, -4), (-4, 4)],
            &[((4, -3), Spark)],
        );
        let mut game = Game::from_position(b, Player::Black, [0, 0]);
        game.play(&push).unwrap();
        assert_eq!(cells(game.board(), Cell::White), vec![(-4, 4)]);
        assert_eq!(
            (game.ejected(Player::Black), game.ejected(Player::White)),
            (2, 0)
        );
        assert_eq!(game.no_ejection_plies(), 0);
        // A Black marble the burst throws off counts for White.
        let b = board(
            &[(2, -3), (3, -3), (4, -4)],
            &[(4, -3), (-4, 4)],
            &[((4, -3), Spark)],
        );
        let mut game = Game::from_position(b, Player::Black, [0, 0]);
        game.play(&push).unwrap();
        assert_eq!(cells(game.board(), Cell::Black), vec![(2, -3), (4, -3)]);
        assert_eq!(
            (game.ejected(Player::Black), game.ejected(Player::White)),
            (1, 1)
        );
        assert_eq!(game.outcome(), None);
    }

    #[test]
    fn a_burst_that_throws_the_pushers_own_marble_off_can_lose_the_fight() {
        let push = mv(&[(2, -3), (3, -3)], E);
        let b = board(
            &[(2, -3), (3, -3), (4, -4)],
            &[(4, -3), (-4, 4)],
            &[((4, -3), Spark)],
        );
        let mut game = Game::from_position(b.clone(), Player::Black, [0, 5]);
        game.play(&push).unwrap();
        assert_eq!(game.outcome(), Some(Outcome::Win(Player::White)));
        // When both reach their count on the same ply, the pusher wins.
        let mut game = Game::from_position(b, Player::Black, [5, 5]);
        game.play(&push).unwrap();
        assert_eq!(game.outcome(), Some(Outcome::Win(Player::Black)));
    }

    #[test]
    fn a_spark_thrown_off_by_a_burst_does_not_burst_and_an_anchor_stays() {
        let push = mv(&[(2, -3), (3, -3)], E);
        // (4,-4) is a Spark too: it goes off, and its own neighbour (3,-4) stays.
        let b = board(
            &[(2, -3), (3, -3)],
            &[(4, -3), (4, -4), (3, -4)],
            &[((4, -3), Spark), ((4, -4), Spark)],
        );
        let after = black_plays(&b, &push).unwrap();
        assert_eq!(cells(&after, Cell::White), vec![(3, -4)]);
        assert!(after.specials().is_empty());
        // An Anchor at the rim stays where it is.
        let b = board(
            &[(2, -3), (3, -3)],
            &[(4, -3), (4, -4)],
            &[((4, -3), Spark), ((4, -4), Anchor)],
        );
        let after = black_plays(&b, &push).unwrap();
        assert_eq!(cells(&after, Cell::White), vec![(4, -4)]);
        assert_eq!(after.specials(), [((4, -4), Anchor)]);
    }

    #[test]
    fn a_heavy_plus_weighs_3_in_a_push_on_both_sides() {
        use Special::HeavyPlus;
        // A lone Heavy+ pushes 2 plain marbles, not 3 (a tie); Heavy+ + 1 (4) pushes 3.
        let lone = mv(&[(0, 0)], E);
        let b = board(&[(0, 0)], &[(1, 0), (2, 0)], &[((0, 0), HeavyPlus)]);
        let after = black_plays(&b, &lone).unwrap();
        assert_eq!(cells(&after, Cell::White), vec![(2, 0), (3, 0)]);
        assert_eq!(after.specials(), [((1, 0), HeavyPlus)], "its mark moves");
        let three = [(1, 0), (2, 0), (3, 0)];
        let b = board(&[(0, 0)], &three, &[((0, 0), HeavyPlus)]);
        assert_eq!(black_plays(&b, &lone), Err(MoveError::NotStrongEnough));
        let pair = mv(&[(-1, 0), (0, 0)], E);
        let b = board(&[(-1, 0), (0, 0)], &three, &[((-1, 0), HeavyPlus)]);
        let after = black_plays(&b, &pair).unwrap();
        assert_eq!(cells(&after, Cell::White), vec![(2, 0), (3, 0), (4, 0)]);
        // 3 plain cannot push a White Heavy+ (3 against 3); a plain Heavy there they can.
        let trio = mv(&[(-1, 0), (0, 0), (1, 0)], E);
        let b = board(
            &[(-1, 0), (0, 0), (1, 0)],
            &[(2, 0)],
            &[((2, 0), HeavyPlus)],
        );
        assert_eq!(black_plays(&b, &trio), Err(MoveError::NotStrongEnough));
        let b = board(&[(-1, 0), (0, 0), (1, 0)], &[(2, 0)], &[((2, 0), Heavy)]);
        assert!(black_plays(&b, &trio).is_ok());
    }

    #[test]
    fn an_anchor_plus_also_keeps_the_marble_in_front_of_it_from_going_off() {
        use Special::AnchorPlus;
        // A plain Anchor on (3,0) lets the marble in front of it go off; an Anchor+ does not.
        let trio = [(0, 0), (1, 0), (2, 0)];
        let push = mv(&trio, E);
        let plain = board(&trio, &[(3, 0), (4, 0)], &[((3, 0), Anchor)]);
        assert!(legal_moves(&plain, Player::Black).contains(&push));
        let shielded = board(&trio, &[(3, 0), (4, 0)], &[((3, 0), AnchorPlus)]);
        assert!(!legal_moves(&shielded, Player::Black).contains(&push));
        assert_eq!(black_plays(&shielded, &push), Err(MoveError::PushBlocked));
        // It never goes off itself, and is pushed along the board with its mark.
        let pair = mv(&[(2, 0), (3, 0)], E);
        let rim = board(&[(2, 0), (3, 0)], &[(4, 0)], &[((4, 0), AnchorPlus)]);
        assert_eq!(black_plays(&rim, &pair), Err(MoveError::PushBlocked));
        let b = board(&[(1, 0), (2, 0)], &[(3, 0)], &[((3, 0), AnchorPlus)]);
        let after = black_plays(&b, &mv(&[(1, 0), (2, 0)], E)).unwrap();
        assert_eq!(after.specials(), [((4, 0), AnchorPlus)]);
        // In the pushing group it shields nothing: the pushed marble goes off.
        let b = board(
            &[(1, 0), (2, 0), (3, 0)],
            &[(4, 0)],
            &[((3, 0), AnchorPlus)],
        );
        let (_, ejected) = apply(&b, Player::Black, &mv(&[(1, 0), (2, 0), (3, 0)], E)).unwrap();
        assert!(ejected);
        // A burst does not throw it off either.
        let b = board(
            &[(2, -3), (3, -3)],
            &[(4, -3), (4, -4)],
            &[((4, -3), Spark), ((4, -4), AnchorPlus)],
        );
        let after = black_plays(&b, &mv(&[(2, -3), (3, -3)], E)).unwrap();
        assert_eq!(after.specials(), [((4, -4), AnchorPlus)]);
    }

    #[test]
    fn the_bot_never_pushes_off_the_marble_an_anchor_plus_keeps() {
        // Black needs one more ejection; the only push off the board is shielded by the Anchor+.
        let b = board(
            &[(1, 0), (2, 0), (0, 0), (-2, 2)],
            &[(3, 0), (4, 0), (-4, 0)],
            &[((3, 0), Special::AnchorPlus)],
        );
        let game = Game::from_position(b, Player::Black, [5, 0]);
        let found = best_move(&game, 3000).unwrap();
        assert_ne!(found, mv(&[(0, 0), (1, 0), (2, 0)], E));
        assert!(legal_moves(game.board(), Player::Black).contains(&found));
    }

    /// Black around White's pair on (2,0) and (3,0); (4,0) is the end of the row.
    const LOCK: [P; 9] = [
        (4, 0),
        (1, 0),
        (0, 0),
        (2, -1),
        (3, -1),
        (4, -2),
        (1, 1),
        (2, 1),
        (3, 1),
    ];

    /// White's pair can only push the Black Anchor on (4,0) off, once Black fills (4,-1).
    fn locked() -> Board {
        board(&LOCK, &[(2, 0), (3, 0)], &[((4, 0), Anchor)])
    }

    #[test]
    fn a_side_left_with_no_legal_move_passes_its_turn() {
        let fill = mv(&[(4, -2)], SE);
        let mut game = Game::from_position(locked(), Player::Black, [0, 0]);
        assert!(!legal_moves(game.board(), Player::White).is_empty());
        game.play(&fill).unwrap();
        assert!(legal_moves(game.board(), Player::White).is_empty());
        assert_eq!(game.outcome(), None, "no loss for a locked side (#1301)");
        assert_eq!(game.to_move(), Player::Black, "White passed");
        assert_eq!(game.passed(), Some(Player::White));
        // With a plain marble on (4,0) White still has its push, and plays it.
        let plain = board(&LOCK, &[(2, 0), (3, 0)], &[]);
        let mut game = Game::from_position(plain, Player::Black, [0, 0]);
        game.play(&fill).unwrap();
        assert_eq!((game.outcome(), game.to_move()), (None, Player::White));
    }

    #[test]
    fn the_bot_no_longer_scores_a_lock_as_a_win() {
        let game = Game::from_position(locked(), Player::Black, [0, 0]);
        let found = search(&game, 4000).unwrap();
        assert!(found.score < crate::search::WIN / 2, "{}", found.score);
    }

    #[test]
    fn the_bot_never_pushes_an_anchor_off_even_for_the_win() {
        // Black needs one more ejection; the only push off the board is the Anchor's.
        let b = board(
            &[(2, 0), (3, 0), (-2, 2)],
            &[(4, 0), (-4, 0)],
            &[((4, 0), Anchor)],
        );
        let game = Game::from_position(b, Player::Black, [5, 0]);
        let found = best_move(&game, 3000).unwrap();
        assert_ne!(found, mv(&[(2, 0), (3, 0)], E));
        assert!(legal_moves(game.board(), Player::Black).contains(&found));
    }

    #[test]
    fn the_bot_takes_the_spark_whose_burst_clears_one_more_marble() {
        // Two pushes off the board: a plain marble on (4,1), or the Spark on (4,-3) whose burst
        // throws (4,-4) off too.
        let b = board(
            &[(2, -3), (3, -3), (2, 1), (3, 1)],
            &[(4, -3), (4, -4), (4, 1), (-4, 4), (-3, 4)],
            &[((4, -3), Spark)],
        );
        let mut game = Game::from_position(b, Player::Black, [0, 0]);
        let found = best_move(&game, 3000).unwrap();
        assert_eq!(found, mv(&[(2, -3), (3, -3)], E));
        game.play(&found).unwrap();
        assert_eq!(game.ejected(Player::Black), 2);
    }

    #[test]
    fn a_special_marble_is_part_of_the_position() {
        let first = mv(&[(0, 2)], NE);
        let mut plain = army_game(FULL_ARMY);
        let mut heavy = army_game(FULL_ARMY);
        heavy.place_special((-4, 4), Heavy).unwrap();
        plain.play(&first).unwrap();
        heavy.play(&first).unwrap();
        assert_ne!(plain.history()[0].hash, heavy.history()[0].hash);
    }

    #[test]
    fn the_same_fight_gives_the_same_burst_every_time() {
        let play = || {
            let b = board(
                &[(2, -2), (3, -2), (4, -1)],
                &[(4, -2), (4, -3), (3, -1)],
                &[((4, -2), Spark), ((4, -1), Heavy)],
            );
            let mut game = Game::from_position(b, Player::Black, [0, 0]);
            game.play(&mv(&[(2, -2), (3, -2)], E)).unwrap();
            game
        };
        let (a, b) = (play(), play());
        assert_eq!(a.board(), b.board());
        assert_eq!(a.history(), b.history());
    }

    /// Random positions reached by seeded random moves from the standard start.
    fn positions() -> Vec<(Board, Player)> {
        let mut out = Vec::new();
        for seed in 0..40u64 {
            let mut game = Game::new();
            let mut state = seed;
            for _ in 0..(seed % 30 + 10) {
                state = mix(state);
                let moves = legal_moves(game.board(), game.to_move());
                game.play(&moves[(state % moves.len() as u64) as usize])
                    .unwrap();
            }
            out.push((game.board().clone(), game.to_move()));
        }
        out
    }

    #[test]
    fn the_flag_alone_changes_no_move_and_no_credit() {
        for (plain, side) in positions() {
            let mut flagged = plain.clone();
            flagged.set_rogue_lite();
            let moves = legal_moves(&plain, side);
            assert_eq!(moves, legal_moves(&flagged, side));
            for m in &moves {
                let (a, ejected) = apply(&plain, side, m).unwrap();
                let (mut b, flagged_ejected) = apply(&flagged, side, m).unwrap();
                assert_eq!(ejected, flagged_ejected);
                assert_eq!(
                    credits(&plain, side, ejected, &a),
                    credits(&flagged, side, ejected, &b)
                );
                assert!(b.rogue_lite() && b.specials().is_empty());
                let mut unflagged = Board::empty();
                for (q, r) in (-4..=4).flat_map(|q| (-4..=4).map(move |r| (q, r))) {
                    unflagged.set(q, r, b.get(q, r).unwrap_or(Cell::Empty));
                }
                b = unflagged;
                assert_eq!(a, b);
            }
        }
    }
}

#[cfg(test)]
mod relics {
    use super::*;
    use crate::board::{PlaceError, Special};
    use crate::game::Outcome;
    use crate::moves::Direction::{self, E};
    use crate::moves::{apply, legal_moves, Move, MoveError};

    type P = (i32, i32);

    /// A rogue-lite board with the army's `relics`: Black and White marbles, then the special ones.
    fn board(black: &[P], white: &[P], specials: &[(P, Special)], relics: &[Relic]) -> Board {
        let mut b = Board::empty();
        b.set_rogue_lite();
        for &(q, r) in black {
            b.set(q, r, Cell::Black);
        }
        for &(q, r) in white {
            b.set(q, r, Cell::White);
        }
        for &(cell, kind) in specials {
            b.place_special(cell, kind).unwrap();
        }
        b.set_relics(relics).unwrap();
        b
    }

    fn mv(cells: &[P], dir: Direction) -> Move {
        Move {
            cells: cells.to_vec(),
            dir,
        }
    }

    fn cells(b: &Board, cell: Cell) -> Vec<P> {
        let mut v: Vec<P> = (-4..=4)
            .flat_map(|q| (-4..=4).map(move |r| (q, r)))
            .filter(|&(q, r)| b.get(q, r) == Some(cell))
            .collect();
        v.sort();
        v
    }

    #[test]
    fn the_relics_are_listed_in_the_order_of_their_bridge_code() {
        assert_eq!(Relic::ALL.len(), 12);
        for (code, relic) in Relic::ALL.into_iter().enumerate() {
            assert_eq!(relic as usize, code);
            assert_eq!(relic.bit(), 1 << code);
        }
    }

    #[test]
    fn relics_are_set_on_a_rogue_lite_fight_before_its_first_move_only() {
        let mut plain = Board::standard();
        assert_eq!(
            plain.set_relics(&[Relic::Gyroscope]),
            Err(PlaceError::NotRogueLite)
        );
        assert!(!plain.has_relic(Relic::Gyroscope));
        assert_eq!(
            Game::new().set_relics(&[Relic::Gyroscope]),
            Err(PlaceError::NotRogueLite)
        );
        let mut game = army_game(FULL_ARMY);
        assert_eq!(game.set_relics(&[Relic::Gyroscope, Relic::Jammer]), Ok(()));
        assert!(game.board().has_relic(Relic::Gyroscope));
        assert!(game.board().has_relic(Relic::Jammer));
        assert!(!game.board().has_relic(Relic::Detonator));
        let first = legal_moves(game.board(), Player::Black)[0].clone();
        game.play(&first).unwrap();
        assert_eq!(game.set_relics(&[]), Err(PlaceError::Started));
    }

    #[test]
    fn the_relics_are_part_of_the_position() {
        let first = mv(&[(0, 2)], crate::moves::Direction::NE);
        let mut plain = army_game(FULL_ARMY);
        let mut gyro = army_game(FULL_ARMY);
        gyro.set_relics(&[Relic::Gyroscope]).unwrap();
        plain.play(&first).unwrap();
        gyro.play(&first).unwrap();
        assert_ne!(plain.history()[0].hash, gyro.history()[0].hash);
    }

    #[test]
    fn the_gyroscope_lets_the_armys_first_push_one_short_through_once_per_fight() {
        // 2 against 2: a tie, too weak without the Gyroscope.
        let pair = mv(&[(0, 0), (1, 0)], E);
        let black = [(0, 0), (1, 0), (-4, 4)];
        let white = [(2, 0), (3, 0), (-4, 0)];
        let plain = board(&black, &white, &[], &[]);
        assert_eq!(
            apply(&plain, Player::Black, &pair),
            Err(MoveError::NotStrongEnough)
        );
        let gyro = board(&black, &white, &[], &[Relic::Gyroscope]);
        assert!(legal_moves(&gyro, Player::Black).contains(&pair));
        let (after, ejected) = apply(&gyro, Player::Black, &pair).unwrap();
        assert!(!ejected);
        assert_eq!(cells(&after, Cell::White), vec![(-4, 0), (3, 0), (4, 0)]);
        assert!(!after.has_relic(Relic::Gyroscope), "spent by the push");
        // A tie again: too weak now.
        assert_eq!(
            apply(&after, Player::Black, &mv(&[(1, 0), (2, 0)], E)),
            Err(MoveError::NotStrongEnough)
        );
        // 2 against 3: one short by 2, still too weak.
        let trio = board(
            &[(0, 0), (1, 0)],
            &[(2, 0), (3, 0), (4, 0)],
            &[],
            &[Relic::Gyroscope],
        );
        assert_eq!(
            apply(&trio, Player::Black, &pair),
            Err(MoveError::NotStrongEnough)
        );
    }

    #[test]
    fn a_push_strong_enough_and_a_move_keep_the_gyroscope() {
        let gyro = board(&[(0, 0), (1, 0)], &[(2, 0)], &[], &[Relic::Gyroscope]);
        let (after, _) = apply(&gyro, Player::Black, &mv(&[(0, 0), (1, 0)], E)).unwrap();
        assert!(after.has_relic(Relic::Gyroscope), "2 push 1 without it");
        let (after, _) = apply(&gyro, Player::Black, &mv(&[(0, 0)], Direction::SE)).unwrap();
        assert!(after.has_relic(Relic::Gyroscope), "no push");
    }

    #[test]
    fn the_gyroscope_is_the_armys_only() {
        // White's pair against Black's pair: a tie, whatever the army holds.
        let b = board(
            &[(2, 0), (3, 0)],
            &[(0, 0), (1, 0)],
            &[],
            &[Relic::Gyroscope],
        );
        assert_eq!(
            apply(&b, Player::White, &mv(&[(0, 0), (1, 0)], E)),
            Err(MoveError::NotStrongEnough)
        );
    }

    #[test]
    fn the_gyroscope_can_win_the_fight() {
        // Black needs one more ejection: 2 against 2 at the rim, only with the Gyroscope.
        let pair = mv(&[(1, 0), (2, 0)], E);
        let b = board(
            &[(1, 0), (2, 0)],
            &[(3, 0), (4, 0), (-4, 0)],
            &[],
            &[Relic::Gyroscope],
        );
        let mut game = Game::from_position(b, Player::Black, [5, 0]);
        game.play(&pair).unwrap();
        assert_eq!(game.outcome(), Some(Outcome::Win(Player::Black)));
    }

    /// White pushes the army's Spark off from (4,-2): its neighbours (3,-2), White, (4,-3) and
    /// (3,-1), Black, move away from it.
    fn burst_of(relics: &[Relic], black: &[P], specials: &[(P, Special)]) -> Board {
        let b = board(black, &[(2, -2), (3, -2)], specials, relics);
        let (after, ejected) = apply(&b, Player::White, &mv(&[(2, -2), (3, -2)], E)).unwrap();
        assert!(ejected);
        after
    }

    #[test]
    fn the_detonator_bursts_the_armys_sparks_two_cells() {
        let black = [(4, -2), (4, -3), (3, -1)];
        let spark = [((4, -2), Special::Spark)];
        let one = burst_of(&[], &black, &spark);
        assert_eq!(cells(&one, Cell::White), vec![(2, -2), (4, -2)]);
        assert_eq!(cells(&one, Cell::Black), vec![(2, 0), (4, -4)]);
        let two = burst_of(&[Relic::Detonator], &black, &spark);
        // (4,-3) slides past (4,-4) off the board: White is credited with it.
        assert_eq!(cells(&two, Cell::White), vec![(1, -2), (4, -2)]);
        assert_eq!(cells(&two, Cell::Black), vec![(1, 1)]);
        let mut game = Game::from_position(
            board(&black, &[(2, -2), (3, -2)], &spark, &[Relic::Detonator]),
            Player::White,
            [0, 0],
        );
        game.play(&mv(&[(2, -2), (3, -2)], E)).unwrap();
        assert_eq!(game.ejected(Player::White), 2);
    }

    #[test]
    fn a_detonated_marble_stops_before_a_marble_and_an_anchor_on_the_rim() {
        // (1,-2) stops White's pusher on (2,-2); the Anchor on (4,-3) stops on the rim; (3,-1)
        // stops before (1,1).
        let black = [(4, -2), (4, -3), (3, -1), (1, -2), (1, 1)];
        let specials = [((4, -2), Special::Spark), ((4, -3), Special::Anchor)];
        let after = burst_of(&[Relic::Detonator], &black, &specials);
        assert_eq!(cells(&after, Cell::White), vec![(2, -2), (4, -2)]);
        assert_eq!(
            cells(&after, Cell::Black),
            vec![(1, -2), (1, 1), (2, 0), (4, -4)]
        );
        assert_eq!(after.specials(), [((4, -4), Special::Anchor)]);
    }

    #[test]
    fn the_detonator_leaves_the_enemys_sparks_alone() {
        // Black pushes White's Spark off: one cell, as without the relic.
        let b = board(
            &[(2, -2), (3, -2)],
            &[(4, -2), (4, -3), (3, -1)],
            &[((4, -2), Special::Spark)],
            &[Relic::Detonator],
        );
        let (after, _) = apply(&b, Player::Black, &mv(&[(2, -2), (3, -2)], E)).unwrap();
        assert_eq!(cells(&after, Cell::White), vec![(2, 0), (4, -4)]);
    }

    #[test]
    fn a_spark_plus_bursts_2_cells_and_3_with_the_detonator() {
        let black = [(4, -2), (4, -3), (3, -1)];
        let plus = [((4, -2), Special::SparkPlus)];
        // As far as a Spark with the Detonator: (4,-3) slides off, the others 2 cells.
        let two = burst_of(&[], &black, &plus);
        assert_eq!(cells(&two, Cell::White), vec![(1, -2), (4, -2)]);
        assert_eq!(cells(&two, Cell::Black), vec![(1, 1)]);
        assert!(two.specials().is_empty(), "the Spark+'s mark is gone");
        // The Detonator adds its cell: 3.
        let three = burst_of(&[Relic::Detonator], &black, &plus);
        assert_eq!(cells(&three, Cell::White), vec![(0, -2), (4, -2)]);
        assert_eq!(cells(&three, Cell::Black), vec![(0, 2)]);
        // The enemy's Spark+ bursts 2 cells too, the Detonator aside.
        let b = board(
            &[(2, -2), (3, -2)],
            &[(4, -2), (4, -3), (3, -1)],
            &[((4, -2), Special::SparkPlus)],
            &[Relic::Detonator],
        );
        let (after, _) = apply(&b, Player::Black, &mv(&[(2, -2), (3, -2)], E)).unwrap();
        assert_eq!(cells(&after, Cell::White), vec![(1, 1)]);
        assert_eq!(cells(&after, Cell::Black), vec![(1, -2), (4, -2)]);
    }

    #[test]
    fn a_treasure_joins_the_node_draw() {
        let found = (0..50).any(|seed| run_map(seed).iter().any(|n| n.kind == NodeKind::Treasure));
        assert!(found);
        assert_eq!(NodeKind::Treasure as u8, 5);
    }
}

#[cfg(test)]
mod new_specials {
    use super::*;
    use crate::board::Special::{self, Anchor, Bomb, Heavy, Magnet, Medic, Shield, Spark};
    use crate::game::Outcome;
    use crate::moves::Direction::{self, E, NW, SE, SW};
    use crate::moves::{apply, legal_moves, Move, MoveError};
    use crate::search::best_move;

    type P = (i32, i32);

    /// A rogue-lite board: Black and White marbles, then the special ones among them.
    fn board(black: &[P], white: &[P], specials: &[(P, Special)]) -> Board {
        let mut b = Board::empty();
        b.set_rogue_lite();
        for &(q, r) in black {
            b.set(q, r, Cell::Black);
        }
        for &(q, r) in white {
            b.set(q, r, Cell::White);
        }
        for &(cell, kind) in specials {
            b.place_special(cell, kind).unwrap();
        }
        b
    }

    fn mv(cells: &[P], dir: Direction) -> Move {
        Move {
            cells: cells.to_vec(),
            dir,
        }
    }

    fn cells(b: &Board, cell: Cell) -> Vec<P> {
        let mut v: Vec<P> = (-4..=4)
            .flat_map(|q| (-4..=4).map(move |r| (q, r)))
            .filter(|&(q, r)| b.get(q, r) == Some(cell))
            .collect();
        v.sort();
        v
    }

    fn plays(b: &Board, player: Player, m: &Move) -> Board {
        apply(b, player, m).unwrap().0
    }

    #[test]
    fn a_magnet_that_moved_pulls_an_enemy_two_cells_away_one_cell_toward_it() {
        // The Magnet steps from (0,0) to (1,0): the Heavy on (3,0) comes to (2,0) with its mark.
        let b = board(
            &[(0, 0), (-4, 4)],
            &[(3, 0)],
            &[((0, 0), Magnet), ((3, 0), Heavy)],
        );
        let after = plays(&b, Player::Black, &mv(&[(0, 0)], E));
        assert_eq!(cells(&after, Cell::White), vec![(2, 0)]);
        assert_eq!(after.specials(), [((1, 0), Magnet), ((2, 0), Heavy)]);
        // An enemy next to it has no cell to come to, nor has one behind a marble.
        let near = board(&[(0, 0), (-4, 4)], &[(2, 0)], &[((0, 0), Magnet)]);
        let after = plays(&near, Player::Black, &mv(&[(0, 0)], E));
        assert_eq!(cells(&after, Cell::White), vec![(2, 0)]);
        let blocked = board(&[(0, 0), (2, 0)], &[(3, 0)], &[((0, 0), Magnet)]);
        let after = plays(&blocked, Player::Black, &mv(&[(0, 0)], E));
        assert_eq!(cells(&after, Cell::White), vec![(3, 0)]);
        // Nor does it pull one of its own side.
        let own = board(&[(0, 0), (3, 0)], &[(-4, 0)], &[((0, 0), Magnet)]);
        let after = plays(&own, Player::Black, &mv(&[(0, 0)], E));
        assert_eq!(cells(&after, Cell::Black), vec![(1, 0), (3, 0)]);
    }

    #[test]
    fn a_magnet_pulls_one_enemy_only_the_first_in_direction_order() {
        // From (0,0) two enemies are in line, to the west and to the east: the west one comes.
        let b = board(&[(0, 1)], &[(-2, 0), (2, 0)], &[((0, 1), Magnet)]);
        let after = plays(&b, Player::Black, &mv(&[(0, 1)], NW));
        assert_eq!(cells(&after, Cell::White), vec![(-1, 0), (2, 0)]);
    }

    #[test]
    fn a_magnet_that_did_not_move_does_not_pull() {
        let b = board(&[(0, 0), (-4, 4)], &[(2, 0)], &[((0, 0), Magnet)]);
        let after = plays(&b, Player::Black, &mv(&[(-4, 4)], NW));
        assert_eq!(cells(&after, Cell::White), vec![(2, 0)]);
    }

    #[test]
    fn a_magnet_moved_in_a_group_or_pushed_pulls_for_its_side() {
        // The trio steps SE with the Magnet in the middle: (0,3) comes to (0,2).
        let trio = [(-1, 0), (0, 0), (1, 0)];
        let b = board(&trio, &[(0, 3)], &[((0, 0), Magnet)]);
        let after = plays(&b, Player::Black, &mv(&trio, SE));
        assert_eq!(cells(&after, Cell::White), vec![(0, 2)]);
        assert_eq!(after.specials(), [((0, 1), Magnet)]);
        // White pushes the army's Magnet from (-1,0) to (0,0): it pulls the White marble on (2,0).
        let b = board(
            &[(-1, 0)],
            &[(-3, 0), (-2, 0), (2, 0)],
            &[((-1, 0), Magnet)],
        );
        let after = plays(&b, Player::White, &mv(&[(-3, 0), (-2, 0)], E));
        assert_eq!(cells(&after, Cell::Black), vec![(0, 0)]);
        assert_eq!(cells(&after, Cell::White), vec![(-2, 0), (-1, 0), (1, 0)]);
    }

    #[test]
    fn the_enemys_magnet_pulls_the_armys_marble() {
        let b = board(&[(3, 0)], &[(0, 0), (-4, 0)], &[((0, 0), Magnet)]);
        let after = plays(&b, Player::White, &mv(&[(0, 0)], E));
        assert_eq!(cells(&after, Cell::Black), vec![(2, 0)]);
    }

    #[test]
    fn the_first_push_that_would_move_a_shield_fails_and_spends_it() {
        let push = mv(&[(2, 0), (3, 0)], E);
        let b = board(&[(2, 0), (3, 0)], &[(4, 0)], &[((4, 0), Shield)]);
        assert!(legal_moves(&b, Player::Black).contains(&push));
        let (after, ejected) = apply(&b, Player::Black, &push).unwrap();
        assert!(!ejected);
        assert_eq!(cells(&after, Cell::Black), vec![(2, 0), (3, 0)]);
        assert_eq!(cells(&after, Cell::White), vec![(4, 0)]);
        assert!(after.specials().is_empty(), "a plain marble now");
        // The second push goes through.
        let (after, ejected) = apply(&after, Player::Black, &push).unwrap();
        assert!(ejected && cells(&after, Cell::White).is_empty());
    }

    #[test]
    fn a_shield_in_the_pushed_line_stops_the_whole_push() {
        let trio = [(0, 0), (1, 0), (2, 0)];
        let b = board(&trio, &[(3, 0), (4, 0)], &[((3, 0), Shield)]);
        let (after, ejected) = apply(&b, Player::Black, &mv(&trio, E)).unwrap();
        assert!(!ejected);
        assert_eq!(cells(&after, Cell::Black), trio.to_vec());
        assert_eq!(cells(&after, Cell::White), vec![(3, 0), (4, 0)]);
        assert!(after.specials().is_empty());
        // The same on a free cell behind it, and a Shield outside the line keeps its mark.
        let free = board(
            &[(1, 0), (2, 0)],
            &[(3, 0), (-4, 0)],
            &[((3, 0), Shield), ((-4, 0), Shield)],
        );
        let after = plays(&free, Player::Black, &mv(&[(1, 0), (2, 0)], E));
        assert_eq!(cells(&after, Cell::White), vec![(-4, 0), (3, 0)]);
        assert_eq!(after.specials(), [((-4, 0), Shield)]);
    }

    #[test]
    fn a_shield_moves_itself_and_both_sides_hold_one() {
        let b = board(&[(0, 0)], &[(4, 0)], &[((0, 0), Shield)]);
        let after = plays(&b, Player::Black, &mv(&[(0, 0)], SE));
        assert_eq!(after.specials(), [((0, 1), Shield)]);
        // White's push on the army's Shield fails too.
        let b = board(&[(2, 0)], &[(0, 0), (1, 0)], &[((2, 0), Shield)]);
        let after = plays(&b, Player::White, &mv(&[(0, 0), (1, 0)], E));
        assert_eq!(cells(&after, Cell::Black), vec![(2, 0)]);
        assert!(after.specials().is_empty());
    }

    #[test]
    fn a_push_into_a_shield_still_needs_the_strength() {
        let b = board(&[(0, 0)], &[(1, 0)], &[((1, 0), Shield)]);
        assert_eq!(
            apply(&b, Player::Black, &mv(&[(0, 0)], E)),
            Err(MoveError::NotStrongEnough)
        );
    }

    #[test]
    fn a_failed_push_into_a_shield_keeps_the_gyroscope_and_passes_the_turn() {
        let pair = mv(&[(0, 0), (1, 0)], E);
        let mut b = board(&[(0, 0), (1, 0)], &[(2, 0), (3, 0)], &[((2, 0), Shield)]);
        b.set_relics(&[Relic::Gyroscope]).unwrap();
        let mut game = Game::from_position(b, Player::Black, [0, 0]);
        game.play(&pair).unwrap();
        assert!(
            game.board().has_relic(Relic::Gyroscope),
            "a tie that failed"
        );
        assert_eq!(game.to_move(), Player::White);
        assert_eq!(game.history().len(), 1);
        assert!(game.board().specials().is_empty());
        assert_eq!(game.ejected(Player::Black), 0);
    }

    #[test]
    fn a_bomb_bursts_at_the_end_of_its_sides_third_turn_and_is_gone() {
        // The Bomb on (3,0) throws (4,0) and (4,-1) off the rim and pushes (2,1) away.
        let b = board(
            &[(3, 0), (-4, 4)],
            &[(4, 0), (4, -1), (2, 1), (4, -4)],
            &[((3, 0), Bomb(3))],
        );
        let b = plays(&b, Player::Black, &mv(&[(-4, 4)], NW));
        assert_eq!(b.special((3, 0)), Some(Bomb(2)));
        let b = plays(&b, Player::White, &mv(&[(4, -4)], SW));
        assert_eq!(b.special((3, 0)), Some(Bomb(2)), "White's turn: no tick");
        let b = plays(&b, Player::Black, &mv(&[(-4, 3)], NW));
        assert_eq!(b.special((3, 0)), Some(Bomb(1)));
        let b = plays(&b, Player::White, &mv(&[(3, -3)], SW));
        let (after, ejected) = apply(&b, Player::Black, &mv(&[(-4, 2)], NW)).unwrap();
        assert!(ejected, "a marble left the board");
        assert_eq!(cells(&after, Cell::Black), vec![(-4, 1)]);
        assert_eq!(cells(&after, Cell::White), vec![(1, 2), (2, -2)]);
        assert!(after.specials().is_empty());
        // Two White marbles out for Black, the Bomb's own marble out for White.
        assert_eq!(credits(&b, Player::Black, ejected, &after), [2, 1]);
    }

    #[test]
    fn a_bomb_keeps_its_fuse_when_it_moves() {
        let b = board(&[(0, 0), (-4, 4)], &[(4, 0)], &[((0, 0), Bomb(3))]);
        let after = plays(&b, Player::Black, &mv(&[(0, 0)], SE));
        assert_eq!(after.specials(), [((0, 1), Bomb(2))]);
        // Pushed by the other side, it keeps its fuse too.
        let b = board(&[(2, 0)], &[(0, 0), (1, 0)], &[((2, 0), Bomb(2))]);
        let after = plays(&b, Player::White, &mv(&[(0, 0), (1, 0)], E));
        assert_eq!(after.specials(), [((3, 0), Bomb(2))]);
    }

    #[test]
    fn each_side_burns_only_its_own_bombs() {
        let b = board(&[(-4, 4)], &[(4, -4), (4, 0)], &[((4, 0), Bomb(3))]);
        let after = plays(&b, Player::Black, &mv(&[(-4, 4)], NW));
        assert_eq!(after.special((4, 0)), Some(Bomb(3)));
        let after = plays(&after, Player::White, &mv(&[(4, -4)], SW));
        assert_eq!(after.special((4, 0)), Some(Bomb(2)));
    }

    #[test]
    fn a_bombs_burst_does_not_chain_and_an_anchor_stays() {
        // The Bomb on (3,-1) throws the Spark on (4,-2) off, which does not burst: (4,-3) stays.
        let b = board(
            &[(3, -1), (-4, 4)],
            &[(4, -2), (4, -3), (4, -1), (2, 0)],
            &[
                ((3, -1), Bomb(1)),
                ((4, -2), Spark),
                ((4, -1), Anchor),
                ((2, 0), Bomb(2)),
            ],
        );
        let (after, ejected) = apply(&b, Player::Black, &mv(&[(-4, 4)], NW)).unwrap();
        assert!(ejected);
        assert_eq!(cells(&after, Cell::White), vec![(1, 1), (4, -3), (4, -1)]);
        // The Anchor stays and the other Bomb is moved with its fuse.
        assert_eq!(after.specials(), [((1, 1), Bomb(2)), ((4, -1), Anchor)]);
    }

    #[test]
    fn a_bomb_that_throws_the_armys_own_marbles_off_can_lose_the_fight() {
        let b = board(&[(3, 0), (4, 0), (-4, 4)], &[(0, 0)], &[((3, 0), Bomb(1))]);
        let mut game = Game::from_position(b, Player::Black, [0, 0]).with_win([6, 2]);
        game.play(&mv(&[(-4, 4)], NW)).unwrap();
        assert_eq!(game.ejected(Player::White), 2);
        assert_eq!(game.outcome(), Some(Outcome::Win(Player::White)));
    }

    #[test]
    fn the_bot_moves_its_bomb_next_to_the_marbles_it_throws_off() {
        // The Bomb bursts after the next move wherever it stands: from (3,0) it takes (4,0) and (4,-1).
        let b = board(
            &[(2, 0), (-4, 4)],
            &[(4, 0), (4, -1), (-4, 0)],
            &[((2, 0), Bomb(1))],
        );
        let mut game = Game::from_position(b, Player::Black, [0, 0]);
        let found = best_move(&game, 3000).unwrap();
        assert_eq!(found, mv(&[(2, 0)], E));
        game.play(&found).unwrap();
        assert_eq!(game.ejected(Player::Black), 2);
    }

    #[test]
    fn a_medic_thrown_off_comes_back_on_the_first_free_cell_of_its_back_row() {
        let push = mv(&[(2, 0), (3, 0)], E);
        let b = board(&[(4, 0)], &[(2, 0), (3, 0)], &[((4, 0), Medic)]);
        let (after, ejected) = apply(&b, Player::White, &push).unwrap();
        assert!(ejected);
        assert_eq!(cells(&after, Cell::Black), vec![(-4, 4)]);
        assert!(after.specials().is_empty(), "plain once back");
        assert_eq!(credits(&b, Player::White, ejected, &after), [0, 0]);
        // The next free cell when the first is taken.
        let b = board(
            &[(4, 0), (-4, 4), (-3, 4)],
            &[(2, 0), (3, 0)],
            &[((4, 0), Medic)],
        );
        let after = plays(&b, Player::White, &push);
        assert_eq!(cells(&after, Cell::Black), vec![(-4, 4), (-3, 4), (-2, 4)]);
        // A Medic that is only pushed along keeps its mark.
        let b = board(&[(3, 0)], &[(1, 0), (2, 0)], &[((3, 0), Medic)]);
        let after = plays(&b, Player::White, &push_of(1));
        assert_eq!(after.specials(), [((4, 0), Medic)]);
    }

    fn push_of(q: i32) -> Move {
        mv(&[(q, 0), (q + 1, 0)], E)
    }

    #[test]
    fn a_medic_of_the_bot_comes_back_on_its_own_back_row() {
        let b = board(&[(2, -2), (3, -2)], &[(4, -2)], &[((4, -2), Medic)]);
        let after = plays(&b, Player::Black, &mv(&[(2, -2), (3, -2)], E));
        assert_eq!(cells(&after, Cell::White), vec![(4, -4)]);
        assert_eq!(cells(&after, Cell::Black), vec![(3, -2), (4, -2)]);
    }

    #[test]
    fn a_medic_with_no_free_cell_in_the_back_row_is_lost() {
        let back = [(-4, 4), (-3, 4), (-2, 4), (-1, 4), (0, 4)];
        let mut black = back.to_vec();
        black.push((4, 0));
        let b = board(&black, &[(2, 0), (3, 0)], &[((4, 0), Medic)]);
        let (after, ejected) = apply(&b, Player::White, &mv(&[(2, 0), (3, 0)], E)).unwrap();
        assert_eq!(cells(&after, Cell::Black), back.to_vec());
        assert_eq!(credits(&b, Player::White, ejected, &after), [0, 1]);
    }

    #[test]
    fn a_medic_thrown_off_by_a_burst_comes_back_too() {
        // White pushes the army's Spark off from (4,-1): the burst throws the Medic on (4,0) off.
        let b = board(
            &[(4, -1), (4, 0)],
            &[(2, -1), (3, -1)],
            &[((4, -1), Spark), ((4, 0), Medic)],
        );
        let (after, ejected) = apply(&b, Player::White, &mv(&[(2, -1), (3, -1)], E)).unwrap();
        assert_eq!(cells(&after, Cell::Black), vec![(-4, 4)]);
        assert!(after.specials().is_empty());
        assert_eq!(credits(&b, Player::White, ejected, &after), [0, 1]);
    }

    #[test]
    fn two_medics_thrown_off_by_a_bomb_both_come_back() {
        let b = board(
            &[(3, 0), (4, 0), (4, -1), (0, 0)],
            &[(-4, 0)],
            &[((3, 0), Bomb(1)), ((4, 0), Medic), ((4, -1), Medic)],
        );
        let (after, ejected) = apply(&b, Player::Black, &mv(&[(0, 0)], E)).unwrap();
        assert!(ejected);
        assert_eq!(cells(&after, Cell::Black), vec![(-4, 4), (-3, 4), (1, 0)]);
        assert!(after.specials().is_empty());
        assert_eq!(credits(&b, Player::Black, ejected, &after), [0, 1]);
    }

    #[test]
    fn the_fuse_is_part_of_the_position_and_a_fight_is_the_same_every_time() {
        let play = |fuse| {
            let b = board(&[(0, 0), (-4, 4)], &[(4, 0)], &[((0, 0), Bomb(fuse))]);
            let mut game = Game::from_position(b, Player::Black, [0, 0]);
            game.play(&mv(&[(-4, 4)], NW)).unwrap();
            game
        };
        assert_ne!(play(3).history()[0].hash, play(2).history()[0].hash);
        let (a, b) = (play(3), play(3));
        assert_eq!(a.board(), b.board());
        assert_eq!(a.history(), b.history());
    }
}

#[cfg(test)]
mod foes {
    use super::*;
    use crate::board::{PlaceError, Special, FUSE};
    use crate::search::best_move;

    fn count(board: &Board, cell: Cell) -> usize {
        (-4..=4)
            .flat_map(|q| (-4..=4).map(move |r| (q, r)))
            .filter(|&(q, r)| board.get(q, r) == Some(cell))
            .count()
    }

    fn centre_distance((q, r): (i32, i32)) -> i32 {
        q.abs().max(r.abs()).max((q + r).abs())
    }

    /// The node of `seed` that is the first of `kind` in act `act`, with its index in the map.
    fn node_of(seed: u64, kind: NodeKind, act: usize) -> Option<(usize, Node)> {
        run_map(seed)
            .into_iter()
            .enumerate()
            .find(|(_, n)| n.kind == kind && n.act == act)
    }

    #[test]
    fn an_unknown_node_takes_the_place_of_the_event_in_the_draw_and_fights_when_it_turns_into_one()
    {
        assert_eq!(NodeKind::Unknown as u8, 7);
        assert!((0..50).any(|seed| run_map(seed).iter().any(|n| n.kind == NodeKind::Unknown)));
        assert!((0..50).all(|seed| run_map(seed).iter().all(|n| n.kind != NodeKind::Event)));
        for seed in 0..50 {
            let Some((i, node)) = node_of(seed, NodeKind::Unknown, 0) else {
                continue;
            };
            // The page turns an unknown node into a fight, an event or a treasure: its fight is
            // a plain fight of its act (docs/specs/roguelite.md section 16).
            assert_eq!((node.formation, node.elite), (Formation::Standard, None));
            let plan = foe_plan(seed, i, 0, Biome::Meadow);
            assert_eq!(plan.count, FIGHT_FOES);
            assert_eq!(plan.specials.len(), 1);
            assert_eq!(foe_plan(seed, i, 1, Biome::Meadow).count, FIGHT_FOES - 1);
        }
    }

    #[test]
    fn every_formation_is_14_distinct_cells_of_the_bots_half_clear_of_the_army() {
        assert_eq!(Formation::ALL.len(), 5);
        let army: Vec<_> = STANDARD_BLACK.to_vec();
        let board = Board::empty();
        for formation in Formation::ALL {
            let cells = formation.cells(FULL_ARMY);
            assert_eq!(cells.len(), 14, "{formation:?}");
            let mut sorted = cells.clone();
            sorted.sort();
            sorted.dedup();
            assert_eq!(sorted.len(), 14, "{formation:?} repeats a cell");
            for cell in &cells {
                assert!(
                    board.get(cell.0, cell.1).is_some(),
                    "{formation:?} {cell:?}"
                );
                assert!(!army.contains(cell), "{formation:?} {cell:?} is the army's");
                for (dq, dr) in NEIGHBOURS {
                    let next = (cell.0 + dq, cell.1 + dr);
                    assert!(
                        !army.contains(&next),
                        "{formation:?} {cell:?} touches the army"
                    );
                }
            }
        }
    }

    #[test]
    fn the_standard_formation_is_the_layout_of_before_and_fewer_marbles_lose_the_front() {
        let standard: Vec<_> = STANDARD_BLACK.iter().map(|&(q, r)| (-q, -r)).collect();
        assert_eq!(Formation::Standard.cells(14), standard);
        assert_eq!(Formation::Standard.cells(10), standard[..10]);
        // The others drop the marbles nearest the centre first.
        for formation in &Formation::ALL[1..] {
            let all = formation.cells(14);
            let ten = formation.cells(10);
            assert_eq!(ten.len(), 10);
            assert!(ten.iter().all(|c| all.contains(c)), "{formation:?}");
            let kept = ten.iter().map(|&c| centre_distance(c)).min().unwrap();
            let dropped = all
                .iter()
                .filter(|c| !ten.contains(c))
                .map(|&c| centre_distance(c))
                .max()
                .unwrap();
            assert!(dropped <= kept, "{formation:?} drops a far marble first");
        }
        assert_eq!(Formation::Snake.cells(99).len(), 14); // clamped
        assert_eq!(Formation::Wedge.cells(0).len(), usize::from(MIN_ARMY));
    }

    #[test]
    fn the_formation_codes_are_their_bridge_codes() {
        for (code, formation) in Formation::ALL.into_iter().enumerate() {
            assert_eq!(formation as usize, code);
            assert_eq!(Formation::from_code(code as u8), Some(formation));
        }
        assert_eq!(Formation::from_code(5), None);
        for (code, elite) in Elite::ALL.into_iter().enumerate() {
            assert_eq!(elite as usize, code + 1);
        }
    }

    #[test]
    fn only_fight_and_elite_nodes_have_a_formation_and_only_elites_an_archetype() {
        let (mut formations, mut elites) = (Vec::new(), Vec::new());
        for seed in 0..100 {
            for node in run_map(seed) {
                let fights = matches!(node.kind, NodeKind::Fight | NodeKind::Elite);
                if !fights {
                    assert_eq!(node.formation, Formation::Standard);
                }
                assert_eq!(node.elite.is_some(), node.kind == NodeKind::Elite);
                if fights && !formations.contains(&node.formation) {
                    formations.push(node.formation);
                }
                if let Some(e) = node.elite {
                    if !elites.contains(&e) {
                        elites.push(e);
                    }
                }
            }
        }
        assert_eq!(
            formations.len(),
            Formation::ALL.len(),
            "every formation is dealt"
        );
        assert_eq!(elites.len(), Elite::ALL.len(), "every archetype is dealt");
    }

    #[test]
    fn a_node_keeps_its_enemies_for_a_seed_and_another_seed_deals_others() {
        assert_eq!(run_map(9), run_map(9));
        let plan = |s| {
            let (i, _) = node_of(s, NodeKind::Fight, 1).unwrap();
            foe_plan(s, i, 0, Biome::Meadow)
        };
        assert_eq!(plan(9), plan(9));
        assert!((0..20).any(|s| plan(s) != plan(9)));
    }

    #[test]
    fn a_fight_node_has_10_foes_an_elite_14_and_the_saboteur_takes_one() {
        for seed in 0..30 {
            let (fight, _) = node_of(seed, NodeKind::Fight, 1).unwrap();
            assert_eq!(foe_plan(seed, fight, 0, Biome::Meadow).count, FIGHT_FOES);
            assert_eq!(
                foe_plan(seed, fight, 1, Biome::Meadow).count,
                FIGHT_FOES - 1
            );
            if let Some((elite, _)) =
                node_of(seed, NodeKind::Elite, 0).or(node_of(seed, NodeKind::Elite, 1))
            {
                assert_eq!(foe_plan(seed, elite, 0, Biome::Meadow).count, FULL_ARMY);
                assert_eq!(foe_plan(seed, elite, 1, Biome::Meadow).count, FULL_ARMY - 1);
            }
        }
    }

    #[test]
    fn the_first_fight_of_a_run_has_8_foes_and_the_saboteur_takes_one() {
        assert_eq!(FIRST_FOES, 8);
        for seed in 0..30 {
            let map = run_map(seed);
            for (index, node) in map.iter().enumerate() {
                if node.kind == NodeKind::Fight {
                    let first = node.act == 0 && node.row == 0;
                    let count = if first { FIRST_FOES } else { FIGHT_FOES };
                    assert_eq!(foe_plan(seed, index, 0, Biome::Meadow).count, count);
                    assert_eq!(foe_plan(seed, index, 1, Biome::Meadow).count, count - 1);
                }
            }
            let plan = foe_plan(seed, 0, 0, Biome::Meadow);
            assert_eq!(
                usize::from(plan.count),
                map[0].formation.cells(FIRST_FOES).len()
            );
            assert_eq!(plan.specials.len(), 1);
        }
    }

    #[test]
    fn fights_hold_more_special_foes_in_later_acts_of_kinds_never_repeated() {
        let order = [
            Special::Heavy,
            Special::Anchor,
            Special::Spark,
            Special::Magnet,
            Special::Shield,
            Special::Bomb(FUSE),
            Special::Medic,
        ];
        for seed in 0..60 {
            for act in 0..ACTS {
                let (i, _) = node_of(seed, NodeKind::Fight, act).unwrap(); // the first row fights
                let plan = foe_plan(seed, i, 0, Biome::Meadow);
                assert_eq!(plan.specials.len(), act + 1, "seed {seed} act {act}");
                let kinds: Vec<_> = plan.specials.iter().map(|s| s.1).collect();
                for (k, kind) in kinds.iter().enumerate() {
                    assert!(!kinds[..k].contains(kind), "a kind twice, seed {seed}");
                    let known = &order[..3 + 2 * act];
                    assert!(known.contains(kind), "{kind:?} too early in act {act}");
                }
            }
        }
        // Every kind is dealt somewhere in the third act.
        let mut seen = Vec::new();
        for seed in 0..60 {
            let (i, _) = node_of(seed, NodeKind::Fight, 2).unwrap();
            for (_, kind) in foe_plan(seed, i, 0, Biome::Meadow).specials {
                if !seen.contains(&kind) {
                    seen.push(kind);
                }
            }
        }
        assert_eq!(seen.len(), 7);
    }

    #[test]
    fn the_foe_specials_sit_on_distinct_marbles_of_the_formation() {
        for seed in 0..40 {
            for kind in [NodeKind::Fight, NodeKind::Elite] {
                for act in 0..ACTS {
                    let Some((i, node)) = node_of(seed, kind, act) else {
                        continue;
                    };
                    let plan = foe_plan(seed, i, 0, Biome::Meadow);
                    assert_eq!(plan.formation, node.formation);
                    let cells = plan.formation.cells(plan.count);
                    let mut marked: Vec<_> = plan.specials.iter().map(|s| s.0).collect();
                    assert!(marked.iter().all(|c| cells.contains(c)));
                    marked.sort();
                    marked.dedup();
                    assert_eq!(marked.len(), plan.specials.len(), "a marble twice");
                }
            }
        }
    }

    #[test]
    fn an_elite_plays_its_archetype_with_two_more_specials_than_a_fight() {
        let mut seen = [false; 3];
        for seed in 0..120 {
            for act in 0..ACTS {
                let Some((i, node)) = node_of(seed, NodeKind::Elite, act) else {
                    continue;
                };
                let plan = foe_plan(seed, i, 0, Biome::Meadow);
                let kinds: Vec<_> = plan.specials.iter().map(|s| s.1).collect();
                assert_eq!(kinds.len(), act + 2, "seed {seed} act {act}");
                let elite = node.elite.unwrap();
                seen[elite as usize - 1] = true;
                let (a, b) = match elite {
                    Elite::Wall => (Special::Anchor, Special::Anchor),
                    Elite::Brute => (Special::Heavy, Special::Heavy),
                    Elite::Artificer => (Special::Spark, Special::Bomb(FUSE)),
                };
                assert!(
                    kinds.iter().all(|k| *k == a || *k == b),
                    "{elite:?} {kinds:?}"
                );
                if elite == Elite::Artificer {
                    // Sparks first, then Bombs: as many Sparks as Bombs, the odd one a Spark.
                    let sparks = kinds.iter().filter(|k| **k == a).count();
                    assert_eq!(sparks, kinds.len().div_ceil(2));
                }
            }
        }
        assert_eq!(seen, [true; 3]);
    }

    #[test]
    fn a_node_that_is_no_fight_or_unknown_or_out_of_the_map_has_the_plain_army() {
        let plain = |s, i| foe_plan(s, i, 0, Biome::Meadow);
        for seed in 0..40 {
            for (i, node) in run_map(seed).iter().enumerate() {
                if !matches!(
                    node.kind,
                    NodeKind::Fight | NodeKind::Elite | NodeKind::Unknown
                ) {
                    let plan = plain(seed, i);
                    assert_eq!(
                        (plan.count, plan.formation),
                        (FULL_ARMY, Formation::Standard)
                    );
                    assert!(plan.specials.is_empty());
                }
            }
        }
        let out = plain(1, 9999);
        assert_eq!(
            (out.count, out.formation, out.specials.len()),
            (FULL_ARMY, Formation::Standard, 0)
        );
    }

    #[test]
    fn a_plan_game_stands_the_formation_with_its_specials_and_the_army_as_before() {
        for seed in 0..30 {
            let (i, _) = node_of(seed, NodeKind::Elite, 2)
                .or(node_of(seed, NodeKind::Fight, 2))
                .unwrap();
            let plan = foe_plan(seed, i, 0, Biome::Meadow);
            let game = army_game_formed(9, &plan).unwrap();
            let board = game.board();
            assert_eq!(count(board, Cell::White), usize::from(plan.count));
            assert_eq!(count(board, Cell::Black), 9);
            for cell in plan.formation.cells(plan.count) {
                assert_eq!(board.get(cell.0, cell.1), Some(Cell::White));
            }
            assert_eq!(board.specials().len(), plan.specials.len());
            for (cell, kind) in &plan.specials {
                assert_eq!(board.special(*cell), Some(*kind));
            }
            assert!(board.rogue_lite());
            let mine = army_game(9);
            assert_eq!(
                game.win_ejections(Player::White),
                mine.win_ejections(Player::White)
            );
            assert_eq!(game.win_ejections(Player::Black), WIN_EJECTIONS);
        }
        // The standard formation without a special is the fight of before.
        let plain = FoePlan {
            count: 10,
            formation: Formation::Standard,
            specials: Vec::new(),
            biome: Biome::Meadow,
        };
        assert_eq!(
            army_game_formed(12, &plain).unwrap().board(),
            army_game_against(12, 10).board()
        );
    }

    #[test]
    fn a_special_on_a_cell_without_a_marble_is_refused() {
        let plan = FoePlan {
            count: 10,
            formation: Formation::Snake,
            specials: vec![((0, 0), Special::Anchor)],
            biome: Biome::Meadow,
        };
        assert_eq!(
            army_game_formed(14, &plan).err(),
            Some(PlaceError::NoMarble)
        );
    }

    #[test]
    fn the_bot_plays_every_kind_of_enemy_army() {
        for seed in 0..12 {
            for kind in [NodeKind::Fight, NodeKind::Elite] {
                for act in 0..ACTS {
                    let Some((i, _)) = node_of(seed, kind, act) else {
                        continue;
                    };
                    let mut game =
                        army_game_formed(14, &foe_plan(seed, i, 0, Biome::Meadow)).unwrap();
                    for _ in 0..6 {
                        let mv = best_move(&game, 300).expect("a legal move or a pass");
                        game.play(&mv).unwrap();
                    }
                }
            }
        }
    }

    #[test]
    fn ascension_adds_special_marbles_to_a_fight_and_an_elite() {
        for seed in 0..40 {
            for (kind, base) in [(NodeKind::Fight, 1), (NodeKind::Elite, 2)] {
                for act in 0..ACTS {
                    let Some((i, node)) = node_of(seed, kind, act) else {
                        continue;
                    };
                    let plain = foe_plan(seed, i, 0, Biome::Meadow);
                    assert_eq!(
                        foe_plan_with(seed, i, 0, Biome::Meadow, 0),
                        plain,
                        "more 0 is the plain plan"
                    );
                    for more in 1..=2usize {
                        let plan = foe_plan_with(seed, i, 0, Biome::Meadow, more as u8);
                        assert_eq!(
                            plan.specials.len(),
                            act + base + more,
                            "seed {seed} act {act}"
                        );
                        assert_eq!((plan.count, plan.formation), (plain.count, node.formation));
                        assert_eq!(
                            plan,
                            foe_plan_with(seed, i, 0, Biome::Meadow, more as u8),
                            "deterministic"
                        );
                        let mut cells: Vec<_> = plan.specials.iter().map(|s| s.0).collect();
                        assert!(cells
                            .iter()
                            .all(|c| plan.formation.cells(plan.count).contains(c)));
                        cells.sort();
                        cells.dedup();
                        assert_eq!(cells.len(), plan.specials.len(), "a marble twice");
                        assert!(army_game_formed(14, &plan).is_ok());
                    }
                }
            }
        }
    }

    #[test]
    fn the_extra_special_marbles_of_a_fight_stay_in_the_act_and_an_elite_keeps_its_style() {
        let (i, _) = node_of(3, NodeKind::Fight, 0).unwrap();
        let kinds: Vec<_> = foe_plan_with(3, i, 0, Biome::Meadow, 2)
            .specials
            .iter()
            .map(|s| s.1)
            .collect();
        assert!(kinds
            .iter()
            .all(|k| matches!(k, Special::Heavy | Special::Anchor | Special::Spark)));
        assert_eq!(kinds.len(), 3); // the act 1 pool is only 3 kinds: no kind twice
        for seed in 0..120 {
            let Some((i, node)) = node_of(seed, NodeKind::Elite, 1) else {
                continue;
            };
            let plan = foe_plan_with(seed, i, 0, Biome::Meadow, 2);
            let expected = match node.elite.unwrap() {
                Elite::Wall => vec![Special::Anchor],
                Elite::Brute => vec![Special::Heavy],
                Elite::Artificer => vec![Special::Spark, Special::Bomb(FUSE)],
            };
            assert!(plan.specials.iter().all(|s| expected.contains(&s.1)));
        }
    }

    #[test]
    fn ascension_never_asks_more_special_marbles_than_the_bot_has_marbles() {
        let (i, _) = node_of(3, NodeKind::Elite, 2).unwrap();
        let plan = foe_plan_with(3, i, 10, Biome::Meadow, 200);
        assert_eq!(plan.count, MIN_ARMY);
        assert_eq!(plan.specials.len(), usize::from(MIN_ARMY));
        // A node with no foe plan of its own has none to add to.
        let (boss, _) = node_of(3, NodeKind::Boss, 0).unwrap();
        assert!(foe_plan_with(3, boss, 0, Biome::Meadow, 2)
            .specials
            .is_empty());
    }
}

#[cfg(test)]
mod biomes {
    use super::*;
    use crate::board::Special;
    use crate::moves::{apply, Direction, Move, MoveError};
    use crate::search::best_move;
    use crate::world::Biome;

    fn count(board: &Board, cell: Cell) -> usize {
        (-4..=4)
            .flat_map(|q| (-4..=4).map(move |r| (q, r)))
            .filter(|&(q, r)| board.get(q, r) == Some(cell))
            .count()
    }

    /// The cells of the radius 4 board that a fight removed.
    fn holes(board: &Board) -> Vec<(i32, i32)> {
        let mut holes: Vec<(i32, i32)> = (-4i32..=4)
            .flat_map(|q| (-4..=4).map(move |r| (q, r)))
            .filter(|&(q, r)| (q + r).abs() <= 4 && board.get(q, r).is_none())
            .collect();
        holes.sort();
        holes
    }

    /// A fight of the standard formation in `biome`.
    fn standard(biome: Biome) -> Game {
        let plan = FoePlan {
            count: FIGHT_FOES,
            formation: Formation::Standard,
            specials: Vec::new(),
            biome,
        };
        army_game_formed(FULL_ARMY, &plan).unwrap()
    }

    /// The first fight (or elite) node of act `act` of `seed`, its index in the map.
    fn fight_of(seed: u64, act: usize, kind: NodeKind) -> Option<usize> {
        run_map(seed)
            .iter()
            .position(|n| n.act == act && n.kind == kind)
    }

    #[test]
    fn the_biome_codes_are_the_open_worlds_and_the_meadow_is_the_first() {
        assert_eq!(Biome::ALL.len(), 6);
        for (code, biome) in Biome::ALL.into_iter().enumerate() {
            assert_eq!(biome as usize, code);
            assert_eq!(Biome::from_code(code as u8), Some(biome));
        }
        assert_eq!(Biome::ALL[0], Biome::Meadow);
        assert_eq!(Biome::from_code(6), None);
    }

    #[test]
    fn two_exits_lead_to_two_other_biomes_never_the_meadow_nor_the_one_left() {
        for seed in 0..120 {
            for act in 1..ACTS {
                for from in Biome::ALL {
                    let [a, b] = exits(seed, act, from);
                    assert_ne!(a, b, "seed {seed}");
                    for exit in [a, b] {
                        assert_ne!(exit, Biome::Meadow);
                        assert_ne!(exit, from);
                    }
                }
            }
        }
    }

    #[test]
    fn the_exits_come_from_the_seed_the_act_and_where_the_run_is_and_every_biome_is_offered() {
        assert_eq!(exits(9, 1, Biome::Meadow), exits(9, 1, Biome::Meadow));
        assert!((0..20).any(|s| exits(s, 1, Biome::Meadow) != exits(9, 1, Biome::Meadow)));
        assert!((0..20).any(|s| exits(s, 2, Biome::Meadow) != exits(s, 1, Biome::Meadow)));
        assert!(Biome::ALL
            .into_iter()
            .any(|from| exits(9, 2, from) != exits(9, 2, Biome::Meadow)));
        let mut offered = Vec::new();
        for seed in 0..40 {
            offered.extend(exits(seed, 1, Biome::Meadow));
        }
        for biome in &Biome::ALL[1..] {
            assert!(offered.contains(biome), "{biome:?} is never offered");
        }
    }

    #[test]
    fn the_meadow_has_no_hole_and_every_other_biome_its_own_point_symmetric_holes_in_the_middle() {
        assert!(holes(standard(Biome::Meadow).board()).is_empty());
        let mut seen: Vec<Vec<(i32, i32)>> = Vec::new();
        for &biome in &Biome::ALL[1..] {
            let found = holes(standard(biome).board());
            assert!(!found.is_empty(), "{biome:?}");
            for &(q, r) in &found {
                assert!(found.contains(&(-q, -r)), "{biome:?} {q},{r} is unfair");
                assert!(r.abs() <= 1, "{biome:?} {q},{r} is by the armies");
            }
            assert!(!seen.contains(&found), "{biome:?} repeats a pattern");
            seen.push(found);
        }
    }

    #[test]
    fn a_hole_never_takes_a_marble_of_any_army_formation_or_special() {
        for seed in 0..30 {
            for kind in [NodeKind::Fight, NodeKind::Elite] {
                for act in 0..ACTS {
                    let Some(i) = fight_of(seed, act, kind) else {
                        continue;
                    };
                    for biome in Biome::ALL {
                        let plan = foe_plan(seed, i, 0, biome);
                        assert_eq!(plan.biome, biome);
                        let game = army_game_formed(11, &plan).unwrap();
                        assert_eq!(count(game.board(), Cell::Black), 11);
                        assert_eq!(count(game.board(), Cell::White), usize::from(plan.count));
                        assert_eq!(game.board().specials().len(), plan.specials.len());
                        assert!(game.board().rogue_lite());
                    }
                }
            }
        }
    }

    #[test]
    fn a_marble_pushed_toward_a_hole_goes_off_and_one_walking_in_is_refused() {
        // The Desert's holes are (-1, 0) and (1, 0).
        let mut board = standard(Biome::Desert).board().clone();
        for (q, r) in [(0, 2), (0, -2), (-1, 2), (1, -2)] {
            board.set(q, r, Cell::Empty);
        }
        board.set(1, 3, Cell::Black);
        board.set(1, 2, Cell::Black);
        board.set(1, 1, Cell::White);
        let push = Move {
            cells: vec![(1, 2), (1, 3)],
            dir: Direction::NW,
        };
        let (after, ejected) = apply(&board, Player::Black, &push).unwrap();
        assert!(ejected);
        assert_eq!(after.get(1, 1), Some(Cell::Black));
        assert_eq!(after.get(1, 0), None);
        let mut walk = board.clone();
        walk.set(1, 1, Cell::Black);
        let step = Move {
            cells: vec![(1, 1)],
            dir: Direction::NW,
        };
        assert_eq!(
            apply(&walk, Player::Black, &step).err(),
            Some(MoveError::OffBoard)
        );
    }

    #[test]
    fn a_biome_fight_holds_its_signature_among_the_same_marbles_as_the_meadow_and_an_elite_is_unchanged(
    ) {
        let signatures = [
            (Biome::Meadow, None),
            (Biome::Forest, Some(Special::Anchor)),
            (Biome::Tundra, Some(Special::Shield)),
            (Biome::Desert, Some(Special::Spark)),
            (Biome::Badlands, Some(Special::Heavy)),
            (Biome::Archipelago, Some(Special::Magnet)),
        ];
        for (biome, signature) in signatures {
            assert_eq!(biome.signature(), signature);
        }
        let mut changed = false;
        for seed in 0..60 {
            for act in 1..ACTS {
                let i = fight_of(seed, act, NodeKind::Fight).unwrap();
                let meadow = foe_plan(seed, i, 0, Biome::Meadow);
                for &biome in &Biome::ALL[1..] {
                    let plan = foe_plan(seed, i, 0, biome);
                    let kinds: Vec<_> = plan.specials.iter().map(|s| s.1).collect();
                    assert_eq!(kinds.len(), act + 1);
                    assert!(kinds.contains(&biome.signature().unwrap()));
                    for (k, kind) in kinds.iter().enumerate() {
                        assert!(!kinds[..k].contains(kind), "a kind twice");
                    }
                    let cells = |p: &FoePlan| p.specials.iter().map(|s| s.0).collect::<Vec<_>>();
                    assert_eq!(cells(&plan), cells(&meadow), "the marbles move");
                    assert_eq!(plan.specials[1..], meadow.specials[1..]);
                    changed |= plan.specials != meadow.specials;
                }
                if let Some(e) = fight_of(seed, act, NodeKind::Elite) {
                    let meadow = foe_plan(seed, e, 0, Biome::Meadow).specials;
                    assert_eq!(foe_plan(seed, e, 0, Biome::Tundra).specials, meadow);
                }
            }
        }
        assert!(changed, "no biome ever changes the mix");
    }

    #[test]
    fn the_bot_plays_every_biome() {
        for seed in 0..6 {
            for act in 1..ACTS {
                let i = fight_of(seed, act, NodeKind::Fight).unwrap();
                for &biome in &Biome::ALL[1..] {
                    let mut game = army_game_formed(14, &foe_plan(seed, i, 0, biome)).unwrap();
                    for _ in 0..6 {
                        let mv = best_move(&game, 300).expect("a legal move or a pass");
                        game.play(&mv).unwrap();
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod final_act {
    use super::*;
    use crate::world::Biome;

    #[test]
    fn a_fourth_act_follows_the_three_with_one_elite_then_its_boss() {
        for seed in 0..50 {
            let map = run_map(seed);
            let last: Vec<&Node> = map.iter().filter(|n| n.act == FINAL_ACT).collect();
            assert_eq!(FINAL_ACT, ACTS);
            assert_eq!(last.len(), 2, "seed {seed}");
            assert_eq!((last[0].row, last[0].col), (0, 0));
            assert_eq!(last[0].kind, NodeKind::Elite);
            assert!(last[0].elite.is_some());
            assert_eq!(last[0].links, [0]);
            assert_eq!((last[1].row, last[1].col), (1, 0));
            assert_eq!(last[1].kind, NodeKind::Boss);
            assert!(last[1].links.is_empty() && last[1].elite.is_none());
            // The fourth act comes last, so the nodes of a run saved before keep their indices.
            assert!(map[map.len() - 2..].iter().all(|n| n.act == FINAL_ACT));
            assert_eq!(map.iter().filter(|n| n.act < ACTS).count(), map.len() - 2);
        }
    }

    #[test]
    fn the_final_elite_holds_its_archetypes_marbles_of_the_fourth_act() {
        for seed in 0..50 {
            let map = run_map(seed);
            let i = map.len() - 2;
            let plan = foe_plan(seed, i, 0, Biome::Meadow);
            assert_eq!(plan.count, FULL_ARMY);
            assert_eq!(plan.specials.len(), FINAL_ACT + 2);
            assert_eq!(plan.biome, Biome::Meadow);
            // The act boss that follows has the plain army.
            assert_eq!(foe_plan(seed, i + 1, 0, Biome::Meadow).specials, []);
        }
    }
}

#[cfg(test)]
mod affinities {
    use super::*;
    use crate::board::Special::{
        self, Anchor, AnchorPlus, Bomb, Heavy, HeavyPlus, Shield, Spark, SparkPlus,
    };
    use crate::moves::Direction::{self, E, NW, SW};
    use crate::moves::{apply, legal_moves, Move, MoveError};
    use crate::search::best_move;

    type P = (i32, i32);

    /// A rogue-lite board where the army (Black) has the affinity `levels` (Force, Tactics, Chaos).
    fn board(black: &[P], white: &[P], specials: &[(P, Special)], levels: [u8; 3]) -> Board {
        let mut b = Board::empty();
        b.set_rogue_lite();
        for &(q, r) in black {
            b.set(q, r, Cell::Black);
        }
        for &(q, r) in white {
            b.set(q, r, Cell::White);
        }
        for &(cell, kind) in specials {
            b.place_special(cell, kind).unwrap();
        }
        b.set_affinities(levels).unwrap();
        b
    }

    fn mv(cells: &[P], dir: Direction) -> Move {
        Move {
            cells: cells.to_vec(),
            dir,
        }
    }

    fn cells(b: &Board, cell: Cell) -> Vec<P> {
        let mut v: Vec<P> = (-4..=4)
            .flat_map(|q| (-4..=4).map(move |r| (q, r)))
            .filter(|&(q, r)| b.get(q, r) == Some(cell))
            .collect();
        v.sort();
        v
    }

    const FORCE: [[u8; 3]; 3] = [[0; 3], [1, 0, 0], [2, 0, 0]];
    const TACTICS: [[u8; 3]; 3] = [[0; 3], [0, 1, 0], [0, 2, 0]];
    const CHAOS: [[u8; 3]; 3] = [[0; 3], [0, 0, 1], [0, 0, 2]];

    #[test]
    fn the_affinities_are_listed_in_the_order_of_their_bridge_code() {
        assert_eq!(Affinity::Force as usize, 0);
        assert_eq!(Affinity::Tactics as usize, 1);
        assert_eq!(Affinity::Chaos as usize, 2);
        assert_eq!(MAX_AFFINITY, 2);
    }

    #[test]
    fn affinities_are_set_on_a_rogue_lite_fight_before_its_first_move_capped_at_the_top_level() {
        let mut plain = Board::standard();
        assert_eq!(
            plain.set_affinities([1, 0, 0]),
            Err(PlaceError::NotRogueLite)
        );
        assert_eq!(plain.affinities(), [0, 0, 0]);
        assert_eq!(
            Game::new().set_affinities([1, 0, 0]),
            Err(PlaceError::NotRogueLite)
        );
        let mut game = army_game(FULL_ARMY);
        assert_eq!(game.set_affinities([1, 2, 9]), Ok(()));
        assert_eq!(game.board().affinities(), [1, 2, MAX_AFFINITY]);
        assert_eq!(game.board().affinity(Affinity::Force), 1);
        assert_eq!(game.board().affinity(Affinity::Tactics), 2);
        assert_eq!(game.board().affinity(Affinity::Chaos), MAX_AFFINITY);
        let first = legal_moves(game.board(), Player::Black)[0].clone();
        game.play(&first).unwrap();
        assert_eq!(game.set_affinities([0, 0, 0]), Err(PlaceError::Started));
    }

    #[test]
    fn the_affinities_are_part_of_the_position() {
        let first = mv(&[(0, 2)], crate::moves::Direction::NE);
        let mut plain = army_game(FULL_ARMY);
        let mut forced = army_game(FULL_ARMY);
        forced.set_affinities([1, 0, 0]).unwrap();
        plain.play(&first).unwrap();
        forced.play(&first).unwrap();
        assert_ne!(plain.history()[0].hash, forced.history()[0].hash);
    }

    #[test]
    fn force_adds_its_level_to_the_weight_of_the_armys_heavy_and_heavy_plus() {
        // A lone Heavy (2) cannot push a pair (2); with Force 1 (3) it can, and a trio (3) needs Force 2 (4).
        let lone = mv(&[(0, 0)], E);
        let pair = [(1, 0), (2, 0)];
        let trio = [(1, 0), (2, 0), (3, 0)];
        let push = |white: &[P], levels: [u8; 3]| {
            apply(
                &board(&[(0, 0)], white, &[((0, 0), Heavy)], levels),
                Player::Black,
                &lone,
            )
            .map(|r| r.1)
        };
        assert_eq!(push(&pair, FORCE[0]), Err(MoveError::NotStrongEnough));
        assert_eq!(push(&pair, FORCE[1]), Ok(false));
        assert_eq!(push(&pair, FORCE[2]), Ok(false));
        assert_eq!(push(&trio, FORCE[1]), Err(MoveError::NotStrongEnough));
        assert_eq!(push(&trio, FORCE[2]), Ok(false));
        // A Heavy+ (3) pushes a trio with Force 1 (4), not without.
        let plus = |levels: [u8; 3]| {
            apply(
                &board(&[(0, 0)], &trio, &[((0, 0), HeavyPlus)], levels),
                Player::Black,
                &lone,
            )
        };
        assert_eq!(plus(FORCE[0]), Err(MoveError::NotStrongEnough));
        assert!(plus(FORCE[1]).is_ok());
        // A plain marble gains nothing.
        let plain = apply(
            &board(&[(0, 0)], &pair, &[], FORCE[2]),
            Player::Black,
            &lone,
        );
        assert_eq!(plain, Err(MoveError::NotStrongEnough));
    }

    #[test]
    fn force_also_makes_the_armys_heavy_harder_to_push() {
        // White's trio (3) pushes a lone Heavy (2), but not one with Force 1 (3).
        let trio = mv(&[(-3, 0), (-2, 0), (-1, 0)], E);
        let against = |levels: [u8; 3]| {
            apply(
                &board(
                    &[(0, 0)],
                    &[(-3, 0), (-2, 0), (-1, 0)],
                    &[((0, 0), Heavy)],
                    levels,
                ),
                Player::White,
                &trio,
            )
        };
        assert!(against(FORCE[0]).is_ok());
        assert_eq!(against(FORCE[1]), Err(MoveError::NotStrongEnough));
    }

    #[test]
    fn the_enemys_heavy_gains_nothing_from_the_armys_force() {
        // White's lone Heavy (2) cannot push the army's pair (2) whatever the army's Force.
        let lone = mv(&[(0, 0)], E);
        let b = board(&[(1, 0), (2, 0)], &[(0, 0)], &[((0, 0), Heavy)], FORCE[2]);
        assert_eq!(
            apply(&b, Player::White, &lone),
            Err(MoveError::NotStrongEnough)
        );
        // And the army's pair (2) still holds against a Heavy White... one weighing 2, a tie.
        let b = board(&[(0, 0), (1, 0)], &[(2, 0)], &[((2, 0), Heavy)], FORCE[2]);
        assert!(apply(&b, Player::Black, &mv(&[(0, 0), (1, 0)], Direction::W)).is_ok());
    }

    #[test]
    fn tactics_1_makes_the_armys_anchor_keep_the_marble_in_front_of_it_on_the_board() {
        // White's trio pushes the army's (3,0) Anchor and (4,0): the marble on the rim goes off, unless Tactics 1.
        let trio = [(0, 0), (1, 0), (2, 0)];
        let push = mv(&trio, E);
        let run = |levels: [u8; 3], kind: Special| {
            apply(
                &board(&[(3, 0), (4, 0)], &trio, &[((3, 0), kind)], levels),
                Player::White,
                &push,
            )
        };
        assert!(legal_moves(
            &board(&[(3, 0), (4, 0)], &trio, &[((3, 0), Anchor)], TACTICS[0]),
            Player::White
        )
        .contains(&push));
        assert_eq!(run(TACTICS[0], Anchor).map(|r| r.1), Ok(true));
        assert_eq!(run(TACTICS[1], Anchor), Err(MoveError::PushBlocked));
        // Tactics 2 also weighs the Anchor 2: the trio (3) then ties with the pair (3), too weak.
        assert_eq!(run(TACTICS[2], Anchor), Err(MoveError::NotStrongEnough));
        assert!(!legal_moves(
            &board(&[(3, 0), (4, 0)], &trio, &[((3, 0), Anchor)], TACTICS[1]),
            Player::White
        )
        .contains(&push));
        // A Shield is no Anchor: it keeps the rule it has.
        assert_eq!(run(TACTICS[1], Shield).map(|r| r.1), Ok(false));
    }

    #[test]
    fn the_enemys_anchor_keeps_nothing_from_the_armys_tactics() {
        // The army's trio pushes White's (3,0) Anchor and (4,0) off.
        let trio = [(0, 0), (1, 0), (2, 0)];
        let b = board(&trio, &[(3, 0), (4, 0)], &[((3, 0), Anchor)], TACTICS[2]);
        assert_eq!(
            apply(&b, Player::Black, &mv(&trio, E)).map(|r| r.1),
            Ok(true)
        );
        // The army's pushing group is not shielded either.
        let b = board(
            &[(1, 0), (2, 0), (3, 0)],
            &[(4, 0)],
            &[((3, 0), Anchor)],
            TACTICS[2],
        );
        assert_eq!(
            apply(&b, Player::Black, &mv(&[(1, 0), (2, 0), (3, 0)], E)).map(|r| r.1),
            Ok(true)
        );
    }

    #[test]
    fn tactics_2_adds_one_to_the_weight_of_the_armys_anchors_and_shields() {
        // A lone marble pushes a lone plain marble only when it weighs 2.
        let lone = mv(&[(0, 0)], E);
        for kind in [Anchor, AnchorPlus, Shield] {
            let run = |levels: [u8; 3]| {
                apply(
                    &board(&[(0, 0)], &[(1, 0)], &[((0, 0), kind)], levels),
                    Player::Black,
                    &lone,
                )
            };
            assert_eq!(run(TACTICS[0]), Err(MoveError::NotStrongEnough), "{kind:?}");
            assert_eq!(run(TACTICS[1]), Err(MoveError::NotStrongEnough), "{kind:?}");
            assert!(run(TACTICS[2]).is_ok(), "{kind:?}");
        }
        // A plain marble gains nothing, nor do the enemy's.
        assert!(apply(
            &board(&[(0, 0)], &[(1, 0)], &[], TACTICS[2]),
            Player::Black,
            &lone
        )
        .is_err());
        assert!(apply(
            &board(&[(1, 0)], &[(0, 0)], &[((0, 0), Anchor)], TACTICS[2]),
            Player::White,
            &lone
        )
        .is_err());
    }

    /// White pushes the army's Spark off from (4,-2); its neighbours (3,-2), White, (4,-3) and (3,-1), Black, move away.
    fn burst_of(levels: [u8; 3], black: &[P], specials: &[(P, Special)]) -> Board {
        let b = board(black, &[(2, -2), (3, -2)], specials, levels);
        let (after, ejected) = apply(&b, Player::White, &mv(&[(2, -2), (3, -2)], E)).unwrap();
        assert!(ejected);
        after
    }

    #[test]
    fn chaos_1_bursts_the_armys_sparks_one_cell_further() {
        let black = [(4, -2), (4, -3), (3, -1)];
        let spark = [((4, -2), Spark)];
        let plain = burst_of(CHAOS[0], &black, &spark);
        assert_eq!(cells(&plain, Cell::White), vec![(2, -2), (4, -2)]);
        assert_eq!(cells(&plain, Cell::Black), vec![(2, 0), (4, -4)]);
        // (4,-3) slides past (4,-4) off the board, the others 2 cells.
        for levels in [CHAOS[1], CHAOS[2]] {
            let more = burst_of(levels, &black, &spark);
            assert_eq!(cells(&more, Cell::White), vec![(1, -2), (4, -2)]);
            assert_eq!(cells(&more, Cell::Black), vec![(1, 1)]);
        }
        // A Spark+ bursts 3 cells.
        let plus = [((4, -2), SparkPlus)];
        let three = burst_of(CHAOS[1], &black, &plus);
        assert_eq!(cells(&three, Cell::White), vec![(0, -2), (4, -2)]);
        assert_eq!(cells(&three, Cell::Black), vec![(0, 2)]);
        // It adds to the Detonator's cell: a Spark with both bursts 3 cells.
        let mut both = board(&black, &[(2, -2), (3, -2)], &spark, CHAOS[1]);
        both.set_relics(&[Relic::Detonator]).unwrap();
        let (both, _) = apply(&both, Player::White, &mv(&[(2, -2), (3, -2)], E)).unwrap();
        assert_eq!(cells(&both, Cell::White), vec![(0, -2), (4, -2)]);
        assert_eq!(cells(&both, Cell::Black), vec![(0, 2)]);
    }

    #[test]
    fn the_enemys_spark_bursts_as_far_as_before_whatever_the_armys_chaos() {
        let b = board(
            &[(2, -2), (3, -2)],
            &[(4, -2), (4, -3), (3, -1)],
            &[((4, -2), Spark)],
            CHAOS[2],
        );
        let (after, _) = apply(&b, Player::Black, &mv(&[(2, -2), (3, -2)], E)).unwrap();
        assert_eq!(cells(&after, Cell::White), vec![(2, 0), (4, -4)]);
    }

    /// Black burns its Bomb on (3,0) in `turns` moves of the marble on (-4,4)..., White's marbles on (4,0), (4,-1) and (2,1)
    /// are in reach of the burst; `levels` are the army's.
    fn bombed(levels: [u8; 3], turns: usize) -> Board {
        let mut b = board(
            &[(3, 0), (-4, 4)],
            &[(4, 0), (4, -1), (2, 1), (4, -4)],
            &[((3, 0), Bomb(3))],
            levels,
        );
        let walk = [mv(&[(-4, 4)], NW), mv(&[(-4, 3)], NW), mv(&[(-4, 2)], NW)];
        let reply = [mv(&[(4, -4)], SW), mv(&[(3, -3)], SW), mv(&[(2, -2)], SW)];
        for i in 0..turns {
            b = apply(&b, Player::Black, &walk[i]).unwrap().0;
            if b.special((3, 0)).is_none() {
                return b;
            }
            b = apply(&b, Player::White, &reply[i]).unwrap().0;
        }
        b
    }

    #[test]
    fn chaos_1_bursts_the_armys_bomb_one_cell_further() {
        // Without it the Bomb pushes (2,1) to (1,2); with it to (0,3).
        let plain = bombed(CHAOS[0], 3);
        assert_eq!(cells(&plain, Cell::White), vec![(1, 2), (2, -2)]);
        let more = bombed(CHAOS[1], 3);
        assert_eq!(cells(&more, Cell::White), vec![(0, 3), (2, -2)]);
        assert!(more.specials().is_empty());
    }

    #[test]
    fn chaos_2_burns_two_turns_of_the_armys_bomb_fuse_per_turn() {
        // The fuse is 3: after one turn it is 1 with Chaos 2, 2 without, and it bursts on the second turn.
        assert_eq!(bombed(CHAOS[1], 1).special((3, 0)), Some(Bomb(2)));
        assert_eq!(bombed(CHAOS[2], 1).special((3, 0)), Some(Bomb(1)));
        assert_eq!(bombed(CHAOS[1], 2).special((3, 0)), Some(Bomb(1)));
        let burst = bombed(CHAOS[2], 2);
        assert!(burst.specials().is_empty());
        assert_eq!(cells(&burst, Cell::White), vec![(0, 3), (3, -3)]);
    }

    #[test]
    fn the_enemys_bomb_burns_and_bursts_as_before_whatever_the_armys_chaos() {
        let b = board(
            &[(-4, 4)],
            &[(4, -4), (4, 0)],
            &[((4, 0), Bomb(3))],
            CHAOS[2],
        );
        let after = apply(&b, Player::Black, &mv(&[(-4, 4)], NW)).unwrap().0;
        let after = apply(&after, Player::White, &mv(&[(4, -4)], SW)).unwrap().0;
        assert_eq!(after.special((4, 0)), Some(Bomb(2)));
    }

    #[test]
    fn the_bot_plays_the_bonuses_it_has() {
        // The lone Heavy (2) pushes the pair (2) off the rim only with Force 1 (3).
        let b = board(
            &[(2, 0), (-4, 4)],
            &[(3, 0), (4, 0), (-4, 0)],
            &[((2, 0), Heavy)],
            FORCE[1],
        );
        let mut game = Game::from_position(b, Player::Black, [0, 0]);
        let found = best_move(&game, 3000).unwrap();
        assert_eq!(found, mv(&[(2, 0)], E));
        game.play(&found).unwrap();
        assert_eq!(game.ejected(Player::Black), 1);
    }
}

#[cfg(test)]
mod runes {
    use super::*;
    use crate::world::Biome;

    fn cols(map: &[Node], act: usize, row: usize) -> usize {
        map.iter().filter(|n| n.act == act && n.row == row).count()
    }

    #[test]
    fn no_rune_gives_the_map_and_the_exits_of_a_run_without_runes() {
        for seed in 0..60 {
            assert_eq!(run_map_with(seed, 0), run_map(seed));
            assert!(run_map(seed)
                .iter()
                .all(|n| n.kind != NodeKind::Secret && n.skips.is_empty()));
            for from in Biome::ALL {
                assert_eq!(exits_with(seed, 1, from, 0), exits(seed, 1, from).to_vec());
            }
        }
        assert_eq!(NodeKind::Secret as u8, 8);
        assert_eq!([RUNE_ROOM, RUNE_SHORTCUT, RUNE_EXIT], [1, 2, 4]);
    }

    #[test]
    fn the_rune_of_the_room_adds_a_secret_room_to_the_second_row_of_each_act() {
        for seed in 0..120 {
            let base = run_map(seed);
            let map = run_map_with(seed, RUNE_ROOM);
            // The nodes of a run without runes keep their index, the secret rooms come after them.
            assert_eq!(map.len(), base.len() + ACTS, "seed {seed}");
            for (i, node) in base.iter().enumerate() {
                assert_eq!(
                    (node.kind, node.formation, node.elite),
                    (map[i].kind, map[i].formation, map[i].elite)
                );
            }
            for act in 0..ACTS {
                let secret = &map[base.len() + act];
                let (w0, w1, w2) = (
                    cols(&base, act, 0),
                    cols(&base, act, 1),
                    cols(&base, act, 2),
                );
                assert_eq!(secret.kind, NodeKind::Secret);
                assert_eq!((secret.act, secret.row, secret.col), (act, 1, w1));
                assert_eq!(secret.links, [w2 - 1]);
                assert!(secret.skips.is_empty() && secret.elite.is_none());
                // It is reached from the last node of the first row, past the links it had.
                let from = map
                    .iter()
                    .find(|n| (n.act, n.row, n.col) == (act, 0, w0 - 1))
                    .unwrap();
                assert_eq!(from.links.last(), Some(&w1));
                assert_eq!(
                    from.links[..from.links.len() - 1],
                    base[from_index(&base, act, w0 - 1)].links
                );
            }
        }
    }

    fn from_index(map: &[Node], act: usize, col: usize) -> usize {
        map.iter()
            .position(|n| (n.act, n.row, n.col) == (act, 0, col))
            .unwrap()
    }

    #[test]
    fn the_rune_of_the_shortcut_links_a_first_row_node_to_the_third_row_of_each_act() {
        let mut sources = Vec::new();
        for seed in 0..120 {
            let base = run_map(seed);
            let map = run_map_with(seed, RUNE_SHORTCUT);
            assert_eq!(map.len(), base.len(), "seed {seed}");
            for act in 0..ACTS {
                let skipping: Vec<&Node> = map
                    .iter()
                    .filter(|n| n.act == act && !n.skips.is_empty())
                    .collect();
                assert_eq!(skipping.len(), 1, "seed {seed} act {act}");
                let node = skipping[0];
                assert_eq!(node.row, 0);
                assert_eq!(node.skips.len(), 1);
                assert!(node.skips[0] < cols(&base, act, 2));
                sources.push((node.col, node.skips[0]));
            }
            // Only the shortcut is new.
            for (a, b) in base.iter().zip(&map) {
                assert_eq!((&a.links, a.kind), (&b.links, b.kind));
            }
            assert_eq!(map, run_map_with(seed, RUNE_SHORTCUT));
        }
        assert!(sources.iter().any(|s| s.0 > 0) && sources.iter().any(|s| s.1 > 0));
    }

    #[test]
    fn the_runes_of_the_room_and_the_shortcut_open_both_on_the_same_map() {
        for seed in 0..60 {
            let map = run_map_with(seed, RUNE_ROOM | RUNE_SHORTCUT);
            assert_eq!(
                map.iter().filter(|n| n.kind == NodeKind::Secret).count(),
                ACTS
            );
            assert_eq!(map.iter().filter(|n| !n.skips.is_empty()).count(), ACTS);
            // The exit rune changes no node.
            assert_eq!(
                map,
                run_map_with(seed, RUNE_ROOM | RUNE_SHORTCUT | RUNE_EXIT)
            );
        }
    }

    #[test]
    fn the_rune_of_the_exit_adds_a_third_biome_to_the_exits() {
        for seed in 0..60 {
            for act in 1..ACTS {
                for from in Biome::ALL {
                    let two = exits(seed, act, from);
                    let three = exits_with(seed, act, from, RUNE_EXIT);
                    assert_eq!(three.len(), 3);
                    assert_eq!(three[..2], two);
                    assert!(three[2] != two[0] && three[2] != two[1]);
                    assert!(three[2] != Biome::Meadow && three[2] != from);
                    assert_eq!(
                        exits_with(seed, act, from, RUNE_ROOM | RUNE_SHORTCUT).len(),
                        2
                    );
                }
            }
        }
        let offered: Vec<Biome> = (0..40)
            .map(|seed| exits_with(seed, 1, Biome::Meadow, RUNE_EXIT)[2])
            .collect();
        assert!(Biome::ALL[1..].iter().all(|b| offered.contains(b)));
    }

    #[test]
    fn a_run_that_began_in_a_biome_is_never_offered_it_again_by_any_exit() {
        for seed in 0..60 {
            for act in 1..ACTS {
                for from in Biome::ALL {
                    for first in Biome::ALL {
                        let offered = exits_after(seed, act, from, first, RUNE_EXIT);
                        assert_eq!(offered.len(), 3);
                        assert!(offered
                            .iter()
                            .all(|&b| b != Biome::Meadow && b != from && b != first));
                    }
                    assert_eq!(
                        exits_after(seed, act, from, Biome::Meadow, RUNE_EXIT),
                        exits_with(seed, act, from, RUNE_EXIT)
                    );
                }
            }
        }
    }
}
