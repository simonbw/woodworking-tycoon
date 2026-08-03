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
7. **The plan picker is diegetic**: a stack of shop drawings
   (`BlueprintStack`). The pulled sheet — blueprint blue, white line
   work, a title block — IS the selected plan; the rest of the stack
   shows as clickable sheet edges. Blueprint plans draw their real part
   layout; other plans draw their ingredients to scale.

## The first commission, grounded — **Now**

The rustic shelf was never nonsense — 2 stringers + 3 deck boards is a
classic pallet-wood ladder shelf — it just never *showed* it. Its
blueprint: two stringers run the long way as rails (layer 0), three
deck boards lie across them as shelves (layer 1), six derived nails at
the crossings (down from a hand-set 8; the consumables-chain numbers
follow). Drawn lying on its back, 48″ × 36″, the way it's built.

## What stays for later phases

- **Phase 2**: blueprints for the rest of the nailed rustic tier
  (birdhouse, crate, planter box with the drill driving screws — the
  fastener declares its consumable, so only the tool/animation/clip
  differ), the storage rack, and the worktable builds (their commit
  already differs only in granting machines). Until then those keep the
  legacy row surface (`AssemblySurface`).
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
