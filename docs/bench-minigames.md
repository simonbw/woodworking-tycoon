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
   it's staged. Plans survive only where they genuinely choose between
   products: builds (glue-ups, assemblies) and, until their scripts
   convert, the legacy finishing recipes. Pry work is hidden from the
   plan picker entirely. Freed boards stay lying on the bench
   (`inputMaterials`, real state) right where they were nailed; their
   *arrangement* — dragging, R to turn, F to flip — is view state per
   decision 3.

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
4. **Work that grants resources commits incrementally; work that only
   transforms the workpiece commits atomically.** Each nail pried out of a
   pallet lands in `GameState.consumables` immediately — so the pallet must
   remember its remaining nails, or a refresh would re-arm it and become a
   nail mine. Sanding grants nothing until it's done, so abandoning it
   costs only the strokes. Glue-up resolves in between: spreading and
   clamping are ephemeral, and the single commit (spend glue, tie up
   clamps, start the cure) fires when the last clamp goes on.
5. **Direct-feed machines are out of scope.** The planer, jointer, table
   saw, band saw, and miter saw already have their physical interface —
   settings, stock, held `Space`. They keep it. The bench is where the
   hand-work fantasy lives.
6. **Machines buy attention.** The guiding principle in
   `docs/tools-and-surfaces.md` — machines buy time, they don't gate
   products — gains a corollary. Hand interaction is the slow, cheap,
   engaging path; better tools shrink the interaction (sanding block →
   random orbit sander is a wider, faster brush, not a multiplier on a
   bar); a real machine removes the mini-game entirely. Buying equipment
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
reads as broken — completion still requires 98% *saturated*.

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

The bench view decides *when*; actions decide *what*. Every interactive
operation gets two commit points in `game-actions/`:

- **Start**: claims inputs, spends `requiredConsumables`, ties up
  `requiredClamps` — everything operation start already does today.
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
  presses a nail; a short swing animation paces the pull, then the
  commit lands.
- Each pry is an action: `+1 nail` to consumables (each one flies to the
  supplies tally and clinks in — `flyToSupply`), and the pallet's
  remaining-nail state updates on the `MaterialInstance` itself (absent
  = full, per the established absent-means-default migration pattern —
  old saves load untouched).
- When a slat's last nail comes out, that board comes free *right then*
  and stays lying on the bench where it was nailed
  (`inputMaterials`, so the next plan's `stagedPieces` finds it) —
  mid-job you hold a genuinely half-stripped pallet plus loose boards,
  all real state. The shared layout lives in
  `src/game/bench-work/pallet-geometry.ts`, so the floor sprite, the
  bench scene, and the freed board's berth can never disagree.
- Refresh mid-dismantle and you resume at the exact nail you left —
  not because mini-game state was saved, but because every pull *was*
  game state. (Only the dragged-around arrangement resets: decision 3.)

## Script sketches for the rest — **Now**

| Activity | Script | Lands on |
| --- | --- | --- |
| Sanding | strokes to 98% coverage | `surface` rough→smooth→sanded; tool tiers = brush feel; dust per stroke |
| Hand saw | mark the line, then push–pull strokes deepen the kerf | shares the miter saw's parameterized crosscut operation — same outputs, zoomed presentation |
| Block plane | strokes along a face or edge | `jointedFaces`/`jointedEdges` axes and their prerequisites, unchanged |
| Glue-up | spread glue (stroke) → butt boards (point/snap) → clamps (point, one per `requiredClamps`) → commit starts the hands-free cure | the existing phase system fits 1:1 |
| Assembly | snap components onto ghost outlines → drive fasteners, one per `requiredConsumables` | ghost rendering precedent from the miter saw; drill vs hammer picks the animation |

Note how many target counts already live in the data (`requiredClamps`,
`requiredConsumables`, pallet nail yields): the scripts mostly reveal
numbers the simulation already has.

## The bench view itself — **Now**

**Now**: `src/components/bench-view/` — the bench *top* lives inside the
station sheet (Tab), spread nearly window-wide for benches: one measured
PIXI `Application` rendered at device resolution (no fixed logical size,
no CSS upscale — `stageMath.fitToStage` takes the real rect), a
procedural wood surface (`BenchBackdrop`) with the mounted tools hung on
a rail across the top (`BenchToolRail`, DOM buttons over the canvas),
and the bench's contents lying on the wood (`BenchScene`). The plan
picker survives below, folded into a "Plans & paperwork" drawer that
starts closed while a pallet holds the bench. The camera zoom-in
transition remains future presentation work. Every operation listed in
the rollout is converted; the remaining legacy attended-tick ops are the
single-piece finishing recipes (`finish*`, `oilCuttingBoard`) and the
shop-furniture/jig builds run through them — a coherent "finishing"
batch for a future script.

`src/components/bench-view/` — an overlay in the Phone/Journal/Clipboard
family; diegetically, leaning over the bench. Entered with `Tab` at a
bench, evolving `StationSheet` rather than adding a key: the plan picker
survives inside it as the sheet of paper pinned to the bench (benches
are honestly recipe-driven; that doesn't change). Inside, its own PIXI
stage renders the machine's actual state at high zoom — staged stock via
the material sprites scaled up, mounted tools on their hooks. Closing it
abandons any uncommitted work per decision 3. A camera zoom-in
transition can arrive later as pure presentation, the way
`truckStageStore` performs the truck.

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
   handoff. **Now**
5. **Assembly** — last; per-recipe component layouts are the long-tail
   authoring cost. Mitigation: a generic derived layout (components in a
   row, fasteners at the joints), hand-authored art only for hero
   products. **Now** (the generic layout; hero art still future)

## Open questions

- The per-op work budgets (seconds of stroking the fiftieth sanding pass
  deserves) — one tunable constant per script from day one, revised after
  playtesting.
- Whether the first pallet teardown should force the zoomed view as the
  tutorial beat, or trust the prompt chip.
- Whether per-nail salvage pacing needs a cap so mashing isn't optimal
  (a short pry animation per nail probably solves it for free).
