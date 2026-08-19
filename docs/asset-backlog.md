# Asset Backlog

Most things in the shop view are drawn procedurally with PIXI `Graphics` —
rectangles, ellipses, and stroke calls in a `draw` callback. That was the
right way to get the game standing up, and for some objects it stays the
right answer forever. For the rest it caps how good the shop can look: a
hand-drawn asset carries wear, grain, and shadow that a stack of rounded
rects never will.

A second category wants replacing for a different reason: the AI-generated
pixel art standing in for the tool and consumable icons. That art is real
enough to ship and far better than the black square it replaced, but it is
placeholder — nobody drew it on purpose.

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
   `src/game/player-motion.ts`).
5. Tick the box below.

Objects whose contents vary (a rack of stock, a can of scrap) generally want
the _fixture_ as art with the contents still drawn on top — the asset
replaces the furniture, not what's sitting in it.

## The pixel-art exception

The tool icons are pixel art rather than the smooth flat-shaded style the
machines use, generated through the PixelLab MCP. They are placeholders —
see "Generated placeholders" below — but until they're replaced they
follow a different pipeline:

- **Trimmed to the content bounding box** before landing in
  `static/images/icons/`, because the sprites anchor at 0.5 and PixelLab
  centers loosely inside a padded canvas.
- Listed in `PIXEL_ART_ASSETS` in `loadAssets.ts`, which sets their
  `scaleMode` to `nearest` — a smooth upscale would otherwise blur the
  pixels away.

Mixing the two styles was a deliberate call, not an accident. Anything new
that isn't an icon should use the smooth 400×400 pipeline above. (The
furniture products that once shared this pipeline are gone for good:
blueprint-assembled products draw themselves from their parts —
`AssembledProductSprite` — and never get flat art.)

## Needs art

### Generated placeholders

Everything here already has art on screen — AI-generated through the
PixelLab MCP, committed as a stopgap. It renders, it reads, and it is not
what the game should ship with. Replacing one of these is a swap, not new
wiring: same path, same size, same component.

- [ ] Tool icons — `static/images/icons/tool-<id>.png`, 64×64, rendered by
      `ToolIcon` in `components/ItemIcon.tsx`. Ten of them: hammer, hand
      saw, drill, sanding block, random orbit sander, hand plane, finishing
      kit, crosscut sled, straight-line sled, dust bag. The same files
      double as the shop-floor sprite for a loose tool (`ToolItemSprite` in
      `material-sprites/`), so a tool without icon art (the circular saw)
      falls back to the default pile square on the floor
      too, and its store tile draws no picture at all — see
      `IDS_WITHOUT_ICON_ART` in `utils/uiImages.ts`, which is the list of
      what's missing.
- [ ] Consumable icons — `static/images/icons/consumable-<id>.png`, 64×64,
      rendered by `ConsumableIcon`. Three: nails, screws, mineral oil.
