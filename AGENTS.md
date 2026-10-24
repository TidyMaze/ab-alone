# Rules for AI agents

Read [CONTRIBUTING.md](CONTRIBUTING.md) before doing anything and follow it strictly. The short
version:

1. Work only on a Task in `Ready` status, assigned to you. One unfinished Task at a time.
2. One Task, one branch `<issue>-<slug>`, one PR with `Closes #<task>`. Nothing out of scope.
3. Strict TDD: failing test first, then code. 100 % line and region coverage. Unit and e2e tests.
   Check player-facing changes in Chrome with Playwright.
4. Every bug gets a `bug` issue before any fix. Bugs are picked before tasks.
5. This repo is public: never commit or print a secret.
6. Talk only through issue comments and PR reviews. Sub-agents never merge, never triage, never
   close a `Decision`. The lead agent (driven by an owner) may triage when an owner delegates and
   merge a PR once the CI check `rust` is green; no human review is needed (CONTRIBUTING.md section 0).
7. At most 4 tasks in progress at once. Run the local checks and one e2e run before opening a PR.
   Kill the dev servers you started.
8. Assign yourself (your driving owner) before any work. Never touch an issue or PR assigned to
   someone else without their written consent: let them finish until Ready or merged.
9. Branch from an up-to-date `main`, target `main`. Never base a branch on an unmerged branch.

Setup, checks and e2e commands: [CONTRIBUTING.md section 13](CONTRIBUTING.md#13-local-setup-and-checks).
