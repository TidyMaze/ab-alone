# How we work

**All communication goes through this repo.** If it was said in a chat app, a call or a DM, it
does not exist until it is written here. This applies to humans and to AI agents working for them.

## Channels

| Where | What goes there |
|---|---|
| **Project** ([AB-ALONE](https://github.com/users/TidyMaze/projects/1)) | **The backlog.** Every task and feature lives here, with its status and priority |
| **Issues** | The content of each project item: description, acceptance criteria, discussion of that item |
| **Discussions** | Open-ended ideas, brainstorming, priority votes |
| **Pull requests** | Code and spec changes, and their review |

Nothing else. No decision in commit messages only, no side channel.

## The project

Every issue is added to the project. Fields:

| Field | Values | Set by |
|---|---|---|
| `Status` | `Todo`, `In Progress`, `Done` | The owner of the item |
| `Kind` | `Epic`, `Feature`, `Task`, `Spec`, `Question` | Whoever creates the item |
| `Priority` | `P0` (now) to `P3` (someday) | Project owners only, after votes |
| `Votes` | 👍 count from the latest vote | Project owners, when a vote closes |
| Milestone | Phase 0 to 5 | Whoever creates the item |

A quick idea with no detail yet can be a draft item in the project. It becomes an issue as soon as
someone needs to discuss or work on it.

## Who decides

Two humans own the project: **@TidyMaze** and William. They make every decision and merge every PR.
Agents recommend, they never decide.

## The work loop

1. **Pick** an issue in `Todo` on the board. Assign yourself, comment "taking it", move it to
   `In Progress`. One owner per issue.
2. **Ask** in the issue comments. Blocked → add the `blocked` label and @mention who can answer.
3. **Ship** a PR whose body says `Closes #<n>`. One issue per PR, small PRs.
4. **Review** happens in the PR (comments, suggestions, approve or request changes). The author
   answers every comment in its thread.
5. **Merge** once CI is green and the other owner approved. The issue closes itself.

## Ideas, votes and priorities

1. A new idea starts as a Discussion in **Ideas**. When it gets a concrete shape, an owner turns it
   into a `feature` issue.
2. Prioritization votes run as a Discussion in **Polls** (for example "Vote: top 10 features"):
   one comment per candidate, linking its issue. **Vote with a 👍 reaction**, one per comment you
   want, no limit.
3. When the vote closes, the owners copy each count into the item's `Votes` field, set
   `Priority`, and label the winners `top10`. The project sorted by `Priority` is the backlog.

Quick view of the most wanted features:
[issues sorted by 👍](https://github.com/TidyMaze/ab-alone/issues?q=is%3Aissue+is%3Aopen+label%3Afeature+sort%3Areactions-%2B1-desc).

## Decisions

- A design choice gets an issue labelled `decision` with the options listed and a recommendation.
- Anyone (agents included) comments with arguments. Only an owner closes it, with the chosen
  option as the last comment.
- If it changes a spec, the PR updating the spec links that issue.

## Labels

| Label | Meaning |
|---|---|
| `epic` | Phase-level chunk, split into smaller issues |
| `feature` | Player-facing feature |
| `spec` | Spec writing |
| `question` | Needs an answer before work starts |
| `decision` | Records a design choice |
| `blocked` | Waiting on someone, see the last comment |
| `top10` | Won the latest priority vote |
| `engine` / `client` / `server` / `design` | Area |

## Agents

Agents follow the same loop as humans, plus:

- One agent, one clone (`~/<path>/ab-alone-<agent-name>`), one branch. Never two writers in the
  same checkout.
- Agents talk to each other only through issue comments and PR reviews, never in private.
- An agent claims an issue with a comment, reports progress and blockers as comments, and lists
  what it created (PRs, issues) in its PR body.
- An agent never merges a PR and never closes a `decision` or `question` issue.
- The PR author shows which agent wrote it in the PR body, so reviewers know who to ask.

## Writing

English. Short and direct. One topic per issue, one issue per PR.
