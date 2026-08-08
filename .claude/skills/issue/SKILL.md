---
name: issue
description: Create GitHub issues for things the user mentions. Use when the user invokes /issue to capture one or more items as GitHub issues in this repo (simonbw/woodworking-tycoon). Issues stay faithful to what the user said, lightly filled out with conversation context and the current state of the relevant code.
---

# Create GitHub issues

The user is dictating things they want tracked as GitHub issues. Turn what they mention into one issue per distinct item using `gh issue create`.

## Rules

- **One issue per distinct item** the user mentions. If they list several things, create several issues.
- **Faithful, not verbatim.** The issue must mean exactly what the user meant — never invent rationale, acceptance criteria, proposed solutions, or "why this matters" text they didn't give you. But don't just transcribe their words either: the issue will be read later, outside this conversation, by someone (possibly the user) who doesn't remember the discussion. Write it so it stands on its own.
- **Pull in conversation context.** The user's `/issue` message often leans on things discussed earlier without restating them — a bug you two just diagnosed, a feature being referenced, a decision already made. If the request only makes sense with that context, include it in the body. This is the most important kind of filling-out: factual context from the conversation the user is clearly referencing, stated explicitly so the issue is legible on its own.
- **Briefly check the current state of the code.** Before writing the body, spend a moment locating the relevant code (a grep, a quick read of the obvious file) and note the current behavior or the files/symbols involved — e.g. "currently `feed-clearance.ts` only checks the exit lane" or "handled in `src/components/station/ToolRack.tsx`". A sentence or two of grounding, not an investigation report. If a quick look doesn't turn up anything relevant, skip it rather than guessing.
- **Always write a body.** Even a small item gets a sentence or two — what the user asked for in plain words, plus whatever context/code grounding applies. Keep it to a few sentences or a short paragraph; this is still a terse issue, just one that survives being read cold.
- **Don't ask for confirmation** unless the ask is genuinely ambiguous (e.g. you can't tell if two things are one issue or two). Just create the issues.

## How

Create each issue with the `gh` CLI in this repo:

```sh
gh issue create --title "<concise title>" --body "<body>"
```

- Do not add labels, assignees, or milestones unless the user asks. The one label in active use is `humans-only` (work an agent can't do — recording audio, making art); apply it when that's clearly the case.

## File it into the project

Every issue also goes on the **Woodworking Tycoon** project board (project 2, owner `simonbw`) with its **Status** set (the built-in Status field carries the stage taxonomy):

- **Bug** — a defect; fixing it needs no design decisions
- **Idea** — kept alive for future consideration; not yet decided it should happen
- **Needs design** — direction is committed, but shape decisions remain before anyone can build
- **Ready** — scoped and decided; could be picked up today

Pick the stage from what the user said and how the body reads. When torn between Idea and Needs design, ask yourself whether the user has committed to wanting it; between Needs design and Ready, whether an agent could start without making judgment calls the user would want to weigh in on.

```sh
item=$(gh project item-add 2 --owner simonbw --url "<issue url>" --format json --jq .id)
gh project item-edit --id "$item" --project-id PVT_kwHOAFakNs4Bfydi \
  --field-id PVTSSF_lAHOAFakNs4BfydizhaC1jo --single-select-option-id "<option id>"
```

Status option ids: Bug `c6feaf57`, Idea `cb0c2031`, Needs design `d9f253d1`, Ready `3051b1c8`, In progress `22801f07`, Done `ad9526a2`.

After creating them, report back the titles, the URLs `gh` printed, and the stage each was filed under, one line each, so the user can click through.