- [ ] Store-shelf icons for the things that aren't tools or consumables —
      `upgrade-vise`, `misc-barClamp`, `misc-broom`, and `misc-shopVac`.
      Same 64×64 icons directory, rendered by `UpgradeIcon` / `ClampIcon` /
      `BroomIcon` / `ShopVacIcon` in `components/ItemIcon.tsx`. Two
      upgrades have **no icon art at all** and fall back to a drawn
      placeholder: `toolDrawers` and `materialShelf` (listed in
      `uiImages.ts`'s no-art set) — a harder gap than the generated ones.
      Machines want no icon of their own: every one on the shelf shows its
      shop-floor art through `MACHINE_ICON_SRC`.

### Machines

- [x] Worktable — both sizes drawn (`workbench-2x2`, `-2x4`). Registered in
      `machine-sprites/worktable-art.ts`. Each table ships three layers off
      one drawing, plus an `@4x` close-up of each at 32 px/inch: - `-top` — the laminated top, filling the footprint edge to edge. - `-shadow` — the cast shadow, on a wider canvas so it can bleed.
      Drawn in a pass of its own _under every table's top_
      (`WorktableShadowLayer` in ShopView, and both passes in
      `BenchDiveView`), because tables get pushed together and a
      neighbour's shadow falling across the top butted against it would
      draw the very seam a flush top is avoiding. - `-complete` — the two flattened, used for `MACHINE_ICON_SRC`.

      **The top must be a hard-edged rect on exact integer pixel bounds,
                          filling the artboard**: 192×192 and 384×192 (8 px/inch; ×4 for the
                          close-ups). Both drawn tops measure exactly that. It matters because a half-transparent
                          edge sitting over the black shadow beneath reads as a hairline down
                          every seam where two tables butt — which is the one place this art
                          has to be precise, and the only place. (`-2x4-top` still carries a
                          1-px edge column at alpha 252, 241 on the close-up: a 1–5% softness
                          on one side, versus the 39–62% that was drawing a visible line —
                          invisible in play. Not worth an export on its own; worth squaring up
                          if that artboard is opened again.)

                          Shadows and completes are centred on even canvases so no shadow core
                          peeks out from under its own top.

                          Legs want to sit in from the corners so butted tables don't collide
                          visually; a top texture that tiles horizontally reads best across a
                          run. Vise and tool-drawer upgrades stay procedural overlays drawn on
                          the front edge (`WorktableSprite`'s `drawUpgrades`), over the art.

                          These are deliberately **not** in `scripts/trim-images.ts`, and don't
                          need to be: the tops are opaque corner to corner so there is nothing
                          to trim, and while the shadows and completes do carry a transparent
                          margin, trimming them would be harmless rather than helpful — the
                          script keeps every pixel with any alpha (soft halos survive) and
                          crops symmetrically about the canvas centre, which is the
                          registration these rely on. It would save a couple of kilobytes and
                          cost the ability to compare a top and its shadow by their canvases.

- [ ] Storage rack — `machine-sprites/StorageRackSprite.tsx`. Art for the
      empty rack; parked stock keeps its data-driven slat colors.
- [ ] Lumber shelf — `machine-sprites/LumberShelfSprite.tsx`. The starter
      2×1 shelf every shop opens with; art for the empty shelf, with
      parked stock keeping its data-driven board colors.
- [ ] Sawhorses — `machine-sprites/SawhorsesSprite.tsx`. Two folding horses
      seen from above, a couple of feet apart across a 3×2-ft span. The
      sheet lying across them is staged stock and keeps rendering through
      `MaterialSprite`, so the art is the bare pair — which is also why
      the horses have to read as empty when nothing is on them.
- [ ] Circular saw on the horses — the saw itself is a mounted tool and
      currently draws nothing at the station at all; it wants the same
      treatment as the table saw's jigs below.
- [x] Garbage can — `garbage-can.png`. A top-down lid view centered on the
      2×2-ft footprint; the collision circle in `garbageCan.ts` is hand-set
      to the can's measured 26.5" diameter. Contents still render through
      `MaterialSprite`.
- [x] Band saw — `bandsaw-14-lower/-fence/-upper.png`. Three layers so the
      fence can slide with the setting and the stock can pass between the
      table and the arm reaching over it; the blade sits at (245, 200) in
      the art, which is what `BandSawSprite` measures everything from.
      `bandsaw-14.png` is the three flattened together for the store shelf.
- [ ] Table saw jigs — `SledSprite` in
      `machine-sprites/JobsiteTableSawSprite.tsx`. The crosscut sled and
      the straight-line sled are shop-built jigs sitting on the saw.
- [ ] Dust bag — the dust bag in `views/MachineView.ts`.

### Props and fixtures

- [ ] Machine crate — `views/MachineCrateView.ts`.
- [ ] For-sale stand — `views/StandView.ts`. The little table and
      hand-written FOR SALE sign in the grass at the end of the driveway.
      Pieces set out on it keep rendering through `MaterialSprite`, so the
      art is the bare table and sign — and it has to read as empty when
      nothing is out.
- [ ] Customers — `views/CustomerView.ts`. The passersby on the
      sidewalk line are simple circles, deliberately plain for now; art
      would be a small set of top-down walkers, drawn to the player
      sprite's scale and style.
- [ ] Broom (resting) — `views/BroomView.ts`. Leans wherever it was
      set down; the tutorial points at it.
- [ ] Broom + dustpan (in hand) — `views/HeldBroomGraphics.ts`.
      Top-down handle + bristle bar + hip-riding dustpan (with a fill
      readout) drawn in the player's rotated frame, with the stroke sway
      animated procedurally; art would replace the handle/bar/pan
      shapes, the animation stays code.
- [ ] Shop vac — `views/ShopVacView.ts`. Drum and casters as art; the
      hose stretches to the player's hand every frame and stays drawn.
- [ ] Pallet — `views/material-sprites/pallet.ts`. Currently composed out of
      `createBoardSprite` boards. (`static/images/pallet.png` exists but serves the
      HTML UI's material widgets via `LOOSE_UI_IMAGES`, not the shop-view
      sprite.) Boards get pulled off one at a time, so the art has to
      survive a partially dismantled pallet — probably per-board art rather
      than one whole-pallet sprite.
- [ ] Floor tiles — `views/FloorView.ts`. Flat zinc rects under
      the concrete floor texture; likely folds into the floor art rather than
      becoming its own asset.
- [x] The lot — `views/EnvironmentView.ts`. The lawn tiles
      `grass.png` (tinted down to sit in the shop's palette) across the
      viewport, and the driveway tiles `asphalt.png` instead of borrowing
      the interior concrete. Both are photographic 2048² tiles scaled so
      one repeat covers a believable stretch of lot.
- [ ] Walls and garage door — `views/EnvironmentView.ts`. The stud
      walls, jambs, and threshold are flat bands. Art could carry siding,
      corner trim, and door tracks — but it has to follow an arbitrary shop
      footprint, so tiling strips rather than one sprite.
- [ ] Store racking and counter — `shell/scenes/store-views/StoreFixturesView.ts`. The
      big-box shelf bays, machine display pads, and checkout counter are
      rects on the planogram's footprints (the lumber and sheet piles
      already draw with the shop's own material sprites —
      `StoreMerchandiseLayer.tsx`). The fixture wants art with the DOM
      shelf tags still laid on top; sizes come from
      `game/store-layout.ts`, so tiling bay strips rather than one sprite.
- [ ] Storefront and lot — `shell/scenes/store-views/StoreEnvironmentView.ts`. Wall
      bands, glass panes, sidewalk, and stall paint, all flat fills on an
      arbitrary generated footprint — tiling strips, like the shop's walls.
- [ ] Other shoppers — `shell/scenes/store-views/StoreActorsView.ts`. The same
      circle-people as the sidewalk's customers; whatever art the customers
      get should walk the aisles too.
- [ ] Shopping cart — `shell/scenes/store-views/flatbed.ts`. Basket, handle,
      and parcels as rounded rects; wants a real cart with the parcels
      still drawn in it.
- [x] The light — `views/DaylightView.ts`. Procedural on purpose,
      and not art at all: one offscreen light mask, painted from the sun in
      `game/daylight.ts` and multiplied over the scene once. The building's
      shadow is a hard-edged slab subtracted from it; the lamp pool and the
      door spill are gradient fills added into it, soft-edged by their own
      gradients rather than by a filter. Nothing here could be a PNG — the
      shapes follow an arbitrary shop footprint and a moving sun.

## Needs a call

Open design questions — cutting-board glue-up patterns, end-grain slice
rings, and whether `DefaultMachineSprite` should be improved at all — live
in issue #125 now, where they can be discussed. (Every assembled product —
shelf, bookshelf, side table, hex frame, serving tray, jewelry box, and
friends — draws from its bill of materials via `AssembledProductSprite`
and needs no flat art; the flat sprites they once used are deleted.)

## Stays procedural

Decided — don't re-open these without a reason.

- **Board and sheet silhouettes, textured faces** — `createBoardSprite`
  and `drawSheetGood` (`views/material-sprites/`) draw their outlines
  procedurally (dimensions vary
  continuously — wavy unjointed edges, miter skews, true scale against
  `PIXELS_PER_INCH`) and fill the faces from photography under
  `assets/textures/materials/` (all CC0 or homemade), processed by
  `npm run process:textures` (the manifest in
  `scripts/process-textures.ts`). Source and shipped textures alike are
  foldered by material — one folder per species, one for sheet goods of
  every kind, and `shared` for overlays tied to no material, so adding a
  species means adding a folder and a manifest block. Sheets tile a
  seamless square per kind
  (`sheetFaceTextures.ts`); boards window a library of full-plank scans
  per species — every species has one (`boardFaceTextures.ts`). Edge
  strips exist for oak only; the other species draw their edge face as
  flat color until their strips land.
  The fill matrix windows the art by the piece's face region
  (`SheetFaceRegion` / `BoardFaceRegion`), which is what keeps a cut
  piece wearing the grain it was cut with. Board roughness is art too —
  grayscale wear maps multiplied over the face, fading as the board is
  milled. The weathered-gray veil and the sanded sheen stay procedural
  overlays on purpose — they're color states, not wood.
- **On-edge boards, panels, sheet edges** — `drawBoardOnEdge`,
  `drawPanel`, and the sheets' lamination/crumble edge strips are still
  fully procedural; the panel strips and on-edge boards are expected to
  pick up the board scans' art in a later pass.
- **Cut particles and the dust layers** — `CutParticles`, `DustLayer`,
  `DustMotionLayer`. Per-frame effects; the dust layer already bakes its
  stamps into a single `RenderTexture`.
- **Feeding masks** — `FeedingBoard`. The two `Graphics` there are masks for
  the infeed/outfeed reveal and never render.
- **Selection highlight** — `TARGET_HIGHLIGHT_FILTERS` in
  `views/targetHighlight.ts`, an outline shader (`pixi-filters`) hugging
  the target's silhouette. Worn by the targeted machine and by the pile E
  would pick up. UI drawn on the canvas, not art.
- **Kerf lines** — the cut lines in `JobsiteTableSawSprite` and
  `MiterSawSprite`, which track the animated blade.
- **Power cords and wall outlets** — `PowerCordLayer`
  (`views/power-cords.ts`). Every cord is a hash-seeded curve that
  re-routes to the nearest outlet whenever a machine moves; no fixed asset
  can follow that. The outlet plates are a few rectangles at outlet size.
- **Collision debug overlay** — `CollisionDebugLayer`. Dev-only, `?collision`.
- **Bench-view overlays** — the nail markers, pry-bar lever, glue beads,
  clamp bars, ghost outlines, fastener heads, and cut/kerf lines in
  `src/shell/scenes/bench/` (`BenchDiveView`, `BenchGlueView`,
  `BenchSawView`). Interaction UI drawn over the real material sprites at
  zoom — markers and state readouts, not art. The scratch-off brush in
  `BenchStrokeView` is a mask stamped into a `RenderTexture` and never
  renders directly.
- **Edge band** — the plane's edge-on strip (`BenchStrokeView`). The block plane's edge-on
  view of a board: a strip of the species' edge color with grain/saw
  marks, the same procedural language as the board renderers in
  `views/material-sprites/board.ts`, which own the faces.
- **Default material pile** — `DefaultMaterialPileSprite`. A black square,
  and now only ever reached by `UnknownMaterial` — the type-system escape
  hatch, which has nothing real to draw. Every product type has a sprite. If
  this square shows up in the shop, that's a bug, not missing art.

## Already done

For reference, so this doesn't get re-surveyed: benchtop jointer, lunchbox
planer, jobsite table saw (table and fence), miter saw (all three parts),
makeshift bench, the player, the concrete floor, and the door warning paint.

Hand-drawn art only. The generated pixel art is _not_ done — it's listed
under "Generated placeholders" above.
