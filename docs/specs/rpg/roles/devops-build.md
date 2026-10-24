# CI, coverage, e2e, WASM size and data validation: implementation spec (role `devops-build`)

Status: **PROPOSAL**, role spec written for Decision #313 (RPG open-world pivot). Source of truth:
the validated French gameplay spec (`docs/specs/rpg/plan.fr.md`, same text as the approved plan),
cited below as "§x.y". Nothing here changes the gameplay spec. Every change to `.github/workflows/`
listed below is a shared decision (CONTRIBUTING "A collaboration project": the CI is shared), so each
Task is opened as an issue the other owner can see before it lands.

Tags, as in `rules.md`: **FINAL** (decided by #313's four choices, by an existing spec or decision
cited next to it, or a measured fact), **TUNE** (starting value, adjusted after measuring CI runs),
**PROPOSAL** (proposed here, an owner or the named role confirms). Every number carries one.

---

## 0. Scope

**In scope (this role owns the change):**

- `.github/workflows/ci.yml`, `nightly.yml`, `pages.yml` and any new workflow (`nightly-rust.yml`).
- `scripts/verify.sh`, `rust-toolchain.toml`, per-crate lint configuration (`clippy.toml`,
  `[lints]` tables), `deny.toml`, `.gitattributes` for data files.
- CI scripts under `client/scripts/` (size checks), with their unit tests.
- The **CI shape** of every test level the RPG adds: which job runs it, on which event, with which
  time budget (PR `rust` job, main-only jobs, nightly).
- The 100 % line and region coverage gate as it grows to new crates (CONTRIBUTING §11).
- The e2e infrastructure: shards, tags, nightly filters, the shared Playwright helpers for RPG
  specs (`client/e2e/rpg.ts`), multi-page runs.
- The WASM size budget and the dist size budget (tech.md §4, §9), measured and enforced in CI.
- The **generic** data validation pipeline: every file under `data/` is loaded, parses, and the
  integrity checks of every content role run in the required `rust` check, with readable errors.
- Nightly jobs that are too slow for a PR: deep invariant tiers, cross-target determinism, the RPG
  bot ladder (runner workflow, reporting, issue opening).

**Out of scope (named in "Dependencies"):**

- The rules, the hash function, the scenario parser, golden logs (`combat-engineer`).
- The data format choice, the loader, `include_str!` bundling, crate creation (`tech-lead`).
- The content of each integrity rule (each content role: `class-designer`, `progression-designer`,
  `encounter-boss-designer`, `economy-designer`, `world-designer`, `narrative-quest-designer`,
  `ux-designer`, `lead-game-designer`).
- The ladder itself: the player bot, the RPG ladder example, the gate thresholds (`ai-engineer`,
  `encounter-boss-designer`, `qa-balance`).
- The e2e specs of each feature and the browser test hooks in `main.ts` (`client-engineer`).
- The P2P protocol, commit-reveal and version handshake (`network-engineer`).

**Role slugs** used for dependencies: the canonical list of `lead-game-designer.md` §2.2.
Aliases met in peer files: `combat-engineer` = `gameplay-programmer`, `engine-programmer`;
`world-designer` = `level-designer`, `world-programmer`; `class-designer` = `combat-designer`;
`progression-designer` = `systems-designer`; `client-engineer` = `client-programmer`;
`ai-engineer` = `ai-programmer`; `network-engineer` = `network-programmer`; `qa-balance` =
`qa-engineer`.

---

## 1. Inputs read

- The gameplay spec, all sections (§0 to §26, "Fichiers critiques", "Vérification").
- `SPEC.md` (§3 stack, §4 phases), `CONTRIBUTING.md` (§0 flow, §1 rules 7, 8, 12, 16, 17, §6.4
  merge gate, §11 testing, §13 local setup and what CI runs), `AGENTS.md`.
- `docs/specs/tech.md` §3 (determinism, `no_std`-friendly core), §4 (WASM build, 500 KB gzip
  budget, pinned wasm-bindgen), §5.5 (performance budget), §9 (Pages, 5 MB initial load budget,
  offline service worker), §10 (CI, property tests, perft, golden games, cross-target determinism,
  nightly self-play).
- `docs/specs/ci-repair.md` (nightly flow, issue opening, flaky label).
- `docs/specs/game-design.md` §7 (bot ladder "run nightly in CI", node budgets, never wall clock).
- `docs/specs/boss-balance.md` (ladder commands, fixtures, run times: Ballast Mind about 24 s per
  move at pro level).
- `docs/specs/mcp.md` (MCP server uses the Node build of `abalone-wasm`, not in CI).
- `.github/workflows/ci.yml`, `nightly.yml`, `pages.yml`; `scripts/verify.sh`;
  `client/playwright.config.ts`, `client/vite.config.ts`, `client/package.json`,
  `client/e2e/*.spec.ts` (hook transport `?net=hook`, `page.clock`, reduced motion).
- `crates/abalone-core/src/{board,game,moves,search}.rs`, `encounter/{ladder,fixture,telemetry}.rs`,
  `examples/ladder.rs`, `tests/boss_fixtures.rs`; `crates/abalone-wasm/src/lib.rs`.
- Peer role files under `docs/specs/rpg/roles/` (crate layout of `gameplay-programmer.md` §3, hash
  and data format §4.6 to §4.8; integrity lists of `encounter-boss-designer.md` §18 to §19,
  `systems-designer.md` §16, `combat-designer.md` §14; data size note of `economy-designer.md`).

### 1.1 Facts from the repo that shape this spec

