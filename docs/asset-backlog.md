# Asset Backlog

Most things in the shop view are drawn procedurally with PIXI `Graphics` —
rectangles, ellipses, and stroke calls in a `draw` callback. That was the
right way to get the game standing up, and for some objects it stays the
right answer forever. For the rest it caps how good the shop can look: a
hand-drawn asset carries wear, grain, and shadow that a stack of rounded
rects never will.

This file is the standing list of what still wants real art, so the work is
tracked without minting a GitHub issue per sprite. Tick a box in the same
commit that lands the asset.

## Making an asset

1. Draw it and export the PNG at **400×400** (not the 72pt canvas size) into
   `static/images/`. The renderer runs at the scaled canvas resolution, so
   the extra resolution shows up as real detail.
2. Register the path in `TEXTURE_ASSETS` in `src/utils/loadAssets.ts`.
3. Swap the component's `<pixiGraphics draw={...} />` for a `<pixiSprite>`
   using `useTexture(path)` and `IMAGE_SCALE` — see `JointerSprite.tsx` for
   the minimal shape of this.
4. **Machines only:** re-run `npm run generate:collision-boxes`. Collision
   boxes for image-based machines are measured from the art; procedurally
   drawn machines carry hand-set boxes that the generator ignores, so a
   machine changes hands between the two the moment it gets a sprite (see
   `docs/continuous-movement.md`).
5. Tick the box below.

Objects whose contents vary (a rack of stock, a can of scrap) generally want
the *fixture* as art with the contents still drawn on top — the asset
replaces the furniture, not what's sitting in it.

## Needs art

### Machines

- [ ] Worktable — `machine-sprites/WorktableSprite.tsx`. Spans an arbitrary
      `cellsOccupied` bounding box, so this needs either a size set or a
      tiling/9-slice top. Vise and tool-drawer upgrades are drawn on the
      front edge and could stay procedural overlays.
- [ ] Storage rack — `machine-sprites/StorageRackSprite.tsx`. Art for the
      empty rack; parked stock keeps its data-driven slat colors.
- [ ] Garbage can — `machine-sprites/GarbageCanSprite.tsx`. Contents already
      render through `MaterialSprite`.
- [ ] Table saw sleds — `SledSprite` in
      `machine-sprites/JobsiteTableSawSprite.tsx`. Crosscut and straight-line
      sleds are separate shop-built jigs sitting on the saw table.
- [ ] Dust bag — `DustBagSprite` in `shop-view/MachineSprite.tsx`.

### Props and fixtures

- [ ] Machine delivery crate — `shop-view/MachineCrateSprite.tsx`.
- [ ] Broom — `shop-view/BroomSprite.tsx`. Pure set dressing, but the
      tutorial points at it.
- [ ] Shop vac — `shop-view/ShopVacSprite.tsx`. Drum and casters as art; the
      hose stretches to the player's hand every frame and stays drawn.
- [ ] Pallet — `material-sprites/PalletSprite.tsx`. Currently composed out of
      `BoardSprite`s. There is already an unused `static/images/pallet.png`.
      Boards get pulled off one at a time, so the art has to survive a
      partially dismantled pallet — probably per-board art rather than one
      whole-pallet sprite.
- [ ] Floor tiles — `shop-view/FloorTileSprite.tsx`. Flat zinc rects under
      the concrete floor texture; likely folds into the floor art rather than
      becoming its own asset.

### Finished products

Fixed-form objects that happen to be tinted by species — good candidates for
one asset plus a tint, the way `MaterialSprite` already passes `tint` down.

- [ ] Boxes: jewelry box, birdhouse, crate, step stool —
      `material-sprites/FinishedBoxSprite.tsx` (one sprite serves all four
      today).
- [ ] Picture frame and hex frame — `material-sprites/PictureFrameSprite.tsx`.
- [ ] Planter box — `material-sprites/PlanterBoxSprite.tsx`.
- [ ] Serving tray — `material-sprites/CuttingBoardSprite.tsx`.

## Needs a call

Form is fixed but the surface is generated from game data, so an asset only
works with an overlay or a mask. Decide per item when we get there.

- Cutting boards: simple, striped, sunrise, end-grain, checkerboard —
  `material-sprites/CuttingBoardSprite.tsx`. The glue-up pattern *is* the
  product, and it comes from the species the player laminated. Possibly art
  for the silhouette, edge, and finish sheen with the pattern drawn inside.
- End-grain slice — `material-sprites/EndGrainSliceSprite.tsx`. Same tension:
  the ring pattern is the point.
- Default machine fallback — `DefaultMachineSprite` in
  `shop-view/MachineSprite.tsx`. A brown square standing in for any machine
  with no sprite. Better art makes missing art harder to notice, which may be
  the wrong incentive.

## Stays procedural

Decided — don't re-open these without a reason.

- **Boards, on-edge boards, panels, sheet goods** —
  `BoardSprite`, `OnEdgeBoardSprite`, `PanelSprite`, `SheetGoodSprite`.
  Length, width, species, and surface condition all vary continuously, and
  the sprite is drawn at true scale against `PIXELS_PER_INCH`. No fixed-size
  asset can cover that space.
- **Sawdust piles** — `SawdustPileSprite`. Size and color come from the
  swept species mix.
- **Cut particles and the dust layer** — `CutParticles`, `DustLayer`.
  Per-frame effects; the dust layer already bakes its stamps into a single
  `RenderTexture`.
- **Feeding masks** — `FeedingBoard`. The two `Graphics` there are masks for
  the infeed/outfeed reveal and never render.
- **Selection highlight** — `MachineSelectionHighlight` in `MachineSprite`.
  UI drawn on the canvas, not art. Follows an arbitrary footprint.
- **Kerf lines** — the cut lines in `JobsiteTableSawSprite` and
  `MiterSawSprite`, which track the animated blade.
- **Collision debug overlay** — `CollisionDebugLayer`. Dev-only, `?collision`.
- **Default material pile** — `DefaultMaterialPileSprite`. A deliberate
  placeholder for material types with no sprite.

## Already done

For reference, so this doesn't get re-surveyed: benchtop jointer, lunchbox
planer, jobsite table saw (table and fence), miter saw (all three parts),
makeshift bench, the player, the concrete floor, and the door warning paint.
