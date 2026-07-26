---
name: implement
description: Implement a change in a throwaway worktree, merge it to main, and clean up after itself. Use when the user invokes /implement with a GitHub issue number or a description of the change.
disable-model-invocation: true
---

# Implement

`$ARGUMENTS` is either a GitHub issue reference (`123`, `#123`, or an issue URL) or a
plain description of the change to make.

1. **Read the ask.** For an issue, `gh issue view <n> --comments` — that is the spec.
   Otherwise the argument itself is the spec. Ask first only if the ask is genuinely
   ambiguous; otherwise just start.
2. **Isolate.** `EnterWorktree` with a short kebab-case name — `issue-<n>-<slug>`, or a
   slug of the description.
3. **Implement it**, following `CLAUDE.md`. Keep the change scoped to what was asked.
4. **Check it.** `npm run tsc` plus `npm run test` (or `test:unit` / `test:e2e` if only
   one tier is in play). Don't proceed with failures.
5. **Commit** in the worktree. Say `Fixes #<n>` in the message when there is an issue.
6. **Merge to main.**
   - `ExitWorktree` with `action: "keep"` — this puts the session back in the main
     checkout. Never `"remove"` here; it deletes the branch too, so it either refuses
     (commits aren't on main yet) or throws the work away.
   - `git merge <branch>` from the main checkout, then `git push`.
7. **Clean up.**
   ```sh
   git worktree remove .claude/worktrees/<name>
   git branch -d <name>        # -d, so it refuses if the merge never landed
   gh issue close <n> --comment "<one line on what shipped>"   # if there was an issue
   ```
8. **Report** one line on what changed, the commit hash, and the issue you closed.

Stop and ask instead of improvising if the merge conflicts, the main checkout is too
dirty to merge into, or tests fail for reasons the change didn't introduce.
