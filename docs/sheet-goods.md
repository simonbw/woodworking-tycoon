# Sheet Goods

Plywood, MDF, OSB, and particle board are bought by the piece and cut down
to the parts a recipe wants. A sheet is not lumber and is deliberately not
modelled like it: it has no species, no grain, no surface ladder and no
jointed axes. The only thing the shop ever does to one is make it smaller.

That single verb is the system. It spans the store shelf, two machines, a
tool, and every blueprint with a sheet in it, which is why it has a doc
rather than a module header.

## What a sheet is

`SheetGood` (`src/game/Materials.ts`) is a kind, a thickness, and two
inch dimensions. Both cross dimensions are free numbers — sheets never sat
on the `BOARD_DIMENSIONS` detents — so any size a saw can produce is
representable.

**The long side is always the length.** A board's length is a fact about
its grain; a sheet has none, so a 24×48 piece and a 48×24 piece are the
same piece turned. `makeSheet` (`src/game/sheet-helpers.ts`) normalizes
every piece that comes off a cut, which is what lets a blueprint slot
state one orientation and mean either. Anything constructing a `SheetGood`
outside a fixture should go through it.

`cutSheet` is the whole cutting model: split one piece into two along one
dimension. No kerf — charging the blade's eighth of an inch would drift
every part size in the game off the inch, and board rips don't charge it
either. The kerf shows up as dust on the floor, which is where the player
meets it anyway.

## Where cuts happen

Two stations, and the split between them is capability, not tax:

**The table saw** rips against its fence (`ripSheet`) and crosscuts on the
mounted crosscut sled (`crosscutSheet`), both to the inch. It is the
accurate one, and it is limited two ways that both fall out of systems
that already existed:

- `RIP_FENCE_CAPACITY_IN` — the fence only travels so far from the blade,
  so the piece kept against it can never be wider than that. Whatever
  falls off the far side is unrestricted, which is why breaking a sheet
  down is a series of cuts that each keep the small side.
- Feed clearance (`src/game/feed-clearance.ts`) already demands lane
  scaled to the stock's length. A full sheet needs more clear floor than a
  one-car garage has, so it cannot go through the saw at all. No new rule
  was needed for this and none should be added.

**The sawhorses** (`machines/sawhorses.ts`) take the cuts the saw can't,
with the circular saw in their one tool slot. They have no `feedsThrough`,
so stock length is irrelevant — the sheet stays put and the saw walks the
cut. That is the only reason to own them, and it is enough: nothing else
in the shop accepts a full sheet.

What they cost is setup, and none of it is a fudge factor:

- The straightedge is clamped for each cut, drawn from the shop's clamp
  pool (`clampsHeld` on the operation), so a shop mid-glue-up can't also
  be breaking sheets down.
- The cut lands on a half-foot detent — a marked and clamped cut, not a
  fence — so a piece still goes to the saw to reach its real size.
- One tool slot, already spent, so there is nowhere to hang a dust bag.

The cut runs clean. There is no rough-edge or cut-quality axis on sheets
and adding one was considered and dropped: the setup cost is the whole
point, and a quality penalty on top would make the tool feel punitive
rather than cheap.

## Sizes and price

The store racks every kind in three sizes (`SHEET_SIZES` in
`sheetStock.ts`), and which one to buy is a real decision because price
per square foot climbs as the piece gets smaller — `sheetSizePremium` in
`material-values.ts` charges on face area against a full sheet. The full
sheet is the cheapest wood in the building; the small panels are
convenience-priced.

That gap is the circular saw's entire business case. Breaking sheets down
is never *required* for the small builds — the panels exist so a shop with
one saw can still make its first jigs — it just costs more to skip. The
things that genuinely need a full sheet are the ones no panel can yield:
anything wider than the widest panel on the rack.

Because the premium is a function of area rather than a table of SKUs, an
offcut prices on the same curve as everything on the shelf.

## Recipes ask for parts

A blueprint slot with a sheet in it asks for the size the part actually is
(`sheetRequirement` in `bench-work/blueprint.ts`), never for a whole
sheet. For the worktables and the storage rack that size is the machine's
own top, so the requirement and the part drawing both derive from the
table's footprint — a bigger bench is a bigger buy, and the numbers can't
drift from the machine they build.

Those dimensions are restated in `blueprint.ts` rather than read off
`MACHINE_TYPES`: worktables reach the blueprint module through
`benchOperations`, so importing back would close a cycle. `blueprint.test.ts`
holds the two in step.

## Deliberately not modelled

- **Kerf**, as above.
- **Grain direction on plywood.** Real sheets have a face grain that
  matters for how you cut a carcass; nothing in the game would ask about
  it yet, and it would double every requirement. (The renderer does track
  where a piece lay on its source sheet — `SheetFaceRegion`, filled in by
  `cutSheet` and `makeSheet` — so cut pieces keep showing the veneer they
  were cut with. That bookkeeping is cosmetic only: no cut, recipe, or
  price ever reads it.)
- **Scrap thresholds.** Every cut yields both pieces, however small. A
  cutoff below which an offcut vanished would be a rule the player can't
  see, and the garbage can already absorbs clutter.
- **Sheet edge quality.** See above — the circular saw cuts clean.
