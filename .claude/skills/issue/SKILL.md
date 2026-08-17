---
name: issue
description: Work with GitHub issues and the project board in this repo (simonbw/woodworking-tycoon). Invoke ANY time the task involves issues — creating them (/issue), picking work up from the backlog, triaging, reading the tracker, or moving an issue between stages — to load the stage taxonomy, labels, and board mechanics.
---

# GitHub issues and the project board

Every open issue lives on the **Woodworking Tycoon** project board (project 2, owner `simonbw`, `gh project item-list 2 --owner simonbw`). The built-in **Status** field carries the stage taxonomy:

- **Idea** — kept alive for future consideration; not yet decided it should happen. Needs thinking, not implementing — don't pick these up as build tasks.
- **Needs design** — direction is committed, but shape decisions remain before anyone can build.
- **Ready** — scoped and decided; could be picked up today. Bugs go here too, wearing the `bug` label — a defect needs no design decisions.
- **In progress** / **Done** — the usual. Closing an issue moves it to Done automatically; set In progress when starting work that will span sessions.

When torn between Idea and Needs design, ask whether the user has committed to wanting it; between Needs design and Ready, whether an agent could start without making judgment calls the user would want to weigh in on. When a design discussion concludes and an issue becomes buildable, update its body with the decisions and move it to Ready.

Two labels are in active use: `bug` (a defect) and `humans-only` (work an agent can't do — recording real audio, creating art assets). Apply them when they clearly fit; otherwise don't add labels, assignees, or milestones unless the user asks.

Dependencies between issues are stated in the body ("Depends on #140") — the board has no dependency field.

## Board mechanics

```sh
# add an issue to the board, then set its stage
item=$(gh project item-add 2 --owner simonbw --url "<issue url>" --format json --jq .id)
gh project item-edit --id "$item" --project-id PVT_kwHOAFakNs4Bfydi \
  --field-id PVTSSF_lAHOAFakNs4BfydizhaC1jo --single-select-option-id "<option id>"
```

Status option ids: Idea `d13c8298`, Needs design `8b96ddb8`, Ready `d0cb56e7`, In progress `69e6bab1`, Done `79163d63`.

To move an existing issue between stages, get its item id from `gh project item-list` and run the same `item-edit`. Never add or remove Status *options* from the CLI — the GraphQL mutation regenerates every option id and wipes all items' statuses; use the web UI for that.

# Creating issues (/issue)

When the user invokes `/issue`, they are dictating things they want tracked. Turn what they mention into one issue per distinct item using `gh issue create`, then file each onto the board as above.

## Rules

- **One issue per distinct item** the user mentions. If they list several things, create several issues.
- **Faithful, not verbatim.** The issue must mean exactly what the user meant — never invent rationale, acceptance criteria, proposed solutions, or "why this matters" text they didn't give you. But don't just transcribe their words either: the issue will be read later, outside this conversation, by someone (possibly the user) who doesn't remember the discussion. Write it so it stands on its own.
- **Pull in conversation context.** The user's `/issue` message often leans on things discussed earlier without restating them — a bug you two just diagnosed, a feature being referenced, a decision already made. If the request only makes sense with that context, include it in the body. This is the most important kind of filling-out: factual context from the conversation the user is clearly referencing, stated explicitly so the issue is legible on its own.
- **Briefly check the current state of the code.** Before writing the body, spend a moment locating the relevant code (a grep, a quick read of the obvious file) and note the current behavior or the files/symbols involved — e.g. "currently `feed-clearance.ts` only checks the exit lane" or "handled in `src/shell/hud/station/StationSheet.tsx`". A sentence or two of grounding, not an investigation report. If a quick look doesn't turn up anything relevant, skip it rather than guessing.
- **Always write a body.** Even a small item gets a sentence or two — what the user asked for in plain words, plus whatever context/code grounding applies. Keep it to a few sentences or a short paragraph; this is still a terse issue, just one that survives being read cold.
- **Pick the stage** from what the user said and how the body reads, per the taxonomy above.
- **Don't ask for confirmation** unless the ask is genuinely ambiguous (e.g. you can't tell if two things are one issue or two). Just create the issues.

After creating them, report back the titles, the URLs `gh` printed, and the stage each was filed under, one line each, so the user can click through.
