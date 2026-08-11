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
   - **Textual conflict** → abort the merge, skip this PR, continue with the
     next one. Report the conflict; don't resolve it unilaterally.
3. Verify the combined tree:
   - `npm run tsc`
   - `npm run test:unit`
   - `npm run test:e2e` — if only `floor.spec`'s load-time budget fails, rerun
     it up to 2 more times before blaming the merge; that check is flaky on
     unmodified `main` (~1 in 3 runs).
   - Any real failure → skip this PR (leave it open, report why), continue.
4. Land it: `gh pr merge <number> --merge --delete-branch`.
5. `git checkout main && git pull`, confirm the merge commit arrived, and
   delete the local branch if one exists with `git branch -d` (never `-D` —
   if `-d` refuses, the branch has commits main doesn't; report it instead of
   forcing).

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

End with a summary: PRs merged (in order), PRs skipped and exactly why
(conflict / tsc / which test), drafts left alone, and any local branches that
survived cleanup and need the user's decision.
