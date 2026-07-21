# The Shop Manual — Tutorials & Reference — Design

A dismissible reference modal: categories on the left, an article on the
right, opened from the `?` button in the top bar. Articles unlock as the
features they explain unlock.

**Status: implemented.** The article registry and unlock predicates live
in `src/game/manual.ts`, the modal and provider in
`src/components/manual/`, and the article bodies in
`src/components/manual/articles/`. Sidebar categories: Basics / The
Craft / The Shop / Business. One delta from the design below: the
welcome auto-open is state-driven (the manual shows itself while
`welcome` is unlocked-but-unread and closing acknowledges it) rather
than a mount-time effect, so a migrated or fixture-loaded save dissolves
it automatically.

## Why

The game has accumulated enough interlocking systems (surfaces, tool
slots, marketplace demand, dust physics) that a player can't be expected
to hold them all from contextual hints alone. The manual is the durable
place to re-read how something works. It is deliberately **not** an
interactive step-by-step tutorial — it's the binder on the shelf.

## Fiction & presentation

The paperwork design system carries this: the manual is an in-fiction
**shop binder** — manila category tabs down the left, typewriter-set
articles on the right, paper card surfaces throughout. Standard fonts and
surface roles from `docs/design-system.md`; no new chrome invented.

## Entry point: the `?` button

The NavBar `?` currently opens `ShortcutHelpOverlay` (keyboard
shortcuts). The manual **takes over the button**: `?` (and the
`toggle-help` shortcut) opens the manual instead. The shortcut list
becomes the always-unlocked **Controls** article, rendered from the same
shortcut registry so it can never drift; `toggle-help` opens the manual
directly to it. The standalone overlay component retires.

## Articles

| Article                       | Unlocks on                                     |
| ----------------------------- | ---------------------------------------------- |
| Welcome to the Shop           | always (auto-opens once on a brand-new game)   |
| Controls                      | always                                         |
| Milling & Surfaces            | first rough (non-S4S) lumber enters the shop   |
| Finishing                     | first time a finish is required or bought      |
| Tools & Tool Slots            | first mountable tool owned                     |
| Shop Layout: Moving Machines  | `shopLayoutUnlocked`                           |
| Marketplace & Jobs            | `marketplaceUnlocked`                          |
| Sawdust & Cleaning            | `sweepingUnlocked`                             |
| Skills & XP                   | first skill point earned                       |

Notes:

- **Welcome** walks the very basics through completing the rustic shelf.
- **Milling & Surfaces** covers rough → smooth → sanded, the machines
  that get you there, and the planer's direct-feed behavior — the planer
  does not get its own article; this is where the player meets it.
- **Supplies (consumables)** folds into Finishing for now (finish oil is
  the consumable players will actually wonder about; nails explain
  themselves). Break it out into its own article if the system grows.
- Per the progressive-disclosure rule, locked articles are **absent**
  from the tab list — never grayed-out teasers.

## Unlock signaling

- A new unlock puts a small badge on the `?` button and a "NEW" marker on
  the article's tab; opening the article clears both. No toasts, no
  auto-opens — the one exception is Welcome, which opens the manual once
  on a fresh game (no save present).
- One-shot in-world notes like `DustTutorialCard` stay: they're the
  moment-of-need nudge, the manual is the re-readable reference. New
  systems can ship both; the card may end with "see the shop manual".

## State model

New `ProgressionState` fields (persistent, saved):

- `unlockedArticles: ReadonlyArray<ArticleId>` — appended by the same
  game actions / tick checks that flip the underlying features. Event
  triggers with no existing flag (rough lumber, finishing, first tool,
  first skill point) are detected where the relevant state changes and
  recorded here; no parallel boolean flags.
- `readArticles: ReadonlyArray<ArticleId>` — drives the NEW markers and
  the `?` badge (badge = any unlocked-but-unread).

Requires a `SAVE_VERSION` bump. Migration evaluates each article's
unlock predicate against the loaded state and marks everything already
unlocked as **read** — an established save must not get badge-spammed
with nine "NEW" tabs on load.

Whether the manual is open (and which article) is UI state, not
`GameState`.

## Content format

Articles are **TSX content**, not markdown strings — headings, key-cap
chips (`ShortcutKeys`), and inline machine/material sprites, so the
Welcome article can show the actual icons it references and shortcut
references never go stale. Article components and the registry live in
`src/components/manual/`; the registry maps `ArticleId` → title,
category, unlock predicate (for migration), and component.

## Later

- Contextual deep links: inspector panels and one-shot cards link
  straight to the relevant article.
- Articles for systems as they land (worktable building, offcut
  recovery, dust collection tiers).
- Possibly per-article illustrations in the sprite style once content
  settles.
