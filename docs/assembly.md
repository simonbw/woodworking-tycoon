# Assembly: blueprints, and products built from their parts — Design

This doc captures the agreed design for assembled products, the way
`docs/bench-minigames.md` captures hand work. Sections marked **Now**
are built and live; the rest stays design.

## The thesis

Pallet dismantling proved a pattern: a product that is visibly made of
its parts (board slots at authored positions, one nail per crossing of
exactly two boards, one sprite composing real board sprites at every
zoom) plus an arrangement system where pieces drag, turn, and flip as
persistent state. **Assembly is that machinery run forward.** A
blueprint says where every part lies and where every nail goes; the
player lays real staged parts onto ghost slots and drives a nail at
each crossing. Not a new engine — the pallet generalized.

## Decisions (settled — don't relitigate casually)

1. **One authored artifact per assembled product.** A `ProductBlueprint`
   (`src/game/bench-work/blueprint.ts`) is part slots (role, stock
   requirement, position/angle/layer) — and it is the single source of
   truth for four things that must never drift apart: the recipe's
   input list (`blueprintInputs`), its fastener bill
   (`blueprintFastenerCost`), the finished product's rendering
   (`AssembledProductSprite`), and the bench view's assembly script
   (the ghosts ARE the slots).
2. **Fasteners are derived, never hand-set**: one per overlap of two
   parts on adjacent layers — the pallet's crossing rule. Every
   fastener joins exactly two parts. (A hand-override escape hatch can
   come when a real product's nail pattern isn't "every crossing".)
3. **Products carry their bill of materials.** `FinishedProduct.parts`
   records the very boards that went in, seeded by the consumed
   materials' ids — the grain the player laid on the bench is the grain
   in the finished piece, in the bench view, on the shop floor, and in
   every icon. Products from older saves render the blueprint's nominal
   stock (`defaultPartsFor`). Blueprint-assembled products never get
   flat art (see `docs/asset-backlog.md`).
4. **Seating is derived, not stored.** A part is "seated" when its
   persistent bench placement (`MachineState.benchLayout`) lies on its
   slot — so a refresh mid-assembly finds every part exactly as placed,
   for free. Only driven-but-uncommitted nails are ephemeral, per the
   bench-minigames decision 4: assembly only spends, so it commits
   whole — the last nail resolves start + finish back to back.
5. **The ghost frame is the product's default seat.** Both stand
   squarely centered on the bench, so the assembled sprite appears
   exactly where the parts were lying — nothing moves at the moment the
   boards become one piece. Finished work stays on the bench (in both
   views, through the same placements) until E takes it.
6. **Parts nailed on are part of the build**: a piece a driven fastener
   holds won't drag, turn, or leave the bench until the build commits.
7. **The plan picker is diegetic**: a pile of shop drawings sitting in
   the bench view's bottom-right corner (`BlueprintCorner`, sheets by
   `BlueprintStack.tsx`). The pulled sheet — blueprint blue, white line
   work, a title block that reads supplies against the shop's stock —
   IS the selected plan; the rest of the stack shows as clickable sheet
   edges. Blueprint plans draw their real part layout; other plans draw
   their ingredients to scale. There is no paperwork card and no
   input/output diagram for benches: a bench top holds stock, not bays
   (tools manage on the top rail, a worktable's shelf/upgrades in the
   `UnderBenchPanel` drawer).
8. **Orientation is part of the slot.** A `BlueprintSlot` can stand its
   part on edge (`onEdge`); its footprint (`slotFaceWidthIn`) narrows
   to the part's thickness, seating and snapping demand a piece tipped
   to match (`BenchPlacement.onEdge` — F, the one flip verb, tips a board
   on edge where it flips the pallet over), and the fastener
   derivation's per-axis bite requirement relaxes to what a thin edge
   can offer. Hovering an empty outline bare-handed tags the slot's
   role and required stock — the drawing teaches at the bench, not in
   a sheet.

## The first commission, grounded — **Now**

The rustic shelf was never nonsense — 2 stringers + 3 deck boards is a
classic pallet-wood slatted shelf — it just never *showed* it. Its
blueprint: two stringers stand on edge as rails, the joists the piece
hangs on (layer 0, `onEdge`), three deck boards lie flat across their
top edges as slats (layer 1), six derived nails at the crossings (down
from a hand-set 8; the consumables-chain numbers follow). Drawn from
above, 48″ × 36″, the way it's built.

## Phase 2, partly landed — **Now**

The crate and the planter box are blueprints. Both are boxes, and a box
in this model's vocabulary is `boxSlots`: four walls stand on edge
spanning the full frame, inset from the edges so neighboring walls lap
past each other at every corner — log-cabin corners, one derived
fastener where the two thin footprints cross — with bottom slats lying
flat across the lower pair of walls (opposite walls share a layer so
only crossing pairs are fastener candidates). The crate is the 3'
version (two slats, eight nails, was a hand-set 12); the planter box is
the 2' version on screws (one slat — a planter drains — six screws,
was 8). The fastener declares its consumable and the consumable its
driver (`fastenerToolId`: nails → hammer, screws → drill), so the bench
scene's driving, instructions, armed-crossing chrome, and clip
(`drill-driver`) all follow from the blueprint; screw heads draw with a
driver cross (`fastenerHead.ts`) in every view.

## What stays for later phases

- **Phase 2, the rest**: blueprints for the birdhouse (its pitched roof
  doesn't flatten into nail-the-crossings top-down — needs a call), the
  step stool and bookshelf, the storage rack, and the worktable builds
  (their commit already differs only in granting machines). Until then
  those keep the legacy row surface (`AssemblySurface`).
- **Phase 3**: parametric slot groups (a shelf unit 2–5 shelves tall,
  placement as a function of index and count — the shape
  `deckBoardXIn` already has), commissions that require attributes of
  the BOM ("at least 3 shelves", "oak rails"), pricing from parts.
- **North star**: a product that carries parts and fasteners can be
  *dismantled* — `Pallet` stops being special, and prying nails out of
  your own crate returns boards and nails. The data model points there;
  the migration is deliberately not scheduled.

## Testing — **Now**

- **Unit**: blueprint geometry and derivation (`blueprint.test.ts`),
  seating/snap/arming (`assembly.ts` covered there too), the recipe's
  paired commit carrying the BOM (`operation-actions.test.ts`).
- **Sequence**: the ShopDriver path is unchanged — `run` routes
  assembly through the same paired commit, no mini-game in between; the
  consumables chain keeps the pallet-pays-for-its-shelf premise at six
  nails.
- **E2E** (`bench.spec.ts`): one real snap-drag (the grab preferring a
  free piece lying over a seated one), the hammer driving all six
  crossings through real clicks, the commit checked in state.
  `stations.spec.ts` owns the blueprint stack's selection contract
  (every plan name clickable exactly once via `data-mode-option`).
