# The Shop Manual — writing and wiring articles

The in-game reference binder: a dismissible modal opened from the `?`
button in the top bar, one article at a time with index tabs sticking
out the right edge. Articles unlock as the features they explain unlock.
The registry and unlock predicates live in `src/game/manual.ts`, the
modal and provider in `src/components/manual/`, and the article bodies
in `src/components/manual/articles/`. This doc is the guidance for
adding an article and the voice rules its prose must follow — the
article list itself lives in the registry.

## What the manual is

The game has enough interlocking systems (surfaces, tool slots,
milling settings, dust physics) that a player can't hold them all from
contextual hints alone. The manual is the durable place to re-read how
something works. It is deliberately **not** an interactive step-by-step
tutorial — it's the binder on the shelf. One-shot in-world notes like
`DustTutorialCard` stay: they're the moment-of-need nudge, the manual is
the re-readable reference. New systems can ship both; the card may end
with "see the shop manual".

The paperwork design system carries the fiction: an in-fiction
**spiral-bound shop notebook** — one ivory page at a time, a wire coil
punched through the left edge, the page stack peeking out underneath,
manila index tabs clustered by category (Basics / The Craft / The Shop /
Business), the open article's tab pulled forward in page-ivory.
Typewriter-set article text per `docs/design-system.md`.

## Unlocking and signaling

- Locked articles are **absent** from the tab list — never grayed-out
  teasers (the same progressive-disclosure rule the lumber channels
  follow).
- A new unlock puts a small badge on the `?` button and a "NEW" marker
  on the article's tab; opening the article clears both. No toasts and
  no auto-opens.
- State is two persistent `ProgressionState` lists: `unlockedArticles`
  (appended by the same milestone checks that flip the underlying
  features — no parallel boolean flags) and `readArticles` (drives the
  markers; badge = any unlocked-but-unread). Whether the manual is open,
  and to which article, is UI state, not `GameState`.

## Adding an article

1. A component in `src/components/manual/articles/`, built from the
   article elements (`elements.tsx`: `P`/`H`/`UL`/`Term`/`Note`/
   `FigureRow`/`Photo`). Articles are **TSX content**, not markdown —
   key-cap chips (`ShortcutKeys`) and inline sprites mean shortcut
   references and icons can never drift from the game. `Photo` presents
   the machine PNGs as tilted white-bordered prints with handwritten
   captions.
2. A registry row in `src/game/manual.ts`: title, short `tab` label,
   category, unlock predicate, component.
3. Deep links where the player will want them: `ManualLink` renders a
   "Shop Manual → article" pointer that hides while the article is
   locked; station sheets get theirs via `MACHINE_ARTICLES`.

**A new section beats a new article.** When a system is small or lives
at an existing station, add a section to the article already covering
that place, and cut against what the binder teaches elsewhere — a fact
stated in two articles will drift apart. (This is why Workbenches covers
tools, glue-ups, finishing, and supplies in one page, and why the planer
has no article of its own — Milling & Surfaces is where the player meets
it.)

## Voice & copy rules

Article prose is written for a player seeing the game for the first
time, in plain instruction-manual style. The rules, learned the hard way
in the first copy pass:

1. **Never explain what the game isn't, lacks, or used to be.** "The
   planer has no menus", "there is no blueprint mode", "there's no
   meter to watch" — a first-time player never expected those things,
   so mentioning them only plants doubt. Describe what _is_.
2. **No internal design vocabulary, invariants, or units.** Words like
   "verb", axioms like "dust is a substance that moves; only containers
   destroy it", and internal units like "tiles" belong in design docs.
   The articles teach the same facts through concrete actions ("hold
   Space to sweep the dust into the dustpan") and fiction-level
   quantities ("when the dustpan fills up"; "the canister holds far
   more than the pan").
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
7. **Ration em dashes.** One appositive per paragraph is plenty, and
   parentheses or commas usually do the same job more quietly. Where a
   dash splices two clauses, a colon, semicolon, or full stop serves
   better.
8. **Say each thing once, in one register.** Not a pithy sentence and
   then its detailed restatement ("That work is milling", "It's where
   rough boards become flat stock: …") — write the informative
   sentence and delete the setup. Punchy fragment runs ("Scavenge,
   build, sell.") get cut the same way; the steps are already in the
   prose.
9. **End the sentence at the fact.** Trailing clauses that add mood
   instead of information ("for as long as the cut takes", "soaks in on
   its own time") come off.
10. **Instruct, don't reassure.** Say what to do and what happens
    ("Keeping a clean shop keeps work moving at full speed"), not how
    the player should feel about it ("A little mess is harmless").
11. **A new section beats a new article** — see above; it's a voice rule
    too, because the binder speaking twice about one fact is how the
    two tellings drift.
