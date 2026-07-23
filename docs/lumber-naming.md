# Lumber Naming — Design

How wood is named everywhere in the game: store shelves, inventory,
floor piles, machine bays, outfeeds, marketplace, recipe descriptions.

**Status: implemented.** The grammar lives in
`getMaterialName` / `getMaterialState` / `getMaterialFullName`
(`src/game/material-helpers.ts`); the shared two-line row renderer is
`src/components/MaterialLabel.tsx`; the player-facing explanation is the
manual's "Reading Lumber Sizes" article.

## Why

The old name — `Pine Board (8'x4"x8/4, smooth, S4S)` — failed both
audiences at once. It's jargon-dense enough to scare a newcomer, and
wrong-shaped for a woodworker: nobody lists dimensions length-first,
and nobody calls a 2x4 by its quarters. The two goals (accessible to
non-wood people, authentic to woodworkers) stop conflicting once the
name stops trying to carry everything:

- **The name says what a woodworker would say.** Notation is keyed to
  what the wood *is*, because real lumber notation differs by stock.
- **The UI teaches what the name means.** Plain-inch translations live
  in tooltips and the manual, one layer down — learning that "8/4"
  means two inches is a reward the game hands the player, not a
  prerequisite.

## Identity vs. state

A material's **name** carries identity: species, notation, dimensions.
Its **state** — surface quality, milling progress, end treatments — is
what's been *done* to it, and renders as a separate faded line under
the name (`getMaterialState`), never inside the name.

Contexts that need one string (tooltips, grouping keys, operation
output lists) use `getMaterialFullName` = `name (state)`. **Grouping
always keys on the full name** — a smooth board and a sanded board are
different materials and must never collapse into one row.

## Name grammar

Dimension order is cut-list order everywhere: **thickness × width ×
length**. Units are fixed by `BoardDimension`: length in feet (`'`),
width in inches (`"`), thickness in quarters of an inch (`/4` — which
conveniently reads correctly both as quarters notation and as a
fraction of an inch for thin stock: `1/4` pallet wood really is a
quarter inch thick).

| Stock | Grammar | Example |
| --- | --- | --- |
| Board, nominal size (see below) | `{Species} {t/4}x{w} — {l}'` | `Pine 2x4 — 8'` |
| Board, everything else | `{Species} {t}/4 — {w}" × {l}'` | `Walnut 8/4 — 6" × 8'` |
| Panel | `{Species} [End-Grain ]Panel {t}/4 — {w}" × {l}'` | `Maple Panel 4/4 — 10" × 2'` |
| Sheet good | `{Kind} {t}/4 — {w}' × {l}'` | `Shop Plywood 2/4 — 4' × 4'` |
| Everything else | unchanged (`Oiled Maple Simple Cutting Board`, …) | |

Sheet goods measure **both** cross dimensions in feet — the tell that
you're holding a sheet, not a board. Kind display names come from
`sheetKindLabel`: the plywood grades read as what they're for
("Cabinet Plywood", "Shop Plywood", "Sheathing Plywood"), never as
letter grades; the engineered boards keep their shop names ("MDF",
"OSB", "Particle Board").

Species display names come from `speciesLabel`: `pallet` → "Pallet
Wood" (so thin stock doesn't read "1/4 Pallet"), `purpleHeart` →
"Purple Heart", everything else via `humanizeString`. Multi-species
panels stay "Mixed Wood".

### The nominal-size predicate

A board gets the construction-lumber callout (`2x4`, `1x6`, `2x2`)
when **all** of:

- species is `pine` (construction softwood — hardwood is never
  nominal, no matter its size: nobody says "2x6 walnut"),
- thickness is exactly `4` or `8` quarters (a true 1" or 2"),
- width ≥ 2".

The callout is `{thickness/4}x{width}`. It survives crosscuts — "a
4-foot 2x4" is exactly what you'd say in a shop — and dissolves the
moment ripping or planing takes the board off a nominal size, falling
back to the quarters grammar. The game treats nominal as actual
(`Materials.ts`: milling never consumes nominal dimension), so the
callout is honest.

### The state line

Boards: surface + milling label + ends label, joined with ", " —
`smooth, S4S` / `rough sawn` / `sanded, S4S, 45° both ends`. The
"rough sawn"-on-rough-surface stutter rule carries over unchanged.
Panels: the surface alone. Everything else: no state line.

## Requirements speak cut-list, never nominal

`describeMaterialRequirement` (machine bays, refusals, recipe inputs)
keeps its own voice: it describes *constraints*, in cut-list order
(`4/4×2"×2'`), quarters always. A requirement is the shop's paperwork,
not a store shelf — and a requirement for "any 2"-thick board" can't
be a 2x4, so nominal callouts never appear there.

## Where the pieces render

- **Store cards** (`BoardSelector`): name only, in the channel section
  — the state line joins the stock line ("smooth, S4S · In stock")
  since a whole channel shares one milled state. This is issue #63:
  the store label now *is* the inventory label, so what you buy is
  what you carry.
- **List rows** (inventory, floor, outfeed, station contents,
  marketplace): `MaterialLabel` — name line, faded state line under it.
- **Icon tooltips** (machine bays, shelves): full name.
- **Plain-inch teaching tooltip**: hovering a board or panel name shows
  `2" thick · 4" wide · 8' long` (`describeStockDimensionsPlain`) —
  quarters translated to fractional inches.
- **Manual**: "Reading Lumber Sizes" (The Craft, always unlocked)
  explains both notations. Existing saves pick it up as a NEW tab via
  the normal milestone check — no save migration needed.

## Out of scope, deliberately

- Real-world nominal shrinkage (a store 2x4 measuring 1.5" × 3.5") is
  not modeled; the sim treats nominal as actual and the labels follow
  the sim.
