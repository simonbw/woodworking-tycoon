# Asset Backlog

Most things in the shop view are drawn procedurally with PIXI `Graphics` —
rectangles, ellipses, and stroke calls in a `draw` callback. That was the
right way to get the game standing up, and for some objects it stays the
right answer forever. For the rest it caps how good the shop can look: a
hand-drawn asset carries wear, grain, and shadow that a stack of rounded
rects never will.

A second category wants replacing for a different reason: the AI-generated
pixel art standing in for furniture products and for the tool and consumable
icons. That art is real enough to ship and far better than the black square
it replaced, but it is placeholder — nobody drew it on purpose.

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

## The pixel-art exception

The furniture products (shelf, side table) break
the rules above: they are pixel art rather than the smooth flat-shaded style
the machines use, generated through the PixelLab MCP. They are placeholders
— see "Generated placeholders" below — but until they're replaced they
follow a different pipeline:

- Exported at **`PIXELS_PER_INCH`** (4 px/inch), not 8, and drawn at scale 1
  so texture pixels land on world pixels. A 400×400 export downscaled by
  `IMAGE_SCALE` would blur the pixels away.
- **Trimmed to the content bounding box** before landing in `static/images/`,
  because the sprites anchor at 0.5 and PixelLab centers loosely inside a
  padded canvas.
- Listed in `PIXEL_ART_ASSETS` in `loadAssets.ts`, which sets their
  `scaleMode` to `nearest` — the shop's fit-to-column upscale would
  otherwise smooth them.
- Drawn in a neutral wood and **tinted by species** at render time, so one
  asset serves all nine species. See `material-sprites/FurnitureSprite.tsx`.

Mixing the two styles was a deliberate call, not an accident. Anything new
that isn't furniture should still use the smooth 400×400 pipeline above.

## Needs art

### Generated placeholders

Everything here already has art on screen — AI-generated through the
PixelLab MCP, committed as a stopgap. It renders, it reads, and it is not
what the game should ship with. Replacing one of these is a swap, not new
wiring: same path, same size, same component.

- [ ] Furniture products: shelf, side table —
      `static/images/{shelf,side-table}.png`, drawn by
      `material-sprites/FurnitureSprite.tsx`. Pixel art against the smooth
      machines, so the shop floor is currently mixed-style. A replacement
      wants the neutral-wood treatment kept so the species tint still works,
      and should be trimmed to its content box. Sizes today: 79×15,
      49×51 at 4 px/inch. Update `FURNITURE_ICON_FIT` in
      `FurnitureSprite.tsx` if the dimensions change. (The rustic shelf and
      the bookshelf left this list on purpose: blueprint-assembled products
      draw themselves from their parts — `AssembledProductSprite` — and
      should never get flat art.)
- [ ] Tool icons — `static/images/icons/tool-<id>.png`, 64×64, rendered by
      `ToolIcon` in `components/ItemIcon.tsx`. Nine of them: hammer, hand
      saw, drill, sanding block, random orbit sander, hand plane, crosscut
      sled, straight-line sled, dust bag. The same files double as the
      shop-floor sprite for a loose tool (`ToolItemSprite` in
      `material-sprites/`), so a tool without icon art (the resaw fence)
      falls back to the default pile square on the floor too.
- [ ] Consumable icons — `static/images/icons/consumable-<id>.png`, 64×64,
      rendered by `ConsumableIcon`. Three: nails, screws, mineral oil.
- [ ] Store-shelf icons for the things that aren't tools or consumables —
      `upgrade-vise`, `misc-barClamp`, and `misc-shopVac`. Same 64×64 icons
      directory, rendered by `UpgradeIcon` / `ClampIcon` / `ShopVacIcon` in
      `components/ItemIcon.tsx`. Machines want no icon of their own: every
      one on the shelf shows its shop-floor art through `MACHINE_ICON_SRC`.

### Machines

- [ ] Worktable — `machine-sprites/WorktableSprite.tsx`. Spans an arbitrary
      `cellsOccupied` bounding box, so this needs either a size set or a
      tiling/9-slice top. Vise and tool-drawer upgrades are drawn on the
      front edge and could stay procedural overlays.
- [ ] Storage rack — `machine-sprites/StorageRackSprite.tsx`. Art for the
      empty rack; parked stock keeps its data-driven slat colors.
- [x] Garbage can — `garbage-can.png`. A top-down lid view centered on the
      2×2-ft footprint; the collision circle in `garbageCan.ts` is hand-set
      to the can's measured 26.5" diameter. Contents still render through
      `MaterialSprite`.
- [x] Band saw — `bandsaw-14-lower/-fence/-upper.png`. Three layers so the
      fence can slide with the setting and the stock can pass between the
      table and the arm reaching over it; the blade sits at (245, 200) in
      the art, which is what `BandSawSprite` measures everything from.
      `bandsaw-14.png` is the three flattened together for the store shelf.
