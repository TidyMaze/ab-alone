# Rules for AI agents

Read [CONTRIBUTING.md](CONTRIBUTING.md) before doing anything and follow it strictly. The short
version:

1. Work only on a Task in `Ready` status, assigned to you. One unfinished Task at a time.
2. One Task, one branch `<issue>-<slug>`, one PR with `Closes #<task>`. Nothing out of scope.
3. Strict TDD: failing test first, then code. 100 % line and region coverage. Unit and e2e tests.
   Check player-facing changes in Chrome with Playwright.
4. Every bug gets a `bug` issue before any fix. Bugs are picked before tasks.
5. This repo is public: never commit or print a secret.
6. Talk only through issue comments and PR reviews. Never merge, never triage, never close a
   `Decision`.

Setup, checks and e2e commands: [CONTRIBUTING.md section 13](CONTRIBUTING.md#13-local-setup-and-checks).
