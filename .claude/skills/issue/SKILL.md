---
name: issue
description: Create GitHub issues for things the user mentions. Use when the user invokes /issue to capture one or more items as brief GitHub issues in this repo (simonbw/woodworking-tycoon). Keeps issues short and faithful to what the user actually said.
---

# Create GitHub issues

The user is dictating things they want tracked as GitHub issues. Turn what they mention into one issue per distinct item using `gh issue create`.

## Rules

- **One issue per distinct item** the user mentions. If they list several things, create several issues.
- **Keep it short and faithful.** The title and body should say what the user meant — nothing more. Do not pad the body with invented rationale, acceptance criteria, background, or "why this matters" text they didn't ask for.
- **Rephrase, don't transcribe.** You need not copy the user's words verbatim, but the meaning must stay exactly theirs. If the user's phrasing is already a fine issue title, a one-line issue (title only, empty body) is often correct.
- **Use conversation context** to add genuinely relevant, factual detail — e.g. a file path, symbol, or specifics you and the user just discussed. Only add context you're confident the user intends. When in doubt, leave it out.
- **Don't ask for confirmation** unless the ask is genuinely ambiguous (e.g. you can't tell if two things are one issue or two). Just create the issues.

## How

Create each issue with the `gh` CLI in this repo:

```sh
gh issue create --title "<concise title>" --body "<brief body, or omit for none>"
```

- Omit `--body` (or pass an empty string) when the title alone captures it.
- Do not add labels, assignees, or milestones unless the user asks.

After creating them, report back the titles and the URLs `gh` printed, one line each, so the user can click through.
