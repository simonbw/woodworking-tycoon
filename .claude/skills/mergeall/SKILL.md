---
name: mergeall
description: Merge every open PR one at a time, verifying each merge on the combined tree before it lands, then clean up branches and leave local main up to date. Only run when explicitly invoked with /mergeall.
disable-model-invocation: true
---

# Merge all open PRs

Land every open PR in this repo one at a time, safely, and finish with a clean
branch list and an up-to-date local `main`. This repo has no CI, so **local
verification is the only gate** — never trust GitHub's `MERGEABLE`/`CLEAN`
status alone: PRs that merge cleanly textually still break `tsc` or tests on
the combined tree routinely here.

## Preconditions

1. Working tree must be clean (`git status`). If it isn't, stop and ask —
   don't stash the user's work.
2. `git fetch --prune origin` and fast-forward local `main` to `origin/main`.
3. `gh pr list --state open --json number,title,headRefName,isDraft,mergeable`.
   - Skip drafts; report them at the end.
   - If there are no open PRs, just sync `main`, prune branches (see Cleanup),
     and report.
4. Show the queue (number, title, branch) before starting, oldest PR first.

## Per-PR loop

Repeat for each PR, always against the **freshest** `main` (earlier merges can
break later PRs, so re-verify every one in turn — never batch):

1. `git checkout main && git pull` (picks up the previous iteration's merge).
2. Build the candidate tree locally: `git checkout -B mergeall-test main &&
   git merge --no-edit origin/<headRefName>`.
   - **Textual conflict** → resolve it (see "Resolving conflicts" below).
3. Verify the combined tree:
   - `npm run tsc`
   - `npm run test:unit`
   - `npm run test:e2e` — if only `floor.spec`'s load-time budget fails, rerun
     it up to 2 more times before blaming the merge; that check is flaky on
     unmodified `main` (~1 in 3 runs).
   - Any real failure → first try to fix it on the PR branch the same way as a
     conflict (small, intent-preserving fixes only — a renamed import, a
     changed signature, a moved file). If the fix would mean redesigning the
     PR's approach, leave the PR open, report why, and continue.
4. Land it: `gh pr merge <number> --merge --delete-branch`.
5. `git checkout main && git pull`, confirm the merge commit arrived, and
   delete the local branch if one exists with `git branch -d` (never `-D` —
   if `-d` refuses, the branch has commits main doesn't; report it instead of
   forcing).

## Resolving conflicts

Default to resolving conflicts yourself; escalate only when the conflict is a
real design decision. GitHub can't merge a conflicted PR, so the resolution
must land **on the PR branch**, not just the test branch:

1. `git checkout <headRefName>` (tracking `origin/<headRefName>`), then
   `git merge --no-edit main` and resolve every conflicted file. Read enough
   surrounding code and both branches' intent (`git log main..HEAD` and the PR
   description) to preserve **both** changes — a resolution that quietly drops
   one side's behavior is worse than asking.
2. Re-run the full verification (`tsc`, unit, E2E) on the resolved branch.
3. Push the merge commit to the PR branch (`git push origin <headRefName>`),
   confirm the PR shows as mergeable, then continue to `gh pr merge`.

**Stop and ask the user instead** when the resolution would require a
judgment call they'd want to weigh in on — both branches redesigned the same
system in incompatible ways, the conflict spans a subsystem's core files with
no evident right answer, or you'd be choosing which feature's behavior wins.
Present the conflicting intents concretely, then continue with the remaining
PRs while waiting; come back to the escalated one last. Sheer conflict-marker
count is not by itself a reason to escalate — many markers with an obvious
resolution (imports, adjacent additions, formatting) are still yours to do.

## Cleanup

1. `git branch -D mergeall-test` (the throwaway is expected to be unmerged).
2. `git fetch --prune origin`.
3. For each remaining local branch, delete it only if
   `git merge-base --is-ancestor <branch> main` holds; otherwise leave it and
   list it in the report. Never push an old local branch after its PR merged —
   the remote branch was deleted, and pushing recreates it as a `[new branch]`
   orphan.
4. Finish on `main`, fully up to date, working tree clean.

## Report

End with a summary: PRs merged (in order), conflicts resolved and how, PRs
left open and exactly why (escalated conflict / tsc / which test), drafts left
alone, and any local branches that survived cleanup and need the user's
decision.