- [ ] Table saw jigs — `SledSprite` and `TallFenceSprite` in
      `machine-sprites/JobsiteTableSawSprite.tsx`. Crosscut sled,
      straight-line sled, and the tall resaw fence are shop-built jigs
      sitting on (or bolted to) the saw.
- [ ] Dust bag — `DustBagSprite` in `shop-view/MachineSprite.tsx`.

### Props and fixtures

- [ ] Machine delivery crate — `shop-view/MachineCrateSprite.tsx`.
- [ ] Broom (resting) — `shop-view/BroomSprite.tsx`. Leans wherever it was
      set down; the tutorial points at it.
- [ ] Broom + dustpan (in hand) — `shop-view/HeldBroomSprite.tsx`.
      Top-down handle + bristle bar + hip-riding dustpan (with a fill
      readout) drawn in the player's rotated frame, with the stroke sway
      animated procedurally; art would replace the handle/bar/pan
      shapes, the animation stays code.
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
- [x] The lot — `shop-view/EnvironmentLayer.tsx`. The lawn tiles
      `grass.png` (tinted down to sit in the shop's palette) across the
      viewport, and the driveway tiles `asphalt.png` instead of borrowing
      the interior concrete. Both are photographic 2048² tiles scaled so
      one repeat covers a believable stretch of lot.
- [ ] Walls and garage door — `shop-view/EnvironmentLayer.tsx`. The stud
      walls, jambs, and threshold are flat bands. Art could carry siding,
      corner trim, and door tracks — but it has to follow an arbitrary shop
      footprint, so tiling strips rather than one sprite.

### Finished products

Fixed-form objects that happen to be tinted by species — good candidates for
one asset plus a tint, the way `MaterialSprite` already passes `tint` down.

- [ ] Jewelry box — `material-sprites/FinishedBoxSprite.tsx` (the last
      product it serves; the crate, planter box, step stool, bookshelf,
      birdhouse, and picture frame now draw from their bills of materials
      via `AssembledProductSprite`, procedural on purpose).
- [ ] Hex frame — `material-sprites/PictureFrameSprite.tsx` (the last
      frame it serves; a hex blueprint waits on rotated-slot fastener
      derivation).
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
- **Cut particles and the dust layers** — `CutParticles`, `DustLayer`,
  `DustMotionLayer`. Per-frame effects; the dust layer already bakes its
  stamps into a single `RenderTexture`.
- **Feeding masks** — `FeedingBoard`. The two `Graphics` there are masks for
  the infeed/outfeed reveal and never render.
- **Selection highlight** — `TARGET_HIGHLIGHT_FILTERS` in
  `shop-view/targetHighlight.ts`, an outline shader (`pixi-filters`) hugging
  the target's silhouette. Worn by the targeted machine and by the pile E
  would pick up. UI drawn on the canvas, not art.
- **Kerf lines** — the cut lines in `JobsiteTableSawSprite` and
  `MiterSawSprite`, which track the animated blade.
- **Power cords and wall outlets** — `PowerCordLayer`
  (`shop-view/power-cords.ts`). Every cord is a hash-seeded curve that
  re-routes to the nearest outlet whenever a machine moves; no fixed asset
  can follow that. The outlet plates are a few rectangles at outlet size.
- **Collision debug overlay** — `CollisionDebugLayer`. Dev-only, `?collision`.
- **Bench-view overlays** — the nail markers, pry-bar lever, glue beads,
  clamp bars, ghost outlines, fastener heads, and cut/kerf lines in
  `src/components/bench-view/` (`PrySurface`, `GlueSurface`,
  `AssemblySurface`, `SawSurface`). Interaction UI drawn over the real
  material sprites at zoom — markers and state readouts, not art. The
  scratch-off brush in `StrokeSurface` is a mask stamped into a
  `RenderTexture` and never renders directly.
- **Edge band** — `bench-view/EdgeBandSprite`. The block plane's edge-on
  view of a board: a strip of the species' edge color with grain/saw
  marks, the same procedural language as `BoardSprite`, which owns the
  faces.
- **Default material pile** — `DefaultMaterialPileSprite`. A black square,
  and now only ever reached by `UnknownMaterial` — the type-system escape
  hatch, which has nothing real to draw. Every product type has a sprite. If
  this square shows up in the shop, that's a bug, not missing art.

## Already done

For reference, so this doesn't get re-surveyed: benchtop jointer, lunchbox
planer, jobsite table saw (table and fence), miter saw (all three parts),
makeshift bench, the player, the concrete floor, and the door warning paint.

Hand-drawn art only. The generated pixel art is *not* done — it's listed
under "Generated placeholders" above.
