# Bench mini-games: the interface is your hands — Design

This doc captures the agreed design for interactive hand work — the zoomed
bench view where materials and tools are manipulated directly — so
implementation builds toward one vision instead of colliding with it.
Sections marked **Now** are built and live (the way
`docs/tools-and-surfaces.md` marks them); the rest stays design.

## The thesis

`docs/direct-feed-machines.md` reframed machines around "the interface is
the machine": physical settings, the stock deciding the cut, holding
`Space` because you are the one pushing the board through. Benches are the
half of the shop that reframe never reached — they still run on a plan
picker and an abstract progress bar.

This design completes the arc. Hand work happens in a **bench view**: a
zoomed-in look at the station's actual state — the staged stock, the
mounted tools — where the player performs the work with the pointer.
Sanding means moving the sander across the board. Pulling a nail means
prying that nail. Not six separate mini-games: one bench, one small gesture
vocabulary, and per-operation scripts that compose it.

## Decisions (settled — don't relitigate casually)

0. **The tool is the bench's mode selector.** (Amends the original
   "benches are honestly recipe-driven" stance — deliberately, after
   playtesting the pry pilot.) The bench top is the interface: mounted
   tools hang on a rail across the top of the zoomed view and are taken
   in hand by clicking; applying the held tool to a valid target IS the
   operation. A staged pallet offers its nails to the hammer with no
   plan selected — a bench takes any stock a bench recipe could want
   (`stageableMaterials` gives benches the direct-feed treatment), and
   the pallet wins the bench top over a lingering plan selection while
   it's staged. **Now this covers every single-piece tool job**: the
   sanding block (or orbit sander) strokes the very piece it's over,
   the plane offers the face when the board lies flat and the edge when
   it's stood on edge (the arrangement is the mode picker), and the
   hand saw ghosts its cut line along the half-foot detents under the
   pointer, R swinging the angle stop — the press marks the cut and
   starts it. The offer is pure and unit-tested
   (`bench-work/tool-work.ts`: held tool + piece + how it lies →
   operation), and the claim takes exactly the piece under the tool
   (`operateMachineAction`'s `BenchToolClaim`, mirroring direct-feed's
   inferred start — it works pieces out of the output bay too, so
   rework needs no restaging). Work lands _in place_: the mask, kerf,
   and finished piece render through the piece's persistent placement,
   and the finish commit hands the workpiece's spot to its outputs — a
   sanded board doesn't move, a sawn board parts into two pieces lying
   end to end at the mark (`inheritedBenchLayout`). Plans survive only
   where they genuinely choose between products: assembly builds.
   Glue-ups are plan-free too — clamps-first, below. Finishing converted with the finishing kit
   (`src/game/tools/finishingKit.ts`): the `finish*` recipes and the
   oil wipe are the kit's stroke operations, tool-first like sanding —
   the rag over a sanded blank offers the pickiest finish the panel
   satisfies (operation order in `finishing-operations.ts` is the
   tiebreak), and the oil spends its consumable at the claim then
   soaks hands-free. Tool work — pry, stroke, saw — is hidden from the plan
   picker entirely, and a stale selection of it (old saves) is inert.
   Freed boards stay lying on the bench (`inputMaterials`, real state)
   right where they were nailed, and the _arrangement_ — dragging, R to
   turn, F to flip — is real state too (`MachineState.benchLayout`, see
   decision 3's amendment): the same layout shows in the zoomed view
   and the shop view, and survives closing either.

1. **The mini-game is the only player path.** There is no player-facing
   "hold Space instead". Tests and debug tooling complete work through the
   same commit actions the bench view dispatches (see The commit-action
   split) — that hook is never exposed as UI.
2. **Performance affects speed, never quality.** A sloppy pass takes more
   strokes; it never produces a worse board. Outputs are computed from
   inputs and parameters exactly as today (`Operation.output`), so material
   identity, commission matching, and every existing test assertion stay
   deterministic. (This extends the brainstorm doc's settled "no finish
   quality levels".)
3. **Mid-action progress is ephemeral.** Refresh mid-sanding and the board
   starts that sanding pass over. Masks, glue beads, and tool positions are
   UI state, never saved. The one principled exception is rule 4.
   _Amended:_ where pieces **lie** on the bench is not mid-action progress
   — it's the state of the shop, like a machine's position on the floor.
   `MachineState.benchLayout` persists each staged piece's spot/turn/flip
   (written by the pry commit and by `arrangeBenchMaterialAction`), and
   both the bench view and the shop-floor sprite render from it. Only
   the in-flight gesture (the drag under the button) is view state.
4. **Work that grants resources commits incrementally; work that only
   transforms the workpiece commits atomically.** Each nail pried out of a
   pallet lands in `GameState.consumables` immediately — so the pallet must
   remember its remaining nails, or a refresh would re-arm it and become a
   nail mine. Sanding grants nothing until it's done, so abandoning it
   costs only the strokes. Glue-up resolves in between: the set-out
   clamps and the beads are ephemeral, and the single commit (claim the
   run, tie up the clamps, start the cure) fires when the last clamp is
   wound tight.
5. **Direct-feed machines are out of scope.** The planer, jointer, table
   saw, band saw, and miter saw already have their physical interface —
   settings, stock, held `Space`. They keep it. The bench is where the
   hand-work fantasy lives.
6. **Machines buy attention.** The guiding principle in
   `docs/tools-and-surfaces.md` — machines buy time, they don't gate
   products — gains a corollary. Hand interaction is the slow, cheap,
   engaging path; better tools shrink the interaction (sanding block →
   random orbit sander is a wider, faster brush, not a multiplier on a
   bar — and a _powered_ brush: `powered` on the stroke interaction
   means the pad does its own scrubbing, so the sander keeps cutting
   while it rests on a spot, where the block only cuts while it moves);
   a real machine removes the mini-game entirely. Buying equipment
   literally buys back your hands.

## The gesture vocabulary — **Now**

Three primitives, pointer-driven, composed per operation:

- **Stroke** — drag a tool across the workpiece, tracked as continuous
  coverage: sanding, planing, saw push-pull, spreading glue.
- **Point** — press a marked target: driving a nail or screw, placing a
  clamp, prying a nail (a press-and-lever variant), snapping a component
  onto its ghost outline.
- **Mark** — position a line or a piece before committing to it: the hand
  saw's cut line. (`cutPosition` with `presentation: "slide"` and the
  miter saw's ghosted board are the precedent — the same idea zoomed in.)

Keeping the vocabulary this small is the point: one input framework, one
tuning surface, and each new operation is a script over existing verbs
rather than a new engine.

## The coverage mask (stroke work) — **Now**

**Now**: `src/game/bench-work/coverage.ts` (the accumulation grid, the
98% threshold, the saw's kerf mask) with the RenderTexture scratch-off in
`src/components/bench-view/StrokeSurface.tsx`. One addition the design
didn't call: the grid tracks average accumulation alongside saturated
cells, because a % readout that sits at zero through the first thin pass
reads as broken — completion still requires 98% _saturated_.

Stroke work renders as a per-pixel transition — the rough texture visibly
giving way to the smooth one under the tool:

- **Visual layer**: the workpiece draws its two surface states stacked,
  the upper erased through a PIXI `RenderTexture`. Each frame of active
  stroking stamps a soft brush at the pointer. Standard scratch-off
  rendering; one draw call per stamp.
- **Accounting layer**: completion never reads pixels back from the GPU
  (readback stalls the pipeline). A CPU-side accumulation grid at a few
  pixels per cell is bumped analytically as stamps land; the operation
  completes when coverage crosses **98%**, so the last sliver of edge
  never holds the board hostage. The grid math is a pure function —
  stamps in, coverage out — and unit-testable.
- **The work budget**: brush radius and per-stamp accumulation come from
  the tool (block = narrow and slow, orbit sander = wide and fast), and
  total area comes from the actual workpiece dimensions — a glued-up
  panel genuinely takes longer than a strip. For interactive operations
  `Operation.duration` stops meaning "ticks of held Space" and is
  reinterpreted as this budget. Expect to retune it after playtesting;
  it is the whole repetition curve now.

The same engine covers the block plane (strokes constrained to an edge
band, shavings instead of dust) and the hand saw (a 1-D mask along the
marked line, deepened by push–pull strokes).

## The commit-action split — **Now**

**Now**: `src/game/game-actions/operation-actions.ts` — start is still
`operateMachineAction`; `finishAttendedWorkAction` is the extracted
completion (or the handoff into a hands-free remainder);
`machineTickPass` calls the same `completeOperation`/grant application.
Operations declare their script via `Operation.interaction`, and the
tick never advances a declared operation's attended phase. Dev builds
expose the commits as `__START_OPERATION__` / `__FINISH_ATTENDED_WORK__`
/ `__PRY_PALLET_NAIL__` for tests and debug tooling — never as UI.

The bench view decides _when_; actions decide _what_. Every interactive
operation gets two commit points in `game-actions/`:

- **Start**: claims inputs, spends `requiredConsumables`, ties up
  the clamps the stock's length derives (`clampsFor`) — everything
  operation start already does today.
- **Finish**: the completion block currently at the bottom of
  `machineTickPass` — `op.output(materials, resolvedParameters)`, XP,
  sound events, granted machines/upgrades — extracted into an action the
  bench view dispatches at completion.

Between the two, resource-granting scripts may dispatch incremental
actions (per-nail salvage, throttled dust emission — see below).
`tickAction` keeps only what runs without you: hands-free phases (glue
curing, and someday kilns and finishes) tick exactly as today, entered by
the glue-up's finish commit. Operations without an interactive script
keep the legacy attended-tick behavior until converted — an op-by-op
migration path — but conversion should land in coherent batches (all
sanding at once), so the shop never has two arbitrarily-assigned
interaction registers.

The world does not stop for the bench view. Overlays never stop the world
(only the pause menu does), and the player is standing at the station the
whole time — the planer keeps power-feeding, glue keeps curing, dust
keeps settling.

**Dust and foley don't wait for the commit.** Active stroking dispatches
a throttled dust-emission action (reusing `emitMachineDust`, on the order
of twice a second) so the dust simulation — slowdown, sweeping — stays
honest, and continuous tool foley runs UI-side the way `UiSoundLayer`
works, with the completion stinger going through the `SoundEvent` queue
as usual.

## Pallet dismantling: progressive transformation — **Now**

The richest script, and the pilot for incremental commits — and, since
the tool-in-hand rework, the pilot for decision 0. Dismantling is
modeled as the pallet instance transforming nail by nail:

- No plan is selected: the staged pallet is the offer. The player takes
  the hammer off the rail (it becomes the cursor, nails light up) and
  presses a nail; a short lever animation — a rotation about the claw,
  not a swing — paces the pull, then the commit lands.
- The nails are pallet state (`Pallet.nails`): one at every crossing of
  a present deck board and a present stringer, so every nail is in two
  boards and joins exactly them. They render in both views from the
  same geometry (`palletNailPosition` inside `PalletSprite`), so the
  shop floor shows the same half-pried pallet the bench view does.
- Each face only presents its own side's nail heads: top-deck nails on
  the top, bottom-deck nails underneath. The pallet is a piece like any
  other — its placement lives in `MachineState.benchLayout` (default:
  squarely centered), it drags, R turns it, F flips it (also with the
  hammer in hand) — and flipping it over is how the bottom boards'
  nails come on offer. Berths, nails, and hit tests all carry through
  the placement (`palletPointOnBench` / `berthPlacementOnBench`).
- Z-order is physical: a freed board lying untouched on its berth keeps
  its place inside the pallet's layer stack (a stringer slid out of the
  sandwich stays under the deck boards), and only moved pieces ride on
  top. E takes the piece under the pointer, not the first in the bay.
- Each pry is an action: the nail leaves `Pallet.nails`, `+1 nail` to
  consumables (each one flies to the supplies tally and clinks in —
  `flyToSupply`).
- A board comes free the moment its _last_ nail comes out — never
  before, and the very last nail on a crossing frees its deck board and
  its stringer together. The freed board stays lying on the bench where
  it was nailed (`inputMaterials`, so the next plan's `stagedPieces`
  finds it) — mid-job you hold a genuinely half-stripped pallet plus
  loose boards, all real state. The shared layout lives in
  `src/game/bench-work/pallet-geometry.ts`, so the floor sprite, the
  bench scene, and the freed board's berth can never disagree (a freed
  board's id is its slot id, which is also its sprite seed — the grain
  doesn't change when the board drops).
- Refresh mid-dismantle and you resume at the exact nail you left —
  not because mini-game state was saved, but because every pull _was_
  game state — the dragged-around arrangement included
  (`MachineState.benchLayout`, decision 3's amendment).

## Script sketches for the rest — **Now**

| Activity    | Script                                                                                                                         | Lands on                                                                                                                                                                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sanding     | strokes to 98% coverage                                                                                                        | `surface` rough→smooth→sanded; tool tiers = brush feel; dust per stroke                                                                                                                                                                                                                                                     |
| Hand saw    | mark the line, then push–pull strokes deepen the kerf                                                                          | shares the miter saw's parameterized crosscut operation — same outputs, zoomed presentation                                                                                                                                                                                                                                 |
| Block plane | strokes along a face or edge                                                                                                   | `jointedFaces`/`jointedEdges` axes and their prerequisites, unchanged                                                                                                                                                                                                                                                       |
| Glue-up     | clamps set out on the scene → stock laid across them edge to edge (the run decides the recipe, like direct-feed stock) → glue stroked down each seam → tightening the last clamp commits into the hands-free cure | `bench-work/glue-up.ts` (run detection, credited-recipe inference, clamps = one per foot of length, min two)                                                                                                                                                                                                                |
| Assembly    | snap components onto ghost outlines → drive fasteners, one per `requiredConsumables`                                           | ghost rendering precedent from the miter saw; drill vs hammer picks the animation. _Superseded for blueprint products:_ recipes with a `ProductBlueprint` assemble on the bench scene itself — real parts laid on ghost slots, one nail per crossing — see `docs/assembly.md`; the generic row surface remains for the rest |

Note how many target counts already live in — or derive from — the data
(clamps from the stock's length, `requiredConsumables`, pallet nail
yields): the scripts mostly reveal numbers the simulation already has.

## The bench view itself — **Now**

**Now**: `src/components/bench-view/` — Tab at a bench fills the whole
window with the shop itself, leaned into: one measured PIXI
`Application` at device resolution (no fixed logical size, no CSS
upscale — `stageMath.fitToStage` takes the real rect) draws the same
concrete floor the shop view tiles and the _same bench art_ the shop
floor uses (`BenchSceneBackdrop`: `makeshift-bench.png`
nearest-sampled for the starting bench, the `WorktableSprite` vectors
for built tables), so the zoomed bench and the floor bench are one
asset at two zooms. The bench's contents lie on it exactly where
`MachineState.benchLayout` says (`BenchScene`, turns and flips tweened;
a board flipped up on edge with F narrows to its thickness,
`BoardOnEdgeSprite`), stroke and saw work runs on those very pieces in
place (`StrokeSurface` / `SawSurface` mount over the scene at the
piece's placement; nothing takes the surface over anymore), the
mounted tools hang on a floating rail
(`BenchToolRail` — which is also where tools mount and unmount: empty
hooks take a compatible carried tool), and the chrome floats: nameplate
top-left, instruction + key hints bottom-center, the plan picker as a
diegetic pile of blueprint sheets bottom-right (`BlueprintCorner`,
folded by default — the pulled drawing is the selection and its title
block reads supplies against shop stock), and a worktable's
shelf/upgrades in an "Under the bench" drawer bottom-left
(`UnderBenchPanel`). There is no paperwork card and no input/output
diagram: a bench top holds stock, not bays.
The camera zoom-in transition has landed too (see below). Every
operation listed in the rollout is converted, and so are the batches
that used to trail it: the finishing recipes are the finishing kit's
stroke work, and the shop-furniture and jig builds are blueprint
assemblies (`bench-work/blueprint.ts` — equipment blueprints, keyed by
what they grant: the four worktables, the storage rack, the tool
drawers and material shelf, the three saw jigs). An equipment build
lays out and fastens exactly like a product build; its commit grants
the machine, upgrade, or jig instead of leaving a product on the
bench, and the builds lie upside down on the plan — top face-down,
understructure nailed across it. A blueprint with no fasteners at all
(the material shelf: two planks side by side) commits the moment the
last part is laid on its outline. The one attended-tick hold left at a
bench is the garbage can's Empty; every recipe at a real bench is your
hands. The legacy row assemblies followed batch by batch — the shelf
(seam-spaced fasteners), the serving tray (panel parts), the side
table (boards standing on end; F cycles flat → edge → end), the hex
frame (rotated slots, laps clipped as polygons), and finally the
jewelry box, re-cut to jewelry size (12"×6", seven thin parts). With
that, `AssemblySurface` and the row layout for assembly are retired and
`interaction.blueprint` is required. Glue-ups then joined the scene as
the last conversion (`bench-work/glue-up.ts`, `GlueUpLayer`): no plan is
ever selected — bar clamps are set out on the bench top (one per foot of
the stock's length, minimum two, `clampsForGlueSpan`), glue-ready stock
is laid across them edge to edge, and the contiguous run that forms is
the operation, exactly as the stock on a direct-feed machine decides the
cut. The composition picks the credited recipe (`inferGlueOperationId`:
boards are a panel, a bare pair/panel-extend/panel-join is freeform
lamination's, four slices are the end-grain blank — a locked composition
simply never forms a run), the bottle strokes a bead down each open
seam, and winding the last clamp tight is the single commit
(`startGlueUpAction` claims the very pieces in the clamps, in across
order) straight into the hands-free cure, drawn in place with the bars
wound home (`GlueCuringLayer`). `GlueSurface` is deleted; no takeover
surface remains.

`src/components/bench-view/` — an overlay in the Phone/Journal/Clipboard
family; diegetically, leaning over the bench. Entered with `Tab` at a
bench, evolving `StationSheet` rather than adding a key: the plan picker
survives inside it as the sheet of paper pinned to the bench (benches
are honestly recipe-driven; that doesn't change). Inside, its own PIXI
stage renders the machine's actual state at high zoom — staged stock via
the material sprites scaled up, mounted tools on their hooks. Closing it
abandons any uncommitted work per decision 3. Opening and closing are
performed by a camera zoom (`bench-view/benchZoom.tsx`), pure
presentation the way `truckStageStore` performs the truck: both views
draw the same bench from the same state, so the whole transition is one
similarity transform on the bench view's stage — `benchZoomAnchor` maps
the finished scene onto the bench's on-screen footprint in the shop view
(via `shop-view/shopFrameStore.ts` and the machine's floor rotation, so
a turned bench squares up as you lean in), and `BenchZoomRig` eases that
transform to identity on the PIXI ticker, reversibly, while the room
dims and the chrome settles in behind it (CSS fades keyed off the same
stages, the chrome `inert` until the lean-in lands). Closing runs the
ramp backwards: `StationSheet` holds the surface mounted as a departing
theater — no `station-sheet` testid, no pointer targets, input gated the
whole way — until the rig reports the pull-back landed. The world never
stops for any of it. `prefers-reduced-motion` skips straight to the end
states, which is also how the E2E suite runs (`reducedMotion: "reduce"`
in the Playwright config): the specs drive surfaces, not choreography,
and `bench.spec` pins the landed stage via `data-zoom="open"`.

This is the game's first pointer-primary surface (the floor is
keyboard-first; `Person.sweepAim` is the one pointer precedent). Assist
options — bigger brush, lower threshold — are deliberately deferred, but
nothing in the design forecloses them: they're per-script constants.

## Testing — **Now**

- **Unit**: commit actions, the pallet transform, accumulation-grid math.
- **Sequence**: `ShopDriver` grows `performWork(machine)` — start + finish
  through the real commit actions, no mini-game in between. This amends
  the driver's charter from "anything it can do a player can do" to
  "it commits through the same actions the mini-game commits through";
  update CLAUDE.md's testing section when the first interactive op lands.
  The progression ledger keeps working unchanged.
- **E2E**: a seventh spec file, `bench.spec.ts` — the bench view is a
  genuinely new kind of interface, which is the bar CLAUDE.md sets. Test
  exactly one real canvas drag per gesture type (one stroke, one pry);
  canvas drags are the flakiest tool in the box, so everything else sets
  up through fixtures and asserts on wiring, not feel.

## Rollout order

1. **Sanding** — pilots the mask engine, the commit split, and the bench
   view shell. (The pilot pattern the planer served for direct-feed.) **Now**
2. **Pallet dismantling** — pilots incremental commits and the material
   state change; the game's opening minutes get the biggest win. **Now**
3. **Hand saw + block plane** — reuse the mask engine. **Now**
4. **Glue-up** — pilots ephemeral-until-last-clamp and the hands-free
   handoff. **Now** — and re-landed clamps-first on the scene itself,
   plan-free (see above); the takeover surface it piloted is gone.
5. **Assembly** — last; per-recipe component layouts are the long-tail
   authoring cost. Mitigation: a generic derived layout (components in a
   row, fasteners at the joints), hand-authored art only for hero
   products. **Now** — and superseded where a product has a
   `ProductBlueprint` (the rustic shelf): the authored layout turned out
   cheap (a dozen lines of slots; fasteners derive), and it buys the
   real place-and-nail build plus the product drawn from its own parts.
   See `docs/assembly.md` for that whole design.

## Open questions

- The per-op work budgets (seconds of stroking the fiftieth sanding pass
  deserves) — one tunable constant per script from day one, revised after
  playtesting.
- Whether the first pallet teardown should force the zoomed view as the
  tutorial beat, or trust the prompt chip.
- Whether per-nail salvage pacing needs a cap so mashing isn't optimal
  (a short pry animation per nail probably solves it for free).
