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
classic pallet-wood slatted shelf — it just never _showed_ it. Its
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
version (six slats edge to edge with 2" gaps — a properly covered
bottom — sixteen nails, was a hand-set 12 over a mostly-open floor);
the planter box is the 2' version on screws (one slat — a planter
drains — six screws, was 8). The fastener declares its consumable and the consumable its
driver (`fastenerToolId`: nails → hammer, screws → drill), so the bench
scene's driving, instructions, armed-crossing chrome, and clip
(`drill-driver`) all follow from the blueprint; screw heads draw with a
driver cross (`fastenerHead.ts`) in every view.

The step stool and the bookshelf are blueprints too — both the rustic
shelf's shape (two sides on edge, two boards screwed flat across them),
so they were pure data. The stool's treads sit top-and-middle the way a
real stool steps; the bookshelf's shelves cross at thirds, 48″ square,
drawn lying on its back. Four screws each, one per crossing (was a
hand-set 10 and 12). The bookshelf is the first blueprint built from
sanded hardwood, so `AssembledPart` now carries the board's `surface` —
the oak the player surfaced draws sanded in the finished piece (older
saves' parts default to rough). Its pixel art (`bookshelf.png`) is
retired per decision 3; the step stool likewise left
`FinishedBoxSprite`.

The birdhouse landed as a **lean-to**, and its pitched-roof problem
dissolved into two ideas that cost no model extensions:

- **A blueprint may be an elevation.** The birdhouse assembles lying on
  its back, so the plan the player builds on is the front face — two
  tall boards with a 1″ entrance slit between them, side walls and a
  perch floor on edge at the flanks, no back wall (it hangs on a post).
- **The roof lies flat on the slope.** A single-slope roof is a board
  you _lay onto_ the leaning walls — which in the lying-down assembly
  is simply a flat piece on the top layer, overhanging both sides. The
  slope itself lives in the stock: the front walls' top ends are
  **mitered at the 45° stop** so the roof seats flush, expressed as a
  `matches` requirement (`hasOneMiteredEnd`) with a `matchesNote`
  ("one end mitered 45°") so the sheet and slot tips can still describe
  what the predicate wants. It's the first recipe that sends the player
  to the saw's angle stops before the bench.

Six nails, all derived: front→side, front→floor, roof→front. The roof
never touches the sides — those gaps are the ventilation, and the
adjacent-layer rule derives exactly that. (The birdhouse's own miters
hide under the roof in every view; the picture frame is the blueprint
that finally _shows_ its mitered ends, and it's what made parts record
them — see below.)

The picture frame is a blueprint, and it's the one that put mitered
ends on assembled parts. Four 2' rails, 1" wide, mirrored 45s both
ends — the horizontal pair on one layer, the vertical pair lapped over
it, and the four 1×1 corner overlaps derive one brad each (four nails,
right on the seams; the per-axis bite requirement relaxes to what a 1"
face can offer). A frame's corners ARE its ends, so `AssembledPart` now
carries the consumed board's `ends` and `AssembledProductSprite` hands
them to the board sprite's miter geometry — each rail draws as its true
trapezoid and the four seams close. Every slot is turned so its rail's
long edge faces out, with the slot's nominal `part.ends` saying which
flip that is: a rail cut with the other swing of the head is simply
turned over on the way in (flipping negates both ends and costs
nothing), and frames from older saves synthesize the nominal ends so
they still draw closed corners. (Fixing this exposed a sprite sign slip:
BoardSprite drew mirrored ends as a parallelogram and parallel ends as
a trapezoid — inverted from `SignedMiterAngle`'s convention. Loose
mitered stock on the floor draws right now too.) The hex frame stays on
its flat art until fastener derivation learns rotated slots.

## Equipment blueprints — **Now**

Phase 2's rest landed: the four worktable builds, the storage rack,
the tool drawers and material shelf, and the three saw jigs are
blueprints (`EquipmentBlueprintId`, registered beside the products but
keyed by what they grant). A `ProductBlueprint` now carries an `id`
and an optional `productType` — equipment has no product type, and
`assembleFromBlueprint` refuses it; the operation's `output()` keeps
granting `machineOutputs`/`upgradeOutputs`/tool items exactly as
before, so the commit path never changed. Two ideas carried the
conversions with no model extensions:

- **A table assembles upside down.** The blueprint is the build as a
  woodworker stages it: the top sheet face-down on layer 0, two rails
  on edge across its underside, the remaining leg boards as
  stretchers crossing the rails — one nail per sheet–rail seam and
  rail–stretcher crossing, all derived. The rack is the same shape in
  rack-grade sheets; the sleds sandwich runner–base–fence.
- **A blueprint may have no fasteners.** The material shelf is two
  planks laid side by side; nothing overlaps, so `deriveFasteners`
  yields none and the build commits the moment the last part seats
  (`BenchWorkSurface`'s all-seated effect). Laying on _is_ the build.

Slot requirements widened to sheet goods (typed as board stock with a
contained cast — every consumer that reads board fields only runs on
product blueprints), and a plan larger than the bench (48×48 on the
makeshift top) leans the scene back to hold it (the frame maxes in the
active blueprint's size). Jigs bill screws now — two per jig, derived —
where the legacy recipes charged nothing.

## The legacy conversions — **Now**

The row-surface tail is nearly gone; each fell to one small extension:

- **The seam rule.** `deriveFasteners` spaces fasteners along long
  overlaps (`FASTENER_SPACING_IN`, 16″): crossings keep their single
  pallet-style nail, a cleat seam takes a row, a laminated double top
  takes a grid. The **shelf** rode it (plank face-down, cleat on edge,
  three screws down the seam), and the equipment bills recounted
  honestly — the small worktables landed back on their original
  hand-set numbers.
- **Panel parts.** `AssembledPart.strips` records a glued-up part, and
  such parts draw through `PanelSprite`. The **serving tray** rode it:
  a six-strip bottom (exactly 12″ — the width its mitered wrap
  genuinely closes around) under two long rails and two 12″ ends.
  A build with a panel part reads its species off that face.
- **On-end placement.** `BenchPlacement.onEnd` / `BlueprintSlot.onEnd`:
  a standing board covers only its cross-section; F cycles flat →
  on edge → on end. The **side table** rode it, assembling upside
  down — top face-down, legs stood on end at its corners.
- **Rotated slots.** Slot angles left the square grid; a lap with a
  turned member derives its fastener by clipping the two rects
  (Sutherland–Hodgman) and bradding the centroid. The **hex frame**
  rode it: six rails at 60° steps on alternating layers, six brads at
  the skewed corner laps.

- **The jewelry box**, last of the row-surface tenants, landed
  jewelry-sized: 12″×6″×2″, seven parts of thin 2/4 stock in three
  cuts — two bottom slats, four lapped walls on edge, an off-center
  divider parting a ring well — eight derived brads. One 4′ board
  mills a whole box, walking the crosscut and rip offcuts down the cut
  list (the playthrough does exactly that). With it, `AssemblySurface`
  is retired and `interaction.blueprint` is required: every assembly
  is a blueprint.

## What stays for later phases
- **Phase 3**: parametric slot groups (a shelf unit 2–5 shelves tall,
  placement as a function of index and count — the shape
  `deckBoardXIn` already has), commissions that require attributes of
  the BOM ("at least 3 shelves", "oak rails"), pricing from parts.
- **North star**: a product that carries parts and fasteners can be
  _dismantled_ — `Pallet` stops being special, and prying nails out of
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