| # | Fact | Consequence |
|---|---|---|
| F1 | `rust` is the only required check; it runs fmt, clippy, `cargo test` on ready PRs (CONTRIBUTING §6.4). | Anything that must block a merge runs **inside** the `rust` job, unless owners add a required check (branch protection, a Decision). |
| F2 | Coverage (`cargo llvm-cov`, 100 % lines and regions) and e2e run on `main` after merge only (decision #239). | A PR can merge below 100 %; `scripts/verify.sh` is the local gate. Unchanged here. |
| F3 | Docs-only paths are ignored: `paths-ignore: ['**.md', 'docs/**']`. | Executable rule examples cannot live in `docs/`: a docs-only edit would skip CI (section D5). |
| F4 | The `changes` job runs e2e only for `client/`, `crates/abalone-(core|wasm)/`, `Cargo.*`, `ci.yml`. The `wasm` cache key hashes only `crates/abalone-wasm/**` and `crates/abalone-core/**`. | New crates `abalone-rpg`, `abalone-world` and the `data/` folder would be **invisible**: e2e skipped and a stale cached WASM served (section D1). |
| F5 | CI installs `dtolnay/rust-toolchain@stable`, no `rust-toolchain.toml` (tech.md §10 asks for one). | Each stable release can change clippy lints and std hashing; golden hashes and fixtures are not reproducible across months (section D2). |
| F6 | `game.rs` hashes positions with `std::collections::hash_map::DefaultHasher`; slices hash their length as `usize`. | The value differs between wasm32 (4-byte `usize`) and native (8-byte) as soon as cracks or conversions exist, and Rust documents no stability across releases. Harmless today (the hash never leaves one process), fatal for an RPG state hash shared by peers or stored in fixtures (section D2, D3). |
| F7 | `board.rs` stores cells in a `HashMap`; scans in `moves.rs`, `search.rs`, `game.rs` loop `q` outer, `r` inner, while the WASM board encoding is `r` outer, `q` inner and §24.1 asks "r croissant, puis q croissant". | Two scan orders exist today; the RPG must pick one before any golden hash is recorded (feedback G2). |
| F8 | The WASM file is 106 473 bytes raw, 41 586 bytes gzip (FINAL, measured on a local build of 2026-10-24); budget 500 KB gzip for core plus AI (FINAL, tech.md §4), "reported in CI" but no CI step does it. | The budget is safe today; `serde`, data files and two new crates are the risk (section D8). |
| F9 | e2e: 95 tests in 32 files (FINAL, counted 2026-10-25), 4 shards of one worker each (FINAL, #257, #258), 960x540 software WebGL, 60 s per test on CI (FINAL, `playwright.config.ts`). | RPG specs (world scene, transition, combat, reload, group) must stay cheap per frame and per test (section D10). |
| F10 | The ladder is a manual `cargo run --release --example ladder`; no workflow runs it. game-design.md §7 says "Run nightly in CI". | The RPG ladder (§18, §25 R2, R9) needs a real nightly workflow (section D11). |
| F11 | Client unit tests (`bun run test`, vitest, 100 % thresholds) and `tsc` are **not** in CI (CONTRIBUTING §11). The MCP package is not in CI either. | Any integrity check written in TypeScript is not gated. Data integrity must live in Rust (section D6). |
| F12 | `abalone-core` has no dependency; the workspace has one external crate (`wasm-bindgen = 0.2.129`, pinned). | The first `serde` / `ron` / `serde_json` dependency (§24.3) is a supply-chain and size event (sections D8, D12). |
| F13 | e2e already has the patterns the RPG needs: page hooks on `window.__*` present in the production build (the nightly live run uses them), `?net=hook` for multi-page P2P without relays, `page.clock`, `emulateMedia({ reducedMotion })`. | Reuse them; no new test framework (section D10). |

---

## 2. Conventions

### 2.1 Check levels (where a test runs)

| Level | Event | Job | Blocks a merge | Budget |
|---|---|---|---|---|
| **L1 PR** | ready PR, push to `main` | `rust` | Yes (required) | under 10 min p50 (FINAL target, tech.md §10), 15 min hard timeout (TUNE) |
| **L2 main** | push to `main`, when paths changed | `coverage`, `wasm`, `e2e (n/4)`, `wasm-determinism` (new) | No: a red `main` is the first bug to fix (CONTRIBUTING §6.4) | coverage 20 min timeout (TUNE), each e2e shard under 12 min (TUNE) |
| **L3 nightly** | schedule, or manual dispatch | `nightly.yml` (live e2e), `nightly-rust.yml` (new: deep tests, determinism, ladder) | No: opens a `bug` issue (ci-repair.md) | 45 min per job (TUNE), ladder 60 min (TUNE) |

Rule (PROPOSAL): **a test runs at the lowest level its time allows.** A Rust test slower than
20 s in the debug, instrumented build (TUNE) moves to L3 as an `#[ignore]` test, and keeps a fast
twin at L1 that covers the same code (an ignored test does not count for coverage, see D7).

### 2.2 Files this role creates or edits

| Path | Content | First phase |
|---|---|---|
| `rust-toolchain.toml` | Pinned toolchain, components, wasm32 target | R1 |
| `.github/workflows/ci.yml` | Path filters, cache keys, wasm32 build and size step, `wasm-determinism` job, e2e tags | R1 |
| `.github/workflows/nightly-rust.yml` | Deep tests, cross-target determinism, RPG ladder | R1 (deep, determinism), R2 (ladder) |
| `.github/workflows/nightly.yml` | Grep filter for `@dev-only` and `@multi` | R1 |
| `.github/workflows/pages.yml` | Dist size report | R4 |
| `crates/abalone-rpg/Cargo.toml`, `crates/abalone-world/Cargo.toml` (`[lints]`), `crates/*/clippy.toml` | Determinism lints | R1, R4 |
| `deny.toml` | License and ban list | R1 |
| `.gitattributes` | `data/** text eol=lf` | R1 |
| `client/scripts/wasm-size.mjs`, `wasm-size.test.ts` | WASM gzip size check | R1 |
| `client/scripts/dist-size.mjs`, `dist-size.test.ts` | Dist gzip size check | R4 |
| `client/e2e/rpg.ts` | Shared Playwright helpers for RPG specs | R1 |
| `crates/<loader>/tests/data_files.rs` | Generic data checks (orphans, parse, collected errors) | R1 |
| `CONTRIBUTING.md` §13 | Commands for the new checks | R1 |

### 2.3 Test format

Given/When/Then, as the peer role files. CI behaviour that cannot be unit tested (a workflow
condition) is verified by hand on the PR branch with a temporary commit, as ci-repair.md §6 already
does, and the PR body records the run links.

---

## D1. Pipeline shape: new crates and `data/` are seen by CI (§24.2, §24.3, §24.4)

**Gameplay points.** §24.2 adds crates `abalone-rpg` and `abalone-world`; §24.3 adds a root
`data/` folder bundled with `include_str!`; §24.4 bridges both through `abalone-wasm`. §25 R1 exit:
"e2e vert".

**Implementation.**

1. `changes` job (`ci.yml`): replace the two regexes by
   - Rust: `^(crates/|data/|Cargo\.|rust-toolchain\.toml|clippy\.toml|deny\.toml|\.github/workflows/ci\.yml)`;
   - e2e: `^(client/|crates/|data/|Cargo\.|rust-toolchain\.toml|\.github/workflows/ci\.yml)`.

   `crates/` as a whole (PROPOSAL) instead of a list of crate names: a new crate can never be
   forgotten. Cost: a change to `abalone-cli` alone also reruns e2e, rare and acceptable.
2. `wasm` cache key: `hashFiles('Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml', 'crates/**', 'data/**')`.
   A data edit changes the bundled bytes, so it must rebuild the WASM.
3. The same cache step (same key) is added to the `rust` job's WASM build (D9): on `main`, the
   `wasm` job then hits the cache the `rust` job saved, so the package is built once per commit.
4. `paths-ignore` stays `['**.md', 'docs/**']` (FINAL, decision on docs-only PRs). Rule: **no data
   or test input is ever a `.md` file or lives under `docs/`** (PROPOSAL; see D5 and feedback G10).
5. `.gitattributes`: `data/** text eol=lf` and `crates/**/tests/**/*.scn text eol=lf`. The
   `include_str!` bytes, hence `DATA_HASH` (D6) and golden logs, are the same on every checkout.

**Dependencies.** `tech-lead` (crate creation, `data/` location; if data moves under a crate,
the regexes still match through `crates/`).

**Tests.**
- Given a push to `main` touching only `data/abilities/warrior.ron`, When `changes` runs, Then
  `rust=true` and `e2e=true` (manual check on the PR branch with a dispatch, link in the PR).
- Given a push touching only `crates/abalone-rpg/src/lib.rs`, When the `wasm` job runs, Then the
  cache misses (the key changed) and `wasm-pack build` runs.
- Given a push touching only `docs/specs/rpg/combat.md`, Then CI does not start (unchanged).

**Risks.** A manual dispatch still runs everything (unchanged, wanted). The broader e2e trigger
adds e2e runs for CLI-only pushes: measured cost at most one e2e run per such push (TUNE: if CLI
pushes become frequent, exclude `crates/abalone-cli/` explicitly).

---

## D2. Toolchain pin and determinism lints (§24.1, §5.3, §1 pillar 2)

**Gameplay points.** §24.1: integers only, fixed order, "on ne parcourt jamais une HashMap", hash
covers everything. §5.3 and game-design.md §7: AI budgets in nodes, never time. §1 pillar 2: no
dice in combat.

**Implementation.**

1. `rust-toolchain.toml` (PROPOSAL):
   ```toml
   [toolchain]
   channel = "1.NN.0"   # exact stable version, chosen in the PR from the current stable
   components = ["rustfmt", "clippy", "llvm-tools-preview"]
   targets = ["wasm32-unknown-unknown"]
   profile = "minimal"
   ```
   CI: the `dtolnay/rust-toolchain@stable` steps become a `rustup toolchain install` step (rustup
   1.28 and later install the toolchain the file names; to verify on the PR, fallback
   `dtolnay/rust-toolchain@master` with `toolchain:` read from the file). A toolchain bump is its
   own Task: it reruns golden hashes, perft and fixtures, and nothing else changes in that PR.
2. Lints for the rule crates (`abalone-rpg`, `abalone-world`; `abalone-core` once
   `combat-engineer` removes its `HashMap`, §24.2):
   - `crates/<crate>/clippy.toml`:
     ```toml
     disallowed-types = [
       { path = "std::collections::HashMap", reason = "random iteration order: Vec sorted by id or BTreeMap (§24.1)" },
       { path = "std::collections::HashSet", reason = "random iteration order (§24.1)" },
       { path = "std::collections::hash_map::DefaultHasher", reason = "not stable across releases or targets: use the canonical hash (§24.1)" },
       { path = "std::hash::RandomState", reason = "random seed per process (§24.1)" },
     ]
     disallowed-methods = [
       { path = "std::time::Instant::now", reason = "rules never read a clock: budgets are in nodes (§5.3)" },
       { path = "std::time::SystemTime::now", reason = "time is an input, never read inside the rules (§4.8, §13.2)" },
     ]
     ```
   - `Cargo.toml` of the crate: `[lints.clippy] float_arithmetic = "deny"` (integers only,
     §24.1). Floats stay allowed in reporting code outside the rule crates (`telemetry.rs` and the
     ladder summary use `f64` for win rates: presentation, not rules).
   - `clippy --all-targets -D warnings` already runs in the `rust` job: the lints are enforced on
     every PR with no new step.
3. Time as input (PROPOSAL, handed to `tech-lead`): every rule that depends on UTC (§4.8 day and
   night, §13.2 travelling merchant, §16 dailies, §17 weekly affixes, §18 world boss schedule,
   §20 BR calendar) takes a `utc_minutes: u64` or `day: u32` argument. The `SystemTime::now` ban
   makes this the only way to write them, and keeps them testable and replayable.

**Dependencies.** `tech-lead` (crate `[lints]` tables, the canonical hash), `combat-engineer`
(removes `HashMap` from `board.rs`, picks the scan order, replaces `DefaultHasher` for any hash that
leaves one process), `world-designer`, `encounter-boss-designer`, `economy-designer` (UTC inputs).

**Tests.**
- Given a branch that adds `let m: HashMap<u8, u8> = HashMap::new();` in `abalone-rpg`, When
  `cargo clippy --all-targets --locked -- -D warnings` runs, Then it fails with `disallowed_types`
  and the reason text (checked by hand on the PR with a temporary commit, then dropped).
- Given `let x = 1.5 * y as f64;` in `abalone-rpg`, Then clippy fails with `float_arithmetic`.
- Given `std::time::Instant::now()` in `abalone-world`, Then clippy fails with `disallowed_methods`.
- Given `abalone-core/src/encounter/telemetry.rs` (uses `f64`), Then clippy stays green (the lint is
  per crate).

**Risks.**
- Clippy reads `clippy.toml` from the crate's manifest directory: to confirm in the PR. Fallback: a
  root `clippy.toml` with the same list, which also hits `abalone-core`'s `HashMap` until removed
  (then that Task waits for the engine change).
- Homebrew Rust (CONTRIBUTING §13) ignores `rust-toolchain.toml`: a contributor on Homebrew stable
  may see different clippy lints than CI. Open question Q5.
- A toolchain bump can change `f64` formatting in ladder output: reporting only, no gate depends
  on it.

---

## D3. Determinism checks: same log, same hash, on every target (§24.1, §4.7, §6.12, §25 R1)

**Gameplay points.** §24.1 "le hash d'état couvre tout"; §4.7 "chaque pair valide chaque action
dans le log signé"; §6.12 retry with the same seed and resume from IndexedDB; §25 R1 exit
"déterminisme vérifié (même log = même hash)". tech.md §10: golden games, cross-target determinism.

**Implementation.**

1. **Golden logs (L1).** `combat-engineer` owns `crates/abalone-rpg/tests/golden/*.log` (a setup
   plus an action list, `gameplay-programmer.md` §4.7 notation) and `golden/hashes.txt` (one line
   `<file> <RULES_VERSION> <hex hash>`). A native test replays each log and compares the hash. This
   role only requires (PROPOSAL): at least one golden log per combat format of §6.8 in play at the
   current phase (R1: skirmish; R2: elite, dungeon room; R8: boss, multi-tile; R10: group, arena,
   battle royale round), and one per class from R2 (TUNE count).
2. **Cross-target (L2 and L3).** New job `wasm-determinism` in `ci.yml` (runs when `rust=true` on
   `main`) and in `nightly-rust.yml`:
   - `crates/abalone-wasm/tests/determinism.rs`, a `wasm-bindgen-test` configured for Node
     (`wasm_bindgen_test_configure!` not set to browser), that replays the same golden logs through
     the public bridge functions (`include_str!` of the log files and of `hashes.txt`) and asserts
     the same hashes;
   - command: `wasm-pack test --node crates/abalone-wasm` (tech.md §10 already lists it);
   - dev-dependency `wasm-bindgen-test` pinned to the exact version that matches
     `wasm-bindgen = 0.2.129` (FINAL pin rule, tech.md §4).
   One test file, two targets: a native run (`cargo test -p abalone-wasm`, L1) and a wasm32 run
   (L2). Both read the same `hashes.txt`, so drift on one target fails its job.
3. **Replay property (L1 and L3).** `combat-engineer`'s seeded property (`gameplay-programmer.md`
   §4.9): 500 random legal action sequences at L1 (TUNE), 20 000 at L3 (TUNE), each replayed from
   its log to the same hash. This role wires the L3 tier (`#[ignore]`, D4 rule).
4. **World generation (L1).** `world-designer` owns a golden summary: the hash of the biome of every
   tile of the radius-60 continent (§4.1, 10 981 tiles, FINAL arithmetic `3·60·61 + 1`) and the
   hashes of 10 generated tile boards per v1 biome (TUNE count) (§4.5 "la même tuile donne donc le
   même plateau, à tout le monde"). This role asks that the same summary also runs in the wasm32
   test of point 2 from R4.
5. **Resume (L2).** §6.12 resume after reload is an e2e spec (`client-engineer`): play 3 actions,
   reload, the `data-state-hash` attribute equals the one before the reload (PROPOSAL contract, D10).

**Dependencies.** `combat-engineer` (canonical encoding, hash, `RULES_VERSION`, golden logs, bridge
replay function), `world-designer` (world golden), `client-engineer` (resume spec, state hash on the
page), `network-engineer` (the same hash in signed logs).

**Tests.**
- Given `golden/skirmish-r1.log` and its line in `hashes.txt`, When `cargo test -p abalone-rpg`
  runs, Then the replayed hash equals the line.
- Given the same log, When `wasm-pack test --node crates/abalone-wasm` runs, Then the hash is the
  same.
- Given a temporary change that hashes a `Vec` length as `usize` with `DefaultHasher`, When both
  jobs run, Then native and wasm32 hashes differ and the wasm32 job fails (manual check showing the
  test catches F6, then dropped).

**Risks.**
- A rules change that legitimately changes hashes must bump `RULES_VERSION` and rewrite
  `hashes.txt` in the same PR. PROPOSAL: the PR template gets one line "golden hashes changed: why".
- `wasm-pack test --node` needs Node on the runner (present on `ubuntu-latest`) and compiles the
  crate a second time for wasm32: about 2 min with cache (TUNE estimate, measure in the PR).

---

## D4. Classic invariant: Weighted with every Weight 1 is Abalone (§1 pillar 1, §6.4, §25 R1)

**Gameplay points.** §1 pillar 1 and §6.4: "Si tous les Poids valent 1 … on retrouve exactement
l'Abalone classique … Un test de propriété le vérifie (même perft, mêmes parties aléatoires)."
§25 R1 exit: "test « Poids 1 = classique » vert".

**Implementation.** The tests are `combat-engineer`'s (push predicate in `abalone-core`). This
role fixes the tiers so CI stays fast:

| Tier | Where | Content | Numbers |
|---|---|---|---|
| L1 | `crates/abalone-core/tests/weighted_classic.rs`, normal test | perft Classic vs Weighted (all Weights 1) from the standard start, the Belgian daisy and 3 hand-built edge positions (sumito at the edge, blocked push, side step) | depth 3 from the start if it runs under 20 s instrumented (TUNE), else depth 2 at L1 and depth 3 at L3; 200 seeded random games of 200 plies (TUNE), legal move lists equal at every ply |
| L3 | same file, `#[ignore]` | the same, deeper | depth 4 from the start (TUNE); 10 000 random games (TUNE) |

`nightly-rust.yml`, job `deep-tests`: `cargo test --release --workspace --locked -- --ignored`
(45 min timeout, TUNE).

**Dependencies.** `combat-engineer` (the test, the `PushRule::{Classic, Weighted}` switch),
`lead-game-designer` (agreed: depth 1 to 3, `lead-game-designer.md` §4.1).

**Tests.**
- Given the nightly workflow with a test marked `#[ignore]` that fails on purpose, When dispatched
  on the PR branch, Then the job fails and opens the issue "Nightly Rust deep tests failed" with the
  failing test names (manual check, the test issue is closed after, ci-repair.md §6 practice).
- Given `cargo llvm-cov --workspace`, Then it does not run `#[ignore]` tests and still reaches
  100 % (the L1 twin covers the code).

**Risks.** Perft depth 3 from the start is tens of thousands of leaves (order of magnitude, TUNE to
measure) and the instrumented debug build is several times slower than release: measure in the R1
PR before fixing the L1 depth.

---

## D5. Every rule is a scenario that runs in the required check (§1 pillar 4, §0 "Vérification")

**Gameplay points.** §1 pillar 4: "Une règle se décrit par une position de départ et une liste
d'actions." §0 "Vérification": the Given/When/Then examples of `rules.md` (weighted push 6 cases,
Choc, Ice, seams, hero ejection and Edge danger, revival, flight, Isolation and Formation,
durations, cooldowns, bonus Step).

**Implementation.**
- Scenario files live in `crates/abalone-rpg/tests/scenarios/*.scn` (format and runner owned by
  `combat-engineer`, `gameplay-programmer.md` §4.7). They run in `cargo test`, so in `rust` (L1).
- The examples in `rules.md` §10.5 and `docs/specs/rpg/combat.md` **link** to their `.scn` file;
  they are never parsed from the Markdown (F3: a docs-only PR skips CI, so a test reading docs
  would break on the next code push, not on the docs PR that caused it).
- PROPOSAL: one test lists the scenario folder and fails on a `.scn` file the runner did not
  execute (same orphan rule as data, D6), so a dropped file never silently stops testing a rule.

**Dependencies.** `combat-engineer` (runner, files), `lead-game-designer` (the list of rule
examples that must exist, `rules.md` delta).

**Tests.**
- Given a new file `tests/scenarios/ice-one-ejection.scn` with a wrong `then:` line, When
  `cargo test` runs, Then it fails naming the file and the line.
- Given a `.scn` file with an unknown extension typo (`.scn.txt`), Then the orphan test fails.

**Risks.** None specific to CI: the runner is fast (no search).

---

## D6. Data validation pipeline (§1 pillar 6, §24.3, and every data-driven section)

**Gameplay points.** §1 pillar 6: classes, abilities, runes, items, biomes, monsters, quests and
recipes are data. §24.3: `data/` in RON or JSON, `include_str!`, integrity tests: every reference
exists, point budgets are right (§9.1: 99; §10: 20, costs 1/1/2), no cost above the resource max,
every ability has a counter, every Ejector has a tell or is an ultimate, every mass control hits 3
targets at most (§6.10).

**Implementation.** Three layers, all in Rust, all in `cargo test` (so in the required `rust`
check, F1, F11):

1. **Bundling list (owned by `tech-lead`).** The loader exposes
   `pub const FILES: &[(&str, &str)]`: the path relative to the repo root and the bytes from
   `include_str!`. One list, one place.
2. **Generic checks (this role), `crates/<loader>/tests/data_files.rs`:**
   - *No orphan:* the test walks `data/` with `std::fs` (tests may do I/O; the library may not) and
     fails on a file not in `FILES`, or a `FILES` path that does not exist. Message:
     `data/monsters/affixes.ron is not bundled: add it to FILES`.
   - *Every file parses:* each entry deserialises into its type; the error carries
     `path:line:column` (both `serde_json` and `ron` report line and column).
   - *All errors at once:* `fn check_all(db: &Db) -> Vec<IntegrityError>` runs every registered
     check and the test prints the whole list before failing, so a designer fixes a batch in one
     run. `IntegrityError { file, id, rule, message }`.
   - *Registration:* each content role adds `fn checks(db: &Db, out: &mut Vec<IntegrityError>)` in
     `crates/<loader>/src/integrity/<domain>.rs`; `check_all` calls the list. The harness has its
     own unit tests with a tiny in-memory `Db` that breaks each generic rule once.
3. **Content rules (owned by each role, run by the harness):**

   | Rule (§24.3 and sections) | Owner |
   |---|---|
   | Every reference exists (ability, status, terrain, item, monster, quest, recipe ids) | each role for its ids, `tech-lead` for the id resolver |
   | Point budgets: passive 99 = 5 + 30 + 10 + 54, shard cap `min(6, 1 + ⌊L/16⌋)` (§9.1); active 20, rank costs 1/1/2 (§10) | `progression-designer` |
   | No cost above the resource max; every ability has a counter; Ejector has a tell or is an ultimate; mass control hits 3 at most; bonus Step sources flagged (§6.3, §6.10) | `class-designer` |
   | Threat budgets compose (§5.3, §6.8); boss `release: true` needs a winning fixture (§18) | `encounter-boss-designer` |
   | Biome terrain shares, tile content shares sum to 100 % (§4.3, §5.2) | `world-designer` |
   | Items, affixes (+1 Weight max, §7.1), recipes without loops, prices (§12 to §15) | `economy-designer` |
   | Quest graph reachable, no talent point reward (§16) | `narrative-quest-designer` |
   | Every terrain and status has a glyph id and a label (§5.1, §1 pillar 2) | `ux-designer` (moved from vitest to Rust, Q2) |
   | Every rules constant carries its FINAL/TUNE/PROPOSAL tag (`data/rules/constants.*`) | `lead-game-designer` |

4. **Data version (PROPOSAL, handed to `tech-lead` and `network-engineer`).**
   `pub const DATA_HASH: u64` = FNV-1a 64 over every `FILES` entry, path then bytes, in list order,
   computed by a `const fn` (no `build.rs`). Exposed by the bridge (`data_version()`), sent in
   `Hello` with the engine version (tech.md §9: peers on different versions refuse to play). A test
   calls the same `const fn` at run time, so it is covered. `.gitattributes` keeps LF (D1), so the
   hash is the same on every checkout.
5. **Designer command** (CONTRIBUTING §13, R1): `cargo test -p <loader> --test data_files`. No
   Rust knowledge needed to read the output; the file and id come first.

**Dependencies.** `tech-lead` (format, loader, `FILES`, `Db`), every content role listed above,
`network-engineer` (`DATA_HASH` in `Hello`), `ux-designer` (glyph rule in Rust).

**Tests (harness).**
- Given a file `data/classes/extra.ron` not in `FILES`, When `cargo test` runs, Then
  `data_files_are_bundled` fails naming that path.
- Given `FILES` naming `data/biomes/lumen.ron` that does not exist, Then the same test fails
  naming it (and `include_str!` already fails the build: the test covers the reverse direction).
- Given a data file with a missing comma on line 12, Then `data_files_parse` fails with
  `data/…:12:<col>`.
- Given a `Db` with two broken abilities and one broken item, When `check_all` runs, Then it returns
  3 errors, sorted by file then id (fixed order, §24.1).
- Given two `FILES` lists that differ by one byte, Then their `DATA_HASH` differ; given the same
  list, Then the hash is the same in a native and a wasm32 run (D3 job).

**Risks.**
- Format undecided (RON in most role files, JSON in `gameplay-programmer.md` §4.8): see G5 and Q3.
  The harness is format-agnostic; only the parse error format differs.
- Size: every data file is compiled into the WASM (D8).
- A designer edit to `data/` is a code change for CI (it is not under `docs/`), so it needs a `Ready`
  Task and goes through the full PR flow: wanted (rule 1), stated in CONTRIBUTING §13.

---

## D7. Coverage: 100 % lines and regions with the new crates (CONTRIBUTING §11, §24)

**Gameplay points.** §24 principles: "On code en TDD avec 100 % de couverture." §24.2 new crates.

**Implementation.**
- `cargo llvm-cov --workspace --locked --fail-under-lines 100 --fail-under-regions 100` (FINAL,
  CONTRIBUTING §11) covers new workspace members automatically. No new flag.
- `coverage` job timeout 10 min to 20 min (TUNE), raised in the PR that first measures it above
  8 min (TUNE trigger).
- Rules for the RPG crates (PROPOSAL):
  - an `#[ignore]` test never is the only test of a code path (llvm-cov skips ignored tests);
  - data-loading code is covered by loading the real files plus one broken input per error branch;
  - `#[automatically_derived]` impls (serde derives) are not instrumented by recent rustc (to
    confirm on the pinned toolchain in the first PR that adds `serde`); if they are, the exclusion
    is a `--ignore-filename-regex` on one file of plain data types, with a one-line comment, as
    CONTRIBUTING §11 allows for generated code.
- `scripts/verify.sh` unchanged; it remains the local gate a PR author runs.

**Dependencies.** `tech-lead` (serde adoption), every crate owner (tests).

**Tests.**
- Given the first PR that adds `serde` derives to `abalone-rpg`, When `cargo llvm-cov` runs, Then
  regions stay at 100 % with no exclusion, or the PR documents the exclusion (acceptance in the PR).

**Risks.** Coverage on `main` only (F2): a PR below 100 % breaks `main`'s coverage job after the
merge. Unchanged policy (decision #239); the local `verify.sh` is the guard.

---

## D8. WASM size budget (§24.3 `include_str!`, §24.4, tech.md §4)

**Gameplay points.** §24.3 bundles all content in the binary; §24.4 adds world and combat bridge
functions in versioned JSON; §5.3 and §24.2 move the AI to a combat state. The gameplay spec gives
no size number; tech.md §4 does: "core + AI under 500 KB gzipped, `wasm-opt -O3`, reported in CI".

**Implementation.**
- Budget: `abalone_wasm_bg.wasm` gzip size at most 500 KB (FINAL, tech.md §4, 512 000 bytes);
  warning at 400 KB (TUNE).
- `client/scripts/wasm-size.mjs` (Node, no dependency: `node:zlib` gzip level 9, `node:fs`):
  - pure function `sizeVerdict(gzipBytes, budgetBytes, warnBytes)` returns
    `{ status: 'ok' | 'warn' | 'over', line }`, with `line` such as
    `wasm gzip 41.6 KB / 500 KB (8 %)`;
  - the CLI part reads the file, prints the line, appends it to `$GITHUB_STEP_SUMMARY` when set,
    exits 1 when `over`;
  - budget and warning from `WASM_BUDGET_BYTES`, `WASM_WARN_BYTES` with the defaults above, so a
    manual check can force a failure.
- It runs in the `rust` job right after the WASM build of D9 (L1: a PR that blows the budget
  cannot merge). The size is also printed in the `wasm` job on `main` for the history.
- If the budget is ever in sight (warning reached), the order of remedies (PROPOSAL, KISS first):
  1. compact data (shorter keys, no pretty print in bundled files) and drop `ron` for
     `serde_json` if both exist;
  2. `[profile.release] opt-level = "s"` for `abalone-wasm` (measured against search speed: the AI
     node budget is fixed, so only wall time changes);
  3. split a second module (world and economy data loaded after the first combat), a `tech-lead`
     decision with a Decision issue.

**Dependencies.** `tech-lead` (format, dependencies, any split), `client-engineer` (worker loading if
split), `economy-designer` (largest data set, noted in its own risk list).

**Tests (vitest, `client/scripts/wasm-size.test.ts`, 100 % like `nightly-report.test.ts`).**
- Given 41 586 bytes, a budget of 512 000 and a warning at 409 600, When `sizeVerdict` runs, Then
  `ok` and the line shows `41.6 KB / 500 KB (8 %)`.
- Given 450 000 bytes, Then `warn`. Given 600 000 bytes, Then `over`.
- Given exactly the budget, Then `warn`, not `over` (at most 500 KB is allowed).
- Manual: `WASM_BUDGET_BYTES=1000` on the PR branch makes the `rust` job fail; the run link goes in
  the PR, the temporary commit is dropped.

**Risks.** Gzip level 9 in Node vs the Pages server's compression: the CI number is an estimate of
the transfer size, consistent from run to run, which is what a regression gate needs.

---

## D9. The WASM build runs on every PR (§24.4, §25 R1 "jouable dans le navigateur")

**Gameplay points.** §24.4 bridge; §25 R1 playable in the browser.

**Implementation.** Today a PR that breaks the wasm32 build (a dependency without wasm32 support, a
`std::time` call, a bridge type error) passes `rust` and breaks `main`'s `wasm` job after the merge.
New steps in the `rust` job, after `cargo test` (PROPOSAL):

1. the `actions/cache` step with the D1 key on `crates/abalone-wasm/pkg`;
2. on a cache miss: `taiki-e/install-action` for `wasm-pack`, then
   `wasm-pack build crates/abalone-wasm --target web` (the target comes from `rust-toolchain.toml`);
3. `node client/scripts/wasm-size.mjs` (D8).

`rust` job timeout 10 min to 15 min (TUNE), to lower again if the measured p50 stays under 8 min.

**Dependencies.** None beyond D1, D2, D8.

**Tests.** Manual on the PR: a temporary commit with `std::time::Instant::now()` inside a bridge
function in `abalone-wasm` builds (it compiles, it panics at run time on wasm32); the clippy ban of
D2 is what catches that one in the rule crates. A temporary commit adding a non-wasm dependency
(for example one with a C build script) makes the `rust` job fail at the WASM step.

**Risks.** Extra 1 to 3 min per PR (TUNE estimate), offset by the cache on `main`.

---

## D10. e2e for the RPG: hooks, time, motion, tags, shards (§4.2, §4.5, §6.6, §6.12, §24.5, §25)

**Gameplay points.** §4.2 real-time movement (300 ms per step × biome cost, Élan), §4.5 unfold
animation of about 1.2 s, §6.6 crack and crumble of 400 ms, §6.12 retry under 5 s and resume after
reload, §4.8 / §13.2 / §16 / §18 / §20 UTC-seeded content, §24.5 world scene with instanced tiles,
§25 exit criteria R1 "e2e vert", R4 "marcher, combattre, revenir, recharger la page", R10 "e2e à 2
onglets, en groupe et en arène".

**Implementation.**

1. **Shared helpers `client/e2e/rpg.ts`** (this role; specs are `client-engineer`'s):
   - `startScenario(page, file)`: reads a `.scn` file from `crates/abalone-rpg/tests/scenarios/`
     with Node `fs` in the test and calls `window.__rpgStart(text)` (hook in `main.ts`,
     `client-engineer`). No scenario data ships in the production bundle; the hook takes text.
   - `fixedTime(page, iso)`: `page.clock.install` (the pattern of `newgame.spec.ts`), so world
     movement and UTC content are driven by `fastForward`, never by real waiting.
   - `calm(page)`: `emulateMedia({ reducedMotion: 'reduce' })`; §4.5 already says reduced motion
     shows one frame of the unfold, which makes specs fast and deterministic.
   - `combat(page)`: reads the page contract (PROPOSAL, agreed with `client-engineer` and
     `ux-designer`): `body[data-combat]` = `none | placing | running | won | lost | draw | fled`,
     `body[data-entity]` = active entity id, `body[data-state-hash]` = the engine state hash in hex,
     `body[data-edge-danger]` = number of heroes in danger.
   - Reuses the `?net=hook` relay of `online.spec.ts` for group and arena specs (no public relay,
     F13).
2. **Tags** in test titles (Playwright `--grep`):
   - `@dev-only`: needs the `--mode e2e` dev server (a hook not in the production build). Nightly
     `E2E_GREP_INVERT` becomes `textures are requested|@dev-only` (FINAL rule kept: never empty).
     Default PROPOSAL: RPG hooks ship in production like the existing ones, so `@dev-only` stays
     rare.
   - `@multi`: 3 or more pages (group of up to 4, §4.7). Excluded from the 4 shards and run in their
     own matrix entry from R10 (point 4).
3. **Shards.** 4 shards (FINAL, #257). Scaling rule (PROPOSAL): when the slowest shard of 3
   consecutive `main` runs exceeds 12 min (TUNE), add one shard, up to 8 (TUNE). Concurrency stays
   well under the 20 concurrent jobs of a free public repo (FINAL, measured limit noted by the
   owners).
4. **Multi-page entry (R10).** Matrix entry `e2e-multi`: `bun run e2e --grep @multi`, one worker,
   per-test timeout 120 s (TUNE), because 4 pages of software WebGL share 4 vCPU. The 4 shards run
   `--grep-invert @multi`.
5. **CI cost of the world scene (§24.5).** CI renders at 960x540 with software WebGL (F9). The world
   scene must stay within tech.md §5.5 (under 150 draw calls, FINAL there) and draw only the tiles
   near the ball (fog radius 3, §4.2, plus a margin). Not a CI change; a constraint handed to
   `client-engineer`, checked by a spec that reads `renderer.info.render.calls` through a hook
   (PROPOSAL, soft report until R4 exit).
6. **Timing claims.** §6.12 "moins de 5 s" is measured engine side, from the loss to
   `data-combat=placing` of the retry, with `fixedTime` off, in a dedicated spec (TUNE 5 s locally;
   on CI report only, since software WebGL slows frames, not the engine).

**Dependencies.** `client-engineer` (hooks `__rpgStart`, the data attributes, specs per feature),
`ux-designer` (attribute names for Edge danger and intention), `network-engineer` (hook transport
for groups of 4), `combat-engineer` (scenario text format).

**Tests.**
- `client/e2e/rpg-smoke.spec.ts` (this role, R1, kept minimal): Given the R1 skirmish scenario, When
  `startScenario` and `calm` run, Then `body[data-combat]` becomes `running` and
  `body[data-state-hash]` equals the hash `hashes.txt` lists for the same setup.
- Nightly: Given a spec titled `… @dev-only`, When the nightly live run starts, Then it is not in the
  JSON report (manual check by dispatch on the PR branch).
- Given the shard matrix with `--grep-invert @multi`, Then no `@multi` spec runs in shards 1 to 4.

**Risks.**
- Hooks in production let a player start any local fight from the console. Harmless for solo play
  (saves are local and self-declared, §13.4), and ranked PvP is normalised and validated by peers
  (§19). Open question Q7.
- Each new RPG spec adds about 20 to 40 s on CI (TUNE estimate from the slowest current specs,
  F9). The shard rule absorbs growth.

---

## D11. Nightly RPG bot ladder and the boss release gate (§18, §25 R2, R8, R9; game-design §7)

**Gameplay points.** §18: tuning by "l'échelle de bots qui tourne chaque nuit en CI"; "Un boss ne
sort que s'il a gagné une échelle de bots RPG … restent bloqués tant qu'ils n'ont pas de fixture de
victoire." §24.2: the player bot plays its class rotation, specified from R1. §25 R2 exit: "chaque
classe bat la meute de référence sur l'échelle de bots"; R8: "une fixture de victoire RPG par
boss"; R9: "les 8 classes passent l'échelle de bots".

**Implementation.** Two gates, two speeds (PROPOSAL):

| Gate | What | Level | Owner of content |
|---|---|---|---|
| **Release gate** | A boss with `release: true` has a winning fixture that replays to a win (deterministic, no search, seconds) | L1, integrity test (D6) and fixture replay test | `encounter-boss-designer` |
| **Health report** | The RPG ladder plays every class against its reference pack and every released boss, at fixed seeds and node budgets, and compares with the gates in data | L3, `nightly-rust.yml` job `ladder` | `ai-engineer` (runner), `encounter-boss-designer` and `qa-balance` (gates) |

Job `ladder` (this role):
- `cargo run --release --locked --example rpg_ladder` (the example, its output and exit code are
  `ai-engineer`'s). Contract asked (PROPOSAL): prints a Markdown table, writes `ladder.jsonl`
  (one attempt per line, the telemetry fields of `encounter/telemetry.rs` plus class and pack),
  exits 1 when a row is below its gate in `data/ladder/gates.*`, exits 2 on a crash.
- The table is appended to `$GITHUB_STEP_SUMMARY`; `ladder.jsonl` uploaded as an artifact kept
  30 days (TUNE).
- On exit 1: open the issue "Nightly RPG ladder below its gate" labelled `bug`, with the table, the
  run link and the last green run (same "unless one with the same title is open" step as
  `nightly.yml`). On exit 2: "Nightly RPG ladder crashed", `bug`.
- Time: 60 min timeout (TUNE). Seeds per cell 10 (FINAL, boss-balance.md method). The cells of one
  class run in parallel threads like `examples/ladder.rs` (4 vCPU runner). From R9 (8 classes,
  10 biomes, 8 bosses) the job becomes a matrix by class if one run passes 45 min (TUNE trigger).
- Schedule: 04:17 UTC (TUNE), one hour after the live e2e (03:17 UTC, FINAL in `nightly.yml`) so
  the two never compete for the owners' attention in the same minute; manual dispatch allowed.
- The Ballast Mind raid at pro budget (about 24 s per move natively, boss-balance.md) is excluded
  from the nightly matrix until `ai-engineer` gives a budget that fits the 60 min cap (TUNE).

**Dependencies.** `ai-engineer` (player bot, `rpg_ladder` example, exit codes), `class-designer`
(rotations in data), `encounter-boss-designer` (reference packs, release flag, fixtures, gates),
`qa-balance` (reads the report, files balance tasks).

**Tests.**
- Given a gate file with an impossible gate (100 % wins at 0.5x budget), When the workflow is
  dispatched on the PR branch, Then the job fails and opens the issue with the table (manual, the
  issue is closed after, ci-repair.md §6 practice).
- Given a ladder run that panics, Then exit 2 and the "crashed" issue title.
- Given the release gate test with a boss `release: true` and no fixture, Then `cargo test` fails
  naming the boss (owned by `encounter-boss-designer`, listed here because it is the L1 half of §18).

**Risks.**
- A gate that flips because of one seed opens issues every night: the issue step does not open a
  second one while the first is open (existing rule), and gates are rates over 10 seeds.
- The `bug` label for a balance regression: open question Q6.

---

## D12. Supply chain for the first dependencies (§24.3, tech.md §10)

**Gameplay points.** §24.3 brings `serde` and a format crate; §24.4 versioned JSON.

**Implementation.** `deny.toml` (PROPOSAL) with `[licenses]` allowing MIT, Apache-2.0,
Unicode-3.0, BSD-3-Clause (the usual `serde` tree; TUNE as the tree grows) and `[bans]` refusing
duplicate major versions of the same crate (`multiple-versions = "deny"`, TUNE to `warn` if a
transitive duplicate is unavoidable). `cargo deny check licenses bans` in the `rust` job (L1, no
network needed beyond the crates index already fetched). `cargo deny check advisories` in
`nightly-rust.yml` (L3), because the advisory database changes without a code change and must not
turn a PR red at random.

**Dependencies.** `tech-lead` (the dependency list).

**Tests.** Manual on the PR: adding a GPL-licensed crate fails `licenses`; the run link in the PR.

**Risks.** `cargo-deny` install time: prebuilt binary through `taiki-e/install-action` (seconds).

---

## D13. Dist size budget (§24.5, tech.md §9)

**Gameplay points.** §24.5 adds a world scene, biome decals, glyphs; §5.2 one palette per biome.
tech.md §9: initial load under 5 MB gzip, each deck under 15 MB, site under 250 MB (TUNE there:
"starting values"), "CI reports and fails on regressions" (not built yet).

**Implementation (R4).** `client/scripts/dist-size.mjs` with `dist-size.test.ts`, the same shape as
D8: gzip size of every file in `client/dist/` except `sw.js` and source maps, summed. KISS proxy:
the whole `dist/assets` total stands for the initial load until lazy decks exist; budget 5 MB gzip
(TUNE, tech.md §9). Runs in `pages.yml` after `bun run build`: prints in the job summary, fails
over the budget (a failing Pages build keeps the previous site online, which is the safe failure).

**Dependencies.** `client-engineer` (lazy loading of decks), `art-audio` (asset formats).

**Tests.** `sizeVerdict` reused or mirrored; Given a fake dist of 3 files, Then the sum excludes
`sw.js` and `*.map`.

**Risks.** Once lazy decks exist, the proxy overestimates; then split the report by deck (TUNE).

---

## D14. MCP and client checks outside the required job (§24.6; F11)

**Gameplay points.** §24.6: the MCP server will learn abilities (`legal_moves`, `get_state`), a
separate issue (#163). The MCP server runs on the Node build of `abalone-wasm`.

**Implementation (PROPOSAL, each needs a Decision because it changes what CI runs, CONTRIBUTING
"A collaboration project"):**
- `mcp` job on `main` (L2) when `crates/`, `data/` or `mcp/` changed: `bun install
  --frozen-lockfile`, `bun run test`, `bunx tsc --noEmit` in `mcp/`. Catches a bridge change that
  breaks the MCP server, which the RPG bridge (§24.4) will do often.
- `client` job on ready PRs (L1 but not required) or inside `rust` (required): `bun run test` and
  `bunx tsc --noEmit` in `client/`. Today these run only locally (CONTRIBUTING §6.4 merge gate);
  the RPG moves a lot of client logic (action bar, previews, world input) into tested modules.

**Dependencies.** Owners (Decision), `client-engineer`, `tech-lead` (MCP).

**Tests.** Manual on the PR: a temporary type error in `client/src/` makes the job fail.

**Risks.** More minutes per PR (free on a public repo, FINAL per the owners' note), one more job to
keep green.

---

## Feedback on the gameplay spec

Contradictions and gaps seen from the CI, coverage, size and data angle. The gameplay spec is not
modified; each item is for `lead-game-designer` and the owners on #313.

- **G1 (§18).** The spec says the bot ladder "tourne chaque nuit en CI" (inherited from
  game-design.md §7), but no workflow runs any ladder today (F10): it is a manual example. The RPG
  ladder needs an owner for the runner, a time cap, gates in data and a failure path (D11).
- **G2 (§24.1).** Scan order: §24.1 asks "r croissant, puis q croissant"; `moves.rs`, `search.rs`
  and `game.rs` scan `q` outer, `r` inner, while the WASM board encoding is `r` outer. Golden
  hashes, multi-target resolution order (§6.10) and the Graveyard order depend on it: one order
  must be fixed before the first golden hash.
- **G3 (§24.1).** The spec names the `HashMap` iteration order as the determinism problem, but not
  `std::hash::DefaultHasher` (used by `game.rs`): Rust documents no stability across releases, and
  hashing a slice writes its `usize` length, which differs between wasm32 and native. Any hash
  shared between peers, stored in a fixture or compared across targets must use the canonical
  encoding of `combat-engineer`, never `std::hash::Hash`.
- **G4 (§24.1).** "Pas de nombres à virgule flottante dans les règles" has no enforcement and no
  boundary: reporting code (`telemetry.rs`, the ladder) uses `f64` legitimately. Proposal: deny
  `clippy::float_arithmetic` in the rule crates only (D2).
- **G5 (§24.3).** "RON ou JSON" is undecided while most role files write RON and the bridge (§24.4)
  already needs JSON. Two format crates cost WASM size and supply-chain surface for no gain; this
  must be decided before R1 data lands (Q3).
- **G6 (§24.3, §24.4).** All content is compiled into one WASM (`include_str!`) but the gameplay
  spec gives no size budget; tech.md §4 has one (500 KB gzip for core plus AI). With 80 abilities,
  10 biomes, items, quests and dungeons, the spec should restate the budget and the escape route
  (a second module) (D8).
- **G7 (§25 R1).** "Déterminisme vérifié (même log = même hash)" does not say on which targets.
  Peers run wasm32 while fixtures, the ladder and golden tests run natively: the exit criterion
  should read "native and wasm32 give the same hash for every golden log" (D3).
- **G8 (§25).** Exit criteria say "e2e vert", but e2e runs on `main` after merge only (decision
  #239). The criteria should name where they are read: the `main` CI run of the phase's last merge,
  plus the next nightly live run.
- **G9 (§1 pillar 1, §6.4).** "Même perft, mêmes parties aléatoires" has no depth and no count. CI
  time depends on both; proposed tiers in D4 (depth 2 to 3 and 200 games per PR, depth 4 and
  10 000 games nightly, TUNE).
- **G10 (§0 "Vérification", §1 pillar 4).** The Given/When/Then examples are planned in `rules.md`,
  under `docs/`-style Markdown that CI ignores (`paths-ignore`). Executable examples must be `.scn`
  files in a crate, with the Markdown linking to them; otherwise a docs-only edit to an example is
  never tested (D5).
- **G11 (§4.2, §4.8, §13.2, §16, §17, §18, §19, §20).** Real-time movement, the UTC day and night,
  the daily merchant, dailies, weekly affixes, the world boss schedule, the PvP turn timer and the
  BR calendar all read time, but the spec does not say that time is an **input** of the rules. For
  testability (pillar 4) and for a stable nightly run against the live site, every such rule should
  take the UTC time as an argument, and e2e specs fix the page clock (D2, D10).
- **G12 (§6.12, §4.5).** "Moins de 5 s" for a retry and "1,2 s" for the unfold have no measurement
  method; CI draws with software WebGL, where frame time is not representative. The spec should say
  the 5 s is engine-side and measured on a reference machine, reported (not gated) on CI (D10).
- **G13 (§25, §24.5, Pages).** `main` deploys to GitHub Pages on every merge, so R1 to R9 would ship
  half-built RPG screens to players while the classic tables must stay intact (§1 pillar 1, §21
  Mess). The roadmap needs a visibility rule, for example the RPG behind a `?rpg` URL flag until R4
  exits (PROPOSAL for `client-engineer` and the owners).
- **G14 (§24.6).** The MCP server is not in CI and consumes `abalone-wasm`; the RPG bridge will
  change that API at almost every phase. The spec defers MCP to a separate issue but should say
  whether `mcp/` gets a CI job before the bridge changes (D14).
- **G15 (§4.7, §21, §25 R10).** Group play and presence use Trystero; CI cannot depend on public
  relays (flaky, external). R10's "e2e à 2 onglets" should state "with the in-page hook transport"
  as `online.spec.ts` already does, plus one optional real-relay smoke in the nightly only.
- **G16 (§25 R2, R9).** "Chaque classe bat la meute de référence" and "les 8 classes passent
  l'échelle" have no threshold (win rate, budget, seeds). A nightly gate cannot be automated without
  numbers; `encounter-boss-designer` and `qa-balance` must put them in data (D11).
- **G17 (§18).** The release rule mixes two checks: "a gagné une échelle de bots" (slow, search,
  nightly) and "fixture de victoire" (fast, deterministic). Proposal: the fixture is the merge gate
  (L1), the ladder is the nightly health report (L3); the spec should say which one blocks a release
  (D11).

---

## Open questions

- **Q1.** Do the owners want new required checks (branch protection) or should every blocking step
  stay inside the `rust` job? This file assumes the latter (F1, KISS).
- **Q2.** Should client unit tests and `tsc` run in PR CI (D14)? If not, should every integrity rule
  written by `ux-designer` in vitest move to Rust (this file's default)?
- **Q3.** RON or JSON for `data/` (`tech-lead`, G5)?
- **Q4.** `proptest` as a dev-dependency, or in-house seeded loops (`gameplay-programmer.md` §4.9
  default)? CI does not care; coverage and supply chain prefer no new crate.
- **Q5.** Which exact Rust version to pin, who bumps it and how often, and how Homebrew-Rust
  contributors (no rustup, CONTRIBUTING §13) match it locally?
- **Q6.** Should a nightly ladder regression open a `bug` (P1 by rule 11) or a new `balance` label
  (needs a Decision to extend CONTRIBUTING §8)?
- **Q7.** Are RPG test hooks (`window.__rpgStart`) acceptable in the production build, as the
  existing hooks are, or must they be `@dev-only`?
- **Q8.** Does the nightly ladder include the Ballast Mind raid at a reduced budget, or only bosses
  whose pro-level run fits the 60 min cap?
- **Q9.** If the WASM nears its budget, is a second module (world and economy) acceptable, given the
  Web Worker and offline service worker setup (tech.md §4, §9)?
- **Q10.** Does the RPG stay behind a URL flag on the live site until R4 (G13)?

---

## Tasks (one PR each)

Each Task is a sub-issue of the "Phase R" Epic (§0), opened from the form, shared with the other
owner before it lands because it changes the CI. Order inside a phase is the listed order (rule 16:
PRs touching `ci.yml` go one after the other).

### DB-00 (R0) CI and test plan in `tech.md` §10

Outcome: `tech.md` §10 describes the RPG check levels, tiers and budgets of this file.
- [ ] §10 gets the L1/L2/L3 table (section 2.1), the D4 tiers and the D8 budget line
- [ ] Links to this role file and to `ci-repair.md`
- [ ] Docs-only PR, merged by an owner with the admin bypass (CONTRIBUTING §6.4 item 7)

### DB-01 (R1) Pin the Rust toolchain

Outcome: CI and rustup users build with one exact Rust version from `rust-toolchain.toml`.
- [ ] `rust-toolchain.toml` with channel, components, wasm32 target (D2)
- [ ] `ci.yml`, `pages.yml` install from the file; `dtolnay/...@stable` steps removed
- [ ] `cargo test`, coverage, boss fixtures green on the pinned version
- [ ] CONTRIBUTING §13 says how Homebrew users match the version (answer of Q5)

### DB-02 (R1) CI sees every crate and `data/`

Outcome: a change under any crate or `data/` reruns Rust checks and e2e and rebuilds the WASM.
- [ ] `changes` regexes per D1
- [ ] `wasm` cache key includes `crates/**`, `data/**`, `rust-toolchain.toml`
- [ ] `.gitattributes` with LF for `data/**` and scenario files
- [ ] Manual dispatch runs linked in the PR (data-only push, crate-only push)

### DB-03 (R1) Determinism lints for the rule crates

Outcome: `HashMap`, `HashSet`, `DefaultHasher`, clocks and float arithmetic fail clippy in
`abalone-rpg`.
- [ ] `crates/abalone-rpg/clippy.toml` and `[lints.clippy] float_arithmetic = "deny"` (D2)
- [ ] Temporary-commit proofs for each lint linked in the PR, commits dropped
- [ ] Same lints added to `abalone-world` when it is created (checklist line in its creation Task)
- [ ] Depends on: `abalone-rpg` crate created (`tech-lead`)

### DB-04 (R1) WASM build and size budget on every PR

Outcome: a PR that breaks the wasm32 build or exceeds 500 KB gzip cannot merge.
- [ ] `client/scripts/wasm-size.mjs` and `wasm-size.test.ts` written test first, 100 % coverage
- [ ] `rust` job: cache, `wasm-pack build`, size step, job summary line (D8, D9)
- [ ] `rust` timeout raised to 15 min (TUNE), measured p50 noted in the PR
- [ ] Forced-failure run (`WASM_BUDGET_BYTES=1000`) linked, commit dropped

### DB-05 (R1) Cross-target determinism job

Outcome: every golden log gives the same hash natively and in wasm32, on every `main` push.
- [ ] `crates/abalone-wasm/tests/determinism.rs` with `wasm-bindgen-test` (exact pinned version)
- [ ] Native run in `cargo test`, wasm32 run in the new `wasm-determinism` job (D3)
- [ ] Proof that a `usize`-length hash change fails the wasm32 job, commit dropped
- [ ] Depends on: first golden log and `hashes.txt` (`combat-engineer`)

### DB-06 (R1) Nightly deep Rust tests

Outcome: `#[ignore]` tiers run every night in release mode and a failure opens a `bug` issue.
- [ ] `.github/workflows/nightly-rust.yml`, job `deep-tests` (D4), 45 min timeout (TUNE)
- [ ] Job `wasm-determinism` reused nightly; `cargo deny check advisories` once DB-08 exists
- [ ] Issue step copied from `nightly.yml` (title "Nightly Rust deep tests failed", label `bug`)
- [ ] Manual dispatch with a failing ignored test linked, test issue closed, commit dropped
- [ ] `ci-repair.md` gets a short section on this workflow

### DB-07 (R1) Generic data validation harness

Outcome: every file in `data/` is bundled, parses, and all integrity errors print at once with
file and id.
- [ ] `tests/data_files.rs`: no orphan, parse with `path:line:col`, `check_all` collected errors (D6)
- [ ] `IntegrityError` and the registration point for domain checks, unit tested on a tiny `Db`
- [ ] `DATA_HASH` const fn and its run-time test (handed to `network-engineer` for `Hello`)
- [ ] CONTRIBUTING §13 designer command
- [ ] Depends on: loader and `FILES` (`tech-lead`), format decided (Q3)

### DB-08 (R1) Supply-chain check

Outcome: a dependency with a refused license or a duplicate major version fails the `rust` job.
- [ ] `deny.toml` (D12); `cargo deny check licenses bans` in `rust`
- [ ] Advisories in `nightly-rust.yml`
- [ ] Lands with or right after the first `serde` dependency (`tech-lead`)

### DB-09 (R1) RPG e2e harness and tags

Outcome: RPG specs start a fixed fight from a scenario file, run with a fixed clock and reduced
motion, and nightly skips `@dev-only`.
- [ ] `client/e2e/rpg.ts` helpers (D10)
- [ ] `client/e2e/rpg-smoke.spec.ts`: scenario starts, state hash matches `hashes.txt`
- [ ] `nightly.yml` grep-invert `textures are requested|@dev-only`
- [ ] Screenshot in the PR if the smoke spec shows a new screen (CONTRIBUTING §6.4)
- [ ] Depends on: `window.__rpgStart` and the data attributes (`client-engineer`)

### DB-10 (R1) MCP tests on `main` CI (PROPOSAL, after a Decision)

Outcome: a bridge change that breaks the MCP server turns `main` red the same day.
- [ ] Decision issue answered (section D14, G14)
- [ ] `mcp` job on `main` per D14, path-filtered
- [ ] Manual run with a broken bridge function linked, commit dropped

### DB-11 (R1) Client unit tests and typecheck in CI (PROPOSAL, after a Decision)

Outcome: `bun run test` and `tsc` run on every ready PR.
- [ ] Decision issue answered (Q2), placement inside `rust` or a separate job
- [ ] Job steps per D14; CONTRIBUTING §6.4 and §13 updated
- [ ] Forced type error run linked, commit dropped

### DB-12 (R2) Nightly RPG ladder

Outcome: every night, each class against its reference pack is measured and a run below its gate
opens a `bug` issue with the table.
- [ ] Job `ladder` in `nightly-rust.yml` (D11): summary table, JSONL artifact 30 days (TUNE)
- [ ] Exit 1 and exit 2 paths open their issues; dispatch proofs linked
- [ ] Schedule 04:17 UTC (TUNE)
- [ ] Depends on: `rpg_ladder` example and gates in data (`ai-engineer`, `encounter-boss-designer`)

### DB-13 (R4) Dist size budget in the Pages build

Outcome: the Pages build prints the gzip size of the site and fails above 5 MB.
- [ ] `client/scripts/dist-size.mjs` and its test (D13)
- [ ] Step in `pages.yml`, job summary line
- [ ] Forced-failure run linked

### DB-14 (R4) World determinism in wasm32

Outcome: the world golden summary (continent biomes and tile boards) gives the same hash in
wasm32 as natively.
- [ ] `determinism.rs` replays the world golden of `world-designer` (D3 point 4)
- [ ] Depends on: `abalone-world` golden test

### DB-15 (R9) Ladder matrix by class

Outcome: the nightly ladder covers 8 classes, all released bosses and stays under its time cap.
- [ ] `ladder` job split into a matrix by class when a single run passes 45 min (TUNE)
- [ ] Released bosses included, raid budget per Q8
- [ ] One summary table merged from the matrix outputs

### DB-16 (R10) Multi-page e2e entry

Outcome: group and arena specs with up to 4 pages run in their own CI entry without slowing the
4 shards.
- [ ] `e2e-multi` matrix entry, `--grep @multi`, 120 s per test (TUNE) (D10 point 4)
- [ ] Shards run `--grep-invert @multi`
- [ ] First `@multi` spec (`client-engineer`) green on `main`
