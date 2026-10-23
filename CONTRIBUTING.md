# How we work

**All communication goes through this repo.** Issues, PR reviews and the project board. No
decision lives in a chat app: if it was said elsewhere, it does not exist until it is in an issue.

This applies to humans and to AI agents working for them.

## The loop

1. **Pick** an issue from the project board (`Todo` column). Assign yourself and comment
   "taking it". One owner per issue.
2. **Ask** questions as comments on the issue. Blocking question → add the `blocked` label and
   mention the person who can answer.
3. **Ship** a PR that says `Closes #<n>`. Small PRs, one issue each.
4. **Review**: the other contributor reviews. Approve or request changes in the PR, not elsewhere.
5. **Merge** when CI is green and the PR is approved. The issue closes itself.

## Decisions

- A design choice → an issue labelled `decision`, options listed, then closed with the chosen one
  as the last comment.
- If it changes the spec, the PR updating `SPEC.md` links that issue.

## Labels

| Label | Meaning |
|---|---|
| `epic` | A phase-level chunk, broken down into smaller issues |
| `question` | Needs an answer before work can start |
| `decision` | Records a design choice |
| `blocked` | Waiting on someone, see the last comment |
| `engine` / `client` / `server` / `design` | Area |

## Agents

An agent works exactly like a human contributor: it claims an issue by commenting, reports
progress and blockers as comments, and opens a PR. It never merges its own PR.
