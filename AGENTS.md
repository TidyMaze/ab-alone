# Rules for AI agents

Read [CONTRIBUTING.md](CONTRIBUTING.md) before doing anything and follow it strictly.

**This is a collaboration project.** Several owners and their agents work on the repo at the same
time. Act as one contributor among others, never as the only developer: check open issues and PRs
first, share decisions that affect others in an issue, and leave others' work alone.

The short version:

1. Work only on a Task in `Ready` status, assigned to you. One unfinished Task at a time.
2. One branch `<issue>-<slug>` and one PR with a `Closes #<task>` line per issue. Linked issues
   (same feature or files) may share one PR to go faster; unrelated work never does. Nothing out
   of scope.
3. Strict TDD: failing test first, then code. Unit tests cover 100 % of all code (lines and regions
   for Rust, decision #445). Unit and e2e tests.
   Every e2e test passes in under 15 s and fails beyond (Playwright timeout 15 s); a slower one is
   made cheaper (test hook instead of clicking through) or its logic becomes a fast unit test.
   An e2e test loads the full game state it needs (test hook on the game file import) instead of
   replaying steps that other e2e tests already cover.
   Check player-facing changes in Chrome with Playwright. A PR that changes the UI MUST include a
   screenshot in its description (CONTRIBUTING 6.4).
4. Every bug gets a `bug` issue before any fix (clear name, exact steps to reproduce, screenshot or
   visual proof, and expected behaviour once fixed). Bugs are picked before tasks.
   Every new feature or improvement must be formulated as a User Story ("As [role] I can [action] because [reason]")
   with proper description, context, and expected outcome.
5. This repo is public: never commit or print a secret.
6. Talk only through issue comments and PR reviews. Sub-agents never merge, never triage, never
   close a `Decision`. The lead agent (driven by an owner) may triage when an owner delegates and
   merge a PR once the CI check `rust` is green; no human review is needed (CONTRIBUTING.md section 0).
7. At most 4 tasks in progress at once. While developing, run only the smallest scoped checks (the touched unit file via `bun run test:scoped <file>`, instant `bun run layout:check`, or single e2e spec via `bun run e2e:layout`, CONTRIBUTING 13).
   CI runs e2e only on a manual dispatch (decision #445): run the full e2e suite locally once (`bun run e2e`, random
   port), when the draft is ready to become ready, and write "Full e2e suite run locally: N passed" in the PR body.
   It can also run on CI by hand: `gh workflow run ci.yml --ref <branch>`.
   After a rebase on `main` without conflict, rerun only `bun run test` and `tsc` (CONTRIBUTING 6.4).
   Kill the dev servers you started. Finish and merge your open PR before opening another: many
   open PRs mean rebase loops (CONTRIBUTING rule 16). Keep every task and PR minimal: one thing,
   done well, the simplest way (KISS, CONTRIBUTING rule 17). Group small open issues that fit one
   PR into that PR, one `Closes` line each (rule 17), instead of one PR per issue.
   Keep every Decision and spec PR short enough to review in one sitting: one question per Decision,
   one topic per spec PR (CONTRIBUTING rule 18).
8. Assign yourself (your driving owner) before any work. Never touch an issue or PR assigned to
   someone else without their written consent: let them finish until Ready or merged.
9. Branch from an up-to-date `main`, target `main`. Never base a branch on an unmerged branch.
10. Open every PR as a draft, after your local checks are green. CI does not run on drafts: the
    lead agent marks the PR ready, CI runs, and it merges when green, conversations
    resolved. The lead agent marks it ready and merges. Rebase your own PR when main
    moves, never someone else's.
11. Faster and cheaper (owner decision, 2026-10-29): no builds in parallel, one agent builds and
    changes the code at a time, so the changes do not conflict. No model above Sonnet, no
    reasoning effort above medium, for the lead agent and every sub-agent.
12. A partial PR says `Refs #<issue>`, never `Closes`: the issue stays open with the numbers in a
    comment (#925: reordering the texture requests gained nothing measurable).
13. Screenshots go to the `pr-screenshots` branch with `gh api -X PUT .../contents/... --input
    file.json` (the base64 in a JSON file): as a command argument it fails with "argument list too
    long".
14. A red e2e spec on `main` gets a `bug` issue the same day, and a full run is counted with
    `--reporter=json`, not by grepping the list output (#1048 broke 59 specs unseen until #1061).

Setup, checks and e2e commands: [CONTRIBUTING.md section 13](CONTRIBUTING.md#13-local-setup-and-checks).
