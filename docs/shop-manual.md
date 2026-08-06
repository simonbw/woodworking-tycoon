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
**spiral-bound shop notebook**. One ivory page at a time, a wire coil
punched through the left edge, a faint red margin rule, the rest of the
page stack peeking out underneath, and physical index tabs sticking out
the right edge — manila tabs clustered by category, the open article's
tab pulled forward in page-ivory. Tab labels are the registry's short
`tab` names; typewriter-set article text per `docs/design-system.md`.

## Entry point: the `?` button

The NavBar `?` currently opens `ShortcutHelpOverlay` (keyboard
shortcuts). The manual **takes over the button**: `?` (and the
`toggle-help` shortcut) opens the manual instead. The shortcut list
becomes the always-unlocked **Controls** article, rendered from the same
shortcut registry so it can never drift; `toggle-help` opens the manual
directly to it. The standalone overlay component retires.

## Articles

| Article                      | Unlocks on                                      |
| ---------------------------- | ----------------------------------------------- |
| Welcome to the Shop          | always (auto-opens once on a brand-new game)    |
| Controls                     | always                                          |
| Milling & Surfaces           | the lumberyard opens, or a milling machine/tool |
| Workbenches                  | first bought tool, clamp, or finish — or the cutting-board commission's call |
| Shop Layout: Moving Machines | `shopLayoutUnlocked`                            |
| Marketplace & Jobs           | `marketplaceUnlocked`                           |
| Sawdust & Cleaning           | `sweepingUnlocked`                              |
| Skills & XP                  | first skill point earned                        |

Notes:

- **Welcome** walks the very basics through completing the rustic shelf.
- **Milling & Surfaces** covers rough → smooth → sanded, the machines
  that get you there, and the planer's direct-feed behavior — the planer
  does not get its own article; this is where the player meets it.
- **Workbenches** merges what were separate Tools, Glue-Ups, and
  Finishing articles into one page on the bench: tool slots and tiers,
  sanding and finishing, glue-ups and the clamp pool, jigs. Supplies
  (finish oil, clamps) are covered here rather than in their own
  article; break them out only if the system grows.
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

## Voice & copy rules

Article prose is written for a player seeing the game for the first
time, in plain instruction-manual style. The rules, learned the hard
way in the first copy pass:

1. **Never explain what the game isn't, lacks, or used to be.** "The
   planer has no menus", "there is no blueprint mode", "there's no
   meter to watch" — a first-time player never expected those things,
   so mentioning them only plants doubt. Describe what _is_.
2. **No internal design vocabulary or invariants.** Words like "verb",
   or axioms like "dust is a substance that moves; only containers
   destroy it", belong in design docs. The articles teach the same
   facts through concrete actions ("hold Space to sweep the dust into
   the dustpan").
3. **Don't spell out what players will assume anyway** ("everything in
   the shop takes time"). Drawing attention to the intuitive reads as
   if there's a catch.
4. **State facts, not theses.** Openers give information ("Skills
   determine what you know how to build"), not metaphors ("two ledgers
   track this shop's rise") or sales copy ("where the money hides").
5. **Personality lives only in the handwritten margin `Note`s — and
   there it's wanted.** A Note is the binder's previous owner scribbling
   a practical tip in their own voice ("Say 'eight-quarter', not 'two
   inches thick'"); a Note with no flavor should just be body text.
   Shop vernacular ("the blade eats a quarter inch", "an 8' rip wants
   7' clear") belongs in Notes or nowhere — body text stays plain.
6. **State the positive fact by itself.** Not "A worktable doesn't
   block the lane — stock slides over it" but "Stock slides right over
   a bare worktable." The negative-then-positive pivot ("that's not X;
   that's Y") reads as generated copy.
7. **Ration em dashes.** One appositive per paragraph is plenty. Where
   a dash splices two clauses, a colon, semicolon, or full stop usually
   serves better.

## Content format

Articles are **TSX content**, not markdown strings — headings, key-cap
chips (`ShortcutKeys`), and inline machine/material sprites, so the
Welcome article can show the actual icons it references and shortcut
references never go stale. Article components and the registry live in
`src/components/manual/`; the registry maps `ArticleId` → title,
category, unlock predicate (for migration), and component.

## Deep links & illustrations (implemented)

- `ManualLink` (`src/components/manual/ManualLink.tsx`) is the
  moment-of-need pointer: a small "Shop Manual → <article>" link that
  renders nothing while the article is locked. Used by the dust card,
  the station sheets (`MACHINE_ARTICLES` in
  `src/game/manual.ts` maps machine → article), and every tool rack
  (→ Workbenches).
- Articles carry photo prints (`Photo` / `FigureRow` in the article
  elements): the machine PNGs from `static/images/` presented as tilted
  white-bordered prints with handwritten captions.

## Later

- Articles for systems as they land (worktable building, offcut
  recovery, dust collection tiers).
